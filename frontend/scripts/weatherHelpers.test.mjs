import assert from "node:assert/strict";
import test from "node:test";

import { readWeatherLocation, saveWeatherLocation, validateWeatherCoordinates } from "../src/utils/weatherLocation.js";
import { formatWeatherNumber, toFiniteWeatherNumber } from "../src/utils/weatherValues.js";
import { getIrrigationWeatherSources, getIrrigationWeatherUpdates } from "../src/utils/irrigationWeatherMapping.js";

for (const [label, value] of [
  ["blank", ""], ["whitespace", " \t "], ["null", null], ["undefined", undefined],
  ["non-numeric", "abc"], ["NaN", NaN], ["infinity", Infinity],
]) {
  test(`weather coordinates reject ${label} input`, () => {
    assert.match(validateWeatherCoordinates(value, 0), /Latitude/);
    assert.match(validateWeatherCoordinates(0, value), /Longitude/);
    assert.equal(toFiniteWeatherNumber(value), null);
  });
}

test("weather coordinates accept zero, numeric strings, Bidar coordinates and inclusive boundaries", () => {
  for (const [latitude, longitude] of [
    [0, 0], ["0", "0"], [17.9133, 77.5301], [" 17.9133 ", "77.5301"],
    [-90, -180], [90, 180], [-90, 180], [90, -180],
  ]) {
    assert.equal(validateWeatherCoordinates(latitude, longitude), "");
  }
  assert.equal(toFiniteWeatherNumber(0), 0);
  assert.equal(toFiniteWeatherNumber("0"), 0);
});

test("weather coordinates reject both out-of-range boundaries and non-scalar values", () => {
  for (const latitude of [-90.0001, 90.0001]) {
    assert.match(validateWeatherCoordinates(latitude, 0), /Latitude/);
  }
  for (const longitude of [-180.0001, 180.0001]) {
    assert.match(validateWeatherCoordinates(0, longitude), /Longitude/);
  }
  for (const value of [false, true, [], [0], {}, -Infinity]) {
    assert.notEqual(validateWeatherCoordinates(value, value), "");
    assert.equal(toFiniteWeatherNumber(value), null);
  }
});

const withStorage = (t) => {
  const originalWindow = globalThis.window;
  const values = new Map();
  globalThis.window = { localStorage: {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  } };
  t.after(() => {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  });
  return values;
};

test("saved valid and zero coordinates still round-trip", (t) => {
  withStorage(t);
  assert.equal(readWeatherLocation(), null);
  saveWeatherLocation({ latitude: "17.9133", longitude: "77.5301" });
  assert.deepEqual(readWeatherLocation(), { latitude: 17.9133, longitude: 77.5301 });
  saveWeatherLocation({ latitude: "0", longitude: "0" });
  assert.deepEqual(readWeatherLocation(), { latitude: 0, longitude: 0 });
});

test("invalid saves do not overwrite a valid location; corrupt/blank saved locations are rejected", (t) => {
  const storage = withStorage(t);
  const key = "agrosphere.weather-location.v1";
  const valid = { latitude: 17.9133, longitude: 77.5301 };
  saveWeatherLocation(valid);
  for (const value of ["", " ", null, undefined, "bad", 999]) {
    saveWeatherLocation({ latitude: value, longitude: value });
    assert.deepEqual(readWeatherLocation(), valid);
  }
  for (const stored of ["bad json", "null", "{}", '{"latitude":"","longitude":""}', '{"latitude":null,"longitude":0}']) {
    storage.set(key, stored);
    assert.equal(readWeatherLocation(), null);
  }
});

test("weather formatting distinguishes actual zero from unavailable metrics", () => {
  assert.equal(formatWeatherNumber(0, 2, " mm"), "0 mm");
  assert.equal(formatWeatherNumber("0", 2, " mm"), "0 mm");
  assert.equal(formatWeatherNumber(2.125, 2, " mm"), "2.13 mm");
  for (const value of [null, undefined, "", "   ", "bad", NaN, Infinity, -Infinity, false]) {
    assert.equal(formatWeatherNumber(value, 2, " mm"), "Not available");
  }
});

