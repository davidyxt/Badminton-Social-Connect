import {useEffect,useState} from 'react';
import {useNavigate,useParams} from 'react-router-dom';
import {ArrowLeft,Clock3,MapPin,UserRound,TriangleAlert} from 'lucide-react';
import * as api from '../services/badmintonApi';
import '../styles/GameDetailsPage.css';
function GameDetailsPage(){
 const navigate=useNavigate();const {gameId}=useParams();
 const [game,setGame]=useState(null),[host,setHost]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[requesting,setRequesting]=useState(false);
 useEffect(()=>{let active=true;(async()=>{try{const row=await api.getGame(gameId);if(!row)throw new Error('Game not found.');const player=row.organiserId?await api.getPlayer(row.organiserId):null;if(active){setGame(api.mapGame(row));setHost(player?api.mapPlayer(player):null);}}catch(e){if(active)setError(e.message);}finally{if(active)setLoading(false);}})();return()=>{active=false;};},[gameId]);
 const request=async()=>{setError('');setRequesting(true);try{await api.requestToJoin(gameId);navigate(`/games/${gameId}/request-confirmation`,{state:{player:host,confirmed:true}});}catch(e){setError(e.message||'Could not send request.');}finally{setRequesting(false);}};
 return <div className="game-details-page"><header className="game-details-header"><button type="button" onClick={()=>navigate('/find')} aria-label="Back"><ArrowLeft size={22}/></button><h1>Game Details</h1></header>
  {loading&&<p>Loading game...</p>}{error&&<p role="alert" className="game-details-error">{error}</p>}
  {game&&<main className="game-details-content"><section className="game-details-card"><div className="game-details-image"><h2>{game.title}</h2><span>{game.format}</span></div>
  <div className="game-detail-row"><Clock3 size={19}/><div><strong>Proposed time</strong><p>{game.date}, {game.time}</p></div></div>
  <div className="game-detail-row"><MapPin size={19}/><div><strong>Suburb</strong><p>{game.location}</p></div></div>
  <div className="game-detail-row"><UserRound size={19}/><div><strong>Organiser</strong><p>{host?.name||'Not available'}</p>{host&&<button type="button" onClick={()=>navigate(`/players/${host.id}`)}>View profile</button>}</div></div>
  <div className="game-detail-row"><strong>Status: {game.status||'Not specified'}</strong></div></section>
  <div className="game-detail-notice"><TriangleAlert size={18}/><p>Requesting a game sends a join request. The organiser must accept it.</p></div>
  {game.status==='open'&&<button type="button" className="request-game-button" disabled={requesting} onClick={request}>{requesting?'Requesting...':'Request to Play'}</button>}
  </main>}
 </div>;
}
export default GameDetailsPage;
