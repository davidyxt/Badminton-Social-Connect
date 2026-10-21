import {useEffect,useState} from 'react';
import {useLocation,useNavigate,useParams} from 'react-router-dom';
import {ArrowLeft,Clock3} from 'lucide-react';
import * as api from '../services/badmintonApi';
import '../styles/MatchResultFlow.css';
// Set scores come as [[21,17],...] or as a "21-17 18-21" string.
const setsOf=result=>Array.isArray(result?.games)&&result.games.length?result.games.map(g=>g.join('-')):String(result?.score||'').split(/\s+/).filter(Boolean);
function ResultSubmittedPage(){const navigate=useNavigate(),location=useLocation(),{matchId}=useParams();const result=location.state?.result;const [match,setMatch]=useState(null);
 useEffect(()=>{let active=true;api.getMatch(matchId).then(m=>{if(active)setMatch(m);}).catch(()=>{});return()=>{active=false;};},[matchId]);
 const mySide=match?.mySide||'a';
 const opponents=(match?.sides?.[mySide==='a'?'b':'a']||[]).map(p=>p.name).join(' & ');
 const sets=setsOf(result);
 return <div className="match-flow-page"><header className="match-flow-header"><button type="button" onClick={()=>navigate(`/matches/${matchId}`)} aria-label="Back"><ArrowLeft size={20}/></button><h1>Result Submitted</h1></header><main className="result-submitted-content"><div className="waiting-icon"><Clock3 size={32}/></div>
 <h2>{result?'Waiting for confirmation':'Match result'}</h2><p className="waiting-description">{result?`${opponents||'Your opponent'} will be asked to confirm the score. Ratings update once it's confirmed.`:'Open Match Details to view the current result status.'}</p>
 {result&&<section className="recorded-result-card">
  <div className="recorded-result-top"><h2>SUBMITTED SCORE</h2><span className="recorded-result-status pending">Awaiting confirmation</span></div>
  {sets.length>0&&<div className="recorded-result-sets">{sets.map((s,i)=><div className="recorded-result-set" key={i}><span>SET {i+1}</span><strong>{s}</strong></div>)}</div>}
 </section>}
 <button type="button" className="match-flow-primary submitted-details-button" onClick={()=>navigate(`/matches/${matchId}`)}>View Match Details</button></main></div>;
}
export default ResultSubmittedPage;
