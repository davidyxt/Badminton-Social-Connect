import {useEffect,useState} from 'react';
import {useNavigate,useParams} from 'react-router-dom';
import {ArrowLeft,Clock3,MapPin,UserRound,TriangleAlert} from 'lucide-react';
import * as api from '../services/badmintonApi';
import '../styles/GameDetailsPage.css';
function GameDetailsPage(){
 const navigate=useNavigate();const {gameId}=useParams();
 const [game,setGame]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[requesting,setRequesting]=useState(false);
 useEffect(()=>{let active=true;(async()=>{try{const g=await api.getGame(gameId);if(!g)throw new Error('Game not found or you do not have access.');if(active)setGame(g);}catch(e){if(active)setError(e.message);}finally{if(active)setLoading(false);}})();return()=>{active=false;};},[gameId]);
 const request=async()=>{setError('');setRequesting(true);try{await api.requestToJoin(gameId);navigate(`/games/${gameId}/request-confirmation`,{state:{player:game.host,confirmed:true}});}catch(e){setError(e.message||'Could not send request.');}finally{setRequesting(false);}};
 return <div className="game-details-page"><header className="game-details-header"><button type="button" onClick={()=>navigate('/find')} aria-label="Back"><ArrowLeft size={22}/></button><h1>Game Details</h1></header>
  {loading&&<p>Loading game...</p>}{error&&<p role="alert" className="game-details-error">{error}</p>}
  {game&&<main className="game-details-content"><section className="game-details-card"><div className="game-details-image"><h2>{game.title||'Badminton game'}</h2><span>{game.format}</span></div>
   <div className="game-detail-row"><Clock3 size={19}/><div><strong>Start time</strong><p>{game.date}, {game.time}</p></div></div>
   <div className="game-detail-row"><MapPin size={19}/><div><strong>Location</strong><p>{game.location}</p></div></div>
   <div className="game-detail-row"><UserRound size={19}/><div><strong>Organiser</strong><p>{game.host?.name||'Not available'}</p>{game.host?.id&&!game.host.isGroup&&<button type="button" onClick={()=>navigate(`/players/${game.host.id}`)}>View profile</button>}</div></div>
   <div className="game-detail-row"><strong>Status: {game.status||'Unknown'}</strong></div>
   {game.players?.length>0&&<div className="game-detail-row"><strong>Accepted: {game.players.map(p=>p.name).join(', ')}</strong></div>}
  </section>
  {game.canManage&&<button type="button" className="request-game-button" onClick={()=>navigate(`/play-requests/${gameId}`)}>Manage Play Requests</button>}
  {game.canRecordResult&&<button type="button" className="request-game-button" onClick={()=>navigate(`/games/${gameId}/record-result`)}>Record a Match Result</button>}
  {String(game.myStatus||'').toLowerCase()==='invited'&&<div className="game-detail-notice" style={{display:'grid',gap:8}}><p>You were invited to this game.</p>
   <button type="button" disabled={requesting} onClick={async()=>{try{setRequesting(true);await api.acceptInvite(gameId);setGame(await api.getGame(gameId));}catch(e){setError(e.message);}finally{setRequesting(false);}}}>Accept Invitation</button>
   <button type="button" disabled={requesting} onClick={async()=>{try{setRequesting(true);await api.declineInvite(gameId);setGame(await api.getGame(gameId));}catch(e){setError(e.message);}finally{setRequesting(false);}}}>Decline Invitation</button>
  </div>}
  {!game.canManage&&!game.canRecordResult&&<div className="game-detail-notice"><TriangleAlert size={18}/><p>The organiser reviews requests before you can join.</p></div>}
  {!game.canManage&&game.status==='open'&&!['pending','accepted','invited'].includes(String(game.myStatus||'').toLowerCase())&&<button type="button" className="request-game-button" disabled={requesting} onClick={request}>{requesting?'Requesting...':'Request to Play'}</button>}
  {String(game.myStatus||'').toLowerCase()==='pending'&&<button type="button" className="request-game-button" disabled={requesting} onClick={async()=>{try{setRequesting(true);await api.withdrawRequest(gameId);setGame(await api.getGame(gameId));}catch(e){setError(e.message);}finally{setRequesting(false);}}}>Withdraw Request</button>}
  </main>}
 </div>;
}
export default GameDetailsPage;
