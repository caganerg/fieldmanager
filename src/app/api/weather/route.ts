import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const lat = searchParams.get("lat");
  const lon = searchParams.get("lon");
  const customApiKey = searchParams.get("apiKey");

  if (!lat || !lon) {
    return NextResponse.json({ error: "Enlem ve boylam zorunludur." }, { status: 400 });
  }

  const API_KEY = customApiKey || process.env.OPENWEATHER_API_KEY;

  if (!API_KEY) {
    // API Key yoksa test amaciyla dummy data dondurebiliriz fakat biz hata verdirecegiz.
    return NextResponse.json({ 
      error: "Hava durumu verisi için API Anahtarı eksik. Lütfen ayarlardan OpenWeather API anahtarınızı girin." 
    }, { status: 500 });
  }

  try {
    const urls = [
      `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric&lang=tr`,
      `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric&lang=tr`
    ];

    const [currentRes, forecastRes] = await Promise.all(urls.map(url => fetch(url)));

    if (!currentRes.ok || !forecastRes.ok) {
        return NextResponse.json({ error: "Hava durumu verisi alınamadı." }, { status: 502 });
    }

    const currentData = await currentRes.json();
    const forecastData = await forecastRes.json();

    // forecastData.list contains 3-hour intervals for 5 days.
    // We want to extract one forecast per day (e.g. at 12:00 PM)
    const dailyForecasts = forecastData.list.filter((item: any) => {
        return item.dt_txt.includes("12:00:00");
    });

    return NextResponse.json({
        current: currentData,
        forecast: dailyForecasts
    });
    
  } catch (error) {
    console.error("Hava durumu API hatası:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
