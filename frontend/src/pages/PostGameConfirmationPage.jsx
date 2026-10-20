import { useLocation, useNavigate } from "react-router-dom";

import {
  Check,
  CalendarDays,
  Clock3,
  MapPin,
} from "lucide-react";

import ConfirmationPage from "../components/common/ConfirmationPage";

import "../styles/PostGameConfirmation.css";


function formatDate(dateValue) {
  if (!dateValue) {
    return "Date not set";
  }

  const [year, month, day] =
    dateValue.split("-");

  const date = new Date(
    Number(year),
    Number(month) - 1,
    Number(day)
  );

  return new Intl.DateTimeFormat(
    "en-AU",
    {
      day: "numeric",
      month: "short",
      year: "numeric",
    }
  ).format(date);
}


function formatTime(timeValue) {
  if (!timeValue) {
    return "Time not set";
  }

  const [hours, minutes] =
    timeValue.split(":");

  const date = new Date();

  date.setHours(
    Number(hours),
    Number(minutes)
  );

  return new Intl.DateTimeFormat(
    "en-AU",
    {
      hour: "numeric",
      minute: "2-digit",
    }
  ).format(date);
}


function PostGameConfirmationPage() {
  const navigate = useNavigate();

  const location = useLocation();

  const game = location.state?.game;


  return (
    <ConfirmationPage
      icon={
        <Check
          size={42}
          strokeWidth={2.5}
        />
      }

      title="Game Posted!"

      description={
        <>
          Your game has been created.
          Players will be able to find
          and join your game.
        </>
      }

      primaryLabel="Back to Dashboard"

      onPrimary={() =>
        navigate("/dashboard")
      }

      secondaryLabel="Post Another Game"

      onSecondary={() =>
        navigate("/post-game")
      }
    >

      {game && (
        <div className="posted-game-summary">

          <div className="posted-game-heading">

            <div>
              <strong>
                {game.format === "singles"
                  ? "Singles"
                  : "Doubles"}
              </strong>

              <span>
                {game.style === "social"
                  ? "Social Game"
                  : "Competitive Game"}
              </span>
            </div>

            <span className="posted-game-status">
              Posted
            </span>

          </div>


          <div className="posted-game-divider" />


          <div className="posted-game-detail">

            <CalendarDays size={19} />

            <span>
              {formatDate(game.date)}
            </span>

          </div>


          <div className="posted-game-detail">

            <Clock3 size={19} />

            <span>
              {formatTime(game.startTime)}
              {" • "}
              {game.durationMinutes} minutes
            </span>

          </div>


          <div className="posted-game-detail">

            <MapPin size={19} />

            <span>
              {game.venue}
            </span>

          </div>

        </div>
      )}

    </ConfirmationPage>
  );
}

export default PostGameConfirmationPage;