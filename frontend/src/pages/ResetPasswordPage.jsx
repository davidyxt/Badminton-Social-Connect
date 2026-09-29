import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  verifyPasswordResetLink,
  updatePassword,
  signOut,
} from "../services/authService";
import { getAuthErrorMessage } from "../utils/authErrors";
import { PASSWORD_HINT, getPasswordError } from "../utils/passwordPolicy";
import "../styles/auth.css";

// Landing page for the reset email link (/reset-password?token_hash=...&type=recovery).
// Verifies the link, lets the user choose a new password, then signs them out
// so they log in again with it.
function ResetPasswordPage() {
  const navigate = useNavigate();
  const started = useRef(false);

  // "verifying" → "ready" (show form) or "invalid" (bad or expired link)
  const [status, setStatus] = useState("verifying");
  const [linkError, setLinkError] = useState("");

  const [formData, setFormData] = useState({
    password: "",
    confirmPassword: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // StrictMode runs effects twice in development; the token is single-use.
    if (started.current) return;
    started.current = true;

    const params = new URLSearchParams(window.location.search);
    const tokenHash = params.get("token_hash");

    // Keep the single-use token out of the address bar and browser history.
    window.history.replaceState(null, "", window.location.pathname);

    if (!tokenHash || params.get("type") !== "recovery") {
      setLinkError("This reset link is invalid or has expired.");
      setStatus("invalid");
      return;
    }

    verifyPasswordResetLink(tokenHash)
      .then(() => setStatus("ready"))
      .catch((err) => {
        setLinkError(
          getAuthErrorMessage(err, "This reset link is invalid or has expired.")
        );
        setStatus("invalid");
      });
  }, []);

  const handleChange = (event) => {
    const { name, value } = event.target;

    setFormData((previous) => ({
      ...previous,
      [name]: value,
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    setError("");

    if (formData.password !== formData.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    const passwordError = getPasswordError(formData.password);

    if (passwordError) {
      setError(passwordError);
      return;
    }

    setLoading(true);

    try {
      await updatePassword(formData.password);
      await signOut();

      navigate("/login?reset=1", { replace: true });
    } catch (err) {
      setError(getAuthErrorMessage(err, "Unable to update your password."));
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">

    <Link
        to="/"
        className="auth-close-button"
        aria-label="Back to main menu"
        >
        ×
    </Link>

      <div className="auth-brand-panel">
        <div className="auth-brand-content">

          <h1>Badminton Social Connect</h1>

          <p>
            Find players, organise games and stay connected with your badminton
            community.
          </p>
        </div>
      </div>

      <div className="auth-form-section">
        <div className="auth-card">
          <div className="auth-heading">
            <span className="auth-label">RESET PASSWORD</span>

            <h2>Choose a new password</h2>
          </div>

          {status === "verifying" && <p>Checking your reset link...</p>}

          {status === "invalid" && (
            <>
              <div className="auth-error" role="alert">
                {linkError}
              </div>

              <div className="auth-footer-text">
                <Link to="/forgot-password">Request a new link</Link>
              </div>
            </>
          )}

          {status === "ready" && (
            <form onSubmit={handleSubmit} className="auth-form">
              <div className="form-group">
                <label htmlFor="password">New password</label>

                <input
                  id="password"
                  type="password"
                  name="password"
                  placeholder="Create a new password"
                  value={formData.password}
                  onChange={handleChange}
                  autoComplete="new-password"
                  required
                />

                <span className="form-hint">
                  {PASSWORD_HINT}
                </span>
              </div>

              <div className="form-group">
                <label htmlFor="confirmPassword">
                  Confirm new password
                </label>

                <input
                  id="confirmPassword"
                  type="password"
                  name="confirmPassword"
                  placeholder="Re-enter your new password"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  autoComplete="new-password"
                  required
                />
              </div>

              {error && (
                <div className="auth-error" role="alert">
                  {error}
                </div>
              )}

              <button
                type="submit"
                className="auth-primary-button"
                disabled={loading}
              >
                {loading ? "Updating..." : "Update Password"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export default ResetPasswordPage;
