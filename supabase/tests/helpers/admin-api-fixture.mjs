import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createHandler } from "../../functions/admin-api/handler.mjs";
import { createContextFactory } from "../../functions/admin-api/context.mjs";

const require = createRequire(
  new URL("../../../frontend/package.json", import.meta.url),
);
const { createClient } = require("@supabase/supabase-js");
export const id = "11111111-1111-4111-8111-111111111111";
export const stamp = "2026-09-24T06:40:25.123456+00:00";
export const admin = {
  id,
  email: "admin@example.test",
  app_metadata: { role: "admin" },
  user_metadata: {},
  identities: [],
  aud: "authenticated",
  created_at: stamp,
};
export function fixture(
  {
    user = admin,
    dbReply = () => ({ body: [] }),
    authStatus = 200,
    account = admin,
  } = {},
) {
  const calls = [];
  const fetch = (input, options = {}) => {
    const url = new URL(String(input));
    const call = {
      url,
      method: options.method ?? "GET",
      headers: new Headers(options.headers),
      body: options.body ? JSON.parse(options.body) : null,
    };
    calls.push(call);
    if (url.pathname === "/auth/v1/user") {
      return Promise.resolve(Response.json(
        authStatus === 200 ? user : { msg: "Rejected", code: "bad_jwt" },
        { status: authStatus },
      ));
    }
    if (url.pathname.startsWith("/auth/v1/admin/users/")) {
      return Promise.resolve(Response.json({ user: account }));
    }
    assert.match(url.pathname, /^\/rest\/v1\//);
    const reply = dbReply(call);
    const headers = {
      "Content-Type": "application/json",
      "Content-Range": `0-0/${reply.count ?? 1}`,
    };
    return Promise.resolve(
      new Response(
        call.method === "HEAD" ? null : JSON.stringify(reply.body),
        { status: reply.status ?? 200, headers },
      ),
    );
  };
  const client = (url, key, options) =>
    createClient(url, key, {
      ...options,
      global: { ...options.global, fetch },
    });
  const getContext = createContextFactory(client, {
    url: "https://supabase.example.test",
    anonKey: "test-public-key",
    serviceKey: "test-server-key",
  });
  const handler = createHandler({ getContext });
  async function request(
    path,
    {
      method = "GET",
      body,
      token = "admin-token",
      origin,
      raw,
      contentType = "application/json",
      headers: extraHeaders = {},
    } = {},
  ) {
    const headers = { ...extraHeaders };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (origin) headers.Origin = origin;
    if (body !== undefined || raw !== undefined) {
      headers["Content-Type"] = contentType;
    }
    const response = await handler(
      new Request(`http://localhost/functions/v1/admin-api/${path}`, {
        method,
        headers,
        body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
      }),
    );
    const source = await response.text();
    return { response, json: source ? JSON.parse(source) : null };
  }
  return { request, calls };
}
