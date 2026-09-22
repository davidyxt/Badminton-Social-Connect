import "./TopMenuBar.css";

function TopMenuBar() {
  return (
    <header className="top-menu-bar">
      <button
        className="top-menu-icon-button"
        aria-label="Open menu"
        type="button"
      >
        <span className="hamburger-icon">
          <span></span>
          <span></span>
          <span></span>
        </span>
      </button>

      <div className="top-menu-actions">
        <button
          className="notification-button"
          aria-label="Notifications"
          type="button"
        >
          <svg
            viewBox="0 0 24 24"
            className="top-menu-svg"
            aria-hidden="true"
          >
            <path
              d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M10 21h4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>

          <span className="notification-badge">1</span>
        </button>

        <button
          className="profile-avatar"
          aria-label="Open profile"
          type="button"
        >
          JD
        </button>
      </div>
    </header>
  );
}

export default TopMenuBar;