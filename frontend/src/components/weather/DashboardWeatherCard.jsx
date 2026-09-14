import { useEffect, useState } from "react";

import { getWeather } from "../../services/weatherService";
import {
  readWeatherLocation,
  saveWeatherLocation,
  validateWeatherCoordinates,
} from "../../utils/weatherLocation";
import ScrollReveal from "../ui/ScrollReveal";
import WeatherSummary from "./WeatherSummary";

export default function DashboardWeatherCard() {
  const [coordinates, setCoordinates] = useState(() => {
    const savedLocation = readWeatherLocation();
    return {
      latitude: savedLocation?.latitude ?? "",
      longitude: savedLocation?.longitude ?? "",
    };
  });
  const [weather, setWeather] = useState(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const loadWeather = async (location, { save = true } = {}) => {
    const validationMessage = validateWeatherCoordinates(
      location.latitude,
      location.longitude
    );
    if (validationMessage) {
      setError(validationMessage);
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const response = await getWeather(location);
      setWeather(response);
      if (save) {
        saveWeatherLocation(location);
      }
    } catch (requestError) {
      setError(
        requestError.message ||
          "Weather data is temporarily unavailable. Your dashboard is still available."
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const savedLocation = readWeatherLocation();
    if (savedLocation) {
      loadWeather(savedLocation, { save: false });
    }
  }, []);

  const handleCoordinateChange = (event) => {
    const { name, value } = event.target;
    setCoordinates((current) => ({ ...current, [name]: value }));
    setError("");
  };

  const handleUseMyLocation = () => {
    if (!navigator.geolocation) {
      setError("Location access is not supported by this browser. Enter coordinates manually.");
      return;
    }

    setIsLoading(true);
    setError("");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const location = {
          latitude: Number(coords.latitude.toFixed(6)),
          longitude: Number(coords.longitude.toFixed(6)),
        };
        setCoordinates(location);
        loadWeather(location);
      },
      () => {
        setIsLoading(false);
        setError("Location permission was not granted. Enter latitude and longitude manually.");
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 10 * 60 * 1000 }
    );
  };

  return (
    <ScrollReveal
      as="section"
      className="rounded-3xl border border-sky-200/80 bg-white/90 p-5 shadow-sm dark:border-sky-900/50 dark:bg-slate-950/80"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-700 dark:text-sky-300">
            Local weather
          </p>
          <h2 className="mt-2 font-display text-xl font-semibold text-slate-950 dark:text-slate-50">
            Current conditions and short forecast
          </h2>
          <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
            Choose coordinates explicitly. AgroSphere never requests location permission automatically.
          </p>
        </div>
        {weather ? (
          <button
            type="button"
            onClick={() => loadWeather(coordinates)}
            disabled={isLoading}
            className="rounded-full border border-sky-400 px-4 py-2 text-sm font-semibold text-sky-700 transition hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-60 dark:text-sky-300 dark:hover:bg-sky-950/30"
          >
            {isLoading ? "Refreshing..." : "Refresh weather"}
          </button>
        ) : null}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr,1fr,auto,auto] lg:items-end">
        <label className="block">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Latitude</span>
          <input
            type="number"
            name="latitude"
            value={coordinates.latitude}
            onChange={handleCoordinateChange}
            min="-90"
            max="90"
            step="any"
            placeholder="e.g. 17.9080"
            className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Longitude</span>
          <input
            type="number"
            name="longitude"
            value={coordinates.longitude}
            onChange={handleCoordinateChange}
            min="-180"
            max="180"
            step="any"
            placeholder="e.g. 77.5152"
            className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          />
        </label>
        <button
          type="button"
          onClick={handleUseMyLocation}
          disabled={isLoading}
          className="h-10 rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-700 transition hover:border-sky-400 hover:text-sky-700 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:text-slate-200"
        >
          Use My Location
        </button>
        <button
          type="button"
          onClick={() => loadWeather(coordinates)}
          disabled={isLoading}
          className="h-10 rounded-xl bg-sky-700 px-5 text-sm font-semibold text-white transition hover:bg-sky-600 disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {isLoading ? "Loading..." : "Get weather"}
        </button>
      </div>

      {error ? (
        <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
          {error}
        </p>
      ) : null}

      {weather ? <div className="mt-5"><WeatherSummary weather={weather} /></div> : null}
    </ScrollReveal>
  );
}
