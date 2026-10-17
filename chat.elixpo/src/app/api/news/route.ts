import { NextResponse } from "next/server";
import { getTodaysNews } from "@/lib/db";
import { getCached, setCache } from "@/lib/kv";
import type { News } from "@/lib/types";

export async function GET() {
  try {
    const cached = await getCached<News>("news:latest");
    if (cached) return NextResponse.json(cached);

    const news = await getTodaysNews();
    if (!news) return NextResponse.json({ error: "No news found" }, { status: 404 });

    await setCache("news:latest", news);
    return NextResponse.json(news);
  } catch (error) {
    console.error("Error fetching news:", error);
    return NextResponse.json({ error: "Failed to fetch news" }, { status: 500 });
  }
}
