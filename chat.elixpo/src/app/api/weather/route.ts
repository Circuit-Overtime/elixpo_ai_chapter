import { NextRequest, NextResponse } from "next/server";
import { getStructuredWeather, generateAISummary, generateAIImage } from "@/lib/weather";
import { getCached, setCache } from "@/lib/kv";
import type { WeatherResponse } from "@/lib/types";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const location = searchParams.get("location");

    if (!location) {
      return NextResponse.json({ error: "Missing location parameter" }, { status: 400 });
    }

    const parts = location.split(",").map((s) => s.trim());
    const cityName = parts[0];
    const lat = parseFloat(parts[1]);
    const lon = parseFloat(parts[2]);

    if (!lat || !lon) {
      return NextResponse.json({ error: "Unable to resolve location" }, { status: 400 });
    }

    const cacheKey = `weather:${cityName.toLowerCase()}`;
    const cached = await getCached<WeatherResponse>(cacheKey);
    if (cached) return NextResponse.json(cached);

    const structuredWeather = await getStructuredWeather(lat, lon, cityName);
    if (!structuredWeather) {
      return NextResponse.json({ error: "Failed to fetch weather data" }, { status: 500 });
    }

    const { env } = await getCloudflareContext();
    const token = (env as any).POLLINATIONS_TOKEN || "fEWo70t94146ZYgk";

    const aiSummary = await generateAISummary(structuredWeather, token);
    const aiImageLink = generateAIImage(structuredWeather.current.condition, token);

    const responseData: WeatherResponse = {
      structuredWeather,
      aiSummary,
      aiImageLink,
      bannerLink: aiImageLink,
    };

    await setCache(cacheKey, responseData);
    return NextResponse.json(responseData);
  } catch (error) {
    console.error("Error fetching weather:", error);
    return NextResponse.json({ error: "Failed to fetch weather" }, { status: 500 });
  }
}
