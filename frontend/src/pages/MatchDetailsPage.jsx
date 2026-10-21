import {useEffect,useState} from 'react';
import {useNavigate,useParams} from 'react-router-dom';
import {ArrowLeft,CalendarDays,CheckCircle2,Crown,MapPin,TriangleAlert} from 'lucide-react';
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
 const rawStatus=String(latest?.verificationStatus||latest?.status||'No result').replaceAll('_',' ');
 const status=rawStatus.charAt(0).toUpperCase()+rawStatus.slice(1);
 // Set scores come as [[21,17],...] or as a "21-17 18-21" string, side A's points first.
 const sets=(Array.isArray(latest?.games)&&latest.games.length?latest.games:String(latest?.score||'').split(/\s+/).filter(Boolean).map(s=>s.split('-').map(Number))).filter(g=>g.length===2);
 const setsWon=side=>sets.filter(([x,y])=>side==='a'?x>y:y>x).length;
 const nameOf=side=>(side==='a'?a:b).map(p=>p.name).join(' & ')||'Unknown';
 const firstName=side=>((side==='a'?a:b)[0]?.name||'').split(' ')[0];
 const initialsOf=name=>String(name||'?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
 const playedAt=match?.playedAt?new Date(match.playedAt).toLocaleString('en-AU',{weekday:'short',day:'numeric',month:'short',hour:'numeric',minute:'2-digit'}):'Date TBC';
 const sideBlock=side=>{const players=side==='a'?a:b;const won=latest?.winningSide===side;
  return <div className={`match-side ${won?'winner':''}`}>
   <div className="match-side-avatars">{players.map(p=><div key={p.id} className="match-side-avatar">{p.initials||initialsOf(p.name)}</div>)}</div>
   <strong>{nameOf(side)}</strong>
   {latest&&<span className="match-side-tag">{won&&<Crown size={12}/>}{players.some(p=>p.isMe)?'You \u00b7 ':''}{won?'Winner':'Runner-up'}</span>}
  </div>;};
 return <div className="match-flow-page"><header className="match-flow-header"><button type="button" onClick={()=>navigate(-1)} aria-label="Back"><ArrowLeft size={20}/></button><h1>Match Details</h1></header>
  {error&&<p role="alert" style={{padding:14,color:'#a32727'}}>{error}</p>}{loading&&<p>Loading match...</p>}
  {match&&<main className="match-flow-content"><section className="match-flow-card match-hero-card">
   <div className="match-hero-top"><span className="match-format-chip">{match.format||'Badminton'} match</span><span className={`match-status-pill status-${status.toLowerCase().replaceAll(' ','-')}`}>{status}</span></div>
   <div className="match-versus">
    {sideBlock('a')}
    <div className="match-versus-score">{sets.length?<><strong>{setsWon('a')} - {setsWon('b')}</strong><span>SETS</span></>:<strong className="match-versus-vs">VS</strong>}</div>
    {sideBlock('b')}
   </div>
   {sets.length>0&&<div className="match-set-list">{sets.map(([x,y],i)=><div key={i} className="match-set"><span>SET {i+1}</span><strong><em className={x>y?'won':''}>{x}</em>-<em className={y>x?'won':''}>{y}</em></strong><small>{firstName(x>y?'a':'b')}</small></div>)}</div>}
   <div className="match-meta">
    <span><CalendarDays size={14}/>{playedAt}</span>
    <span><MapPin size={14}/>{match.location||'Location TBC'}</span>
   </div>
   {latest?.ratingChange&&<p className="match-rating-note">Rating {latest.ratingChange.before} {'\u2192'} {latest.ratingChange.after}</p>}
   {latest?.ratingPending&&<p className="match-rating-note">Rating will update after the nightly calculation.</p>}
  </section>
  {latest?.canConfirm&&<section className="match-flow-card match-confirm-card"><p>{latest.submittedBy?.name?`${latest.submittedBy.name} submitted this result.`:'A result was submitted.'} Check the score, then confirm or dispute it.</p>
   <div className="match-confirm-actions">
    <button type="button" className="match-confirm-button" disabled={busy} onClick={confirm}><CheckCircle2 size={18}/> Confirm Result</button>
    <button type="button" className="match-dispute-button" onClick={()=>setDisputing(v=>!v)}><TriangleAlert size={18}/> Dispute</button>
   </div>
   {disputing&&<form className="match-dispute-form" onSubmit={dispute}><label htmlFor="disputeReason">Dispute reason</label><textarea id="disputeReason" value={reason} onChange={e=>setReason(e.target.value)} required/><button type="submit" className="match-dispute-button" disabled={busy||!reason.trim()}>Submit Dispute</button></form>}
  </section>}
  {match.gameId&&<button type="button" className="match-flow-secondary" onClick={()=>navigate(`/games/${match.gameId}`)}>View Game</button>}
  </main>}
 </div>;
}
export default MatchDetailsPage;
