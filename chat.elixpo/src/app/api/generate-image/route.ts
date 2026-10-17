import { NextRequest } from "next/server";
import { POLLINATIONS_BASE_URL } from "@/lib/pollinations";

export async function POST(req: NextRequest) {
  try {
    const { prompt, width = 1024, height = 1024, model = "flux" } = (await req.json()) as any;

    if (!prompt) {
      return new Response(JSON.stringify({ error: "Missing prompt" }), { status: 400 });
    }

    const seed = Math.floor(Math.random() * 100000000);
    const imageUrl = `${POLLINATIONS_BASE_URL}/prompt/${encodeURIComponent(prompt)}?width=${width}&height=${height}&seed=${seed}&nologo=true&model=${model}`;

    return new Response(JSON.stringify({ url: imageUrl }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
