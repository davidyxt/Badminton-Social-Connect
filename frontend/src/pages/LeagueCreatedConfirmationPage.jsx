import {
    useLocation,
    useNavigate,
    useParams,
  } from "react-router-dom";
  
  import { Trophy } from "lucide-react";
  
  import ConfirmationPage from "../components/common/ConfirmationPage";
  
  import "../styles/LeagueCreatedConfirmationPage.css";
  
  
  function LeagueCreatedConfirmationPage() {
    const navigate = useNavigate();
    const location = useLocation();
    const { leagueId } = useParams();
  
  
    /*
      League data passed from CreateLeaguePage.
  
      Later this can be fetched from Supabase using leagueId.
    */
  
    const passedLeague = location.state?.league;
  
  
    /*
      Fallback lets you directly visit:
      /leagues/test/created
      during development.
    */
  
    const league =
      passedLeague ?? {
        id: leagueId,
        name: "Northside Social League",
        format: "Singles",
        skillLevel: "Intermediate",
        startDate: "2026-10-03",
        rounds: 7,
        venue: "Northside",
        invitedPlayers: [
          {
            id: 1,
            name: "Jordan K.",
            initials: "JK",
          },
          {
            id: 2,
            name: "Alex T.",
            initials: "AT",
          },
          {
            id: 3,
            name: "Sarah M.",
            initials: "SM",
          },
          {
            id: 4,
            name: "Chris L.",
            initials: "CL",
          },
        ],
      };
  
  
    const formatDate = (dateValue) => {
      if (!dateValue) {
        return "Not set";
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
          weekday: "short",
          day: "numeric",
          month: "short",
        }
      ).format(date);
    };
  
  
    const invitedPlayers =
      league.invitedPlayers ?? [];
  
  
    return (
      <ConfirmationPage
        icon={
          <Trophy
            size={42}
            strokeWidth={2}
          />
        }
  
        title="League Created!"
  
        description={
          <>
            <strong>{league.name}</strong>{" "}
            is set up. You'll be notified as
            players join.
          </>
        }
  
        primaryLabel="View League"
  
        onPrimary={() =>
          navigate(`/leagues/${league.id}`)
        }
  
        secondaryLabel="Back to Mini Leagues"
  
        onSecondary={() =>
          navigate("/leagues")
        }
      >
  
        <div className="league-created-card">
  
          {/* TOP */}
  
          <div className="league-created-header">
  
            <div className="league-created-avatar">
              {league.name
                .split(" ")
                .map((word) => word[0])
                .join("")
                .slice(0, 2)
                .toUpperCase()}
            </div>
  
  
            <div className="league-created-title">
  
              <h2>
                {league.name}
              </h2>
  
  
              <div className="league-created-tags">
  
                <span>
                  {league.format}
                </span>
  
                <span>
                  {league.skillLevel}
                </span>
  
              </div>
  
            </div>
  
          </div>
  
  
          <div className="league-created-divider" />
  
  
          {/* DETAILS */}
  
          <div className="league-created-detail">
  
            <span>
              Starts
            </span>
  
            <strong>
              {formatDate(
                league.startDate
              )}
            </strong>
  
          </div>
  
  
          <div className="league-created-detail">
  
            <span>
              Rounds
            </span>
  
            <strong>
              {league.rounds}
            </strong>
  
          </div>
  
  
          <div className="league-created-detail">
  
            <span>
              Area
            </span>
  
            <strong>
              {league.venue ||
                "Not specified"}
            </strong>
  
          </div>
  
  
          {/* INVITED PLAYERS */}
  
          {invitedPlayers.length > 0 && (
            <div className="league-created-detail invited-row">
  
              <span>
                Invited
              </span>
  
  
              <div className="league-created-invited">
  
                <div className="invited-avatars">
  
                  {invitedPlayers
                    .slice(0, 4)
                    .map((player) => (
  
                      <div
                        className="invited-avatar"
                        key={player.id}
                        title={player.name}
                      >
                        {player.initials}
                      </div>
  
                    ))}
  
                </div>
  
  
                <strong>
                  {invitedPlayers.length}{" "}
                  {invitedPlayers.length === 1
                    ? "player"
                    : "players"}
                </strong>
  
              </div>
  
            </div>
          )}
  
        </div>
  
      </ConfirmationPage>
    );
  }
  
  export default LeagueCreatedConfirmationPage;