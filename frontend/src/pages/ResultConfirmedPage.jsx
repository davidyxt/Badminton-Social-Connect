import {useEffect,useState} from 'react';
import {useLocation,useNavigate,useParams} from 'react-router-dom';
import {Trophy} from 'lucide-react';
import * as api from '../services/badmintonApi';
import '../styles/MatchResultFlow.css';
function ResultConfirmedPage(){const navigate=useNavigate(),location=useLocation(),{matchId}=useParams();const [result,setResult]=useState(location.state?.result||null),[error,setError]=useState('');
 useEffect(()=>{if(result)return;let active=true;api.getMatchResults(matchId).then(rows=>{if(active)setResult(rows.find(r=>r.status==='confirmed')||rows[rows.length-1]||null);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[matchId]);
 return <div className="result-confirmed-page"><main className="result-confirmed-content"><div className="result-medal"><Trophy size={42}/></div><span className="result-confirmed-label">MATCH RESULT</span><h1>{result?.status==='confirmed'?'RESULT CONFIRMED':'RESULT STATUS'}</h1>
 {error&&<p role="alert">{error}</p>}{result?<section className="rating-update-card"><h2>Recorded result</h2><p>Score: {result.score||'Not provided'}</p><p>Status: {result.status||'Unknown'}</p></section>:<p>View the match to check its current result.</p>}
 <button type="button" className="confirmed-ranking-button" onClick={()=>navigate('/rankings')}>View Rankings</button><button type="button" className="confirmed-find-button" onClick={()=>navigate(`/matches/${matchId}`)}>View Match</button></main></div>;
}
export default ResultConfirmedPage;
