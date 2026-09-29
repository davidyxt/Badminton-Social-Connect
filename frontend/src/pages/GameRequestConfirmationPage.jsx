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
  
  
    /*
      Temporary player data.
  
      Later this can come from Supabase or from
      the game details page when the request is sent.
    */
  
    const passedPlayer = location.state?.player;
  
  
    const player =
      passedPlayer ?? {
        id: "temporary-player",
        name: "Jordan K.",
        initials: "JK",
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
  
        primaryLabel="View My Requests"
  
        onPrimary={() => {
          // Temporary route until My Requests page exists
          console.log(
            "View requests for game:",
            gameId
          );
        }}
  
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