// BL-087: email a notification to the player it is for.
//
// Called by the database (pg_net) after every insert into public.notification,
// so every in-app notification has a matching email. See
// supabase/migrations/*_bl087_email_notifications.sql.
//
// Environment (supabase/functions/.env locally, `supabase secrets set` hosted):
//   EMAIL_WEBHOOK_SECRET  must match the vault secret the database sends
//   RESEND_API_KEY        Resend API key. If unset, the function does a dry
//                         run: it builds the email, logs it and sends nothing.
//   EMAIL_FROM            e.g. "Badminton Social Connect <noreply@your-domain>"
//   APP_URL               base URL for links, e.g. https://app.example.org
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.

import { createClient } from "npm:@supabase/supabase-js@2";

type Notification = {
  notification_id: string;
  player_id: string;
  type: string;
  message: string;
  detail: string | null;
  post_id: string | null;
  match_id: string | null;
};

const SUBJECTS: Record<string, string> = {
  join_request: "New request to join your game",
  request_accepted: "You're in: your request was accepted",
  request_declined: "Your request to join a game was declined",
  request_withdrawn: "A player withdrew from your game",
  game_cancelled: "A game you joined was cancelled",
  game_removed: "A game you joined was removed",
  no_show: "You were marked as a no-show",
  result_submitted: "A match result needs your confirmation",
  dispute_update: "Update on your result dispute",
  match_reminder: "Reminder: you have a game coming up",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

function linkFor(n: Notification, appUrl: string): string {
  if (n.match_id) return `${appUrl}/matches/${n.match_id}`;
  if (n.post_id && n.type !== "game_removed") return `${appUrl}/games/${n.post_id}`;
  return `${appUrl}/notifications`;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  // Only the database may call this. The secret is compared in full; a
  // missing secret on either side refuses everything.
  const secret = Deno.env.get("EMAIL_WEBHOOK_SECRET");
  if (!secret || req.headers.get("x-webhook-secret") !== secret) {
    return json({ error: "unauthorised" }, 401);
  }

  let payload: { table?: string; record?: Notification };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }
  const n = payload.record;
  if (payload.table !== "notification" || !n?.player_id || !n.message) {
    return json({ error: "not a notification" }, 400);
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const { data, error } = await admin.auth.admin.getUserById(n.player_id);
  if (error || !data.user?.email) {
    return json({ skipped: "no email address" });
  }

  const appUrl = (Deno.env.get("APP_URL") ?? "http://localhost:5173").replace(/\/$/, "");
  const link = linkFor(n, appUrl);
  const subject = SUBJECTS[n.type] ?? "Update from Badminton Social Connect";
  const lines = [n.message, n.detail].filter(Boolean) as string[];

  const text = [...lines, "", `Open the app: ${link}`, "",
    "You get these emails because of activity on your Badminton Social Connect account.",
    `Turn them off in your profile settings: ${appUrl}/profile`].join("\n");

  const html = `<div style="font-family:system-ui,sans-serif;max-width:520px">
  <p style="font-size:16px">${escapeHtml(n.message)}</p>
  ${n.detail ? `<p style="color:#555">${escapeHtml(n.detail)}</p>` : ""}
  <p><a href="${escapeHtml(link)}" style="display:inline-block;padding:10px 16px;background:#0b5;color:#fff;border-radius:6px;text-decoration:none">Open Badminton Social Connect</a></p>
  <p style="color:#888;font-size:12px">You get these emails because of activity on your Badminton Social Connect account.
  <a href="${escapeHtml(appUrl)}/profile">Turn them off</a> in your profile settings.</p>
</div>`;

  const email = {
    from: Deno.env.get("EMAIL_FROM") ?? "Badminton Social Connect <onboarding@resend.dev>",
    to: data.user.email,
    subject,
    text,
    html,
  };

  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) {
    // Never log the address itself.
    console.log(`dry run: ${n.type} for player ${n.player_id}: ${subject}`);
    return json({ dryRun: true, notificationId: n.notification_id, subject });
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(email),
  });

  if (!res.ok) {
    console.error(`resend failed (${res.status}) for notification ${n.notification_id}`);
    return json({ error: "send failed", status: res.status }, 502);
  }

  return json({ sent: true, notificationId: n.notification_id });
});
