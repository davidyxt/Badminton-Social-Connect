import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import "../styles/auth.css";

// Landing page for OAuth and email-confirmation redirects.
// The Supabase client exchanges the ?code= in the URL for a session on load.
function AuthCallbackPage() {
  const navigate = useNavigate();
  const { session, loading } = useAuth();

  const params = new URLSearchParams(window.location.search);
  const [error] = useState(
    params.get("error_description") || params.get("error") || ""
  );

  useEffect(() => {
    if (error || loading) return;

    navigate(session ? "/dashboard" : "/login", { replace: true });
  }, [error, loading, session, navigate]);

  if (error) {
    return (
      <div className="auth-form-section">
        <div className="auth-card">
          <div className="auth-error" role="alert">
            {error}
          </div>

          <div className="auth-footer-text">
            <Link to="/login">Back to log in</Link>
          </div>
        </div>
      </div>
    );
  }

  return <p style={{ padding: 24 }}>Signing you in...</p>;
}

export default AuthCallbackPage;
