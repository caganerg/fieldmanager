import { NextRequest, NextResponse } from "next/server";

interface ForecastItem {
  dt_txt: string;
  [key: string]: unknown;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const rawLat = searchParams.get("lat");
  const rawLon = searchParams.get("lon");

  if (!rawLat || !rawLon) {
    return NextResponse.json({ error: "Latitude and longitude are required." }, { status: 400 });
  }

  const lat = parseFloat(rawLat);
  const lon = parseFloat(rawLon);

  // Validate coordinates to prevent parameter injection & invalid geo queries
  if (Number.isNaN(lat) || Number.isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return NextResponse.json({ error: "Invalid coordinate values provided." }, { status: 400 });
  }

  // The key is only ever read from the server environment. It is never accepted
  // from the request, so it cannot leak into browser storage, URLs or logs.
  const API_KEY = (process.env.OPENWEATHER_API_KEY || "").trim();

  if (!API_KEY) {
    // `configured: false` lets the client show a setup hint rather than an error.
    return NextResponse.json({
      configured: false,
      error: "Weather is not configured on this server. Set OPENWEATHER_API_KEY in .env.local."
    }, { status: 503 });
  }

  // Guard against a malformed value in the environment reaching the upstream API
  if (!/^[a-zA-Z0-9_-]{16,64}$/.test(API_KEY)) {
    return NextResponse.json({
      configured: false,
      error: "The configured OPENWEATHER_API_KEY is malformed."
    }, { status: 503 });
  }

  try {
    const encodedLat = encodeURIComponent(lat.toString());
    const encodedLon = encodeURIComponent(lon.toString());
    const encodedKey = encodeURIComponent(API_KEY);

    const urls = [
      `https://api.openweathermap.org/data/2.5/weather?lat=${encodedLat}&lon=${encodedLon}&appid=${encodedKey}&units=metric&lang=en`,
      `https://api.openweathermap.org/data/2.5/forecast?lat=${encodedLat}&lon=${encodedLon}&appid=${encodedKey}&units=metric&lang=en`
    ];

    const [currentRes, forecastRes] = await Promise.all(
      urls.map((url) =>
        fetch(url, {
          headers: {
            "Accept": "application/json",
            "User-Agent": "FieldManager/1.0",
          },
          next: { revalidate: 600 } // Cache weather responses for 10 minutes to save API quota
        })
      )
    );

    if (!currentRes.ok || !forecastRes.ok) {
      const errorMsg = !currentRes.ok && currentRes.status === 401 ? "Invalid API Key." : "Could not fetch weather data from upstream provider.";
      return NextResponse.json({ error: errorMsg }, { status: 502 });
    }

    const currentData = await currentRes.json();
    const forecastData = await forecastRes.json();

    // forecastData.list contains 3-hour intervals for 5 days.
    // Pick one representative entry per day (midday when available, otherwise the
    // first entry of that day) in a single pass over the list.
    const byDate = new Map<string, ForecastItem>();

    if (Array.isArray(forecastData?.list)) {
      for (const item of forecastData.list as ForecastItem[]) {
        if (!item?.dt_txt) continue;
        const [date, time] = item.dt_txt.split(" ");
        // Keep the first entry seen for a day, then upgrade to the midday reading
        // when it comes along (a day has at most one 12:00:00 entry).
        if (!byDate.has(date) || time === "12:00:00") {
          byDate.set(date, item);
        }
      }
    }

    const dailyForecasts: ForecastItem[] = Array.from(byDate.values());

    return NextResponse.json(
      {
        current: currentData,
        forecast: dailyForecasts
      },
      {
        // Mirror the 10-minute upstream cache so repeat views are served without
        // another round trip to this route.
        headers: { "Cache-Control": "public, max-age=0, s-maxage=600, stale-while-revalidate=600" }
      }
    );
    
  } catch (error) {
    console.error("Weather API request failure:", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ error: "Internal server error occurred." }, { status: 500 });
  }
}

