import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const imageUrl = searchParams.get("imageUrl");

  if (!imageUrl) {
    return NextResponse.json({ error: "Missing imageUrl query parameter" }, { status: 400 });
  }

  try {
    const res = await fetch(imageUrl);
    const buffer = await res.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    // Simple dominant color extraction from raw image bytes
    // Sample pixels from the image data (skip headers, sample every 30 bytes)
    let r = 0,
      g = 0,
      b = 0,
      count = 0;

    // Start after typical image header bytes and sample RGB triplets
    for (let i = 54; i < bytes.length - 2; i += 30) {
      r += bytes[i];
      g += bytes[i + 1];
      b += bytes[i + 2];
      count++;
    }

    if (count === 0) {
      return NextResponse.json({ color: "rgb(30, 37, 56)" });
    }

    r = Math.round(r / count);
    g = Math.round(g / count);
    b = Math.round(b / count);

    return NextResponse.json({ color: `rgb(${r}, ${g}, ${b})` });
  } catch (error) {
    console.error("Error processing image:", error);
    return NextResponse.json({ color: "rgb(30, 37, 56)" });
  }
}
