// Dependency injection lets tests exercise the real SDK's HTTP requests.
import { ContractError } from "./contract.mjs";
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
      searchAccounts: async (term) => {
        const matches = [];
        // Auth email is absent from player. Scan paginated Auth records only
        // after handler authorization, returning IDs rather than Auth metadata.
        for (let page = 1; page <= 100; page++) {
          const { data, error } = await authAdmin.auth.admin.listUsers({
            page,
            perPage: 100,
          });
          if (error) throw new Error("Account search failed.");
          for (const account of data.users) {
            if (account.email?.toLowerCase().includes(term.toLowerCase())) {
              matches.push(account.id);
            }
          }
          if (matches.length > 200) {
            throw new ContractError(
              400,
              "search_too_broad",
              "More than 200 emails match. Narrow the search or use a player ID.",
            );
          }
          if (data.users.length < 100) return matches;
        }
        // Never return an incomplete result set as if the search were complete.
        throw new ContractError(
          400,
          "search_too_broad",
          "Account search exceeded 10,000 records. Use a player ID.",
        );
      },
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
