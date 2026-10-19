import {useEffect,useState} from 'react';
import {useNavigate,useParams} from 'react-router-dom';
import {CheckCircle2,MessageCircle,TriangleAlert} from 'lucide-react';
import * as api from '../services/badmintonApi';
import '../styles/MatchResultFlow.css';
function MatchDetailsPage(){
 const navigate=useNavigate();const {matchId}=useParams();const [match,setMatch]=useState(null),[participants,setParticipants]=useState([]),[results,setResults]=useState([]),[names,setNames]=useState({}),[myId,setMyId]=useState(null);
 const [error,setError]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[disputing,setDisputing]=useState(false),[reason,setReason]=useState('');
 const refresh=async()=>{const [m,ps,rs,id,players]=await Promise.all([api.getMatch(matchId),api.getMatchParticipants(matchId),api.getMatchResults(matchId),api.getCurrentUserId(),api.listPlayers()]);
  setMatch(m);setParticipants(ps);setResults(rs);setMyId(id);setNames(Object.fromEntries(players.map(p=>[p.playerId,p.displayName||'Player'])));};
 useEffect(()=>{let live=true;(async()=>{try{await refresh();}catch(e){if(live)setError(e.message);}finally{if(live)setLoading(false);}})();return()=>{live=false;};},[matchId]);
 const latest=results[0];const member=participants.some(p=>p.playerId===myId);
 const confirm=async()=>{setError('');setBusy(true);try{const result=await api.confirmResult(matchId);navigate(`/matches/${matchId}/result-confirmed`,{state:{result}});}catch(e){setError(e.message||'Could not confirm result.');}finally{setBusy(false);}};
 const dispute=async e=>{e.preventDefault();setError('');setBusy(true);try{await api.raiseDispute(matchId,reason.trim());setDisputing(false);await refresh();}catch(e){setError(e.message);}finally{setBusy(false);}};
 return <div className="match-flow-page"><header className="match-flow-header"><button type="button" onClick={()=>navigate(-1)}>←</button><h1>Match Details</h1></header>
 {error&&<p role="alert">{error}</p>}{loading&&<p>Loading match...</p>}
 {match&&<main className="match-flow-content"><section className="match-flow-card"><h2>{match.format||'Badminton'} Match</h2><div className="match-detail-row"><span>Status</span><strong>{match.status||'Not specified'}</strong></div><div className="match-detail-row"><span>Played at</span><strong>{match.playedAt?new Date(match.playedAt).toLocaleString('en-AU'):'Not scheduled'}</strong></div><div className="match-detail-row"><span>Suburb</span><strong>{match.suburb||'Not specified'}</strong></div><div className="match-detail-row"><span>Participants</span><strong>{participants.map(p=>names[p.playerId]||'Player').join(', ')||'Not assigned'}</strong></div>
 {latest&&<><div className="match-flow-divider"/><h3>Result record</h3><div className="match-detail-row"><span>Score</span><strong>{latest.score||'Not recorded'}</strong></div><div className="match-detail-row"><span>Status</span><strong>{latest.status||'Unknown'}</strong></div><div className="match-detail-row"><span>Winner</span><strong>{names[latest.winnerId]||'Not yet determined'}</strong></div></>}</section>
 {member&&<><div className="match-flow-bottom-action"><button type="button" className="match-flow-primary" onClick={()=>navigate(`/matches/${matchId}/record-result`)}>Record Result</button></div>
 {latest?.status==='pending'&&<section className="match-flow-card"><p>A participant may confirm or dispute this pending result. Server policies decide who is authorised.</p><button type="button" disabled={busy} onClick={confirm}><CheckCircle2 size={16}/> Confirm Result</button><button type="button" onClick={()=>setDisputing(v=>!v)}><TriangleAlert size={16}/> Dispute</button>
 {disputing&&<form onSubmit={dispute}><label htmlFor="disputeReason">Dispute reason</label><textarea id="disputeReason" value={reason} onChange={e=>setReason(e.target.value)} required/><button type="submit" disabled={busy||!reason.trim()}>Submit Dispute</button></form>}</section>}</>}
 </main>}
 </div>;
}
export default MatchDetailsPage;
