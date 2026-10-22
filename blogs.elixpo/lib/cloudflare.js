import { getRequestContext } from '@cloudflare/next-on-pages';

export function getDB() {
  return getRequestContext().env.DB;
}

export function getKV() {
  return getRequestContext().env.KV;
}

