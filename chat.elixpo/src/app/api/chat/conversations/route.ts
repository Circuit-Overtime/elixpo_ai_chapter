import { NextRequest } from "next/server";
import { listConversations, deleteConversation } from "@/lib/chat/db";
import { getAuthenticatedUser } from "@/lib/auth/get-user";

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req.headers.get("cookie"));

    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
      });
    }

    const conversations = await listConversations(user.id);

    return new Response(JSON.stringify(conversations), {
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
    });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return new Response("Missing id", { status: 400 });

    await deleteConversation(id);
    return new Response(JSON.stringify({ success: true }));
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
    });
  }
}
