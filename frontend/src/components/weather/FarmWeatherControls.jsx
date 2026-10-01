import { useEffect, useRef, useState } from "react";
import { useFarmContext } from "../../context/FarmContext";
import { readWeatherLocation } from "../../utils/weatherLocation";
import WeatherSummary from "./WeatherSummary";

export default function FarmWeatherControls({ disabled = false, onWeatherLoaded, irrigation = false }) {
  const farm = useFarmContext();
  const [coordinates, setCoordinates] = useState(() => farm?.location || { latitude: "", longitude: "" });
  const [manual, setManual] = useState(false);
  const callback = useRef(onWeatherLoaded);
  const appliedWeather = useRef(null);
  callback.current = onWeatherLoaded;
  const loadWeather = farm?.loadWeather, useDeviceLocation = farm?.useDeviceLocation;
  const initial = useRef({ location: farm?.location, source: farm?.locationSource });
  useEffect(() => {
    let active = true;
    if (initial.current.location) loadWeather?.(initial.current.location, initial.current.source);
    else if (navigator.permissions?.query) {
      navigator.permissions.query({ name: "geolocation" }).then((permission) => {
        if (active && permission.state === "granted") useDeviceLocation?.();
      }).catch(() => {});
    }
    return () => { active = false; };
  }, [loadWeather, useDeviceLocation]);
  useEffect(() => { if (farm?.location) setCoordinates(farm.location); }, [farm?.location]);
  useEffect(() => {
    if (!farm?.weather) { appliedWeather.current = null; return; }
    if (!disabled && appliedWeather.current !== farm.weather) {
      appliedWeather.current = farm.weather;
      callback.current?.(farm.weather);
    }
  }, [farm?.weather, disabled]);
  if (!farm) return null;
  const busy = disabled || farm.weatherLoading;
  const button = "rounded-xl border border-sky-300 px-3 py-2 text-sm font-semibold text-sky-800 disabled:opacity-50 dark:border-sky-800 dark:text-sky-200";
  const legacy = !farm.location ? readWeatherLocation() : null;
  return <section className="rounded-2xl border border-sky-200 bg-sky-50/60 p-4 dark:border-sky-900 dark:bg-sky-950/20">
    <h3 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">{irrigation ? "Weather assist — editable suggestions" : "Local weather"}</h3>
    <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">
      {farm.location ? `${farm.locationSource}: ${farm.location.latitude}, ${farm.location.longitude}.` : "Use your device location or enter coordinates."}
      {" "}Device location is not necessarily your farm. Confirm it before using these values. Saved coordinates are scoped to this account; farm profiles currently store district/state only.
    </p>
    <div className="mt-3 flex flex-wrap gap-2">
      <button type="button" onClick={useDeviceLocation} disabled={busy} className={button}>Use My Location</button>
      {farm.location ? <button type="button" onClick={() => loadWeather(farm.location, farm.locationSource, true)} disabled={busy} className={button}>Retry / refresh weather</button> : null}
      <button type="button" onClick={() => setManual((value) => !value)} disabled={disabled} className={button}>{manual ? "Hide coordinates" : "Enter manually / change location"}</button>
      {legacy ? <button type="button" onClick={() => loadWeather(legacy, "Using previously saved browser coordinates (confirmed)")} disabled={busy} className={button}>Reuse previous browser coordinates ({legacy.latitude}, {legacy.longitude})</button> : null}
    </div>
    {manual ? <div className="mt-3 grid gap-3 sm:grid-cols-2">
      {["latitude", "longitude"].map((name) => <label key={name} className="text-sm capitalize text-slate-700 dark:text-slate-200">{name}
        <input type="number" step="any" min={name === "latitude" ? -90 : -180} max={name === "latitude" ? 90 : 180} value={coordinates[name]}
          onChange={(event) => setCoordinates((current) => ({ ...current, [name]: event.target.value }))} disabled={busy}
          className="mt-1 block w-full rounded-xl border border-slate-300 bg-white p-2 dark:border-slate-700 dark:bg-slate-950" />
      </label>)}
      <button type="button" onClick={() => loadWeather(coordinates, "Using manually confirmed coordinates")} disabled={busy} className={button}>Get weather</button>
    </div> : null}
    {farm.weatherLoading ? <p className="mt-3 text-sm" role="status">Obtaining location / weather…</p> : null}
    {farm.weatherError ? <p role="alert" className="mt-3 text-sm text-amber-800 dark:text-amber-200">{farm.weatherError} You can retry or enter the required values manually.</p> : null}
    {irrigation ? <p className="mt-3 text-xs text-slate-600 dark:text-slate-300">Only matching-date temperatures and the next-24-hour forecast are suggested. Manual changes are never overwritten. Rain since your moisture reading stays manual.</p> : null}
    {farm.weather ? <div className="mt-4"><WeatherSummary weather={farm.weather} showIrrigationMapping={irrigation} /></div> : null}
  </section>;
}
