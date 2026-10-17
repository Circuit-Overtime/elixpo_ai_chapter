import { NextResponse } from "next/server";
import { getTodaysPodcast } from "@/lib/db";
import { getCached, setCache } from "@/lib/kv";
import type { Podcast } from "@/lib/types";

export async function GET() {
  try {
    const cached = await getCached<Podcast>("podcast:latest");
    if (cached) return NextResponse.json(cached);

    const podcast = await getTodaysPodcast();
    if (!podcast) return NextResponse.json({ error: "No podcast found" }, { status: 404 });

    await setCache("podcast:latest", podcast);
    return NextResponse.json(podcast);
  } catch (error) {
    console.error("Error fetching podcast:", error);
    return NextResponse.json({ error: "Failed to fetch podcast" }, { status: 500 });
  }
}
