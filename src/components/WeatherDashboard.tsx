"use client";

import useSWR from "swr";
import {
  Sun,
  Moon,
  Cloud,
  CloudSun,
  CloudMoon,
  CloudRain,
  CloudDrizzle,
  CloudLightning,
  Snowflake,
  Wind,
  Droplets,
  CloudFog,
  AlertCircle,
  KeyRound,
  MapPin,
  RefreshCw
} from "lucide-react";
import { t } from "@/lib/translations";

// Non-OK responses carry a JSON body explaining why, so parse them instead of
// throwing: the panel can then tell "not set up yet" apart from a real failure.
const fetcher = async (url: string) => {
  const res = await fetch(url);
  return res.json().catch(() => ({ error: t.weatherFetchError }));
};

// Every state of the panel renders at the same width, so opening it and having
// it resolve from skeleton to data doesn't resize the popover under the cursor.
const CARD_BASE =
  "w-full rounded-xl border shadow-lg backdrop-blur-md overflow-hidden";

function getWeatherIcon(iconCode: string, className = "w-6 h-6") {
  switch (iconCode) {
    case "01d": return <Sun className={`${className} text-amber-500`} />;
    case "01n": return <Moon className={`${className} text-indigo-400`} />;
    case "02d": return <CloudSun className={`${className} text-amber-400`} />;
    case "02n": return <CloudMoon className={`${className} text-indigo-300`} />;
    case "03d":
    case "03n":
    case "04d":
    case "04n": return <Cloud className={`${className} text-zinc-400`} />;
    case "09d":
    case "09n": return <CloudRain className={`${className} text-blue-400`} />;
    case "10d":
    case "10n": return <CloudDrizzle className={`${className} text-blue-300`} />;
    case "11d":
    case "11n": return <CloudLightning className={`${className} text-purple-500`} />;
    case "13d":
    case "13n": return <Snowflake className={`${className} text-sky-300`} />;
    case "50d":
    case "50n": return <CloudFog className={`${className} text-zinc-300`} />;
    default: return <Cloud className={`${className} text-zinc-400`} />;
  }
}

interface WeatherDashboardProps {
  lat: number;
  lon: number;
  locationLabel?: string;
}

// A reading is only worth printing when the upstream actually sent a number.
function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatTemp(value: unknown, suffix = "°"): string {
  const n = num(value);
  return n === null ? "—" : `${Math.round(n)}${suffix}`;
}

