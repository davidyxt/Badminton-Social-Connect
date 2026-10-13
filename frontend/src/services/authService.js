import { supabase } from "./supabase";

const authCallbackUrl = `${window.location.origin}/auth/callback`;
const emailConfirmedUrl = `${window.location.origin}/auth/confirmed`;
const resetPasswordUrl = `${window.location.origin}/reset-password`;

export const signIn = async (email, password, captchaToken) => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
    options: {
      captchaToken,
    },
  });

  if (error) throw error;

  return data;
};

export const signUp = async ({
  email,
  password,
  firstName,
  lastName,
  captchaToken,
  selfRatingBand,
  dateOfBirth,
  state,
}) => {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // Stored in auth.users.raw_user_meta_data
      data: {
        first_name: firstName,
        last_name: lastName,
        display_name: `${firstName} ${lastName}`.trim(),
        self_rating_band: selfRatingBand,
        date_of_birth: dateOfBirth,
        playing_state: state,
      },
      // Where the email verification link sends the user
      emailRedirectTo: emailConfirmedUrl,
      captchaToken,
    },
  });

  if (error) throw error;

  return data;
};

export const resendVerificationEmail = async (email, captchaToken) => {
  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: {
      emailRedirectTo: emailConfirmedUrl,
      captchaToken,
    },
  });

  if (error) throw error;
};

// Sends the reset email. Succeeds even if no account uses this email,
// so the form can't be used to find out who has an account.
export const requestPasswordReset = async (email, captchaToken) => {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: resetPasswordUrl,
    captchaToken,
  });

  if (error) throw error;
};

// Exchanges the token from the reset email link for a short recovery session.
export const verifyPasswordResetLink = async (tokenHash) => {
  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: "recovery",
  });

  if (error) throw error;
};

export const updatePassword = async (password) => {
  const { error } = await supabase.auth.updateUser({ password });

  if (error) throw error;
};

export const signInWithGoogle = async () => {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: authCallbackUrl,
    },
  });

  if (error) throw error;

  // The browser is redirected to Google; nothing else runs after this.
  return data;
};

export const signOut = async () => {
  const { error } = await supabase.auth.signOut();

  if (error) throw error;
};

// Auth users with email verification need registration after their first session.
// This RPC is explicitly defined in the API; it enforces the minimum age.
export const completePlayerRegistration = async () => {
  const {data:{user},error:userError}=await supabase.auth.getUser();
  if(userError) throw userError;
  if(!user) return false;
  const {data:existing,error:lookupError}=await supabase.from('player').select('playerId').eq('playerId',user.id).maybeSingle();
  if(lookupError) throw lookupError;
  if(existing) return true;
  const m=user.user_metadata||{};
  if(!m.display_name||!m.self_rating_band||!m.date_of_birth||!m.playing_state)return false;
  const {error}=await supabase.rpc('register_player',{displayName:m.display_name,selfRatingBand:m.self_rating_band,dateOfBirth:m.date_of_birth,state:m.playing_state});
  if(error)throw error;
  return true;
};
