# Weather data integration

AgroSphere uses the Open-Meteo Forecast API through the Node.js backend. React never calls
Open-Meteo directly. The endpoint is `GET /api/weather?latitude=...&longitude=...` and requires
an authenticated `FARMER` account.

## Provider and licence

- Provider: Open-Meteo Forecast API (`https://api.open-meteo.com/v1/forecast`)
- Documentation: `https://open-meteo.com/en/docs`
- Data licence: CC BY 4.0; the UI links to Open-Meteo beside displayed data.
- Free endpoint: no API key, for non-commercial use under the published limits. Check the
  current Open-Meteo terms before a commercial deployment.

The free endpoint currently documents limits of 600 calls/minute, 5,000 calls/hour,
10,000 calls/day, and 300,000 calls/month, with no uptime guarantee. These terms can change.

## Requested and normalized fields

The service requests current temperature, humidity, precipitation, WMO weather code and
10-metre wind speed; hourly precipitation for the next 24 forecast hours; and two daily
records containing minimum/maximum temperature, precipitation sum and maximum precipitation
probability. `timezone=auto` keeps the provider's daily boundaries local to the coordinates.

Node normalizes this response before returning it to React. The browser never depends on the
provider's raw JSON shape.

Zero is valid: coordinates `0,0` (including numeric strings) and provider precipitation `0`
are not missing data. Blank/whitespace, null, undefined, non-numeric and non-finite coordinate
inputs return 400; latitude remains within [-90, 90] and longitude within [-180, 180].
Unavailable numeric weather metrics remain explicit `null` and display as "Not available",
while available fields still render. A missing weather code is not reported as clear sky.

## Irrigation mapping

Only compatible inputs are copied into Smart Irrigation:

- today's minimum temperature -> `minimumTemperature`
- today's maximum temperature -> `maximumTemperature`
- requested latitude -> `latitude`
- sum of the next 24 hourly precipitation values -> `forecastRainfall`
- today's provider date -> `observationDate`

The next-24-hour sum requires all of the first 24 hourly precipitation entries to be finite
numbers (nonblank numeric strings are also accepted), each with a nonblank timestamp. Missing
arrays, fewer than 24 entries, or any unavailable/invalid entry make the total `null`; no
partial sum or assumed zero is used. Complete totals retain the existing two-decimal rounding.
Only available values autofill irrigation inputs, including real zero. Unavailable values
leave existing/manual inputs unchanged; retained older weather inputs are marked for review.

`recentRainfall` is deliberately not inferred. The irrigation engine defines it as rain since
the soil-moisture reading, so the farmer must enter it manually to avoid double-counting.
Current humidity and wind are displayed as context but are not used by the existing Hargreaves
calculation.

## Cache and failure behavior

The backend keeps a process-local cache for ten minutes, keyed by coordinates rounded to four
decimal places. A cache hit avoids another provider call. Restarting Node clears the cache.
Coordinates are validated before cache access or provider requests. Valid partial responses
may be cached with their nulls preserved. Restart Node after updating to clear old cache entries.
Provider timeouts and network failures return a safe 503 response; malformed/upstream error
responses return 502. Manual irrigation entry and the rest of AgroSphere remain available.
