const assert = require("node:assert/strict");
const test = require("node:test");

const {
  CACHE_TTL_MS,
  TEMPORARY_FAILURE_MESSAGE,
  buildForecastUrl,
  createWeatherService,
  getWeatherCondition,
  normalizeOpenMeteoResponse,
  sumNext24HoursPrecipitation,
  validateCoordinates,
} = require("../src/services/weatherService");

const SAMPLE_PROVIDER_RESPONSE = {
  latitude: 17.875,
  longitude: 77.5,
  utc_offset_seconds: 19800,
  timezone: "Asia/Kolkata",
  timezone_abbreviation: "GMT+5:30",
  current: {
    time: "2026-08-30T14:15",
    temperature_2m: 26.4,
    relative_humidity_2m: 72,
    precipitation: 0.1,
    weather_code: 61,
    wind_speed_10m: 11.2,
  },
  hourly: {
    time: Array.from({ length: 24 }, (_, index) =>
      `2026-08-${index < 10 ? "30" : "31"}T${String((14 + index) % 24).padStart(2, "0")}:00`
    ),
    precipitation: Array.from({ length: 24 }, (_, index) =>
      index === 0 ? 1.2 : index === 1 ? 0.8 : 0
    ),
  },
  daily: {
    time: ["2026-08-30", "2026-08-31"],
    temperature_2m_min: [21.3, 20.9],
    temperature_2m_max: [29.7, 30.1],
    precipitation_sum: [3.6, 2.1],
    precipitation_probability_max: [70, 45],
  },
};

const makeJsonResponse = (payload, ok = true) => ({
  ok,
  json: async () => payload,
});

test("normalizes Open-Meteo data and maps only compatible irrigation inputs", async () => {
  const service = createWeatherService({
    fetchImplementation: async () => makeJsonResponse(SAMPLE_PROVIDER_RESPONSE),
    cache: new Map(),
    now: () => new Date("2026-08-30T08:45:00.000Z"),
  });

  const result = await service.getWeather({ latitude: 17.9133, longitude: 77.5301 });

  assert.equal(result.provider, "Open-Meteo");
  assert.equal(result.current.condition, "Slight rain");
  assert.equal(result.current.relativeHumidityPercent, 72);
  assert.equal(result.today.minimumTemperatureC, 21.3);
  assert.equal(result.tomorrow.maximumTemperatureC, 30.1);
  assert.equal(result.irrigationInputs.minimumTemperatureC, 21.3);
  assert.equal(result.irrigationInputs.maximumTemperatureC, 29.7);
  assert.equal(result.irrigationInputs.latitude, 17.9133);
  assert.equal(result.irrigationInputs.forecastRainfallNext24HoursMm, 2);
  assert.equal(result.irrigationInputs.recentRainfallMm, null);
  assert.match(result.irrigationInputs.recentRainfallNote, /manually/i);
  assert.equal(result.observedAt, "2026-08-30T14:15+05:30");
  assert.equal(result.cache.status, "MISS");
});

test("uses a ten-minute coordinate cache without another provider request", async () => {
  let callCount = 0;
  const service = createWeatherService({
    fetchImplementation: async () => {
      callCount += 1;
      return makeJsonResponse(SAMPLE_PROVIDER_RESPONSE);
    },
    cache: new Map(),
    now: () => new Date("2026-08-30T08:45:00.000Z"),
  });

  const first = await service.getWeather({ latitude: 17.91331, longitude: 77.53011 });
  const second = await service.getWeather({ latitude: 17.91334, longitude: 77.53014 });

  assert.equal(first.cache.status, "MISS");
  assert.equal(second.cache.status, "HIT");
  assert.equal(callCount, 1);
});

test("rejects invalid coordinates before calling the provider", () => {
  assert.throws(
    () => validateCoordinates(91, 77.5),
    (error) => error.statusCode === 400 && /Latitude/.test(error.message)
  );
  assert.throws(
    () => validateCoordinates(17.9, -181),
    (error) => error.statusCode === 400 && /Longitude/.test(error.message)
  );
});

