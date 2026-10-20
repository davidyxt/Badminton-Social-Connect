import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

import { createGame } from "../services/gameService";

import "../styles/PostGamePage.css";

function PostGamePage() {
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    format: "singles",
    style: "social",
    date: "",
    startTime: "",
    durationMinutes: 45,
    venue: "",
    abilityLevel: "any",
    notes: "",
  });

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleChange = (event) => {
    const { name, value } = event.target;

    setFormData((previous) => ({
      ...previous,
      [name]:
        name === "durationMinutes"
          ? Number(value)
          : value,
    }));
  };

  const setOption = (field, value) => {
    setFormData((previous) => ({
      ...previous,
      [field]: value,
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    setError("");

    if (!formData.date) {
      setError("Please choose a date.");
      return;
    }

    if (!formData.startTime) {
      setError("Please choose a start time.");
      return;
    }

    if (!formData.venue) {
      setError("Please choose a venue.");
      return;
    }

    try {
      setLoading(true);

      const game = await createGame(formData);

      navigate(
        `/post-game/confirmation/${game.id}`,
        {
          state: {
            game,
          },
        }
      );
    } catch (err) {
      setError(
        err.message ||
          "Something went wrong while creating the game."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="post-game-page">

      <header className="post-game-header">

        <button
          type="button"
          className="post-game-back-button"
          onClick={() => navigate("/dashboard")}
          aria-label="Back to dashboard"
        >
          <ArrowLeft size={24} />
        </button>

        <h1>Post a Game</h1>

      </header>


      <form
        className="post-game-form"
        onSubmit={handleSubmit}
      >

        <div className="post-game-card">

          {/* FORMAT */}

          <div className="post-game-section">

            <label className="post-game-label">
              FORMAT
            </label>

            <div className="post-game-options">

              <button
                type="button"
                className={`post-game-option ${
                  formData.format === "singles"
                    ? "selected"
                    : ""
                }`}
                onClick={() =>
                  setOption("format", "singles")
                }
              >
                Singles
              </button>

              <button
                type="button"
                className={`post-game-option ${
                  formData.format === "doubles"
                    ? "selected"
                    : ""
                }`}
                onClick={() =>
                  setOption("format", "doubles")
                }
              >
                Doubles
              </button>

            </div>

          </div>


          {/* STYLE */}

          <div className="post-game-section">

            <label className="post-game-label">
              STYLE
            </label>

            <div className="post-game-options">

              <button
                type="button"
                className={`post-game-option ${
                  formData.style === "social"
                    ? "selected"
                    : ""
                }`}
                onClick={() =>
                  setOption("style", "social")
                }
              >
                Social
              </button>

              <button
                type="button"
                className={`post-game-option ${
                  formData.style === "competitive"
                    ? "selected"
                    : ""
                }`}
                onClick={() =>
                  setOption(
                    "style",
                    "competitive"
                  )
                }
              >
                Competitive
              </button>

            </div>

          </div>


          {/* DATE */}

          <div className="post-game-field">

            <label htmlFor="date">
              DATE
            </label>

            <input
              id="date"
              type="date"
              name="date"
              value={formData.date}
              onChange={handleChange}
              required
            />

          </div>


          {/* START TIME */}

          <div className="post-game-field">

            <label htmlFor="startTime">
              START TIME
            </label>

            <input
              id="startTime"
              type="time"
              name="startTime"
              value={formData.startTime}
              onChange={handleChange}
              required
            />

          </div>


          {/* DURATION */}

          <div className="post-game-field">

            <label htmlFor="durationMinutes">
              DURATION
            </label>

            <select
              id="durationMinutes"
              name="durationMinutes"
              value={formData.durationMinutes}
              onChange={handleChange}
            >
              <option value={30}>
                30 minutes
              </option>

              <option value={45}>
                45 minutes
              </option>

              <option value={60}>
                1 hour
              </option>

              <option value={90}>
                1 hour 30 minutes
              </option>

              <option value={120}>
                2 hours
              </option>
            </select>

          </div>


          {/* VENUE */}

          <div className="post-game-field">

            <label htmlFor="venue">
              VENUE
            </label>

            <select
              id="venue"
              name="venue"
              value={formData.venue}
              onChange={handleChange}
              required
            >

              <option value="" disabled>
                Select a venue
              </option>

              <option value="MSAC — Albert Park">
                MSAC — Albert Park
              </option>

              <option value="Melbourne Badminton Centre — Clayton">
                Melbourne Badminton Centre — Clayton
              </option>

              <option value="Monash Sport — Clayton">
                Monash Sport — Clayton
              </option>

              <option value="Other">
                Other venue
              </option>

            </select>

          </div>


          {/* ABILITY */}

          <div className="post-game-field">

            <label htmlFor="abilityLevel">
              PREFERRED ABILITY LEVEL
            </label>

            <select
              id="abilityLevel"
              name="abilityLevel"
              value={formData.abilityLevel}
              onChange={handleChange}
            >

              <option value="any">
                Any level
              </option>

              <option value="beginner">
                Beginner
              </option>

              <option value="intermediate">
                Intermediate
              </option>

              <option value="advanced">
                Advanced
              </option>

            </select>

          </div>


          {/* NOTES */}

          <div className="post-game-field">

            <label htmlFor="notes">
              NOTES
              <span> (OPTIONAL)</span>
            </label>

            <textarea
              id="notes"
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              placeholder="e.g. Friendly hit, happy to warm up..."
              maxLength={300}
            />

          </div>


          {error && (
            <div
              className="post-game-error"
              role="alert"
            >
              {error}
            </div>
          )}

        </div>


        <div className="post-game-submit-area">

          <button
            type="submit"
            className="post-game-submit-button"
            disabled={loading}
          >
            {loading
              ? "Posting..."
              : "Post Game"}
          </button>

        </div>

      </form>

    </div>
  );
}

export default PostGamePage;