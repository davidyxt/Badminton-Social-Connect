import {useLocation,useNavigate,useParams} from 'react-router-dom';
import {Clock3} from 'lucide-react';
import '../styles/MatchResultFlow.css';
function ResultSubmittedPage(){const navigate=useNavigate(),location=useLocation(),{matchId}=useParams();const result=location.state?.result;
 return <div className="match-flow-page"><header className="match-flow-header"><button type="button" onClick={()=>navigate(`/matches/${matchId}`)}>←</button><h1>Result Submitted</h1></header><main className="result-submitted-content"><div className="waiting-icon"><Clock3 size={32}/></div>
 <h2>{result?'Waiting for confirmation':'Match result'}</h2><p className="waiting-description">{result?'Your result was submitted to the backend. Another eligible participant can confirm it.':'Open Match Details to view the current result status.'}</p>
 {result&&<section className="match-flow-card submitted-score-card"><h3>SUBMITTED SCORE</h3><p>{result.score||'No score provided'}</p><p>Status: {result.status||'Submitted'}</p></section>}
 <button type="button" className="match-flow-primary" onClick={()=>navigate(`/matches/${matchId}`)}>View Match Details</button></main></div>;
}
export default ResultSubmittedPage;