const availableWeather = () => ({
  today: { date: "2026-09-14" },
  irrigationInputs: {
    minimumTemperatureC: 21.3, maximumTemperatureC: 29.7,
    latitude: 17.9133, forecastRainfallNext24HoursMm: 2,
    recentRainfallMm: 99,
  },
});

test("available weather maps only compatible irrigation inputs", () => {
  assert.deepEqual(getIrrigationWeatherUpdates(availableWeather()), {
    minimumTemperature: "21.3", maximumTemperature: "29.7", latitude: "17.9133",
    forecastRainfall: "2", observationDate: "2026-09-14",
  });
});

test("true zero temperature, latitude and forecast rain are autofilled", () => {
  const weather = availableWeather();
  for (const field of Object.keys(weather.irrigationInputs)) weather.irrigationInputs[field] = 0;
  assert.deepEqual(getIrrigationWeatherUpdates(weather), {
    minimumTemperature: "0", maximumTemperature: "0", latitude: "0",
    forecastRainfall: "0", observationDate: "2026-09-14",
  });
});

test("unavailable rain leaves manual input unchanged, never null/undefined strings or assumed zero", () => {
  for (const missing of [null, undefined, "", " ", "bad", NaN, Infinity]) {
    const weather = availableWeather();
    weather.irrigationInputs.forecastRainfallNext24HoursMm = missing;
    weather.irrigationInputs.minimumTemperatureC = missing;
    const updates = getIrrigationWeatherUpdates(weather);
    assert.equal(Object.hasOwn(updates, "forecastRainfall"), false);
    assert.equal(Object.hasOwn(updates, "minimumTemperature"), false);
    const form = { forecastRainfall: "7.5", minimumTemperature: "20", recentRainfall: "3" };
    const merged = { ...form, ...updates };
    assert.equal(merged.forecastRainfall, "7.5");
    assert.equal(merged.minimumTemperature, "20");
    assert.equal(merged.maximumTemperature, "29.7");
    assert.equal(merged.recentRainfall, "3");
    assert.equal(({ ...merged, forecastRainfall: "4" }).forecastRainfall, "4");
  }
  assert.deepEqual(getIrrigationWeatherUpdates(null), {});
  assert.deepEqual(getIrrigationWeatherUpdates({ today: { date: " " } }), {});
});

test("missing weather does not overwrite a blank manual forecast field", () => {
  const weather = availableWeather();
  weather.irrigationInputs.forecastRainfallNext24HoursMm = null;
  assert.equal(({ forecastRainfall: "", ...getIrrigationWeatherUpdates(weather) }).forecastRainfall, "");
});

test("recent rainfall remains manual even if a response contains rain from other time windows", () => {
  const weather = availableWeather();
  weather.current = { precipitationMm: 12 };
  weather.today.precipitationMm = 25;
  const updates = getIrrigationWeatherUpdates(weather);
  assert.equal(Object.hasOwn(updates, "recentRainfall"), false);
  assert.equal(getIrrigationWeatherSources({ recentRainfall: "manual" }, updates).recentRainfall, "manual");
});

test("source badges preserve manual values and mark retained older weather for review", () => {
  const weather = availableWeather();
  weather.irrigationInputs.forecastRainfallNext24HoursMm = null;
  const updates = getIrrigationWeatherUpdates(weather);
  const oldSources = { forecastRainfall: "weather", minimumTemperature: "manual", recentRainfall: "manual" };
  const sources = getIrrigationWeatherSources(oldSources, updates);
  assert.equal(sources.forecastRainfall, "retained");
  assert.equal(sources.minimumTemperature, "weather");
  assert.equal(oldSources.forecastRainfall, "weather");
  assert.equal(getIrrigationWeatherSources({ forecastRainfall: "manual" }, updates).forecastRainfall, "manual");
  assert.equal(getIrrigationWeatherSources(sources, { forecastRainfall: "0" }).forecastRainfall, "weather");
});
