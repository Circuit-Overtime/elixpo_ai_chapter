interface CloudflareEnv {
  DB: D1Database;
  KV: KVNamespace;
  CLOUDINARY_CLOUD_NAME: string;
  CLOUDINARY_API_KEY: string;
  CLOUDINARY_API_SECRET: string;
  POLLINATIONS_API_KEY: string;
  ELIXSEARCH_API_KEY: string;
  CORS_ORIGIN: string;
}

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      DB?: D1Database;
      KV?: KVNamespace;
      CLOUDINARY_CLOUD_NAME?: string;
      CLOUDINARY_API_KEY?: string;
      CLOUDINARY_API_SECRET?: string;
      POLLINATIONS_API_KEY?: string;
      ELIXSEARCH_API_KEY?: string;
      CORS_ORIGIN?: string;
      NEXT_PUBLIC_ELIXPO_ACCOUNTS_CLIENT_ID?: string;
      NEXT_PUBLIC_ELIXPO_ACCOUNTS_BASE_URL?: string;
      ELIXPO_OAUTH_CLIENT_SECRET?: string;
    }
  }
}

export {};
