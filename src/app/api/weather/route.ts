import { NextRequest, NextResponse } from "next/server";

interface ForecastItem {
  dt_txt: string;
  [key: string]: unknown;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const lat = searchParams.get("lat");
  const lon = searchParams.get("lon");
  const customApiKey = searchParams.get("apiKey");

  if (!lat || !lon) {
    return NextResponse.json({ error: "Latitude and longitude are required." }, { status: 400 });
  }

  const API_KEY = customApiKey || process.env.OPENWEATHER_API_KEY;

  if (!API_KEY) {
    return NextResponse.json({ 
      error: "API Key missing. Please enter your OpenWeather API key in settings." 
    }, { status: 500 });
  }

  try {
    const urls = [
      `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric&lang=en`,
      `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric&lang=en`
    ];

    const [currentRes, forecastRes] = await Promise.all(urls.map(url => fetch(url)));

    if (!currentRes.ok || !forecastRes.ok) {
      return NextResponse.json({ error: "Could not fetch weather data." }, { status: 502 });
    }

    const currentData = await currentRes.json();
    const forecastData = await forecastRes.json();

    // forecastData.list contains 3-hour intervals for 5 days.
    // We want to extract one forecast per day (ideally at 12:00 PM, or the first available for that day)
    const dailyForecasts: ForecastItem[] = [];
    const seenDates = new Set();

    for (const item of forecastData.list as ForecastItem[]) {
      const date = item.dt_txt.split(" ")[0];
      if (!seenDates.has(date)) {
        seenDates.add(date);
        const itemsForDate = (forecastData.list as ForecastItem[]).filter((i) => i.dt_txt.startsWith(date));
        const targetItem = itemsForDate.find((i) => i.dt_txt.includes("12:00:00")) || itemsForDate[0];
        dailyForecasts.push(targetItem);
      }
    }

    return NextResponse.json({
      current: currentData,
      forecast: dailyForecasts
    });
    
  } catch (error) {
    console.error("Weather API error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
