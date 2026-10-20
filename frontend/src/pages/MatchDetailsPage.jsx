import {useEffect,useState} from 'react';
import {useNavigate,useParams} from 'react-router-dom';
import {CheckCircle2,TriangleAlert} from 'lucide-react';
import * as api from '../services/badmintonApi';
import '../styles/MatchResultFlow.css';
function MatchDetailsPage(){
 const navigate=useNavigate();const {matchId}=useParams();
 const [match,setMatch]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[disputing,setDisputing]=useState(false),[reason,setReason]=useState('');
 const refresh=async()=>{const m=await api.getMatch(matchId);if(!m)throw new Error('Match not found or you are not allowed to view it.');setMatch(m);};
 useEffect(()=>{let live=true;(async()=>{try{const m=await api.getMatch(matchId);if(!m)throw new Error('Match not found or you are not allowed to view it.');if(live)setMatch(m);}catch(e){if(live)setError(e.message);}finally{if(live)setLoading(false);}})();return()=>{live=false;};},[matchId]);
 const latest=match?.result;
 const confirm=async()=>{setError('');setBusy(true);try{if(!latest?.id)throw new Error('No pending result ID.');const card=await api.confirmResult(latest.id);navigate(`/matches/${matchId}/result-confirmed`,{state:{result:card?.result||null}});}catch(e){setError(e.message||'Could not confirm result.');}finally{setBusy(false);}};
 const dispute=async e=>{e.preventDefault();setError('');setBusy(true);try{if(!latest?.id)throw new Error('No result to dispute.');await api.raiseDispute(latest.id,reason.trim());setDisputing(false);await refresh();}catch(e){setError(e.message||'Could not dispute result.');}finally{setBusy(false);}};
 const a=match?.sides?.a||[],b=match?.sides?.b||[];
 return <div className="match-flow-page"><header className="match-flow-header"><button type="button" onClick={()=>navigate(-1)}>←</button><h1>Match Details</h1></header>
  {error&&<p role="alert" style={{padding:14,color:'#a32727'}}>{error}</p>}{loading&&<p>Loading match...</p>}
  {match&&<main className="match-flow-content"><section className="match-flow-card"><h2>{match.format||'Badminton'} Match</h2>
   <div className="match-detail-row"><span>Status</span><strong>{latest?.verificationStatus||latest?.status||'No result'}</strong></div>
   <div className="match-detail-row"><span>Played at</span><strong>{match.playedAt?new Date(match.playedAt).toLocaleString('en-AU'):'Not scheduled'}</strong></div>
   <div className="match-detail-row"><span>Location</span><strong>{match.location||'Not specified'}</strong></div>
   <div className="match-detail-row"><span>Side A</span><strong>{a.map(p=>p.name).join(', ')||'Unknown'}</strong></div>
   <div className="match-detail-row"><span>Side B</span><strong>{b.map(p=>p.name).join(', ')||'Unknown'}</strong></div>
   {latest&&<><div className="match-flow-divider"/><h3>Result</h3>
    <div className="match-detail-row"><span>Score</span><strong>{latest.score||'Not recorded'}</strong></div>
    <div className="match-detail-row"><span>Winning side</span><strong>{latest.winningSide?.toUpperCase()||'Unknown'}</strong></div>
    {latest.ratingChange&&<div className="match-detail-row"><span>Rating change</span><strong>{latest.ratingChange.before} → {latest.ratingChange.after}</strong></div>}
    {latest.ratingPending&&<p>Rating will update after the nightly calculation.</p>}
   </>}
  </section>
  {match.gameId&&<button type="button" className="match-flow-primary" onClick={()=>navigate(`/games/${match.gameId}`)}>View Game</button>}
  {latest?.canConfirm&&<section className="match-flow-card"><p>Only a player from the opposing side can confirm or dispute this result.</p>
   <button type="button" disabled={busy} onClick={confirm}><CheckCircle2 size={16}/> Confirm Result</button>
   <button type="button" onClick={()=>setDisputing(v=>!v)}><TriangleAlert size={16}/> Dispute</button>
   {disputing&&<form onSubmit={dispute}><label htmlFor="disputeReason">Dispute reason</label><textarea id="disputeReason" value={reason} onChange={e=>setReason(e.target.value)} required/><button type="submit" disabled={busy||!reason.trim()}>Submit Dispute</button></form>}
  </section>}
  </main>}
 </div>;
}
export default MatchDetailsPage;
