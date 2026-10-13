import {useEffect,useState} from 'react';
import {useNavigate,useParams} from 'react-router-dom';
import {Info,Plus} from 'lucide-react';
import * as api from '../services/badmintonApi';
import '../styles/MatchResultFlow.css';
function RecordResultPage(){
 const navigate=useNavigate();const {matchId}=useParams();const [match,setMatch]=useState(null),[allowed,setAllowed]=useState(false),[sets,setSets]=useState([{player1:'',player2:''}]),[error,setError]=useState(''),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false);
 useEffect(()=>{let live=true;(async()=>{try{const [m,id,participants]=await Promise.all([api.getMatch(matchId),api.getCurrentUserId(),api.getMatchParticipants(matchId)]);if(live){setMatch(m);setAllowed(participants.some(p=>p.playerId===id));}}catch(e){if(live)setError(e.message);}finally{if(live)setLoading(false);}})();return()=>{live=false;};},[matchId]);
 const update=(idx,key,val)=>setSets(old=>old.map((s,i)=>i===idx?{...s,[key]:val}:s));
 const submit=async()=>{setError('');if(!allowed||!match)return setError('Only match participants can submit results.');
  if(sets.some(s=>s.player1===''||s.player2===''||Number(s.player1)<0||Number(s.player2)<0))return setError('Enter both scores for each set.');
  setSaving(true);try{const score=sets.map(s=>`${s.player1}-${s.player2}`).join(', ');const result=await api.submitResult(matchId,score);
    navigate(`/matches/${matchId}/result-submitted`,{state:{match,result}});
  }catch(e){setError(e.message||'Result submission failed.');}finally{setSaving(false);}};
 return <div className="match-flow-page"><header className="match-flow-header"><button type="button" onClick={()=>navigate(`/matches/${matchId}`)}>←</button><h1>Record Result</h1></header>
 {loading&&<p>Loading match...</p>}{error&&<p role="alert">{error}</p>}
 {match&&<><main className="match-flow-content"><section className="match-flow-card"><h3 className="result-section-title">SCORES</h3><p>{match.format||'Badminton'} · {match.suburb||'Area not specified'}</p>
 <p>Enter scores as they were recorded. The backend accepts a score string; it does not accept a separate winner ID from this form.</p>
 <div className="score-list">{sets.map((s,i)=><div className="score-row" key={i}><span>Set {i+1}</span><input aria-label={`Set ${i+1} player 1`} type="number" min="0" max="30" value={s.player1} onChange={e=>update(i,'player1',e.target.value)}/><strong>–</strong><input aria-label={`Set ${i+1} player 2`} type="number" min="0" max="30" value={s.player2} onChange={e=>update(i,'player2',e.target.value)}/></div>)}</div>
 <button className="add-set-button" type="button" onClick={()=>setSets(old=>[...old,{player1:'',player2:''}])}><Plus size={15}/> Add Set</button></section>
 <div className="result-info-message"><Info size={18}/><p>Ratings only update after results have been confirmed according to the backend workflow.</p></div></main>
 <div className="match-flow-bottom-action"><button className="match-flow-primary" type="button" disabled={saving||!allowed} onClick={submit}>{saving?'Submitting...':'Submit Result'}</button></div></>}
 </div>;
}
export default RecordResultPage;
