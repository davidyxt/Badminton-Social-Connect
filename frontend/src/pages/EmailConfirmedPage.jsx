import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { signOut } from "../services/authService";
import "../styles/auth.css";

// Landing page for the sign-up verification link. Supabase has already marked
// the email as verified before redirecting here. We end any session the link
// created so the user has to log in again, then send them to the login page.
function EmailConfirmedPage() {
  const navigate = useNavigate();
  const { loading } = useAuth();
  const started = useRef(false);

  const [error] = useState(() => {
    // Expired or already-used links come back with error details in the URL.
    const query = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.slice(1));

    return (
      query.get("error_description") ||
      hash.get("error_description") ||
      ""
    );
  });

  useEffect(() => {
    if (error || loading || started.current) return;
    started.current = true;

    signOut()
      .catch(() => {
        // Nothing to sign out of (e.g. link opened in a different browser).
      })
      .finally(() => {
        navigate("/login?verified=1", { replace: true });
      });
  }, [error, loading, navigate]);

  if (error) {
    return (
      <div className="auth-form-section">
        <div className="auth-card">
          <div className="auth-error" role="alert">
            {error}
          </div>

          <div className="auth-footer-text">
            Try logging in to resend the verification email.{" "}
            <Link to="/login">Back to log in</Link>
          </div>
        </div>
      </div>
    );
  }

  return <p style={{ padding: 24 }}>Verifying your email...</p>;
}

export default EmailConfirmedPage;
