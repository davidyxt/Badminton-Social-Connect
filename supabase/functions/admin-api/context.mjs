// Dependency injection lets tests exercise the real SDK's HTTP requests.
export function createContextFactory(
  createClient,
  { url, anonKey, serviceKey },
) {
  const options = {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  };
  const authAdmin = createClient(url, serviceKey, options);
  return async (token) => {
    const db = createClient(url, anonKey, {
      ...options,
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    // Auth verifies the JWT and returns current user metadata. Never trust
    // user_metadata or an unverified JWT payload to grant administrator access.
    const { data, error } = await db.auth.getUser(token);
    if (error) {
      if (!error.status || error.status >= 500) throw error;
      return { user: null, db };
    }
    return {
      user: data.user,
      db,
      getAccount: async (id) => {
        const { data, error } = await authAdmin.auth.admin.getUserById(id);
        if (error || !data.user) throw new Error("Account lookup failed.");
        // Never expose identities, auth metadata, or the privileged client.
        return {
          email: data.user.email ?? null,
          last_sign_in_at: data.user.last_sign_in_at ?? null,
          email_confirmed_at: data.user.email_confirmed_at ?? null,
        };
      },
    };
  };
}
