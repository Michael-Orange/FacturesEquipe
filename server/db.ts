import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

neonConfig.webSocketConstructor = ws;

function buildConnectionString(): string {
  const neonUrl = process.env.NEW_NEON_DATABASE_URL;
  if (neonUrl) {
    const unpooled = neonUrl.replace(/-pooler\./, '.');
    const separator = unpooled.includes('?') ? '&' : '?';
    return unpooled + separator + 'options=-csearch_path%3Dfacture';
  }
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }
  throw new Error(
    "NEW_NEON_DATABASE_URL or DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const connectionString = buildConnectionString();
export const pool = new Pool({ connectionString });
export const db = drizzle({ client: pool, schema });
