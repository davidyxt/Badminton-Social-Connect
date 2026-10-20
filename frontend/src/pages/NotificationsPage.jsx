import {useEffect,useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {CheckCircle2,ClipboardList,Trophy,AlarmClock,XCircle,CircleDot,BarChart3,BellOff} from 'lucide-react';
import * as api from '../services/badmintonApi';
import '../styles/NotificationsPage.css';

function getNotificationIcon(type){
 if(['join_request','request_accepted','match_invite','invite_accepted'].includes(type))return CheckCircle2;
 if(['result_submitted','result_confirmed','result_expired'].includes(type))return ClipboardList;
 if(type==='league_update')return Trophy;
 if(type==='match_reminder')return AlarmClock;
 if(['request_declined','request_withdrawn','invite_declined','game_cancelled','game_removed'].includes(type))return XCircle;
 if(type==='rating')return BarChart3;
 return CircleDot;
}

function notificationPath(n){
 // The organiser reviews all requests attached to this game post.
 if(['join_request','request_withdrawn','invite_declined','invite_accepted'].includes(n.type)&&n.postId)
  return `/play-requests/${n.postId}`;
 if(['result_submitted','result_confirmed','result_expired','dispute_update','match_reminder'].includes(n.type)&&n.matchId)
  return `/matches/${n.matchId}`;
 if(n.type==='request_accepted'&&n.matchId)return `/matches/${n.matchId}`;
 if(n.postId)return `/games/${n.postId}`;
 if(n.matchId)return `/matches/${n.matchId}`;
 return null;
}

function NotificationsPage(){
 const navigate=useNavigate();
 const [notifications,setNotifications]=useState([]);
 const [loadError,setLoadError]=useState('');
 const [userId,setUserId]=useState(null);

 useEffect(()=>{
  let live=true;
  (async()=>{
   try{
    const id=await api.getCurrentUserId();
    if(!live)return;
    if(!id)throw new Error('Please log in to view notifications.');
    setUserId(id);
    const rows=await api.getNotifications(id);
    if(!live)return;
    setNotifications(rows.map(n=>({
     id:n.id||n.notificationId,
     type:n.type,
     title:n.title||'Notification',
     message:n.message||'',
     time:n.createdAt?new Date(n.createdAt).toLocaleString('en-AU'):'',
     createdAt:n.createdAt,
     unread:!!n.unread,
     postId:n.postId,
     matchId:n.matchId
    })).sort((a,b)=>new Date(b.createdAt||0)-new Date(a.createdAt||0))); 
   }catch(e){if(live)setLoadError(e.message||'Could not load notifications.');}
  })();
  return()=>{live=false;};
 },[]);

 const handleNotificationClick=async notification=>{
  const path=notificationPath(notification);
  if(notification.unread){
   try{
    await api.markNotificationRead(notification.id);
    setNotifications(previous=>previous.map(item=>item.id===notification.id?{...item,unread:false}:item));
   }catch(e){setLoadError(e.message||'Could not mark notification as read.');}
  }
  if(path)navigate(path);
  else setLoadError('This notification has no linked game or match.');
 };

 const markAllRead=async()=>{
  if(!userId)return;
  try{
   await api.markNotificationsRead(userId);
   setNotifications(previous=>previous.map(item=>({...item,unread:false})));
  }catch(e){setLoadError(e.message||'Could not mark notifications as read.');}
 };

 const hasUnread=notifications.some(n=>n.unread);

 return <div className="notifications-page">
  {loadError&&<p role="alert" style={{padding:'10px 18px',color:'#b42318'}}>{loadError}</p>}
  <header className="notifications-header">
   <h1>Notifications</h1>
   {notifications.length>0&&<button type="button" className="mark-all-read-button" onClick={markAllRead} disabled={!hasUnread}>Mark all read</button>}
  </header>

  {notifications.length>0?<div className="notifications-list">
   {notifications.map(notification=>{
    const Icon=getNotificationIcon(notification.type);
    return <button type="button" key={notification.id}
     className={`notification-row ${notification.unread?'unread':''}`}
     onClick={()=>handleNotificationClick(notification)}>
     <div className={`notification-icon notification-${notification.type}`}><Icon size={21} strokeWidth={2}/></div>
     <div className="notification-content">
      <strong>{notification.title}</strong>
      {notification.message&&<p>{notification.message}</p>}
      {notification.time&&<span>{notification.time}</span>}
     </div>
     {notification.unread&&<span className="notification-unread-dot"/>}
    </button>;
   })}
  </div>:<div className="notifications-empty">
   <div className="notifications-empty-icon"><BellOff size={31} strokeWidth={1.8}/></div>
   <h2>No notifications</h2>
   <p>You're all caught up. Game requests, league updates and match activity will appear here.</p>
  </div>}
 </div>;
}

export default NotificationsPage;
