import { NextRequest, NextResponse } from "next/server";

interface ForecastItem {
  dt_txt: string;
  [key: string]: unknown;
}

// This route is unauthenticated and open to anyone who can reach the server,
// so a per-client cap keeps a single caller from burning through the shared
// OpenWeather quota. In-memory is fine here: the app is deployed as a single
// long-running process (see README), not across multiple serverless instances.
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 20;
const requestCounts = new Map<string, { count: number; windowStart: number }>();

function getClientKey(request: NextRequest): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  return request.headers.get("x-real-ip") || "unknown";
}

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const entry = requestCounts.get(key);

  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    requestCounts.set(key, { count: 1, windowStart: now });
    // Opportunistic sweep so the map doesn't grow unbounded over the life of
    // the process when many distinct clients (or spoofed IPs) show up.
    if (requestCounts.size > 5000) {
      for (const [mapKey, mapEntry] of requestCounts) {
        if (now - mapEntry.windowStart > RATE_LIMIT_WINDOW_MS) requestCounts.delete(mapKey);
      }
    }
    return false;
  }

  entry.count += 1;
  return entry.count > RATE_LIMIT_MAX_REQUESTS;
}

export async function GET(request: NextRequest) {
  if (isRateLimited(getClientKey(request))) {
    return NextResponse.json(
      { error: "Too many weather requests. Please slow down and try again shortly." },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

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

