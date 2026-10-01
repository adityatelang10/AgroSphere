import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useAuth } from "./AuthContext";
import { apiRequest } from "../services/apiClient";
import { getWeather } from "../services/weatherService";
import { readWeatherLocation, saveWeatherLocation, validateWeatherCoordinates } from "../utils/weatherLocation";
import { requestDeviceLocation } from "../utils/farmContext";

const FarmContext = createContext(null);
export function FarmContextProvider({ children }) {
  const { user } = useAuth();
  return user?.role === "FARMER" ? <FarmerContext key={user.id} ownerId={user.id}>{children}</FarmerContext>
    : <FarmContext.Provider value={null}>{children}</FarmContext.Provider>;
}
function FarmerContext({ children, ownerId }) {
  const [data, setData] = useState({ profile: null, crops: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [location, setLocation] = useState(() => readWeatherLocation(ownerId));
  const [locationSource, setLocationSource] = useState("Saved coordinates for this account");
  const [weather, setWeather] = useState(null);
  const [weatherError, setWeatherError] = useState("");
  const [weatherLoading, setWeatherLoading] = useState(false);
  const live = useRef(true), requests = useRef(new Map()), cache = useRef(null), weatherVersion = useRef(0), contextVersion = useRef(0);
  const reload = useCallback(async () => {
    const version = ++contextVersion.current;
    setLoading(true); setError("");
    try {
      const response = await apiRequest("/api/farmer/context", { signal: AbortSignal.timeout(15000) });
      if (live.current && version === contextVersion.current) setData({ profile: response.profile, crops: response.crops || [] });
    } catch (failure) {
      if (live.current && version === contextVersion.current) { setData({ profile: null, crops: [] }); setError(failure.message || "Could not load farm context. Enter values manually or retry."); }
    } finally { if (live.current && version === contextVersion.current) setLoading(false); }
  }, []);
  useEffect(() => { live.current = true; reload(); return () => { live.current = false; contextVersion.current++; weatherVersion.current++; }; }, [reload]);
  const loadWeather = useCallback(async (coordinates, source = "Using saved coordinates", force = false) => {
    const invalid = validateWeatherCoordinates(coordinates?.latitude, coordinates?.longitude);
    if (invalid) { setWeatherError(invalid); return null; }
    const version = ++weatherVersion.current;
    const normalized = { latitude: Number(coordinates.latitude), longitude: Number(coordinates.longitude) };
    const key = JSON.stringify(normalized);
    setLocation(normalized); setLocationSource(source); saveWeatherLocation(normalized, ownerId);
    setWeather(null); setWeatherError(""); setWeatherLoading(true);
    try {
      let value;
      const cached = !force && cache.current?.key === key && Date.now() - cache.current.at < 600000;
      if (cached) value = cache.current.value;
      else {
        if (!requests.current.has(key)) requests.current.set(key, getWeather(normalized, { signal: AbortSignal.timeout(20000) }).finally(() => requests.current.delete(key)));
        value = await requests.current.get(key);
      }
      if (!live.current || version !== weatherVersion.current) return null;
      if (!cached) cache.current = { key, at: Date.now(), value };
      setWeather(value); return value;
    } catch (failure) {
      if (live.current && version === weatherVersion.current) setWeatherError("Could not retrieve weather automatically. Retry or enter manually.");
      return null;
    } finally { if (live.current && version === weatherVersion.current) setWeatherLoading(false); }
  }, [ownerId]);
  const useDeviceLocation = useCallback(async () => {
    const version = ++weatherVersion.current;
    setWeatherError(""); setWeatherLoading(true);
    try {
      const coordinates = await requestDeviceLocation();
      if (live.current && version === weatherVersion.current) return await loadWeather(coordinates, "Using device location");
    } catch (failure) { if (live.current && version === weatherVersion.current) { setWeatherError(failure.message); setWeatherLoading(false); } }
    return null;
  }, [loadWeather]);
  const selectedListing = selectedId === null ? (data.crops.length === 1 ? data.crops[0] : null)
    : data.crops.find((crop) => crop._id === selectedId) || null;
  return <FarmContext.Provider value={{ ...data, loading, error, reload, selectedListing, selectListing: setSelectedId,
    setProfile: (update) => setData((current) => ({ ...current, profile: typeof update === "function" ? update(current.profile) : update })),
    location, locationSource, weather, weatherError, weatherLoading, loadWeather, useDeviceLocation,
  }}>{children}</FarmContext.Provider>;
}
export const useFarmContext = () => useContext(FarmContext);
