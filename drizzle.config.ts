import { defineConfig } from "drizzle-kit";

function buildConnectionUrl(): string {
  const neonUrl = process.env.NEW_NEON_DATABASE_URL;
  if (neonUrl) {
    const unpooled = neonUrl.replace(/-pooler\./, '.');
    const separator = unpooled.includes('?') ? '&' : '?';
    return unpooled + separator + 'options=-csearch_path%3Dfacture';
  }
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }
  throw new Error("NEW_NEON_DATABASE_URL or DATABASE_URL must be set");
}

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: buildConnectionUrl(),
  },
});
