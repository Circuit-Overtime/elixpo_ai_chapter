import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { D1Database } from "@cloudflare/workers-types";
import { nanoid } from "nanoid";

async function getDB(): Promise<D1Database> {
  const { env } = await getCloudflareContext();
  return (env as any).DB;
}

export interface Conversation {
  id: string;
  user_id: string;
  title: string;
  model: string;
  system_prompt?: string;
  created_at: number;
  updated_at: number;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  model?: string;
  created_at: number;
}

export async function createConversation(
  userId: string,
  title: string = "New Chat",
  model: string = "gpt-4o"
): Promise<string> {
  const db = await getDB();
  const id = nanoid();
  const now = Date.now();

  await db
    .prepare(
      "INSERT INTO conversations (id, user_id, title, model, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .bind(id, userId, title, model, now, now)
    .run();

  return id;
}

export async function getConversation(id: string): Promise<Conversation | null> {
  const db = await getDB();
  return db
    .prepare("SELECT * FROM conversations WHERE id = ?")
    .bind(id)
    .first<Conversation>();
}

export async function saveMessage({
  id = nanoid(),
  conversationId,
  role,
  content,
  model,
}: {
  id?: string;
  conversationId: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  model?: string;
}): Promise<string> {
  const db = await getDB();
  const now = Date.now();

  await db
    .prepare(
      "INSERT INTO messages (id, conversation_id, role, content, model, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .bind(id, conversationId, role, content, model || null, now)
    .run();

  // Update conversation updated_at
  await db
    .prepare("UPDATE conversations SET updated_at = ? WHERE id = ?")
    .bind(now, conversationId)
    .run();

  return id;
}

export async function getMessages(conversationId: string): Promise<Message[]> {
  const db = await getDB();
  const { results } = await db
    .prepare("SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC")
    .bind(conversationId)
    .all<Message>();
  return results;
}

export async function listConversations(userId: string): Promise<Conversation[]> {
  const db = await getDB();
  const { results } = await db
    .prepare("SELECT * FROM conversations WHERE user_id = ? ORDER BY updated_at DESC")
    .bind(userId)
    .all<Conversation>();
  return results;
}

export async function updateConversationTitle(id: string, title: string): Promise<void> {
  const db = await getDB();
  await db
    .prepare("UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?")
    .bind(title, Date.now(), id)
    .run();
}

export async function deleteConversation(id: string): Promise<void> {
  const db = await getDB();
  await db
    .prepare("DELETE FROM conversations WHERE id = ?")
    .bind(id)
    .run();
}
