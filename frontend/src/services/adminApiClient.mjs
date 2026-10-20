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
    if (
      !/^\/[a-z_]+(?:\/(?:[a-z_]+|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})){0,2}$/i
        .test(path)
    ) {
      throw new Error(
        "Use a documented admin endpoint path; pass filters through query.",
      );
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
      const detail = data?.error ?? data;
      const error = new Error(
        detail?.message ?? "The admin API request failed.",
      );
      error.code = detail?.code ?? "request_failed";
      error.status = response.status;
      throw error;
    }
    return { data, contentRange: response.headers.get("content-range") };
  }
  return {
    request,
    list: (table, query, headers) => request(`/${table}`, { query, headers }),
    rpc: (name, body) => request(`/rpc/${name}`, { method: "POST", body }),
    capabilities: () => request("/capabilities"),
    overview: () => request("/overview"),
    attention: (query) => request("/overview/attention", { query }),
    analytics: (query) => request("/analytics", { query }),
    userSummary: (id) => request(`/users/${id}/summary`),
    userRegistration: (id) => request(`/users/${id}/registration`),
    userRating: (id) => request(`/users/${id}/rating`),
    userRatingTrend: (id, query) =>
      request(`/users/${id}/rating_trend`, { query }),
    userRatingHistory: (id, query) =>
      request(`/users/${id}/rating_history`, { query }),
    resultFlags: (query) => request("/result_flags", { query }),
    leaderboard: (query) => request("/rankings/leaderboard", { query }),
    userParticipation: (id, kind, query) =>
      request(`/users/${id}/${kind}`, { query }),
    reportContext: (id) => request(`/reports/${id}/context`),
    matchContext: (id) => request(`/matches/${id}/context`),
    updateReportStatus: (id, status, expectedUpdatedAt) =>
      request(`/reports/${id}`, {
        method: "PATCH",
        body: { status, expected_updated_at: expectedUpdatedAt },
      }),
    sendNotification: (body) =>
      request("/notifications", { method: "POST", body }),
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
