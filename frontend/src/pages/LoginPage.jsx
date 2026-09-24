import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  signIn,
  signInWithGoogle,
  resendVerificationEmail,
} from "../services/authService";
import Captcha, { useCaptcha } from "../components/auth/Captcha";
import { getAuthErrorMessage } from "../utils/authErrors";
import "../styles/auth.css";

function LoginPage() {
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });

  const [searchParams] = useSearchParams();
  const captcha = useCaptcha();

  const [error, setError] = useState("");
  const [message, setMessage] = useState(() => {
    if (searchParams.get("verified")) {
      return "Your email is verified. Log in to continue.";
    }

    if (searchParams.get("reset")) {
      return "Your password has been updated. Log in with your new password.";
    }

    return "";
  });
  const [needsVerification, setNeedsVerification] = useState(false);
  const [loading, setLoading] = useState(false);

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
    setMessage("");
    setNeedsVerification(false);
    setLoading(true);

    try {
      await signIn(formData.email, formData.password, captcha.token);

      navigate("/dashboard");
    } catch (err) {
      if (err.code === "email_not_confirmed") {
        setNeedsVerification(true);
        setError("Please verify your email before logging in.");
      } else {
        setError(getAuthErrorMessage(err, "Unable to sign in."));
      }
    } finally {
      captcha.reset();
      setLoading(false);
    }
  };


  const handleResend = async () => {
    setError("");
    setLoading(true);

    try {
      await resendVerificationEmail(formData.email, captcha.token);

      setNeedsVerification(false);
      setMessage("Verification email sent. Check your inbox.");
    } catch (err) {
      setError(
        getAuthErrorMessage(err, "Unable to resend the verification email.")
      );
    } finally {
      captcha.reset();
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError("");
    setLoading(true);

    try {
      await signInWithGoogle();
    } catch (err) {
      setError(err.message || "Unable to sign in with Google.");
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
            <span className="auth-label">WELCOME BACK</span>

            <h2>Log in to your account</h2>

            <p>
              Enter your details below to continue.
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
                value={formData.email}
                onChange={handleChange}
                autoComplete="email"
                required
              />
            </div>

            <div className="form-group">
              <div className="password-label-row">
                <label htmlFor="password">Password</label>

                <Link
                  to={
                    formData.email
                      ? `/forgot-password?email=${encodeURIComponent(formData.email)}`
                      : "/forgot-password"
                  }
                  className="text-button"
                >
                  Forgot password?
                </Link>
              </div>

              <input
                id="password"
                type="password"
                name="password"
                placeholder="Enter your password"
                value={formData.password}
                onChange={handleChange}
                autoComplete="current-password"
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

                {needsVerification && (
                  <>
                    {" "}
                    <button
                      type="button"
                      className="text-button"
                      onClick={handleResend}
                      disabled={loading || !captcha.ready}
                    >
                      Resend verification email
                    </button>
                  </>
                )}
              </div>
            )}

            <Captcha captcha={captcha} />

            <button
              type="submit"
              className="auth-primary-button"
              disabled={loading || !captcha.ready}
            >
              {loading ? "Logging in..." : "Log In"}
            </button>
          </form>

          <div className="auth-divider">
            <span>or</span>
          </div>

          <button
            type="button"
            className="auth-oauth-button"
            onClick={handleGoogle}
            disabled={loading}
          >
            Continue with Google
          </button>

          <div className="auth-footer-text">
            Don't have an account?{" "}
            <Link to="/signup">Create an account</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;