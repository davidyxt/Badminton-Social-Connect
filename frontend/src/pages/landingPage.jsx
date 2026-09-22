import "../styles/landingPage.css";
import landingPageSplash from "../assets/images/landingPageSplash.avif";
import { Link } from "react-router-dom";

function LandingPage() {
  return (
    <main className="landing-page">

    <div className="landing-image-wrapper">
        <img
          src={landingPageSplash}
          alt=""
          className="landing-splash"
        />

        <div className="landing-image-overlay" />
      </div>

      <div className="landing-badge">
        BADMINTON VICTORIA
      </div>

      <section className="landing-content">

        <h1 className="landing-title">
          Find your
          <br />
          next game.
        </h1>

        <p className="landing-description">
          Meet players at your level, organise matches and build your ranking
          across Victoria.
        </p>

        <div className="landing-features">

          <button className="feature-card">
            <span className="feature-icon">🏸</span>
            <span className="feature-label">
              Find
              <br />
              Games
            </span>
          </button>

          <button className="feature-card">
            <span className="feature-icon">📊</span>
            <span className="feature-label">
              Rankings
            </span>
          </button>

          <button className="feature-card">
            <span className="feature-icon">🏆</span>
            <span className="feature-label">
              Mini
              <br />
              Leagues
            </span>
          </button>

        </div>

        <div className="landing-actions">

        <Link to="/signup">
          <button className="get-started-button">
            Get Started
          </button>
        </Link>

        <Link to="/login">
          <button className="sign-in-button">
            Sign In
          </button>
        </Link>

        </div>

      </section>

    </main>
  );
}

export default LandingPage;