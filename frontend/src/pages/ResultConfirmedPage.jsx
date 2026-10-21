import {useEffect,useState} from 'react';
import {useLocation,useNavigate,useParams} from 'react-router-dom';
import {CheckCircle2,Trophy} from 'lucide-react';
import * as api from '../services/badmintonApi';
import '../styles/MatchResultFlow.css';

const initialsOf=name=>String(name||'?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
// Set scores come as [[21,17],...] or as a "21-17 18-21" string.
const setsOf=result=>Array.isArray(result?.games)&&result.games.length?result.games.map(g=>g.join('-')):String(result?.score||'').split(/\s+/).filter(Boolean);

function ResultConfirmedPage(){const navigate=useNavigate(),location=useLocation(),{matchId}=useParams();const [result,setResult]=useState(location.state?.result||null),[match,setMatch]=useState(null),[error,setError]=useState('');
 useEffect(()=>{if(result)return;let active=true;api.getMatchResults(matchId).then(rows=>{if(active)setResult(rows.find(r=>r.status==='confirmed')||rows[rows.length-1]||null);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[matchId]);
 useEffect(()=>{let active=true;api.getMatch(matchId).then(m=>{if(active)setMatch(m);}).catch(()=>{});return()=>{active=false;};},[matchId]);
 const confirmed=result?.status==='confirmed';
 const sideName=side=>(match?.sides?.[side]||[]).map(p=>p.name).join(' & ');
 const sides=['a','b'].filter(side=>sideName(side));
 const sets=setsOf(result);
 return <div className="result-confirmed-page"><main className="result-confirmed-content"><div className="result-medal"><Trophy size={42}/></div><span className="result-confirmed-label">MATCH RESULT</span><h1>{confirmed?'RESULT CONFIRMED':'RESULT STATUS'}</h1>
 {error&&<p role="alert">{error}</p>}
 {result?<section className="recorded-result-card">
  <div className="recorded-result-top"><h2>RECORDED RESULT</h2><span className={`recorded-result-status ${confirmed?'':'pending'}`}>{confirmed&&<CheckCircle2 size={13}/>}{result.status?result.status.charAt(0).toUpperCase()+result.status.slice(1):'Unknown'}</span></div>
  {sides.length===2&&<div className="recorded-result-players">
   {sides.map((side,i)=>[
    i===1&&<span key="vs" className="recorded-result-vs">VS</span>,
    <div key={side} className={`recorded-result-player ${result.winningSide===side?'winner':''}`}><div className="recorded-result-avatar">{initialsOf(sideName(side))}</div><strong>{sideName(side)}</strong><span>{result.winningSide===side?'Winner':'Runner-up'}</span></div>,
   ])}
  </div>}
  {sets.length>0&&<div className="recorded-result-sets">{sets.map((s,i)=><div className="recorded-result-set" key={i}><span>SET {i+1}</span><strong>{s}</strong></div>)}</div>}
 </section>:<p>View the match to check its current result.</p>}
 <button type="button" className="confirmed-ranking-button" onClick={()=>navigate('/rankings')}>View Rankings</button><button type="button" className="confirmed-find-button" onClick={()=>navigate(`/matches/${matchId}`)}>View Match</button></main></div>;
}
export default ResultConfirmedPage;
