import { useState } from "react";

import { getWeather } from "../../services/weatherService";
import {
  readWeatherLocation,
  saveWeatherLocation,
  validateWeatherCoordinates,
} from "../../utils/weatherLocation";
import WeatherSummary from "./WeatherSummary";

export default function IrrigationWeatherAssist({
  latitude,
  latitudeSource,
  disabled,
  onLatitudeChange,
  onWeatherLoaded,
}) {
  const [longitude, setLongitude] = useState(
    () => readWeatherLocation()?.longitude ?? ""
  );
  const [weather, setWeather] = useState(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const loadWeather = async (location) => {
    const validationMessage = validateWeatherCoordinates(
      location.latitude,
      location.longitude
    );
    if (validationMessage) {
      setError(validationMessage);
      return;
    }

    if (Number(location.latitude) < -55 || Number(location.latitude) > 55) {
      setError("Smart Irrigation currently supports field latitude between -55 and 55.");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const response = await getWeather(location);
      setWeather(response);
      saveWeatherLocation(location);
      onWeatherLoaded(response);
    } catch (requestError) {
      setError(
        requestError.message ||
          "Weather data is temporarily unavailable. Continue with manual irrigation inputs."
      );
    } finally {
      setIsLoading(false);
    }
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
        onLatitudeChange({ target: { name: "latitude", value: location.latitude } });
        setLongitude(location.longitude);
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
    <section className="rounded-2xl border border-cyan-200 bg-cyan-50/60 p-4 dark:border-cyan-900/50 dark:bg-cyan-950/20">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-800 dark:text-cyan-200">
            Optional weather assist
          </p>
          <h3 className="mt-1 font-display text-lg font-semibold text-slate-950 dark:text-slate-50">
            Fill compatible inputs from current forecast data
          </h3>
          <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">
            Enter coordinates or request browser location. Location permission is never requested automatically.
          </p>
        </div>
        {weather ? (
          <button
            type="button"
            onClick={() => loadWeather({ latitude, longitude })}
            disabled={disabled || isLoading}
            className="rounded-full border border-cyan-400 px-4 py-2 text-sm font-semibold text-cyan-800 transition hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-60 dark:text-cyan-200 dark:hover:bg-cyan-950/40"
          >
            {isLoading ? "Refreshing..." : "Refresh & refill"}
          </button>
        ) : null}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr,1fr,auto,auto] lg:items-end">
        <label className="block">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Field latitude</span>
          <span className="ml-1 text-[0.68rem] text-slate-400">-55 to 55</span>
          <span className={`ml-2 inline-flex rounded-full px-2 py-0.5 text-[0.62rem] font-semibold ${latitudeSource === "weather" ? "bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-200" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}>
            {latitudeSource === "weather" ? "From Open-Meteo" : latitudeSource === "saved" ? "Saved coordinate" : "Manual input"}
          </span>
          <input
            type="number"
            name="latitude"
            value={latitude}
            onChange={onLatitudeChange}
            min="-55"
            max="55"
            step="any"
            required
            disabled={disabled || isLoading}
            placeholder="e.g. 17.9080"
            className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-200 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Field longitude</span>
          <span className="ml-1 text-[0.68rem] text-slate-400">-180 to 180</span>
          <input
            type="number"
            value={longitude}
            onChange={(event) => {
              setLongitude(event.target.value);
              setError("");
            }}
            min="-180"
            max="180"
            step="any"
            disabled={disabled || isLoading}
            placeholder="e.g. 77.5152"
            className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-200 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          />
        </label>
        <button
          type="button"
          onClick={handleUseMyLocation}
          disabled={disabled || isLoading}
          className="h-10 rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-700 transition hover:border-cyan-400 hover:text-cyan-800 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:text-slate-200"
        >
          Use My Location
        </button>
        <button
          type="button"
          onClick={() => loadWeather({ latitude, longitude })}
          disabled={disabled || isLoading}
          className="h-10 rounded-xl bg-cyan-700 px-5 text-sm font-semibold text-white transition hover:bg-cyan-600 disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {isLoading ? "Getting weather..." : "Get & fill weather"}
        </button>
      </div>

      {error ? (
        <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
          {error}
        </p>
      ) : null}

      {weather ? (
        <div className="mt-5 border-t border-cyan-200 pt-5 dark:border-cyan-900/50">
          <WeatherSummary weather={weather} showIrrigationMapping />
        </div>
      ) : null}
    </section>
  );
}
