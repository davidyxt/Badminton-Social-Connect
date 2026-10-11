// The team spec uses /rest/v1, but the current-schema adapter is an Edge Function.
// Keep that transport difference in one place; request paths use the team names.
export function createAdminApiClient(
  { supabaseUrl, apiKey, getAccessToken, fetch: fetcher = globalThis.fetch },
) {
  const base = `${supabaseUrl.replace(/\/$/, "")}/functions/v1/admin-api`;
  async function request(
    path,
    { method = "GET", body, query, headers: extraHeaders = {} } = {},
  ) {
    if (!/^\/(?:[a-z_]+|rpc\/[a-z_]+)$/.test(path)) {
      throw new Error("Use a table path or /rpc/function name.");
    }
    const token = await getAccessToken();
    if (!token) throw new Error("Sign in before calling the admin API.");
    const url = new URL(`${base}${path}`);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value != null) url.searchParams.set(key, String(value));
    }
    const headers = new Headers(extraHeaders);
    headers.set("Authorization", `Bearer ${token}`);
    headers.set("apikey", apiKey);
    if (body !== undefined) headers.set("Content-Type", "application/json");
    const response = await fetcher(url, {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const data =
      response.status === 204 || response.headers.get("content-length") === "0"
        ? null
        : await response.text().then((text) => text ? JSON.parse(text) : null);
    if (!response.ok) {
      const error = new Error(data?.message ?? "The admin API request failed.");
      error.code = data?.code ?? "request_failed";
      error.status = response.status;
      throw error;
    }
    return { data, contentRange: response.headers.get("content-range") };
  }
  return {
    request,
    list: (table, query, headers) => request(`/${table}`, { query, headers }),
    rpc: (name, body) => request(`/rpc/${name}`, { method: "POST", body }),
    createAnnouncement: (body) =>
      request("/admin_post", { method: "POST", body }),
    updateAnnouncement: (id, body) =>
      request("/admin_post", {
        method: "PATCH",
        query: { adminPostId: `eq.${id}` },
        body,
      }),
    deleteAnnouncement: (id) =>
      request("/admin_post", {
        method: "DELETE",
        query: { adminPostId: `eq.${id}` },
      }),
  };
}
