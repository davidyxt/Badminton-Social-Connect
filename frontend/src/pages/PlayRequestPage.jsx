import {useEffect,useState} from 'react';
import {useLocation,useNavigate,useParams} from 'react-router-dom';
import {ArrowLeft} from 'lucide-react';
import * as api from '../services/badmintonApi';
import '../styles/PlayRequestPage.css';

function PlayRequestPage(){
 const navigate=useNavigate(),location=useLocation();
 const {requestId}=useParams();
 const initialRequest=location.state?.request;
 // Supports a game ID from Notifications and the older postId:playerId links.
 const postId=initialRequest?.postId||initialRequest?.game?.postId||initialRequest?.game?.id||requestId?.split(':')[0];
 const [requests,setRequests]=useState([]);
 const [loading,setLoading]=useState(true),[error,setError]=useState(''),[saving,setSaving]=useState(null);

 useEffect(()=>{
  let live=true;
  (async()=>{
   setLoading(true);setError('');
   try{
    if(!postId)throw new Error('Missing game post ID.');
    const rows=await api.getJoinRequests(postId);
    if(live)setRequests(Array.isArray(rows)?rows:[]);
   }catch(e){if(live)setError(e.message||'Could not load game requests.');}
   finally{if(live)setLoading(false);}
  })();
  return()=>{live=false;};
 },[postId]);

 const act=async(request,accept)=>{
  const playerId=request?.requester?.id;
  if(!postId||!playerId){setError('Requester or game ID is missing.');return;}
  setSaving(request.id);setError('');
  try{
   if(accept)await api.acceptRequest(postId,playerId);
   else await api.declineRequest(postId,playerId);
   const latest=await api.getJoinRequests(postId);
   setRequests(Array.isArray(latest)?latest:[]);
  }catch(e){setError(e.message||'Could not respond to request.');}
  finally{setSaving(null);}
 };

 const ordered=[...requests].sort((a,b)=>{
  if(a.status==='pending'&&b.status!=='pending')return -1;
  if(a.status!=='pending'&&b.status==='pending')return 1;
  return new Date(b.requestedAt||0)-new Date(a.requestedAt||0);
 });
 const game=requests[0]?.game;
 const pending=ordered.filter(r=>r.status==='pending').length;

 return <div className="play-request-page">
  <header className="play-request-header">
   <button type="button" onClick={()=>navigate('/notifications')} aria-label="Back to notifications"><ArrowLeft size={20}/></button>
   <h1>Play Requests</h1>
  </header>
  {loading&&<p style={{padding:16}}>Loading requests...</p>}
  {error&&<p role="alert" style={{padding:'8px 16px',color:'#b42318'}}>{error}</p>}
  {!loading&&<main className="play-request-content">
   <section className="play-request-card">
    <h2 style={{margin:'0 0 8px',fontSize:18}}>{game?.title||'Game requests'}</h2>
    <p style={{margin:'0 0 8px',fontSize:12,color:'#73798a'}}>
     {game?.format||'Badminton'}{game?.date?` · ${game.date}`:''}{game?.time?` · ${game.time}`:''}
    </p>
    <div className="play-request-card-header">
     <strong>{pending} pending {pending===1?'request':'requests'}</strong>
     <button type="button" className="requester-secondary-button" onClick={()=>navigate(`/games/${postId}`)}>View Game</button>
    </div>
   </section>

   {ordered.length===0&&<section className="play-request-card">
    <h2>No game requests found</h2>
    <p>There are no accessible requests for this game, or the request was removed.</p>
   </section>}

   {ordered.map(request=>{
    const requester=request.requester||{};
    const isPending=request.status==='pending';
    return <section className="play-request-card" key={request.id||requester.id}>
     <div className="requester-main-row">
      <div className="requester-avatar">{requester.initials||'P'}</div>
      <div className="requester-info">
       <strong>{requester.name||'Player'}</strong>
       <div className="requester-rating">{requester.level||'Level unavailable'}
        {requester.rating!=null?` · ${requester.rating} rating`:''}</div>
       <span className="pending-pill">{request.status||'Unknown'}</span>
      </div>
     </div>
     {requester.message&&<div className="requester-message">{requester.message}</div>}
     {isPending&&<div className="requester-actions">
      <button type="button" className="decline-request-button" disabled={!!saving} onClick={()=>act(request,false)}>Decline</button>
      <button type="button" className="accept-request-button" disabled={!!saving} onClick={()=>act(request,true)}>
       {saving===request.id?'Saving...':'Accept'}
      </button>
     </div>}
    </section>;
   })}
  </main>}
 </div>;
}

export default PlayRequestPage;
