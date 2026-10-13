import {useEffect,useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {UserRound,Gamepad2,ClipboardList,Star,Lock,Bell,Ban,Flag,ShieldCheck,ChevronRight} from 'lucide-react';
import * as api from '../services/badmintonApi';
import {signOut} from '../services/authService';
import '../styles/ProfilePage.css';
function ProfilePage(){
 const navigate=useNavigate();const [id,setId]=useState(null),[user,setUser]=useState(null),[profile,setProfile]=useState(null),[ranks,setRanks]=useState([]);
 const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[editing,setEditing]=useState(false);
 const [onboard,setOnboard]=useState({name:'',dateOfBirth:'',state:'VIC',selfRatingBand:'Beginner'});
 const [draft,setDraft]=useState({displayName:'',selfRatingBand:'Beginner',suburb:'',bio:'',isDiscoverable:true});
 const fetchProfile=async()=>{const uid=await api.getCurrentUserId();setId(uid);if(!uid)return;const [p,pr,r]=await Promise.all([api.getPlayer(uid),api.getPlayerProfile(uid),api.getRanking(uid)]);setUser(p);setProfile(pr);setRanks(r);if(p)setDraft({displayName:p.displayName||'',selfRatingBand:p.selfRatingBand||'Beginner',suburb:pr?.suburb||'',bio:pr?.bio||'',isDiscoverable:pr?.isDiscoverable??true});};
 useEffect(()=>{let live=true;(async()=>{try{await fetchProfile();}catch(e){if(live)setError(e.message);}finally{if(live)setLoading(false);}})();return()=>{live=false;};},[]);
 const save=async e=>{e.preventDefault();setSaving(true);setError('');try{await api.updatePlayer(id,{displayName:draft.displayName.trim(),selfRatingBand:draft.selfRatingBand});await api.updateProfile(id,{suburb:draft.suburb.trim(),bio:draft.bio.trim(),isDiscoverable:draft.isDiscoverable});await fetchProfile();setEditing(false);setMessage('Profile updated.');}catch(e){setError(e.message);}finally{setSaving(false);}};
 const register=async e=>{e.preventDefault();setSaving(true);setError('');try{await api.registerPlayer(onboard.name.trim(),onboard.selfRatingBand,onboard.dateOfBirth,onboard.state);await fetchProfile();setMessage('Player profile created.');}catch(e){setError(e.message);}finally{setSaving(false);}};
 const logout=async()=>{setError('');try{await signOut();navigate('/login',{replace:true});}catch(e){setError(e.message);}};
 const score=ranks.find(r=>r.format==='singles')||ranks[0];
 return <div className="profile-page"><header className="profile-page-header"><h1>Profile</h1></header>
 {error&&<p role="alert" className="profile-error">{error}</p>}{message&&<p role="status">{message}</p>}{loading&&<p>Loading profile...</p>}
 {!loading&&!user&&<form onSubmit={register} className="profile-menu-card"><h2>Complete player registration</h2><p>The documented register_player operation requires these details before the app can create your player record.</p>
 <label>Display name<input required value={onboard.name} onChange={e=>setOnboard(p=>({...p,name:e.target.value}))}/></label>
 <label>Date of birth<input type="date" required value={onboard.dateOfBirth} onChange={e=>setOnboard(p=>({...p,dateOfBirth:e.target.value}))}/></label>
 <label>Skill level<select value={onboard.selfRatingBand} onChange={e=>setOnboard(p=>({...p,selfRatingBand:e.target.value}))}>{['Beginner','Intermediate','Advanced'].map(v=><option key={v}>{v}</option>)}</select></label>
 <label>Playing state<select value={onboard.state} onChange={e=>setOnboard(p=>({...p,state:e.target.value}))}>{['VIC','NSW','QLD','SA','WA','TAS','ACT','NT'].map(v=><option key={v}>{v}</option>)}</select></label>
 <button type="submit" disabled={saving}>{saving?'Registering...':'Complete Registration'}</button></form>}
 {user&&<><section className="profile-summary"><div className="profile-summary-main"><div className="profile-photo"><span>{user.displayName?.split(' ').map(n=>n[0]).slice(0,2).join('').toUpperCase()||'P'}</span></div><div className="profile-summary-info"><h2>{user.displayName||'Player'}</h2><div className="profile-tags"><span className="profile-level">{user.selfRatingBand||'Unrated'}</span><span className="profile-reliability">{profile?.reliabilityScore==null?'Reliability unavailable':`${Math.round(profile.reliabilityScore*100)}% reliable`}</span></div><p>{[profile?.suburb,profile?.state].filter(Boolean).join(', ')||'Location not provided'}</p></div></div>
 <div className="profile-summary-divider"/><div className="profile-stats"><div><strong>{score?.rankingPoints??'–'}</strong><span>{score?.format||'Current'} Rating</span></div><div><strong>{score?.verifiedGamesCount??'–'}</strong><span>Verified Games</span></div><div><strong>{profile?.gamesPlayed??'–'}</strong><span>Games Played</span></div></div></section>
 <main className="profile-content"><section><h3 className="profile-section-label">ACCOUNT</h3><div className="profile-menu-card">
 <button className="profile-menu-row" type="button" onClick={()=>setEditing(v=>!v)}><UserRound size={18}/><div className="profile-menu-text"><strong>Edit Profile</strong><span>Name, level, suburb, bio and visibility</span></div><ChevronRight size={17}/></button>
 <button className="profile-menu-row" type="button" onClick={()=>navigate('/rankings')}><Star size={18}/><div className="profile-menu-text"><strong>Rankings</strong><span>Browse ratings by format</span></div></button>
 <button className="profile-menu-row" type="button" onClick={()=>navigate('/notifications')}><Bell size={18}/><div className="profile-menu-text"><strong>Notifications</strong><span>View received alerts</span></div></button>
 </div></section>{editing&&<form className="profile-menu-card" onSubmit={save}><label>Display name<input required value={draft.displayName} onChange={e=>setDraft(p=>({...p,displayName:e.target.value}))}/></label><label>Playing level<select value={draft.selfRatingBand} onChange={e=>setDraft(p=>({...p,selfRatingBand:e.target.value}))}>{['Beginner','Intermediate','Advanced'].map(v=><option key={v}>{v}</option>)}</select></label><label>Suburb<input value={draft.suburb} onChange={e=>setDraft(p=>({...p,suburb:e.target.value}))}/></label><label>Bio<textarea value={draft.bio} onChange={e=>setDraft(p=>({...p,bio:e.target.value}))}/></label><label><input type="checkbox" checked={draft.isDiscoverable} onChange={e=>setDraft(p=>({...p,isDiscoverable:e.target.checked}))}/> Discoverable profile</label><button type="submit" disabled={saving}>{saving?'Saving...':'Save Changes'}</button></form>}
 <div className="profile-privacy-message"><ShieldCheck size={18}/><p>Your profile visibility is controlled by server policies and your discoverability setting.</p></div><button className="profile-signout-button" type="button" onClick={logout}>Sign Out</button></main></>}
 </div>;
}
export default ProfilePage;
