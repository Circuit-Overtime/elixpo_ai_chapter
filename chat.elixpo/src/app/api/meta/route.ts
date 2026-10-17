import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/meta?url=https://example.com
 * Fetches the page title and meta description for a given URL.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");
  if (!url) return NextResponse.json({ error: "Missing url" }, { status: 400 });

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ElixpoBot/1.0)" },
      signal: AbortSignal.timeout(4000),
    });

    // Only read the first chunk of HTML — we just need <head>
    const text = await res.text();
    const head = text.slice(0, 8000);

    const titleMatch = head.match(/<title[^>]*>([^<]+)<\/title>/i);
    const descMatch =
      head.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i) ||
      head.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i) ||
      head.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i) ||
      head.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:description["']/i);

    return NextResponse.json({
      title: titleMatch?.[1]?.trim() || "",
      description: descMatch?.[1]?.trim() || "",
    });
  } catch {
    return NextResponse.json({ title: "", description: "" });
  }
}
