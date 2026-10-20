import {useEffect,useState} from 'react';
import {useNavigate,useParams} from 'react-router-dom';
import {Info,Plus} from 'lucide-react';
import * as api from '../services/badmintonApi';
import '../styles/MatchResultFlow.css';
// BL-021: submit_result creates a new match from a *game post* and accepted
// players. It is not a score update on an already-existing match ID.
function RecordResultPage(){
 const navigate=useNavigate(),{gameId,matchId}=useParams();
 const [game,setGame]=useState(null),[me,setMe]=useState(null),[opponents,setOpponents]=useState([]),[partner,setPartner]=useState('');
 const [sets,setSets]=useState([{a:'',b:''},{a:'',b:''}]),[error,setError]=useState(''),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false);
 useEffect(()=>{let live=true;(async()=>{try{
  const id=await api.getCurrentUserId();let postId=gameId;
  if(!postId&&matchId){const match=await api.getMatch(matchId);postId=match?.gameId;}
  if(!postId)throw new Error('This result form requires an original game post.');
  const card=await api.getGame(postId);
  if(!card?.canRecordResult)throw new Error('You cannot record a result for this game yet. It must have started, and you must be an accepted player.');
  if(live){setMe(id);setGame(card);}
 }catch(e){if(live)setError(e.message);}finally{if(live)setLoading(false);}})();return()=>{live=false;};},[gameId,matchId]);
 const players=(game?.players||[]).filter(p=>p.id!==me);
 const isDoubles=String(game?.format||'').toLowerCase().includes('doubles');
 const maxOpponents=isDoubles?2:1;
 const toggleOpponent=id=>setOpponents(list=>list.includes(id)?list.filter(x=>x!==id):list.length<maxOpponents?[...list,id]:list);
 const update=(index,field,value)=>setSets(old=>old.map((s,i)=>i===index?{...s,[field]:value}:s));
 const submit=async()=>{setError('');
  if(opponents.length!==maxOpponents)return setError(`Select ${maxOpponents} opponent${maxOpponents===1?'':'s'}.`);
  if(isDoubles&&(!partner||opponents.includes(partner)))return setError('Select a different accepted player as your partner.');
  if(sets.some(s=>s.a===''||s.b===''))return setError('Enter both scores for each game.');
  const games=sets.map(s=>[Number(s.a),Number(s.b)]);
  setSaving(true);try{const result=await api.submitResult(game.id,opponents,isDoubles?partner:null,games);
   if(!result?.matchId)throw new Error('Result was submitted but a match ID was not returned.');
   navigate(`/matches/${result.matchId}/result-submitted`,{state:{result:{...result,score:games.map(g=>g.join('-')).join(' ')}}});
  }catch(e){setError(e.message||'Result submission failed.');}finally{setSaving(false);}
 };
 return <div className="match-flow-page"><header className="match-flow-header"><button type="button" onClick={()=>navigate(game?.id?`/games/${game.id}`:'/dashboard')}>←</button><h1>Record Result</h1></header>
 {loading&&<p>Loading accepted players...</p>}{error&&<p role="alert" style={{padding:12,color:'#a32727'}}>{error}</p>}
 {game&&<main className="match-flow-content"><section className="match-flow-card"><h3>ACCEPTED PLAYERS</h3><p>{game.title} · {game.format}</p>
  {isDoubles&&<label>Partner<select value={partner} onChange={e=>{setPartner(e.target.value);setOpponents(old=>old.filter(x=>x!==e.target.value));}}><option value="">Choose partner</option>{players.filter(p=>!opponents.includes(p.id)).map(p=><option value={p.id} key={p.id}>{p.name}</option>)}</select></label>}
  <fieldset style={{border:0,padding:0}}><legend>Choose {maxOpponents} opponent{maxOpponents>1?'s':''}</legend>{players.filter(p=>p.id!==partner).map(p=><label key={p.id} style={{display:'block',marginTop:9}}><input type="checkbox" checked={opponents.includes(p.id)} onChange={()=>toggleOpponent(p.id)}/> {p.name}</label>)}</fieldset>
 </section><section className="match-flow-card"><h3 className="result-section-title">GAME SCORES</h3><p>Scores are from your side's point of view. Best of three, to 21 (win by two, cap at 30).</p>
  <div className="score-list">{sets.map((s,i)=><div className="score-row" key={i}><span>Game {i+1}</span><input aria-label={`Game ${i+1} your side`} type="number" min="0" max="30" value={s.a} onChange={e=>update(i,'a',e.target.value)}/><strong>–</strong><input aria-label={`Game ${i+1} opponents`} type="number" min="0" max="30" value={s.b} onChange={e=>update(i,'b',e.target.value)}/></div>)}</div>
  {sets.length===2&&<button className="add-set-button" type="button" onClick={()=>setSets(old=>[...old,{a:'',b:''}])}><Plus size={15}/> Add third game</button>}
  {sets.length===3&&<button className="add-set-button" type="button" onClick={()=>setSets(old=>old.slice(0,2))}>Remove third game</button>}
 </section><div className="result-info-message"><Info size={18}/><p>Your opponent must confirm the result before it is rated.</p></div>
 <button className="match-flow-primary" type="button" disabled={saving} onClick={submit}>{saving?'Submitting...':'Submit Result'}</button></main>}
 </div>;
}
export default RecordResultPage;
