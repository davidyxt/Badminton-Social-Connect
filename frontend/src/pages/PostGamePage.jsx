import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

import { createGame } from "../services/gameService";

import "../styles/PostGamePage.css";

function PostGamePage() {
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    format: "singles",
    date: "",
    startTime: "",
    venue: "",
  });

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleChange = (event) => {
    const { name, value } = event.target;

    setFormData((previous) => ({
      ...previous,
      [name]: value,
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
      setError("Please enter the suburb for the game.");
      return;
    }

    try {
      setLoading(true);

      const game = await createGame(formData);

      // The confirmation page shows the form's own fields (date, startTime,
      // durationMinutes, venue...). Pass those, with the new game's id: the
      // database row uses other names (proposed_time, venue_id...).
      const gameId = game.id ?? game.post_id;

      navigate(
        `/post-game/confirmation/${gameId}`,
        {
          state: {
            game: { ...formData, id: gameId },
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


          {/* SUBURB: game_post.suburb */}
          <div className="post-game-field">
            <label htmlFor="venue">AREA / SUBURB</label>
            <input id="venue" name="venue" type="text" value={formData.venue} onChange={handleChange} placeholder="e.g. Albert Park" required />
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