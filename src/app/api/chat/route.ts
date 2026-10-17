import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";
import {
  POLLINATIONS_API_KEY,
  POLLINATIONS_BASE_URL,
  DEFAULT_MODEL,
} from "@/lib/pollinations";
import {
  saveMessage,
  createConversation,
  getMessages,
  getConversation,
} from "@/lib/chat/db";
import { NextRequest } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/get-user";

const pollinations = createOpenAI({
  apiKey: POLLINATIONS_API_KEY,
  baseURL: `${POLLINATIONS_BASE_URL}/v1`,
});

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser(req.headers.get("cookie"));

  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
    });
  }

  const userId = user.id;
  try {
    const body = (await req.json()) as any;

    const { messages, model = DEFAULT_MODEL, id: conversationId } = body;
    if (!messages) {
      return new Response(
        JSON.stringify({
          error: "messages missing from request body",
        }),
        { status: 400 },
      );
    }
    const modelMessages = messages.map((msg: any) => ({
      role: msg.role,
      content:
        msg.content ??
        msg.parts
          ?.filter((p: any) => p.type === "text")
          ?.map((p: any) => p.text)
          ?.join("") ??
        "",
    }));
    let currentConversationId = conversationId;
    if (currentConversationId) {
      const existing = await getConversation(currentConversationId);

      if (!existing) {
        // Unknown/stale id — start a fresh conversation for this user.
        currentConversationId = await createConversation(
          userId,
          "New Chat",
          model,
        );
      } else if (existing.user_id !== userId) {
        // Caller doesn't own this conversation.
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
        });
      }
    } else {
      currentConversationId = await createConversation(
        userId,
        "New Chat",
        model,
      );
    }

    const lastMessage = messages[messages.length - 1];

    if (lastMessage?.role === "user") {
      const content =
        lastMessage.content ??
        lastMessage.parts
          ?.filter((p: any) => p.type === "text")
          ?.map((p: any) => p.text)
          ?.join("") ??
        "";

      await saveMessage({
        conversationId: currentConversationId,
        role: "user",
        content,
        model,
      });
    }

    const systemPrompt = `You are Elixpo Chat, an advanced AI assistant. You are capable of text, voice, and image analysis.
You are powered by Pollinations AI and run on optimized CPU inference.
Be helpful, concise, and do not use emojis unless specifically requested. Keep your design clean.`;

    const result = streamText({
      model: pollinations(model),
      system: systemPrompt,
      messages: modelMessages,
      async onFinish({ text }) {
        await saveMessage({
          conversationId: currentConversationId,
          role: "assistant",
          content: text,
          model,
        });
      },
    });

    return result.toUIMessageStreamResponse({
      headers: {
        "x-conversation-id": currentConversationId,
      },
    });
  } catch (error: any) {
    console.error("API Chat Error:", error);

    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
    });
  }
}

export async function GET(req: NextRequest) {
  const user = await getAuthenticatedUser(req.headers.get("cookie"));

  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
    });
  }

  const id = req.nextUrl.searchParams.get("id");

  if (!id) {
    return new Response(JSON.stringify({ error: "Missing id" }), {
      status: 400,
    });
  }

  const conversation = await getConversation(id);

  if (!conversation) {
    return new Response(JSON.stringify({ error: "Conversation not found" }), {
      status: 404,
    });
  }

  if (conversation.user_id !== user.id) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
    });
  }

  const messages = await getMessages(id);

  return new Response(JSON.stringify(messages), {
    headers: {
      "Content-Type": "application/json",
    },
  });
}