export default function WeatherDashboard({ lat, lon, locationLabel }: WeatherDashboardProps) {
  const { data, error, isLoading, isValidating, mutate } = useSWR(
    `/api/weather?lat=${lat}&lon=${lon}`,
    fetcher,
    {
      // The route is rate limited (20/min) and the upstream data only changes
      // every 10 minutes, so don't re-fetch on every focus or remount.
      dedupingInterval: 10 * 60 * 1000,
      revalidateOnFocus: false,
      // Switching fields swaps the key; keeping the previous reading on screen
      // avoids flashing the skeleton for a value that is about to be replaced.
      keepPreviousData: true,
    }
  );

  if (isLoading) {
    return (
      <div className={`${CARD_BASE} bg-white/90 dark:bg-zinc-900/90 border-zinc-200 dark:border-zinc-800 p-4 animate-pulse`}>
        <div className="h-4 bg-zinc-200 dark:bg-zinc-800 rounded w-1/3 mb-4"></div>
        <div className="flex justify-between items-center mb-4">
          <div className="w-16 h-16 bg-zinc-200 dark:bg-zinc-800 rounded-full"></div>
          <div className="h-8 bg-zinc-200 dark:bg-zinc-800 rounded w-1/4"></div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="h-10 bg-zinc-200 dark:bg-zinc-800 rounded"></div>
          <div className="h-10 bg-zinc-200 dark:bg-zinc-800 rounded"></div>
          <div className="h-10 bg-zinc-200 dark:bg-zinc-800 rounded"></div>
        </div>
      </div>
    );
  }

  // The server has no API key yet. This is a setup step, not an error.
  if (data?.configured === false) {
    return (
      <div className={`${CARD_BASE} bg-white/95 dark:bg-zinc-900/95 border-zinc-200 dark:border-zinc-800 p-4 flex items-start gap-3`}>
        <KeyRound className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
        <div className="text-sm min-w-0">
          <p className="font-semibold text-zinc-700 dark:text-zinc-200 mb-1">{t.weatherNotConfigured}</p>
          <p className="text-zinc-500 dark:text-zinc-400">{t.weatherNotConfiguredDesc}</p>
          <code className="mt-2 block text-xs bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 rounded px-2 py-1">
            OPENWEATHER_API_KEY=...
          </code>
        </div>
      </div>
    );
  }

  const current = data?.current;
  const condition = current?.weather?.[0];

  // A payload without a current reading is as much of a failure as a transport
  // error, so it lands in the same branch instead of rendering nothing at all.
  if (error || data?.error || !current) {
    return (
      <div className={`${CARD_BASE} bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900/50 p-4 flex items-start gap-3`}>
        <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
        <div className="text-sm text-red-600 dark:text-red-400 min-w-0 flex-1">
          <p className="font-semibold mb-1">{t.weatherFetchError}</p>
          <p className="break-words">{data?.error || ""}</p>
          <button
            type="button"
            onClick={() => mutate()}
            disabled={isValidating}
            className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium rounded-md border border-red-300 dark:border-red-800 px-2 py-1 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-3 h-3 ${isValidating ? "animate-spin" : ""}`} />
            {t.weatherRetry}
          </button>
        </div>
      </div>
    );
  }

  const forecast = Array.isArray(data?.forecast) ? data.forecast : [];
  const todayKey = new Date().toDateString();
  const humidity = num(current.main?.humidity);
  const clouds = num(current.clouds?.all);
  const wind = num(current.wind?.speed);

  return (
    <div className={`${CARD_BASE} bg-white/95 dark:bg-zinc-900/95 border-zinc-200 dark:border-zinc-800 transition-all`}>
      {/* Current Weather */}
      <div className="p-4 md:p-5 flex items-start justify-between gap-3 border-b border-zinc-100 dark:border-zinc-800/50">
        <div className="min-w-0">
          <div className="text-sm font-medium text-emerald-600 dark:text-emerald-400 mb-1 flex items-center gap-1.5">
            {t.weatherCurrent}
            {locationLabel && (
              <span className="inline-flex items-center gap-1 text-xs font-normal text-zinc-500 dark:text-zinc-400 min-w-0">
                <MapPin className="w-3 h-3 shrink-0" />
                <span className="truncate">{locationLabel}</span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {getWeatherIcon(condition?.icon ?? "", "w-10 h-10")}
            <div className="min-w-0">
              <div className="text-3xl font-bold tracking-tighter text-zinc-800 dark:text-zinc-100">
                {formatTemp(current.main?.temp, "°C")}
              </div>
              <div className="text-xs text-zinc-500 capitalize truncate">
                {condition?.description ?? t.weatherUnavailable}
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-end gap-2 shrink-0">
          <button
            type="button"
            onClick={() => mutate()}
            disabled={isValidating}
            title={t.weatherRefresh}
            aria-label={t.weatherRefresh}
            className="p-1 rounded-md text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isValidating ? "animate-spin" : ""}`} />
          </button>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            <div className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-400">
              <Droplets className="w-3.5 h-3.5 text-blue-500" />
              <span className="font-medium">{humidity === null ? "—" : `${humidity}%`}</span>
            </div>
            <div className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-400 cursor-help" title={t.weatherRainCloud}>
              <CloudRain className="w-3.5 h-3.5 text-blue-400" />
              <span className="font-medium">{clouds === null ? "—" : `${clouds}%`}</span>
            </div>
            <div className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-400 col-span-2">
              <Wind className="w-3.5 h-3.5 text-teal-500" />
              <span className="font-medium">
                {wind === null ? "—" : `${wind.toFixed(1)} m/s`} {t.weatherWind}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 5-Day Forecast */}
      <div className="p-4 bg-zinc-50 dark:bg-zinc-950/50">
        <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">{t.weatherForecast}</div>
        <div className="flex justify-between items-start gap-1">
          {forecast.slice(0, 5).map((day: { dt: number; weather?: { icon: string }[]; main?: { temp?: number }; pop?: number }) => {
            const date = new Date(day.dt * 1000);
            // The 5-day/3h feed drops today once its last interval has passed,
            // so the first entry is not reliably today — compare the real date.
            const isToday = date.toDateString() === todayKey;
            return (
              <div key={day.dt} className="flex flex-col items-center gap-1.5 flex-1 min-w-0 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 p-1.5 rounded-lg transition-colors">
                <span className={`text-[10px] font-semibold uppercase ${isToday ? "text-emerald-600 dark:text-emerald-400" : "text-zinc-500"}`}>
                  {isToday ? t.weatherToday : new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(date)}
                </span>
                {getWeatherIcon(day.weather?.[0]?.icon ?? "", "w-5 h-5")}
                <div className="text-sm font-bold text-zinc-800 dark:text-zinc-200">
                  {formatTemp(day.main?.temp)}
                </div>
              </div>
            );
          })}

          {forecast.length === 0 && (
            <span className="text-xs text-zinc-400 py-2">{t.weatherUnavailable}</span>
          )}
        </div>
      </div>
    </div>
  );
}
