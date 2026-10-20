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
  username,
  ageDeclared,
  termsAccepted,
}) => {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // Stored in auth.users.raw_user_meta_data
      data: {
        first_name: firstName,
        last_name: lastName,
        username: username.trim(),
        self_rating_band: selfRatingBand.toLowerCase().replace(/\s+/g, "_"),
        date_of_birth: dateOfBirth,
        playing_state: state,
        state,
        age_declared: !!ageDeclared,
        terms_version: termsAccepted ? (import.meta.env.VITE_TERMS_VERSION || (import.meta.env.DEV ? "local-dev-v1" : "")) : "",
        privacy_version: termsAccepted ? (import.meta.env.VITE_PRIVACY_VERSION || (import.meta.env.DEV ? "local-dev-v1" : "")) : "",
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

// Registration is handled by the server sign-up trigger when consent metadata
// was submitted. Never assert age/terms acceptance on a user's behalf.
export const completePlayerRegistration = async () => {
  const {data:{user},error:userError}=await supabase.auth.getUser();
  if(userError)throw userError;
  if(!user)return false;
  const {data,error}=await supabase.from('player_private').select('registered_at').eq('player_id',user.id).maybeSingle();
  if(error)throw error;
  const registered=!!data?.registered_at;
  const meta=user.user_metadata||{};
  if(registered&&!meta.bsc_profile_synced&&meta.self_rating_band){
    const band=String(meta.self_rating_band).toLowerCase().replace(/\s+/g,'_');
    // This optional preference sync must not turn a successful login into a
    // reported authentication failure.
    try {
      const {error:profileError}=await supabase.rpc('update_my_profile',{p_self_rating_band:band});
      if(profileError)throw profileError;
      const {error:metaError}=await supabase.auth.updateUser({data:{bsc_profile_synced:true}});
      if(metaError)throw metaError;
    } catch (syncError) { console.warn('Initial playing level could not be synced:',syncError); }
  }
  return registered;
};
