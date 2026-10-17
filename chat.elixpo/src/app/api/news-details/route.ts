import { NextResponse } from "next/server";
import { getTodaysNewsDetails } from "@/lib/db";
import { getCached, setCache } from "@/lib/kv";
import type { NewsDetails } from "@/lib/types";

export async function GET() {
  try {
    const cached = await getCached<NewsDetails>("news:details");
    if (cached) return NextResponse.json(cached);

    const details = await getTodaysNewsDetails();
    if (!details) return NextResponse.json({ error: "No news details found" }, { status: 404 });

    await setCache("news:details", details);
    return NextResponse.json(details);
  } catch (error) {
    console.error("Error fetching news details:", error);
    return NextResponse.json({ error: "Failed to fetch news details" }, { status: 500 });
  }
}
