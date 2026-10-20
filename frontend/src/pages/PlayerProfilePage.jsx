import {useEffect,useState} from 'react';
import {useNavigate,useParams} from 'react-router-dom';
import {ArrowLeft,Flag,ShieldCheck} from 'lucide-react';
import * as api from '../services/badmintonApi';
import '../styles/PlayerProfilePage.css';
function PlayerProfilePage(){
 const navigate=useNavigate(),{playerId}=useParams();
 const [profile,setProfile]=useState(null),[rating,setRating]=useState(null),[loading,setLoading]=useState(true);
 const [error,setError]=useState(''),[busy,setBusy]=useState(false),[reporting,setReporting]=useState(false),[reason,setReason]=useState(''),[reported,setReported]=useState(false);
 useEffect(()=>{let live=true;(async()=>{try{
  // The server RPC enforces discoverability and block relationships. Do not
  // bypass it by fetching raw player/player_profile rows for other people.
  const p=await api.getPublicPlayerProfile(playerId);
  if(!p)throw new Error('This profile is unavailable or private.');
  const s=await api.getRatingSummary(playerId);
  if(live){setProfile(p);setRating(s);}
 }catch(e){if(live)setError(e.message||'Unable to view this profile.');}
 finally{if(live)setLoading(false);}})();return()=>{live=false;};},[playerId]);
 const report=async e=>{e.preventDefault();if(!reason.trim())return;setBusy(true);setError('');try{await api.reportPlayer(playerId,reason.trim());setReported(true);setReporting(false);}catch(e){setError(e.message);}finally{setBusy(false);}};
 return <div className="player-profile-page"><header className="player-profile-header"><button type="button" onClick={()=>navigate(-1)} aria-label="Back"><ArrowLeft size={21}/></button><h1>Player Profile</h1>{profile&&<button type="button" className="player-report-button" onClick={()=>setReporting(v=>!v)} aria-label="Report player"><Flag size={18}/></button>}</header>
 {error&&<p role="alert">{error}</p>}{loading&&<p>Loading player...</p>}
 {profile&&<><section className="player-profile-summary"><div className="player-profile-top"><div className="other-player-avatar">{profile.initials||'P'}</div><div><h2>{profile.name||'Player'}</h2><div className="other-player-tags"><span>{profile.level||'Unrated'}</span><span>{profile.isVerified?'Verified':'Not verified'}</span></div></div></div><div className="player-profile-divider"/><div className="other-player-stats"><div><strong>{profile.matches??'–'}</strong><span>Matches played</span></div><div><strong>{profile.reliability==null?'–':`${profile.reliability}%`}</strong><span>Reliability</span></div><div><strong>{profile.noShows??'–'}</strong><span>No-shows</span></div></div></section>
 <section className="player-profile-section"><h3>Playing area</h3><p>{profile.area||'Not provided'}</p>{profile.bio&&<p>{profile.bio}</p>}</section>
 <section className="player-profile-section"><h3>Singles rating</h3><p>{rating?.rating??'–'} points · {rating?.status||'Not established'}{rating?.grade?` · Grade ${rating.grade}`:''}</p></section>
 <div className="player-profile-privacy"><ShieldCheck size={18}/><span>Only information permitted by this player's privacy settings is displayed.</span></div></>}
 {reported&&<p role="status">Report submitted.</p>}{reporting&&<form className="player-report-form" onSubmit={report}><label htmlFor="reportReason">Reason for report</label><textarea id="reportReason" value={reason} onChange={e=>setReason(e.target.value)} required/><button type="submit" disabled={busy}>{busy?'Submitting...':'Submit report'}</button></form>}
 </div>;
}
export default PlayerProfilePage;
