import {useState} from 'react';
import {useLocation,useNavigate,useParams} from 'react-router-dom';
import {ArrowLeft,Check,X} from 'lucide-react';
import * as api from '../services/badmintonApi';
import '../styles/PlayRequestPage.css';
function PlayRequestPage(){const navigate=useNavigate();const location=useLocation();const {requestId}=useParams();const request=location.state?.request;
 const postId=request?.postId||request?.game?.postId;const playerId=request?.playerId||request?.requester?.id;
 const [status,setStatus]=useState(request?.status||'pending'),[error,setError]=useState(''),[saving,setSaving]=useState(false);
 const act=async accept=>{if(!postId||!playerId){setError('This request needs a genuine game post and requester ID.');return;}setSaving(true);setError('');try{await (accept?api.acceptRequest(postId,playerId):api.declineRequest(postId,playerId));setStatus(accept?'accepted':'declined');}catch(e){setError(e.message);}finally{setSaving(false);}};
 return <div className="play-request-page"><header className="play-request-header"><button type="button" onClick={()=>navigate(-1)} aria-label="Back"><ArrowLeft size={20}/></button><h1>Play Request</h1></header>
 {error&&<p role="alert">{error}</p>}
 {!postId||!playerId?<main className="play-request-content"><section className="play-request-card"><h2>Request details unavailable</h2><p>The API does not define a request table or a lookup by request ID. Request #{requestId} cannot be loaded using this URL alone.</p><p>A request event must provide a real postId and requester playerId before it can be accepted or declined.</p><button type="button" onClick={()=>navigate('/notifications')}>Back to Notifications</button></section></main>:
 <main className="play-request-content"><section className="play-request-card"><h2>Join request</h2><p>Requester: {request?.requester?.name||playerId}</p><p>Game: {request?.game?.title||postId}</p><p>Status: {status}</p></section>{status==='pending'&&<div className="play-request-bottom-actions"><button type="button" disabled={saving} className="decline-button" onClick={()=>act(false)}><X size={18}/> Decline</button><button type="button" disabled={saving} className="accept-button" onClick={()=>act(true)}><Check size={18}/> Accept</button></div>}</main>}
 </div>;
}
export default PlayRequestPage;
