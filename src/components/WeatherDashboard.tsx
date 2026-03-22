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
  AlertCircle
} from "lucide-react";

const fetcher = (url: string) => fetch(url).then((res) => {
    if (!res.ok) throw new Error("API Hatası");
    return res.json();
});

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
  apiKey?: string;
}

export default function WeatherDashboard({ lat, lon, apiKey }: WeatherDashboardProps) {
  const { data, error, isLoading } = useSWR(`/api/weather?lat=${lat}&lon=${lon}${apiKey ? `&apiKey=${apiKey}` : ''}`, fetcher);

  if (isLoading) {
    return (
      <div className="bg-white/90 dark:bg-zinc-900/90 backdrop-blur-md border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 shadow-sm w-full md:w-[350px] animate-pulse">
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

  if (error || data?.error) {
    return (
      <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 rounded-xl p-4 shadow-sm w-full md:w-[350px] flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
        <div className="text-sm text-red-600 dark:text-red-400">
          <p className="font-semibold mb-1">Hava Durumu Alınamadı</p>
          <p>{data?.error || "Bir hata oluştu. API anahtarını kontrol edin."}</p>
        </div>
      </div>
    );
  }

  const { current, forecast } = data;
  
  if (!current) return null;

  return (
    <div className="bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-lg w-full md:w-[380px] overflow-hidden transition-all">
      {/* Current Weather */}
      <div className="p-4 md:p-5 flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800/50">
        <div>
          <div className="text-sm font-medium text-emerald-600 dark:text-emerald-400 mb-1">Anlık Durum</div>
          <div className="flex items-center gap-3">
            {getWeatherIcon(current.weather[0].icon, "w-10 h-10")}
            <div>
              <div className="text-3xl font-bold tracking-tighter text-zinc-800 dark:text-zinc-100">
                {Math.round(current.main.temp)}°C
              </div>
              <div className="text-xs text-zinc-500 capitalize">
                {current.weather[0].description}
              </div>
            </div>
          </div>
        </div>
        
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
          <div className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-400">
            <Droplets className="w-3.5 h-3.5 text-blue-500" />
            <span className="font-medium">{current.main.humidity}%</span>
          </div>
          <div className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-400 cursor-help" title="Yağış / Bulut">
            <CloudRain className="w-3.5 h-3.5 text-blue-400" />
            <span className="font-medium">{current.clouds?.all || 0}%</span>
          </div>
          <div className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-400 col-span-2 mt-1">
            <Wind className="w-3.5 h-3.5 text-teal-500" />
            <span className="font-medium">{current.wind.speed.toFixed(1)} m/s Rüzgar</span>
          </div>
        </div>
      </div>

      {/* 5-Day Forecast */}
      <div className="p-4 bg-zinc-50 dark:bg-zinc-950/50">
        <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">5 Günlük Özet</div>
        <div className="flex justify-between items-center gap-1">
          {forecast?.slice(0, 5).map((day: any, i: number) => {
            const date = new Date(day.dt * 1000);
            const isToday = i === 0;
            return (
              <div key={day.dt} className="flex flex-col items-center gap-1.5 flex-1 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 p-1.5 rounded-lg transition-colors">
                <span className={`text-[10px] font-semibold uppercase ${isToday ? "text-emerald-600 dark:text-emerald-400" : "text-zinc-500"}`}>
                  {isToday ? "BUGÜN" : new Intl.DateTimeFormat('tr-TR', { weekday: 'short' }).format(date)}
                </span>
                {getWeatherIcon(day.weather[0].icon, "w-5 h-5")}
                <div className="text-sm font-bold text-zinc-800 dark:text-zinc-200">
                  {Math.round(day.main.temp)}°
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
