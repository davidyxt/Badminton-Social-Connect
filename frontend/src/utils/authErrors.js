import { PASSWORD_HINT } from "./passwordPolicy";

// Turns Supabase auth error codes into messages we can show to players.
export function getAuthErrorMessage(err, fallback) {
  switch (err?.code) {
    case "invalid_credentials":
      return "Incorrect email or password.";
    case "over_request_rate_limit":
      return "Too many attempts. Please wait a few minutes and try again.";
    case "over_email_send_rate_limit":
      return "We've just sent you an email. Please wait a minute before asking for another.";
    case "captcha_failed":
      return "The security check failed. Please try again.";
    case "weak_password":
      return `That password is too weak. ${PASSWORD_HINT}`;
    case "same_password":
      return "Your new password must be different from your current one.";
    case "otp_expired":
      return "This link is invalid or has expired. Please request a new one.";
    case "unexpected_failure":
      // The database refused the new account: the sign-up trigger checks
      // the username and the 18+ age gate.
      return "We couldn't create your account. Check that your username isn't taken and that you are 18 or over.";
    default:
      return err?.message || fallback;
  }
}
