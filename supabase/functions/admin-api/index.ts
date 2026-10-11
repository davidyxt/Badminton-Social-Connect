import { createClient } from "@supabase/supabase-js";
import { createHandler } from "./handler.mjs";
import { createContextFactory } from "./context.mjs";

const url = Deno.env.get("SUPABASE_URL");
const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if (!url || !anonKey || !serviceKey) {
  throw new Error("Supabase function environment is incomplete.");
}
const handler = createHandler({
  allowedOrigins:
    (Deno.env.get("ADMIN_ALLOWED_ORIGINS") ?? "http://localhost:5173").split(
      ",",
    ).map((s) => s.trim()).filter(Boolean),
  getContext: createContextFactory(createClient, { url, anonKey, serviceKey }),
});
Deno.serve(handler);