test("returns a safe service error when the provider is unavailable", async () => {
  const service = createWeatherService({
    fetchImplementation: async () => {
      throw new Error("provider network detail");
    },
    cache: new Map(),
  });

  await assert.rejects(
    service.getWeather({ latitude: 17.9133, longitude: 77.5301 }),
    (error) => error.statusCode === 503 && error.message === TEMPORARY_FAILURE_MESSAGE
  );
});

test("maps documented WMO weather codes without provider-specific text", () => {
  assert.equal(getWeatherCondition(0), "Clear sky");
  assert.equal(getWeatherCondition(95), "Thunderstorm");
  assert.equal(getWeatherCondition(999), "Unknown conditions");
});

const normalize = (payload) => normalizeOpenMeteoResponse(
  payload,
  { latitude: 17.9133, longitude: 77.5301 },
  "2026-08-30T08:45:00.000Z"
);

for (const [label, value] of [
  ["blank", ""],
  ["whitespace", "   \t"],
  ["null", null],
  ["undefined", undefined],
  ["non-numeric text", "abc"],
  ["NaN", NaN],
  ["positive infinity", Infinity],
  ["negative infinity", -Infinity],
  ["boolean", false],
  ["array", []],
  ["object", {}],
]) {
  test(`rejects ${label} coordinates instead of coercing them to zero`, () => {
    assert.throws(() => validateCoordinates(value, value), { statusCode: 400 });
    assert.throws(() => validateCoordinates(value, 77.5), { statusCode: 400 });
    assert.throws(() => validateCoordinates(17.9, value), { statusCode: 400 });
  });
}

test("accepts real numeric zero coordinates", () => {
  assert.deepEqual(validateCoordinates(0, 0), { latitude: 0, longitude: 0 });
});

test("accepts nonblank numeric strings including zero", () => {
  assert.deepEqual(validateCoordinates("0", "0"), { latitude: 0, longitude: 0 });
  assert.deepEqual(validateCoordinates(" 17.9133 ", "77.5301"), {
    latitude: 17.9133, longitude: 77.5301,
  });
});

test("accepts inclusive coordinate boundaries", () => {
  for (const latitude of [-90, 90]) {
    for (const longitude of [-180, 180]) {
      assert.deepEqual(validateCoordinates(latitude, longitude), { latitude, longitude });
    }
  }
});

test("rejects coordinates just outside either boundary", () => {
  for (const latitude of [-90.0001, 90.0001]) {
    assert.throws(() => validateCoordinates(latitude, 0), { statusCode: 400 });
  }
  for (const longitude of [-180.0001, 180.0001]) {
    assert.throws(() => validateCoordinates(0, longitude), { statusCode: 400 });
  }
});

test("invalid coordinates cannot read the zero-coordinate cache or call the provider", async () => {
  const cache = new Map([["0.0000,0.0000", { cachedAt: Date.now(), value: { success: true } }]]);
  let providerCalls = 0;
  const service = createWeatherService({
    cache,
    fetchImplementation: async () => { providerCalls += 1; },
  });
  for (const value of ["", "   ", null, undefined, NaN, Infinity, "abc", false]) {
    await assert.rejects(service.getWeather({ latitude: value, longitude: 0 }), { statusCode: 400 });
    await assert.rejects(service.getWeather({ latitude: 0, longitude: value }), { statusCode: 400 });
  }
  assert.equal(providerCalls, 0);
  assert.equal(cache.size, 1);
});

test("zero coordinates reach the provider with the unchanged forecast contract", async () => {
  let requestedUrl;
  const service = createWeatherService({
    cache: new Map(),
    fetchImplementation: async (url) => {
      requestedUrl = url;
      return makeJsonResponse(SAMPLE_PROVIDER_RESPONSE);
    },
  });
  const result = await service.getWeather({ latitude: "0", longitude: "0" });
  assert.equal(requestedUrl.origin + requestedUrl.pathname, "https://api.open-meteo.com/v1/forecast");
  assert.equal(requestedUrl.searchParams.get("latitude"), "0");
  assert.equal(requestedUrl.searchParams.get("longitude"), "0");
  assert.equal(requestedUrl.searchParams.get("forecast_hours"), "24");
  assert.equal(requestedUrl.searchParams.get("forecast_days"), "2");
  assert.equal(requestedUrl.searchParams.get("hourly"), "precipitation");
  assert.equal(requestedUrl.searchParams.get("timezone"), "auto");
  assert.equal(result.irrigationInputs.latitude, 0);
  assert.equal(buildForecastUrl({ latitude: 0, longitude: 0 }).href, requestedUrl.href);
});

