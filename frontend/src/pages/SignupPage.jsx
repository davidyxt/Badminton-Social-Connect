import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { signUp, signInWithGoogle, completePlayerRegistration } from "../services/authService";
import Captcha, { useCaptcha } from "../components/auth/Captcha";
import { getAuthErrorMessage } from "../utils/authErrors";
import { PASSWORD_HINT, getPasswordError } from "../utils/passwordPolicy";
import "../styles/auth.css";

function SignupPage() {
  const navigate = useNavigate();
  const captcha = useCaptcha();

  const [formData, setFormData] = useState({
    firstName: "",
    username: "",
    ageDeclared: false,
    termsAccepted: false,
    lastName: "",
    email: "",
    password: "",
    confirmPassword: "",
    dateOfBirth: "",
    selfRatingBand: "Beginner",
    state: "VIC",
  });

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const handleChange = (event) => {
    const { name, value, type, checked } = event.target;

    setFormData((previous) => ({
      ...previous,
      [name]: type === "checkbox" ? checked : value,
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

    if (!/^[A-Za-z0-9_.]{3,20}$/.test(formData.username.trim())) {
      setError("Choose a username of 3–20 letters, numbers, underscores or periods.");
      return;
    }
    if (!formData.ageDeclared || !formData.termsAccepted) {
      setError("Confirm you are 18+ and accept the terms and privacy notice.");
      return;
    }
    if (!import.meta.env.DEV && (!import.meta.env.VITE_TERMS_VERSION || !import.meta.env.VITE_PRIVACY_VERSION)) {
      setError("Terms/privacy versions must be configured before registration is available.");
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
        dateOfBirth: formData.dateOfBirth,
        selfRatingBand: formData.selfRatingBand,
        state: formData.state,
        username: formData.username,
        ageDeclared: formData.ageDeclared,
        termsAccepted: formData.termsAccepted,
      });

      if (session) {
        const registered = await completePlayerRegistration();
        navigate(registered ? "/dashboard" : "/profile");
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
              <label htmlFor="username">Public username</label>
              <input id="username" name="username" value={formData.username} onChange={handleChange}
                placeholder="e.g. badminton_amy" autoComplete="username" maxLength={20} required />
              <span className="form-hint">3–20 letters, numbers, underscores or periods. Visible to other players.</span>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="dateOfBirth">Date of birth</label>
                <input id="dateOfBirth" name="dateOfBirth" type="date" value={formData.dateOfBirth} onChange={handleChange} max={new Date().toISOString().slice(0,10)} required />
              </div>
              <div className="form-group">
                <label htmlFor="state">Playing state</label>
                <select id="state" name="state" value={formData.state} onChange={handleChange} required>
                  {['VIC','NSW','QLD','SA','WA','TAS','ACT','NT'].map(value=><option key={value} value={value}>{value}</option>)}
                </select>
              </div>
            </div>
            <div className="form-group">
              <label htmlFor="selfRatingBand">Playing level</label>
              <select id="selfRatingBand" name="selfRatingBand" value={formData.selfRatingBand} onChange={handleChange}>
                {['Beginner','Intermediate','Advanced'].map(value=><option key={value} value={value}>{value}</option>)}
              </select>
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

            <label className="auth-consent-row">
              <input type="checkbox" name="ageDeclared" checked={formData.ageDeclared} onChange={handleChange} required />
              I confirm I am at least 18 years old.
            </label>
            <label className="auth-consent-row">
              <input type="checkbox" name="termsAccepted" checked={formData.termsAccepted} onChange={handleChange} required />
              I have read and agree to the platform's terms and privacy notice.
            </label>
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