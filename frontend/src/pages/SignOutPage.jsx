import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { signOut } from "../services/authService";

// Visiting /signout ends the session and returns the user to the home (landing) page.
function SignOutPage() {
  const navigate = useNavigate();
  const started = useRef(false);

  useEffect(() => {
    // StrictMode runs effects twice in development; only sign out once.
    if (started.current) return;
    started.current = true;

    signOut()
      .catch((err) => {
        // Local session is cleared even if revoking the token on the server fails.
        console.error("Sign out failed:", err);
      })
      .finally(() => {
        navigate("/", { replace: true });
      });
  }, [navigate]);

  return <p style={{ padding: 24 }}>Signing you out...</p>;
}

export default SignOutPage;