test("preserves actual zero provider metrics and zero rain", () => {
  const payload = structuredClone(SAMPLE_PROVIDER_RESPONSE);
  for (const field of ["temperature_2m", "relative_humidity_2m", "precipitation", "weather_code", "wind_speed_10m"]) {
    payload.current[field] = 0;
  }
  for (const field of ["temperature_2m_min", "temperature_2m_max", "precipitation_sum", "precipitation_probability_max"]) {
    payload.daily[field] = [0, 0];
  }
  payload.hourly.precipitation.fill(0);
  payload.latitude = 0;
  payload.longitude = 0;
  payload.utc_offset_seconds = 0;
  const result = normalize(payload);
  assert.deepEqual(result.current, {
    temperatureC: 0, relativeHumidityPercent: 0, precipitationMm: 0,
    weatherCode: 0, condition: "Clear sky", windSpeedKmph: 0,
  });
  for (const day of [result.today, result.tomorrow]) {
    assert.equal(day.minimumTemperatureC, 0);
    assert.equal(day.maximumTemperatureC, 0);
    assert.equal(day.precipitationMm, 0);
    assert.equal(day.precipitationProbabilityPercent, 0);
  }
  assert.equal(result.location.latitude, 0);
  assert.equal(result.location.longitude, 0);
  assert.equal(result.irrigationInputs.forecastRainfallNext24HoursMm, 0);
  assert.equal(result.observedAt, "2026-08-30T14:15Z");
});

test("missing or invalid provider metrics remain null without losing the rest of the response", () => {
  for (const missing of [null, undefined, "", "   ", "bad", NaN, Infinity, -Infinity, false, [], {}]) {
    const payload = structuredClone(SAMPLE_PROVIDER_RESPONSE);
    for (const field of ["temperature_2m", "relative_humidity_2m", "precipitation", "weather_code", "wind_speed_10m"]) {
      payload.current[field] = missing;
    }
    for (const field of ["temperature_2m_min", "temperature_2m_max", "precipitation_sum", "precipitation_probability_max"]) {
      payload.daily[field] = [missing, missing];
    }
    const result = normalize(payload);
    assert.equal(result.success, true);
    assert.deepEqual(result.current, {
      temperatureC: null, relativeHumidityPercent: null, precipitationMm: null,
      weatherCode: null, condition: "Unknown conditions", windSpeedKmph: null,
    });
    for (const day of [result.today, result.tomorrow]) {
      assert.equal(day.minimumTemperatureC, null);
      assert.equal(day.maximumTemperatureC, null);
      assert.equal(day.precipitationMm, null);
      assert.equal(day.precipitationProbabilityPercent, null);
    }
    assert.equal(result.irrigationInputs.minimumTemperatureC, null);
    assert.equal(result.irrigationInputs.maximumTemperatureC, null);
    assert.equal(result.irrigationInputs.forecastRainfallNext24HoursMm, 2);
  }
});

test("absent precipitation properties do not become zero or break available temperature", () => {
  const payload = structuredClone(SAMPLE_PROVIDER_RESPONSE);
  delete payload.current.precipitation;
  delete payload.daily.precipitation_sum;
  delete payload.daily.precipitation_probability_max;
  delete payload.hourly;
  const result = normalize(payload);
  assert.equal(result.current.precipitationMm, null);
  assert.equal(result.today.precipitationMm, null);
  assert.equal(result.tomorrow.precipitationMm, null);
  assert.equal(result.today.precipitationProbabilityPercent, null);
  assert.equal(result.current.temperatureC, 26.4);
  assert.equal(result.irrigationInputs.forecastRainfallNext24HoursMm, null);
  assert.equal(result.irrigationInputs.recentRainfallMm, null);
});

