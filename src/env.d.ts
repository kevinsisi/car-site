/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    runtime?: {
      env: CloudflareEnv;
      ctx: ExecutionContext;
      caches: CacheStorage;
    };
    admin?: {
      id: string;
      username: string;
    };
  }
}

interface CloudflareEnv {
  MITA_ENV?: string;
  DB_PREVIEW?: D1Database;
  IMPORT_PREVIEW_TOKEN?: string;
  MEDIA_PREVIEW?: R2Bucket;
  ASSETS?: Fetcher;
  SESSION_SECRET?: string;
  LOGIN_RATE_LIMITER?: import('./lib/shared-rate-limit').SharedRateLimiter;
}
