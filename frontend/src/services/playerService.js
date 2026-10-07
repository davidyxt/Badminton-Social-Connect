import { supabase } from "./supabase";
import { rpc, unwrap } from "./api";
import { TERMS_VERSION, PRIVACY_VERSION } from "../config/legal";

// The signed-in player's own status: username and whether they have passed
// the 18+ age gate. Null if the database has no player row yet.
export async function getMyPlayer(userId) {
  const [player, privateRow] = await Promise.all([
    unwrap(
      supabase
        .from("player")
        .select("player_id, username")
        .eq("player_id", userId)
        .maybeSingle()
    ),
    unwrap(
      supabase
        .from("player_private")
        .select("first_name, last_name, registered_at")
        .eq("player_id", userId)
        .maybeSingle()
    ),
  ]);

  if (!player) return null;

  return {
    id: player.player_id,
    username: player.username,
    firstName: privateRow?.first_name ?? null,
    lastName: privateRow?.last_name ?? null,
    registered: Boolean(privateRow?.registered_at),
  };
}

// Australian states and territories, for the sign-up and age-gate forms.
// A fixed list on this branch: the `state` table arrives with the foundation
// branch (BL-001). Once merged, this can read supabase.from("state") instead.
// The codes must match the ones register_player accepts.
const STATES = [
  { state_code: "ACT", name: "Australian Capital Territory" },
  { state_code: "NSW", name: "New South Wales" },
  { state_code: "NT", name: "Northern Territory" },
  { state_code: "QLD", name: "Queensland" },
  { state_code: "SA", name: "South Australia" },
  { state_code: "TAS", name: "Tasmania" },
  { state_code: "VIC", name: "Victoria" },
  { state_code: "WA", name: "Western Australia" },
];

export async function listStates() {
  return STATES;
}

export async function isUsernameAvailable(username) {
  return rpc("is_username_available", { p_username: username });
}

export async function changeUsername(userId, username) {
  return unwrap(
    supabase.from("player").update({ username }).eq("player_id", userId)
  );
}

// Completes the 18+ age gate after sign-up (Google sign-in, or anyone whose
// sign-up did not include the fields).
export async function registerPlayer({ dateOfBirth, stateCode }) {
  return rpc("register_player", {
    p_date_of_birth: dateOfBirth,
    p_age_declared: true,
    p_terms_version: TERMS_VERSION,
    p_privacy_version: PRIVACY_VERSION,
    p_state: stateCode,
  });
}
