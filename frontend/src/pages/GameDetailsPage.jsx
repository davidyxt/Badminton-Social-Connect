import {useEffect,useState} from 'react';
import {useNavigate,useParams} from 'react-router-dom';
import {ArrowLeft,Clock3,MapPin,Star,TriangleAlert,UserRound,Users} from 'lucide-react';
import * as api from '../services/badmintonApi';
import photo1 from '../assets/images/game-placeholder-1.webp';
import photo2 from '../assets/images/game-placeholder-2.webp';
import photo3 from '../assets/images/game-placeholder-3.webp';
import photo4 from '../assets/images/game-placeholder-4.webp';
import photo5 from '../assets/images/game-placeholder-5.webp';
import '../styles/GameDetailsPage.css';

// Games have no photo yet: pick one of the placeholder photos per game.
const photos=[photo1,photo2,photo3,photo4,photo5];
const photoFor=id=>photos[[...String(id||'')].reduce((n,c)=>n+c.charCodeAt(0),0)%photos.length];
const initialsOf=name=>String(name||'?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
const capitalise=value=>value?String(value).charAt(0).toUpperCase()+String(value).slice(1):'Unknown';

function GameDetailsPage(){
 const navigate=useNavigate();const {gameId}=useParams();
 const [game,setGame]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[requesting,setRequesting]=useState(false);
 useEffect(()=>{let active=true;(async()=>{try{const g=await api.getGame(gameId);if(!g)throw new Error('Game not found or you do not have access.');if(active)setGame(g);}catch(e){if(active)setError(e.message);}finally{if(active)setLoading(false);}})();return()=>{active=false;};},[gameId]);
 const request=async()=>{setError('');setRequesting(true);try{await api.requestToJoin(gameId);navigate(`/games/${gameId}/request-confirmation`,{state:{player:game.host,confirmed:true}});}catch(e){setError(e.message||'Could not send request.');}finally{setRequesting(false);}};
 const host=game?.host||{};
 const players=game?.players||[];
 const openSpots=Math.max(0,(game?.maxPlayers||0)-players.length);
 const myStatus=String(game?.myStatus||'').toLowerCase();
 const locationDetail=[game?.address,game?.suburb].find(v=>v&&v!==game.location);
 return <div className="game-details-page"><header className="game-details-header"><button type="button" className="game-details-back" onClick={()=>navigate('/find')} aria-label="Back"><ArrowLeft size={22}/></button><h1>Game Details</h1></header>
  {loading&&<p className="game-details-loading">Loading game...</p>}{error&&<p role="alert" className="game-details-error">{error}</p>}
  {game&&<>
  <section className="game-details-image" style={{backgroundImage:`url(${photoFor(game.id)})`}}>
   <div className="game-details-badges"><span className="details-format-badge">{game.format}</span>{game.style&&<span className="details-style-badge">{game.style}</span>}</div>
  </section>
  <main className="game-details-content">
   <section className="details-card details-title-card">
    <h2>{game.title||'Badminton game'}</h2>
    <span className={`details-status-pill status-${String(game.status||'').toLowerCase()}`}>{capitalise(game.status)}</span>
   </section>
   <section className="details-card details-info-card">
    <div className="details-info-row"><div className="details-info-icon"><Clock3 size={18}/></div><div className="details-info-text"><strong>{game.date}, {game.time}</strong>{game.duration&&<span>{game.duration}</span>}</div></div>
    <div className="details-divider"/>
    <div className="details-info-row"><div className="details-info-icon"><MapPin size={18}/></div><div className="details-info-text"><strong>{game.location}</strong>{locationDetail&&<span>{locationDetail}</span>}</div></div>
   </section>
   <section className="details-card">
    <div className="details-section-label">POSTED BY</div>
    <div className="details-host-row">
     <div className="details-host-avatar">{host.initials||initialsOf(host.name)}</div>
     <div className="details-host-info">
      <strong>{host.name||'Not available'}</strong>
      {host.rating!=null&&<div className="details-host-rating"><Star size={13} fill="currentColor"/><span>Rating {host.rating}{host.verifiedMatches!=null?` \u00b7 ${host.verifiedMatches} verified`:''}</span></div>}
      {host.reliability!=null&&<div className="details-reliability-row"><div className="details-reliability-track"><div className="details-reliability-fill" style={{width:`${host.reliability}%`}}/></div><strong>{host.reliability}%</strong></div>}
     </div>
    </div>
    {host.id&&!host.isGroup&&<button type="button" className="details-profile-button" onClick={()=>navigate(`/players/${host.id}`)}>View Full Profile</button>}
   </section>
   <section className="details-card">
    <div className="details-card-header"><div className="details-section-label">PLAYERS GOING</div><div className="details-player-count"><Users size={14}/><strong>{players.length}{game.maxPlayers?` of ${game.maxPlayers}`:''} confirmed</strong></div></div>
    <div className="details-player-list">
     {players.map(p=><div className="details-player" key={p.id}><div className="details-player-avatar">{p.initials||initialsOf(p.name)}</div><strong>{p.name}</strong>{p.host&&<span className="details-host-badge">Host</span>}</div>)}
     {Array.from({length:openSpots}).map((_,i)=><div className="details-player" key={`open-${i}`}><div className="details-open-avatar"><UserRound size={22}/></div><strong>Open spot</strong><span className="details-open-text">{openSpots===1?'1 spot left':`${openSpots} spots left`}</span></div>)}
    </div>
   </section>
   {game.canManage&&<button type="button" className="details-request-button" onClick={()=>navigate(`/play-requests/${gameId}`)}>Manage Play Requests</button>}
   {game.canRecordResult&&<button type="button" className="details-request-button" onClick={()=>navigate(`/games/${gameId}/record-result`)}>Record a Match Result</button>}
   {myStatus==='invited'&&<div className="details-invite-actions"><p>You were invited to this game.</p>
    <button type="button" className="details-request-button" disabled={requesting} onClick={async()=>{try{setRequesting(true);await api.acceptInvite(gameId);setGame(await api.getGame(gameId));}catch(e){setError(e.message);}finally{setRequesting(false);}}}>Accept Invitation</button>
    <button type="button" className="details-profile-button" disabled={requesting} onClick={async()=>{try{setRequesting(true);await api.declineInvite(gameId);setGame(await api.getGame(gameId));}catch(e){setError(e.message);}finally{setRequesting(false);}}}>Decline Invitation</button>
   </div>}
   {!game.canManage&&!game.canRecordResult&&<div className="details-warning"><TriangleAlert size={20}/><p>The organiser reviews requests before you can join.</p></div>}
   {!game.canManage&&game.status==='open'&&!['pending','accepted','invited'].includes(myStatus)&&<button type="button" className="details-request-button" disabled={requesting} onClick={request}>{requesting?'Requesting...':'Request to Play'}</button>}
   {myStatus==='pending'&&<button type="button" className="details-request-button details-withdraw-button" disabled={requesting} onClick={async()=>{try{setRequesting(true);await api.withdrawRequest(gameId);setGame(await api.getGame(gameId));}catch(e){setError(e.message);}finally{setRequesting(false);}}}>Withdraw Request</button>}
  </main></>}
 </div>;
}
export default GameDetailsPage;
