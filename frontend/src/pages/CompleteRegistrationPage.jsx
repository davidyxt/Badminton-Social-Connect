import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  isUsernameAvailable,
  listStates,
  registerPlayer,
} from "../services/playerService";
import { isOldEnough } from "../config/legal";
import "../styles/auth.css";

// The 18+ age gate for anyone who has an account but has not completed it:
// everyone who signs in with Google, and anyone whose sign-up form did not
// send the fields. Until it is done, the app shows them nothing (BL-007).
function CompleteRegistrationPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { player, refreshPlayer } = useAuth();

  const [states, setStates] = useState([]);
  const [formData, setFormData] = useState({
    username: player?.username ?? "",
    dateOfBirth: "",
    stateCode: "",
    ageDeclared: false,
    termsAccepted: false,
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    listStates().then(setStates).catch(() => setStates([]));
  }, []);

  useEffect(() => {
    if (player?.registered) navigate("/dashboard", { replace: true });
  }, [player, navigate]);

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

    if (!isOldEnough(formData.dateOfBirth)) {
      setError("You must be 18 or over to use Badminton Social Connect.");
      return;
    }

    setLoading(true);

    try {
      const username = formData.username.trim();
      if (username !== player?.username && !(await isUsernameAvailable(username))) {
        setError("That username is taken or not allowed. Use 3-20 letters, numbers, _ or .");
        setLoading(false);
        return;
      }

      // The username is saved together with the age gate. Google sign-ups
      // have none until this point.
      await registerPlayer({
        dateOfBirth: formData.dateOfBirth,
        stateCode: formData.stateCode,
        username,
      });

      await refreshPlayer();
      navigate(location.state?.from || "/dashboard", { replace: true });
    } catch (err) {
      setError(err.message || "Unable to complete registration.");
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-brand-panel">
        <div className="auth-brand-content">
          <h1>Almost there</h1>
          <p>
            Due to safety concerns, Badminton Social Connect is for 18+ only. Confirm a few details to
            start finding games.
          </p>
        </div>
      </div>

      <div className="auth-form-section">
        <div className="auth-card signup-card">
          <div className="auth-heading">
            <span className="auth-label">ONE LAST STEP</span>
            <h2>Complete your registration</h2>
            <p>Other players see your username, never your real name.</p>
          </div>

          <form onSubmit={handleSubmit} className="auth-form">
            <div className="form-group">
              <label htmlFor="username">Username</label>
              <input
                id="username"
                name="username"
                type="text"
                value={formData.username}
                onChange={handleChange}
                autoComplete="username"
                minLength={3}
                maxLength={20}
                pattern="[A-Za-z0-9_.]{3,20}"
                required
              />
              <span className="form-hint">3-20 letters, numbers, _ or .</span>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="dateOfBirth">Date of birth</label>
                <input
                  id="dateOfBirth"
                  name="dateOfBirth"
                  type="date"
                  value={formData.dateOfBirth}
                  onChange={handleChange}
                  autoComplete="bday"
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="stateCode">State or territory</label>
                <select
                  id="stateCode"
                  name="stateCode"
                  value={formData.stateCode}
                  onChange={handleChange}
                  required
                >
                  <option value="" disabled>Choose</option>
                  {states.map((s) => (
                    <option key={s.state_code} value={s.state_code}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <label className="auth-checkbox">
              <input
                type="checkbox"
                name="ageDeclared"
                checked={formData.ageDeclared}
                onChange={handleChange}
                required
              />
              <span>I confirm I am 18 or over.</span>
            </label>

            <label className="auth-checkbox">
              <input
                type="checkbox"
                name="termsAccepted"
                checked={formData.termsAccepted}
                onChange={handleChange}
                required
              />
              <span>
                I accept the <a href="/terms" target="_blank">terms of use</a>{" "}
                and the <a href="/privacy" target="_blank">privacy notice</a>.
              </span>
            </label>

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
              {loading ? "Saving..." : "Continue"}
            </button>
          </form>

          <div className="auth-footer-text">
            Not you? <Link to="/signout">Sign out</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CompleteRegistrationPage;
