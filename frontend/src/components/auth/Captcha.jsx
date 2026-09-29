import { useCallback, useRef, useState } from "react";
import { Turnstile } from "@marsidev/react-turnstile";

// Cloudflare Turnstile site key (public). When it's not set, the widget is
// skipped and requests are sent without a token, which only works if CAPTCHA
// is also disabled on the Supabase side.
const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY;

export function useCaptcha() {
  const ref = useRef(null);
  const [token, setToken] = useState("");

  // Each token can only be used once, so reset after every auth request.
  const reset = useCallback(() => {
    setToken("");
    ref.current?.reset();
  }, []);

  return {
    ref,
    token: token || undefined,
    setToken,
    reset,
    ready: !siteKey || Boolean(token),
  };
}

function Captcha({ captcha }) {
  if (!siteKey) return null;

  return (
    <div className="auth-captcha">
      <Turnstile
        ref={captcha.ref}
        siteKey={siteKey}
        onSuccess={captcha.setToken}
        onExpire={() => captcha.setToken("")}
        onError={() => captcha.setToken("")}
        options={{ size: "flexible", theme: "light" }}
      />
    </div>
  );
}

export default Captcha;
