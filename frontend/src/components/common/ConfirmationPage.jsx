import "./ConfirmationPage.css";

function ConfirmationPage({
  icon,
  title,
  description,
  children,
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
}) {
  return (
    <div className="confirmation-page">

      <div className="confirmation-content">

        <div className="confirmation-icon">
          {icon}
        </div>

        <h1>
          {title}
        </h1>

        <div className="confirmation-description">
          {description}
        </div>

        {children && (
          <div className="confirmation-details">
            {children}
          </div>
        )}

        <div className="confirmation-actions">

          {primaryLabel && (
            <button
              type="button"
              className="confirmation-primary-button"
              onClick={onPrimary}
            >
              {primaryLabel}
            </button>
          )}

          {secondaryLabel && (
            <button
              type="button"
              className="confirmation-secondary-button"
              onClick={onSecondary}
            >
              {secondaryLabel}
            </button>
          )}

        </div>

      </div>

    </div>
  );
}

export default ConfirmationPage;