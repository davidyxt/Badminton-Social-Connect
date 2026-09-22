import "../styles/landingPage.css";
import landingPageSplash from "../assets/images/landingPageSplash.avif";

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

          <button className="get-started-button">
            Get Started
          </button>

          <button className="sign-in-button">
            Sign In
          </button>

        </div>

      </section>

    </main>
  );
}

export default LandingPage;