test("missing provider coordinates fall back to requested coordinates, not zero", () => {
  const payload = structuredClone(SAMPLE_PROVIDER_RESPONSE);
  payload.latitude = null;
  delete payload.longitude;
  delete payload.utc_offset_seconds;
  const result = normalize(payload);
  assert.equal(result.location.latitude, 17.9133);
  assert.equal(result.location.longitude, 77.5301);
  assert.equal(result.observedAt, null);
});

test("unknown weather code is not confused with real code zero", () => {
  for (const value of [null, undefined, "", "   ", false, NaN, Infinity]) {
    assert.equal(getWeatherCondition(value), "Unknown conditions");
  }
  assert.equal(getWeatherCondition("0"), "Clear sky");
});

test("sums exactly the first 24 complete precipitation values, including zeros", () => {
  const hourly = structuredClone(SAMPLE_PROVIDER_RESPONSE.hourly);
  assert.equal(sumNext24HoursPrecipitation(hourly), 2);
  hourly.precipitation[0] = 1.234;
  hourly.precipitation.push(999);
  hourly.time.push("2026-08-31T14:00");
  assert.equal(sumNext24HoursPrecipitation(hourly), 2.03);
});

test("any missing or invalid hour makes the whole 24-hour total unavailable", () => {
  for (const value of [null, undefined, "", " ", "bad", NaN, Infinity, -Infinity, false]) {
    for (const index of [0, 12, 23]) {
      const payload = structuredClone(SAMPLE_PROVIDER_RESPONSE);
      payload.hourly.precipitation[index] = value;
      assert.equal(sumNext24HoursPrecipitation(payload.hourly), null);
      assert.equal(normalize(payload).irrigationInputs.forecastRainfallNext24HoursMm, null);
    }
  }
});

test("missing, short or sparse hourly arrays never produce a partial rainfall total", () => {
  const hourly = structuredClone(SAMPLE_PROVIDER_RESPONSE.hourly);
  for (const incomplete of [
    undefined, {}, { time: hourly.time }, { precipitation: hourly.precipitation },
    { ...hourly, precipitation: hourly.precipitation.slice(0, 23) },
    { ...hourly, time: hourly.time.slice(0, 23) },
    { ...hourly, precipitation: new Array(24) },
    { ...hourly, time: new Array(24) },
  ]) {
    assert.equal(sumNext24HoursPrecipitation(incomplete), null);
  }
  hourly.time[12] = "";
  assert.equal(sumNext24HoursPrecipitation(hourly), null);
});

test("cached partial responses preserve nulls and refresh after ten minutes", async () => {
  const payload = structuredClone(SAMPLE_PROVIDER_RESPONSE);
  payload.current.precipitation = null;
  payload.hourly.precipitation[12] = null;
  const cache = new Map();
  let timestamp = Date.parse("2026-08-30T08:45:00.000Z");
  let calls = 0;
  const service = createWeatherService({
    cache, now: () => new Date(timestamp),
    fetchImplementation: async () => { calls += 1; return makeJsonResponse(payload); },
  });
  const coordinates = { latitude: 17.9133, longitude: 77.5301 };
  assert.equal((await service.getWeather(coordinates)).cache.status, "MISS");
  timestamp += CACHE_TTL_MS - 1;
  const cached = await service.getWeather(coordinates);
  assert.equal(cached.cache.status, "HIT");
  assert.equal(cached.current.precipitationMm, null);
  assert.equal(cached.current.temperatureC, 26.4);
  assert.equal(cached.irrigationInputs.forecastRainfallNext24HoursMm, null);
  assert.equal(cached.cache.ttlSeconds, 600);
  assert.equal(calls, 1);
  timestamp += 1;
  assert.equal((await service.getWeather(coordinates)).cache.status, "MISS");
  assert.equal(calls, 2);
});

test("structurally malformed provider responses still fail safely and are not cached", async () => {
  const cache = new Map();
  const service = createWeatherService({ cache, fetchImplementation: async () => makeJsonResponse({}) });
  await assert.rejects(service.getWeather({ latitude: 0, longitude: 0 }), {
    statusCode: 502, message: TEMPORARY_FAILURE_MESSAGE,
  });
  assert.equal(cache.size, 0);
});
