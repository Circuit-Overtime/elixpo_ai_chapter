import { NextResponse } from "next/server";
import { getTodaysPodcastDetails } from "@/lib/db";
import { getCached, setCache } from "@/lib/kv";
import type { PodcastDetails } from "@/lib/types";

export async function GET() {
  try {
    const cached = await getCached<PodcastDetails>("podcast:details");
    if (cached) return NextResponse.json(cached);

    const details = await getTodaysPodcastDetails();
    if (!details) return NextResponse.json({ error: "No podcast details found" }, { status: 404 });

    await setCache("podcast:details", details);
    return NextResponse.json(details);
  } catch (error) {
    console.error("Error fetching podcast details:", error);
    return NextResponse.json({ error: "Failed to fetch podcast details" }, { status: 500 });
  }
}
