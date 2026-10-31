/**
 * Prints the setup SQL with the app key filled in, ready to paste into the Supabase SQL editor:
 *   npm run db:sql
 */
import { readdirSync, readFileSync } from "node:fs";

try { process.loadEnvFile(".env.local"); } catch { /* fall back to the real environment */ }
const key = process.env.SUPABASE_APP_KEY;
if (!key) {
  console.error("SUPABASE_APP_KEY is not set (add it to .env.local).");
  process.exit(1);
}
if (!/^[A-Za-z0-9_-]{16,}$/.test(key)) {
  console.error("SUPABASE_APP_KEY must be 16+ characters of letters, digits, '_' or '-' (it is embedded in SQL).");
  process.exit(1);
}
const dir = new URL("../supabase/migrations/", import.meta.url);
for (const f of readdirSync(dir).filter((n) => n.endsWith(".sql")).sort()) {
  console.log(readFileSync(new URL(f, dir), "utf8").replaceAll("__APP_KEY__", key));
}
