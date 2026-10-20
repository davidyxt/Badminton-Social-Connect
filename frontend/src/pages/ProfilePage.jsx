import {useEffect,useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {UserRound,Star,Bell,ShieldCheck,ChevronRight} from 'lucide-react';
import * as api from '../services/badmintonApi';
import {signOut,completePlayerRegistration} from '../services/authService';
import '../styles/ProfilePage.css';
const levels=['beginner','lower_intermediate','intermediate','upper_intermediate','advanced'];
const label=value=>String(value||'Unrated').replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
function ProfilePage(){
 const navigate=useNavigate();
 const [user,setUser]=useState(null),[rating,setRating]=useState(null),[registered,setRegistered]=useState(false);
 const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[editing,setEditing]=useState(false);
 const [onboard,setOnboard]=useState({username:'',dateOfBirth:'',state:'VIC',ageDeclared:false,termsAccepted:false});
 const [draft,setDraft]=useState({username:'',firstName:'',lastName:'',selfRatingBand:'beginner',suburb:'',bio:'',isDiscoverable:true});
 const load=async()=>{
  const [profile,registration,score]=await Promise.allSettled([api.getMyProfile(),completePlayerRegistration(),api.getRatingSummary()]);
  if(profile.status==='rejected')throw profile.reason;
  const p=profile.value;setUser(p);setRegistered(registration.status==='fulfilled'&&registration.value);
  if(score.status==='fulfilled')setRating(score.value);
  if(p)setDraft({username:p.username||'',firstName:p.firstName||'',lastName:p.lastName||'',selfRatingBand:p.selfRatingBand||'beginner',suburb:p.suburb||'',bio:p.bio||'',isDiscoverable:p.isDiscoverable??true});
 };
 useEffect(()=>{let live=true;(async()=>{try{await load();}catch(e){if(live)setError(e.message);}finally{if(live)setLoading(false);}})();return()=>{live=false;};},[]);
 const save=async e=>{e.preventDefault();setSaving(true);setError('');try{await api.updateMyProfile({...draft,username:draft.username.trim(),firstName:draft.firstName.trim(),lastName:draft.lastName.trim(),suburb:draft.suburb.trim(),bio:draft.bio.trim()});await load();setEditing(false);setMessage('Profile updated.');}catch(e){setError(e.message);}finally{setSaving(false);}};
 const register=async e=>{e.preventDefault();setSaving(true);setError('');try{
  if(!onboard.ageDeclared||!onboard.termsAccepted)throw new Error('You must explicitly confirm your age and accept the terms and privacy notice.');
  const termsVersion=import.meta.env.VITE_TERMS_VERSION||(import.meta.env.DEV?'local-dev-v1':'');
  const privacyVersion=import.meta.env.VITE_PRIVACY_VERSION||(import.meta.env.DEV?'local-dev-v1':'');
  if(!termsVersion||!privacyVersion)throw new Error('Configure VITE_TERMS_VERSION and VITE_PRIVACY_VERSION before production registration.');
  await api.registerPlayer({...onboard,termsVersion,privacyVersion,username:onboard.username.trim()||user?.username||null});
  await load();setMessage('Player registration completed.');
 }catch(e){setError(e.message);}finally{setSaving(false);}};
 const logout=async()=>{setError('');try{await signOut();navigate('/login',{replace:true});}catch(e){setError(e.message);}};
 const band=label(user?.selfRatingBand),firstName=user?.firstName||user?.username||'Player';
 return <div className="profile-page"><header className="profile-page-header"><h1>Profile</h1></header>
  {error&&<p role="alert" className="profile-error">{error}</p>}{message&&<p role="status">{message}</p>}{loading&&<p>Loading profile...</p>}
  {!loading&&!registered&&<form onSubmit={register} className="profile-menu-card"><h2>Complete player registration</h2><p>Confirm your age and consent before accessing player features.</p>
   {!user?.username&&<label>Public username<input required pattern="[A-Za-z0-9_.]{3,20}" value={onboard.username} onChange={e=>setOnboard(p=>({...p,username:e.target.value}))}/></label>}
   <label>Date of birth<input type="date" required value={onboard.dateOfBirth} onChange={e=>setOnboard(p=>({...p,dateOfBirth:e.target.value}))}/></label>
   <label>Playing state<select value={onboard.state} onChange={e=>setOnboard(p=>({...p,state:e.target.value}))}>{['VIC','NSW','QLD','SA','WA','TAS','ACT','NT'].map(v=><option key={v}>{v}</option>)}</select></label>
   <label><input type="checkbox" required checked={onboard.ageDeclared} onChange={e=>setOnboard(p=>({...p,ageDeclared:e.target.checked}))}/> I confirm I am 18 or over.</label>
   <label><input type="checkbox" required checked={onboard.termsAccepted} onChange={e=>setOnboard(p=>({...p,termsAccepted:e.target.checked}))}/> I have read and accept the platform's terms and privacy notice.</label>
   <button type="submit" disabled={saving}>{saving?'Registering...':'Complete Registration'}</button>
  </form>}
  {user&&<><section className="profile-summary"><div className="profile-summary-main"><div className="profile-photo"><span>{firstName.slice(0,2).toUpperCase()}</span></div><div className="profile-summary-info"><h2>{user.name||firstName}</h2><div className="profile-tags"><span className="profile-level">{band}</span><span className="profile-reliability">{user.reliability==null?'Reliability unavailable':`${user.reliability}% reliable`}</span></div><p>{user.location||'Location not provided'}</p></div></div>
   <div className="profile-summary-divider"/><div className="profile-stats"><div><strong>{rating?.rating??'–'}</strong><span>Singles Rating</span></div><div><strong>{rating?.placement?.played??'–'}</strong><span>Trusted Matches</span></div><div><strong>{user.gamesPlayed??'–'}</strong><span>Games Played</span></div></div></section>
   <main className="profile-content"><section><h3 className="profile-section-label">ACCOUNT</h3><div className="profile-menu-card">
    <button type="button" className="profile-menu-row" onClick={()=>setEditing(v=>!v)}><UserRound size={18}/><div className="profile-menu-text"><strong>Edit Profile</strong><span>Username, level, suburb, bio and visibility</span></div><ChevronRight size={17}/></button>
    <button type="button" className="profile-menu-row" onClick={()=>navigate('/rankings')}><Star size={18}/><div className="profile-menu-text"><strong>Rankings</strong><span>Browse singles ratings</span></div></button>
    <button type="button" className="profile-menu-row" onClick={()=>navigate('/notifications')}><Bell size={18}/><div className="profile-menu-text"><strong>Notifications</strong><span>View received alerts</span></div></button>
   </div></section>
   {editing&&<form className="profile-menu-card" onSubmit={save}>
    <label>Username<input required value={draft.username} onChange={e=>setDraft(p=>({...p,username:e.target.value}))}/></label>
    <label>First name<input required value={draft.firstName} onChange={e=>setDraft(p=>({...p,firstName:e.target.value}))}/></label>
    <label>Last name<input value={draft.lastName} onChange={e=>setDraft(p=>({...p,lastName:e.target.value}))}/></label>
    <label>Playing level<select value={draft.selfRatingBand} onChange={e=>setDraft(p=>({...p,selfRatingBand:e.target.value}))}>{levels.map(v=><option value={v} key={v}>{label(v)}</option>)}</select></label>
    <label>Suburb<input value={draft.suburb} onChange={e=>setDraft(p=>({...p,suburb:e.target.value}))}/></label>
    <label>Bio<textarea value={draft.bio} onChange={e=>setDraft(p=>({...p,bio:e.target.value}))}/></label>
    <label><input type="checkbox" checked={draft.isDiscoverable} onChange={e=>setDraft(p=>({...p,isDiscoverable:e.target.checked}))}/> Discoverable profile</label>
    <button type="submit" disabled={saving}>{saving?'Saving...':'Save Changes'}</button>
   </form>}
   <div className="profile-privacy-message"><ShieldCheck size={18}/><p>Visibility is enforced by the backend.</p></div><button className="profile-signout-button" type="button" onClick={logout}>Sign Out</button>
   </main></>}
 </div>;
}
export default ProfilePage;
