import { formatWeatherNumber as formatNumber } from "../../utils/weatherValues";

const formatObservedAt = (value) => {
  if (!value) {
    return "Not available";
  }

  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
};

function ForecastDay({ label, forecast }) {
  return (
    <article className="rounded-2xl border border-sky-100 bg-sky-50/70 p-3.5 dark:border-sky-900/50 dark:bg-sky-950/30">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700 dark:text-sky-300">
        {label}
      </p>
      <p className="mt-2 font-display text-xl font-semibold text-slate-950 dark:text-white">
        {formatNumber(forecast.minimumTemperatureC, 1, "°C")} / {formatNumber(forecast.maximumTemperatureC, 1, "°C")}
      </p>
      <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
        Rain {formatNumber(forecast.precipitationMm, 2, " mm")}
        {forecast.precipitationProbabilityPercent !== null
          ? ` · ${formatNumber(forecast.precipitationProbabilityPercent, 0)}% probability`
          : ""}
      </p>
    </article>
  );
}

export default function WeatherSummary({ weather, showIrrigationMapping = false }) {
  if (!weather) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[0.85fr,1.15fr]">
        <article className="rounded-2xl bg-gradient-to-br from-sky-700 to-cyan-600 p-5 text-white shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-100">
                Current conditions
              </p>
              <p className="mt-2 font-display text-4xl font-bold">
                {formatNumber(weather.current.temperatureC, 1, "°C")}
              </p>
              <p className="mt-1 font-semibold text-sky-50">{weather.current.condition}</p>
            </div>
            <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">
              {weather.cache?.status === "HIT" ? "Cached" : "Fresh request"}
            </span>
          </div>
          <div className="mt-5 grid grid-cols-3 gap-2 text-xs">
            <div className="rounded-xl bg-white/10 p-2.5">
              <p className="text-sky-100">Humidity</p>
              <p className="mt-1 font-semibold">{formatNumber(weather.current.relativeHumidityPercent, 0, "%")}</p>
            </div>
            <div className="rounded-xl bg-white/10 p-2.5">
              <p className="text-sky-100">Wind</p>
              <p className="mt-1 font-semibold">{formatNumber(weather.current.windSpeedKmph, 1, " km/h")}</p>
            </div>
            <div className="rounded-xl bg-white/10 p-2.5">
              <p className="text-sky-100">Rain now</p>
              <p className="mt-1 font-semibold">{formatNumber(weather.current.precipitationMm, 2, " mm")}</p>
            </div>
          </div>
        </article>

        <div className="grid gap-3 sm:grid-cols-2">
          <ForecastDay label={`Today · ${weather.today.date}`} forecast={weather.today} />
          <ForecastDay label={`Tomorrow · ${weather.tomorrow.date}`} forecast={weather.tomorrow} />
        </div>
      </div>

      {showIrrigationMapping ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-3.5 text-xs leading-5 text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-100">
          Weather can fill today’s minimum/maximum temperature, latitude, observation date,
          and the next 24-hour rainfall forecast. Humidity and wind are context only and do
          not change the existing Hargreaves calculation.
          <p className="mt-1">
            Next 24-hour rain: {formatNumber(weather.irrigationInputs?.forecastRainfallNext24HoursMm, 2, " mm")}.
            {" "}Unavailable weather fields are not autofilled. Existing inputs are kept;
            review or enter them manually. Recent rainfall always stays manual.
          </p>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
        <span>
          Observed {formatObservedAt(weather.observedAt)} · {weather.location.timezone}
        </span>
        <a
          href={weather.providerUrl}
          target="_blank"
          rel="noreferrer"
          className="font-semibold text-sky-700 underline decoration-sky-300 underline-offset-4 hover:text-sky-600 dark:text-sky-300"
        >
          {weather.providerAttribution}
        </a>
      </div>
    </div>
  );
}
