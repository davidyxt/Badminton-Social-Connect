import {useEffect,useState} from 'react';
import {useNavigate,useParams} from 'react-router-dom';
import {ArrowLeft,Flag,ShieldCheck} from 'lucide-react';
import * as api from '../services/badmintonApi';
import '../styles/PlayerProfilePage.css';
function PlayerProfilePage(){
 const navigate=useNavigate();const {playerId}=useParams();const [player,setPlayer]=useState(null),[profile,setProfile]=useState(null),[ranking,setRanking]=useState([]);
 const [error,setError]=useState(''),[busy,setBusy]=useState(false),[reporting,setReporting]=useState(false),[reason,setReason]=useState(''),[reported,setReported]=useState(false);
 useEffect(()=>{let live=true;Promise.all([api.getPlayer(playerId),api.getPlayerProfile(playerId),api.getRanking(playerId)]).then(([p,pr,r])=>{if(live){setPlayer(p);setProfile(pr);setRanking(r);}}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};},[playerId]);
 const report=async e=>{e.preventDefault();if(!reason.trim())return;setBusy(true);setError('');try{await api.reportPlayer(playerId,reason.trim());setReported(true);setReporting(false);}catch(e){setError(e.message);}finally{setBusy(false);}};
 return <div className="player-profile-page"><header className="player-profile-header"><button type="button" onClick={()=>navigate(-1)} aria-label="Back"><ArrowLeft size={21}/></button><h1>Player Profile</h1><button type="button" className="player-report-button" onClick={()=>setReporting(v=>!v)} aria-label="Report player"><Flag size={18}/></button></header>
 {error&&<p role="alert">{error}</p>}{!player&&!error&&<p>Loading player...</p>}
 {player&&<><section className="player-profile-summary"><div className="player-profile-top"><div className="other-player-avatar">{player.displayName?.split(' ').map(s=>s[0]).slice(0,2).join('')||'P'}</div><div><h2>{player.displayName||'Player'}</h2><div className="other-player-tags"><span>{player.selfRatingBand||'Unrated'}</span><span>{player.isVerified?'Verified':'Not verified'}</span></div></div></div><div className="player-profile-divider"/><div className="other-player-stats"><div><strong>{profile?.gamesPlayed??'–'}</strong><span>Games played</span></div><div><strong>{profile?.reliabilityScore==null?'–':`${Math.round(profile.reliabilityScore*100)}%`}</strong><span>Reliability</span></div><div><strong>{profile?.noShowCount??'–'}</strong><span>No-shows</span></div></div></section>
 <section className="player-profile-section"><h3>Playing area</h3><p>{[profile?.suburb,profile?.state].filter(Boolean).join(', ')||'Not provided'}</p>{profile?.bio&&<p>{profile.bio}</p>}</section>
 <section className="player-profile-section"><h3>Rankings by format</h3>{ranking.map(r=><p key={r.format}>{r.format}: {r.rankingPoints??'–'} points · {r.band||'Unrated'} · {r.verifiedGamesCount??0} verified games</p>)}{!ranking.length&&<p>No ranking yet.</p>}</section>
 <div className="player-profile-privacy"><ShieldCheck size={18}/><span>Only profile information permitted by the backend is shown.</span></div></>}
 {reported&&<p role="status">Report submitted.</p>}{reporting&&<form className="player-report-form" onSubmit={report}><label htmlFor="reportReason">Reason for report</label><textarea id="reportReason" value={reason} onChange={e=>setReason(e.target.value)} required/><button type="submit" disabled={busy}>{busy?'Submitting...':'Submit report'}</button></form>}
 </div>;
}
export default PlayerProfilePage;
