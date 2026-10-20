import { supabase, supabaseUrl } from "./supabase";
import { createAdminApiClient } from "./adminApiClient.mjs";

export const adminApi = createAdminApiClient({
  supabaseUrl,
  apiKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
  getAccessToken: async () => {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    return data.session?.access_token;
  },
});
