import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { requestPasswordReset } from "../services/authService";
import Captcha, { useCaptcha } from "../components/auth/Captcha";
import { getAuthErrorMessage } from "../utils/authErrors";
import "../styles/auth.css";

function ForgotPasswordPage() {
  const [searchParams] = useSearchParams();
  const captcha = useCaptcha();

  const [email, setEmail] = useState(searchParams.get("email") || "");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();

    setError("");
    setMessage("");
    setLoading(true);

    try {
      await requestPasswordReset(email, captcha.token);

      // Same message whether or not the account exists.
      setMessage(
        `If an account exists for ${email}, we've sent a link to reset your password. Check your inbox.`
      );
    } catch (err) {
      setError(getAuthErrorMessage(err, "Unable to send the reset email."));
    } finally {
      captcha.reset();
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
            <span className="auth-label">FORGOT PASSWORD</span>

            <h2>Reset your password</h2>

            <p>
              Enter your email and we'll send you a link to choose a new
              password.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="auth-form">
            <div className="form-group">
              <label htmlFor="email">Email address</label>

              <input
                id="email"
                type="email"
                name="email"
                placeholder="you@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                required
              />
            </div>

            {message && (
              <div className="auth-message" role="status">
                {message}
              </div>
            )}

            {error && (
              <div className="auth-error" role="alert">
                {error}
              </div>
            )}

            <Captcha captcha={captcha} />

            <button
              type="submit"
              className="auth-primary-button"
              disabled={loading || !captcha.ready}
            >
              {loading ? "Sending..." : "Send Reset Link"}
            </button>
          </form>

          <div className="auth-footer-text">
            Remembered it? <Link to="/login">Back to log in</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ForgotPasswordPage;
