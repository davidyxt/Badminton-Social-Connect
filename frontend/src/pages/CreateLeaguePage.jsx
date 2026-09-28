import { useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  ArrowLeft,
  Search,
  MapPin,
} from "lucide-react";

import "../styles/CreateLeaguePage.css";


function CreateLeaguePage() {
  const navigate = useNavigate();


  const [formData, setFormData] = useState({
    leagueName: "",
    format: "singles",
    skillLevel: "intermediate",
    startDate: "",
    rounds: "",
    venue: "",
    maxPlayers: "",
    inviteFirst: false,
    inviteSearch: "",
    description: "",
  });


  const [selectedPlayers, setSelectedPlayers] =
    useState([
      {
        id: 1,
        name: "Jordan K.",
      },
      {
        id: 2,
        name: "Alex T.",
      },
      {
        id: 3,
        name: "Sarah M.",
      },
    ]);


  /* ======================================================
     INPUT CHANGE
     ====================================================== */

  const handleChange = (event) => {
    const {
      name,
      value,
      type,
      checked,
    } = event.target;


    setFormData((previous) => ({
      ...previous,

      [name]:
        type === "checkbox"
          ? checked
          : value,
    }));
  };


  /* ======================================================
     SELECT BUTTON OPTIONS
     ====================================================== */

  const setOption = (
    field,
    value
  ) => {
    setFormData((previous) => ({
      ...previous,

      [field]: value,
    }));
  };


  /* ======================================================
     REMOVE INVITED PLAYER
     ====================================================== */

  const removePlayer = (id) => {
    setSelectedPlayers(
      (previous) =>
        previous.filter(
          (player) =>
            player.id !== id
        )
    );
  };


  /* ======================================================
     CREATE LEAGUE
     ====================================================== */

  const handleSubmit = (event) => {
    event.preventDefault();


    const league = {
      id: `temp-${Date.now()}`,

      name:
        formData.leagueName ||
        "New Mini League",

      format:
        formData.format,

      skillLevel:
        formData.skillLevel,

      startDate:
        formData.startDate,

      rounds:
        formData.rounds || 1,

      venue:
        formData.venue ||
        "Not specified",

      maxPlayers:
        formData.maxPlayers || 0,

      description:
        formData.description,

      invitedPlayers:
        formData.inviteFirst
          ? selectedPlayers.map(
              (player) => ({
                ...player,

                initials:
                  player.name
                    .split(" ")
                    .map(
                      (word) =>
                        word[0]
                    )
                    .join("")
                    .slice(0, 2)
                    .toUpperCase(),
              })
            )
          : [],
    };


    console.log(
      "Created league:",
      league
    );


    navigate(
      `/leagues/${league.id}/created`,
      {
        state: {
          league,
        },
      }
    );
  };


  /* ======================================================
     SAVE DRAFT
     ====================================================== */

  const handleSaveDraft = () => {
    console.log(
      "Save league draft:",
      formData
    );
  };


  return (
    <div className="create-league-page">


      {/* HEADER */}

      <header className="create-league-header">

        <button
          type="button"
          className="create-league-back-button"
          onClick={() =>
            navigate("/leagues")
          }
          aria-label="Back to leagues"
        >
          <ArrowLeft size={22} />
        </button>


        <h1>
          Create League
        </h1>

      </header>


      {/* FORM */}

      <form
        className="create-league-form"
        onSubmit={handleSubmit}
      >

        <div className="create-league-card">


          {/* LEAGUE NAME */}

          <div className="create-league-field">

            <label htmlFor="leagueName">
              League Name
            </label>

            <input
              id="leagueName"
              type="text"
              name="leagueName"
              value={
                formData.leagueName
              }
              onChange={handleChange}
              placeholder="e.g. UniMelb Social League"
            />

          </div>


          {/* LEAGUE TYPE */}

          <div className="create-league-field">

            <label>
              League Type
            </label>


            <div className="create-league-options">

              <button
                type="button"
                className={`league-option ${
                  formData.format ===
                  "singles"
                    ? "selected"
                    : ""
                }`}
                onClick={() =>
                  setOption(
                    "format",
                    "singles"
                  )
                }
              >
                Singles
              </button>


              <button
                type="button"
                className={`league-option ${
                  formData.format ===
                  "doubles"
                    ? "selected"
                    : ""
                }`}
                onClick={() =>
                  setOption(
                    "format",
                    "doubles"
                  )
                }
              >
                Doubles
              </button>


              <button
                type="button"
                className={`league-option ${
                  formData.format ===
                  "mixed"
                    ? "selected"
                    : ""
                }`}
                onClick={() =>
                  setOption(
                    "format",
                    "mixed"
                  )
                }
              >
                Mixed
              </button>

            </div>

          </div>


          {/* DATE + ROUNDS */}

          <div className="create-league-two-column">


            <div className="create-league-field">

              <label htmlFor="startDate">
                Start Date
              </label>

              <input
                id="startDate"
                type="date"
                name="startDate"
                value={
                  formData.startDate
                }
                onChange={handleChange}
              />

            </div>


            <div className="create-league-field">

              <label htmlFor="rounds">
                Number of Rounds
              </label>

              <input
                id="rounds"
                type="number"
                name="rounds"
                value={
                  formData.rounds
                }
                onChange={handleChange}
                placeholder="e.g. 7"
                min="1"
              />

            </div>

          </div>


          {/* SKILL LEVEL */}

          <div className="create-league-field">

            <label>
              Skill Level
            </label>


            <div className="create-league-options skill-options">

              <button
                type="button"
                className={`league-option ${
                  formData.skillLevel ===
                  "beginner"
                    ? "selected"
                    : ""
                }`}
                onClick={() =>
                  setOption(
                    "skillLevel",
                    "beginner"
                  )
                }
              >
                Beginner
              </button>


              <button
                type="button"
                className={`league-option ${
                  formData.skillLevel ===
                  "intermediate"
                    ? "selected"
                    : ""
                }`}
                onClick={() =>
                  setOption(
                    "skillLevel",
                    "intermediate"
                  )
                }
              >
                Intermediate
              </button>


              <button
                type="button"
                className={`league-option ${
                  formData.skillLevel ===
                  "advanced"
                    ? "selected"
                    : ""
                }`}
                onClick={() =>
                  setOption(
                    "skillLevel",
                    "advanced"
                  )
                }
              >
                Advanced
              </button>

            </div>

          </div>


          {/* VENUE */}

          <div className="create-league-field">

            <label htmlFor="venue">
              Area / Venue Preference
            </label>


            <div className="input-with-icon">

              <input
                id="venue"
                type="text"
                name="venue"
                value={
                  formData.venue
                }
                onChange={handleChange}
                placeholder="e.g. Box Hill, Clayton, CBD"
              />

              <MapPin size={18} />

            </div>

          </div>


          {/* MAX PLAYERS + INVITE */}

          <div className="create-league-two-column aligned-top">


            <div className="create-league-field">

              <label htmlFor="maxPlayers">
                Max Players
              </label>

              <input
                id="maxPlayers"
                type="number"
                name="maxPlayers"
                value={
                  formData.maxPlayers
                }
                onChange={handleChange}
                placeholder="e.g. 24"
                min="2"
              />

            </div>


            <div className="create-league-field">

              <label className="toggle-label">
                Invite Players First
              </label>


              <label className="toggle-switch">

                <input
                  type="checkbox"
                  name="inviteFirst"
                  checked={
                    formData.inviteFirst
                  }
                  onChange={handleChange}
                />

                <span className="toggle-slider" />

              </label>


              <p className="field-helper-text">
                Invite now or add them later.
              </p>

            </div>

          </div>


          {/* ADD PLAYERS */}

          {formData.inviteFirst && (

            <div className="create-league-field">

              <label htmlFor="inviteSearch">
                Add Players
                <span>
                  {" "}
                  (Optional)
                </span>
              </label>


              <div className="input-with-icon left-icon">

                <Search size={18} />

                <input
                  id="inviteSearch"
                  type="text"
                  name="inviteSearch"
                  value={
                    formData.inviteSearch
                  }
                  onChange={handleChange}
                  placeholder="Search players by name..."
                />

              </div>


              {selectedPlayers.length >
                0 && (

                <div className="selected-players">

                  {selectedPlayers.map(
                    (player) => (

                      <div
                        className="selected-player-pill"
                        key={
                          player.id
                        }
                      >

                        <span>
                          {
                            player.name
                          }
                        </span>


                        <button
                          type="button"
                          onClick={() =>
                            removePlayer(
                              player.id
                            )
                          }
                        >
                          ×
                        </button>

                      </div>

                    )
                  )}

                </div>

              )}

            </div>

          )}


          {/* DESCRIPTION */}

          <div className="create-league-field">

            <label htmlFor="description">
              Description
              <span>
                {" "}
                (Optional)
              </span>
            </label>


            <textarea
              id="description"
              name="description"
              value={
                formData.description
              }
              onChange={handleChange}
              placeholder="e.g. Casual social league, all are welcome!"
              maxLength={300}
            />


            <div className="character-count">
              {
                formData
                  .description
                  .length
              }
              /300
            </div>

          </div>

        </div>


        {/* BUTTONS */}

        <div className="create-league-actions">

          <button
            type="button"
            className="save-draft-button"
            onClick={
              handleSaveDraft
            }
          >
            Save Draft
          </button>


          <button
            type="submit"
            className="create-league-submit-button"
          >
            Create League
          </button>

        </div>

      </form>

    </div>
  );
}

export default CreateLeaguePage;