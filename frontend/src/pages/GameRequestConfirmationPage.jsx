import {
    useLocation,
    useNavigate,
    useParams,
  } from "react-router-dom";
  
  import {
    Send,
    UserRound,
  } from "lucide-react";
  
  import ConfirmationPage from "../components/common/ConfirmationPage";
  
  import "../styles/GameRequestConfirmationPage.css";
  
  
  function GameRequestConfirmationPage() {
    const navigate = useNavigate();
    const location = useLocation();
    const { gameId } = useParams();
  
  
    // Organiser details are provided only after request_to_join succeeds.
  
    const passedPlayer = location.state?.player;
    const confirmed = location.state?.confirmed === true;
    if (!confirmed) return <div className="request-confirmation-page"><p>No successfully sent request was found for this page.</p><button type="button" onClick={() => navigate(`/games/${gameId}`)}>View game</button></div>;
  
  
    const player =
      passedPlayer ?? {
        id: "",
        name: "the game organiser",
        initials: "",
        profileImageUrl: null,
      };
  
  
    return (
      <ConfirmationPage
        icon={
          <Send
            size={40}
            strokeWidth={2}
          />
        }
  
        title="Request Sent!"
  
        description={
          <>
            Your game request has been sent to{" "}
            <strong>{player.name}</strong>.
            You'll be notified when they respond.
          </>
        }
  
        primaryLabel="View Game"

        onPrimary={() => navigate(`/games/${gameId}`)}
  
        secondaryLabel="Find Another Game"
  
        onSecondary={() =>
          navigate("/find")
        }
      >
  
        {/* PLAYER CARD */}
  
        <div className="request-player-card">
  
          <div className="request-player-avatar">
  
            {player.profileImageUrl ? (
              <img
                src={player.profileImageUrl}
                alt={player.name}
              />
            ) : (
              <UserRound
                size={31}
                strokeWidth={1.8}
              />
            )}
  
          </div>
  
  
          <div className="request-player-info">
  
            <strong>
              {player.name}
            </strong>
  
            <span>
              Game organiser
            </span>
  
          </div>
  
        </div>
  
      </ConfirmationPage>
    );
  }
  
  export default GameRequestConfirmationPage;