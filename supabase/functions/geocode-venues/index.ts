// Works through public.venue_geocode_queue: finds a pin for each venue with
// OpenStreetMap Nominatim and writes it back. Called every minute by pg_cron
// (private.invoke_geocoder); see migrations/*_venue_geocoding_queue.sql.
//
// Only one worker may talk to Nominatim at a time. geocode_claim_batch hands
// out a database lease; if another worker holds it, this call does nothing.
//
// Environment (supabase/functions/.env locally, `supabase secrets set` hosted):
//   GEOCODE_WEBHOOK_SECRET  must match the vault secret geocode_function_secret
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.

import { createClient } from "npm:@supabase/supabase-js@2";
import { lookup, Throttle, type Venue } from "./nominatim.ts";

type QueuedVenue = Venue & { queueId: number; venueId: string };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const secret = Deno.env.get("GEOCODE_WEBHOOK_SECRET");
  if (!secret || req.headers.get("x-webhook-secret") !== secret) {
    return json({ error: "unauthorised" }, 401);
  }

  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const { data: claim, error: claimError } = await db.rpc("geocode_claim_batch", { p_max: 25 });
  if (claimError) return json({ error: claimError.message }, 500);
  if (!claim.leased) return json({ skipped: "another worker is running" });

  const venues = claim.venues as QueuedVenue[];

  const work = async () => {
    const throttle = new Throttle(); // one Nominatim request per second
    let found = 0;
    try {
      for (const venue of venues) {
        const result = await lookup(venue, throttle);
        if (result.pin) found++;
        const { error } = await db.rpc("geocode_complete", {
          p_queue_id: venue.queueId,
          p_lat: result.pin?.lat ?? null,
          p_lng: result.pin?.lng ?? null,
          p_error: result.error ?? null,
        });
        if (error) console.error(`geocode_complete ${venue.queueId}: ${error.message}`);
      }
    } finally {
      const { error } = await db.rpc("geocode_release");
      if (error) console.error(`geocode_release: ${error.message}`);
    }
    console.log(`geocoded ${found} of ${venues.length} venues`);
    return { processed: venues.length, found, missed: venues.length - found };
  };

  // Tests can wait for the result with ?wait=true.
  if (new URL(req.url).searchParams.get("wait") === "true") {
    return json(await work());
  }

  // pg_net hangs up after a few seconds, and a request that is cut off stops
  // the function. So reply at once and finish the batch in the background.
  // @ts-ignore: EdgeRuntime is provided by Supabase's Edge Runtime.
  EdgeRuntime.waitUntil(work());
  return json({ accepted: venues.length }, 202);
});
