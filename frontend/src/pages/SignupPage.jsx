import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { signUp, signInWithGoogle } from "../services/authService";
import Captcha, { useCaptcha } from "../components/auth/Captcha";
import { getAuthErrorMessage } from "../utils/authErrors";
import { PASSWORD_HINT, getPasswordError } from "../utils/passwordPolicy";
import "../styles/auth.css";

function SignupPage() {
  const navigate = useNavigate();
  const captcha = useCaptcha();

  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
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
      const { session } = await signUp({
        email: formData.email,
        password: formData.password,
        firstName: formData.firstName,
        lastName: formData.lastName,
        captchaToken: captcha.token,
      });

      if (session) {
        navigate("/dashboard");
      } else {
        // Email verification is on: no session until the link is clicked.
        setMessage(
          "Check your email and click the verification link, then log in to continue."
        );
      }
    } catch (err) {
      setError(getAuthErrorMessage(err, "Unable to create account."));
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

          <h1>Join the community</h1>

          <p>
            Connect with badminton players, discover games and build your
            badminton network.
          </p>
        </div>
      </div>

      <div className="auth-form-section">
        <div className="auth-card signup-card">
          <div className="auth-heading">
            <span className="auth-label">GET STARTED</span>

            <h2>Create your account</h2>

            <p>
              Enter your details to join Badminton Social Connect.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="auth-form">
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="firstName">First name</label>

                <input
                  id="firstName"
                  type="text"
                  name="firstName"
                  placeholder="Sarah"
                  value={formData.firstName}
                  onChange={handleChange}
                  autoComplete="given-name"
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="lastName">Last name</label>

                <input
                  id="lastName"
                  type="text"
                  name="lastName"
                  placeholder="Kim"
                  value={formData.lastName}
                  onChange={handleChange}
                  autoComplete="family-name"
                  required
                />
              </div>
            </div>

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
              <label htmlFor="password">Password</label>

              <input
                id="password"
                type="password"
                name="password"
                placeholder="Create a password"
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
                Confirm password
              </label>

              <input
                id="confirmPassword"
                type="password"
                name="confirmPassword"
                placeholder="Re-enter your password"
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

            {message && (
              <div className="auth-message" role="status">
                {message}
              </div>
            )}

            <Captcha captcha={captcha} />

            <button
              type="submit"
              className="auth-primary-button"
              disabled={loading || !captcha.ready}
            >
              {loading ? "Creating account..." : "Create Account"}
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
            Already have an account?{" "}
            <Link to="/login">Log in</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SignupPage;