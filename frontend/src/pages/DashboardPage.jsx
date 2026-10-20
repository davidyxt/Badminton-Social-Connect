import {useEffect,useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {Search,Plus,Trophy,MapPin,CalendarDays,ChevronRight} from 'lucide-react';
import * as api from '../services/badmintonApi';
import '../styles/DashboardPage.css';

const label=value=>value?String(value).replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase()):'Unrated';
const dateText=value=>{
 if(!value)return 'Date TBC';
 const date=new Date(value);
 return Number.isNaN(date.getTime())?'Date TBC':date.toLocaleDateString('en-AU',{weekday:'long',day:'numeric',month:'short',timeZone:'Australia/Melbourne'});
};
const timeText=value=>{
 if(!value)return 'Time TBC';
 const date=new Date(value);
 return Number.isNaN(date.getTime())?'Time TBC':date.toLocaleTimeString('en-AU',{hour:'numeric',minute:'2-digit',timeZone:'Australia/Melbourne'});
};
const ago=value=>{
 if(!value)return '';
 const minutes=Math.floor((Date.now()-new Date(value).getTime())/60000);
 if(!Number.isFinite(minutes))return '';
 if(minutes<60)return minutes<1?'Just now':`${minutes}m ago`;
 if(minutes<1440)return `${Math.floor(minutes/60)}h ago`;
 return `${Math.floor(minutes/1440)}d ago`;
};

function DashboardPage(){
 const navigate=useNavigate();
 const [home,setHome]=useState(null),[summary,setSummary]=useState(null);
 const [leagues,setLeagues]=useState([]),[notifications,setNotifications]=useState([]);
 const [loading,setLoading]=useState(true),[error,setError]=useState('');

 useEffect(()=>{
  let active=true;
  (async()=>{
   try{
    const id=await api.getCurrentUserId();
    if(!id)throw new Error('Please log in to see your dashboard.');
    const results=await Promise.allSettled([
     api.getMyHome(),
     api.getRatingSummary(),
     api.listLeagues(),
     api.getMyStandings(id),
     api.getNotifications(id)
    ]);
    if(!active)return;
    const value=(index,fallback)=>results[index].status==='fulfilled'?results[index].value??fallback:fallback;
    const allLeagues=value(2,[]),memberships=value(3,[]);
    const mine=allLeagues.filter(l=>l.organiserId===id||memberships.some(m=>m.leagueId===l.leagueId))
     .map(l=>({...l,standing:memberships.find(m=>m.leagueId===l.leagueId)}))
     .sort((a,b)=>(a.status==='active'?0:1)-(b.status==='active'?0:1));
    setHome(value(0,null));
    setSummary(value(1,null));
    setLeagues(mine);
    setNotifications(value(4,[]).sort((a,b)=>new Date(b.createdAt||0)-new Date(a.createdAt||0)).slice(0,3));
    if(!value(0,null))setError('Home information is unavailable. Check that get_my_home is installed in Supabase.');
   }catch(e){if(active)setError(e.message||'Unable to load dashboard.');}
   finally{if(active)setLoading(false);}
  })();
  return()=>{active=false;};
 },[]);

 const card=home?.ratingCard||{};
 const upcoming=Array.isArray(home?.nextGames)?home.nextGames[0]:home?.nextGame;
 const featuredLeague=leagues[0];
 const rating=summary?.rating??card.rating;
 const change=summary?.change30Days;
 const stateRank=summary?.status==='Established'?summary?.stateRank:null;
 const name=home?.greetingName||home?.username||'Player';
 const heading=upcoming?.myRole==='host'?'You are hosting':upcoming?.host?.name||upcoming?.title||'Badminton game';

 return <div className="dashboard-page">
  <section className="dashboard-hero">
   <p className="dashboard-greeting">Welcome back,</p>
   <h1 className="dashboard-name">{name} <span aria-hidden="true">🏸</span></h1>
   <p className="dashboard-subtitle">Ready for a game?</p>
   <div className="dashboard-actions">
    <button type="button" className="dashboard-action-button primary" onClick={()=>navigate('/find')}><Search size={20}/>Find a Match</button>
    <button type="button" className="dashboard-action-button secondary" onClick={()=>navigate('/post-game')}><Plus size={21}/>Post a Game</button>
   </div>
  </section>

  {loading?<p className="dashboard-message">Loading dashboard...</p>:<main className="dashboard-content">
   {error&&<p className="dashboard-error" role="alert">{error}</p>}

   <section className="dashboard-card rating-card">
    <div className="dashboard-card-heading">
     <span>YOUR RATING</span>
     <button className="dashboard-link" type="button" onClick={()=>navigate('/rankings')}>View Rankings <ChevronRight size={16}/></button>
    </div>
    <div className="rating-number">{rating==null?'–':Number(rating).toLocaleString('en-AU')}</div>
    <div className="rating-details">
     <strong>{summary?.grade?`Grade ${summary.grade}`:label(card.band||home?.level)}</strong>
     {change!=null&&<span className={`rating-change ${change<0?'negative':'positive'}`}>{change<0?'↘':'↗'} {change>0?'+':''}{change} this month</span>}
    </div>
    <div className="rating-divider"/>
    <div className="rating-stats">
     <div><strong>{card.matches??'–'}</strong><span>Matches</span></div>
     <div><strong>{card.winRate==null?'–':`${card.winRate}%`}</strong><span>Win Rate</span></div>
     <div><strong>{stateRank==null?'–':`#${stateRank}`}</strong><span>{summary?.state||'State'} Rank</span></div>
    </div>
    {summary?.status==='Provisional'&&<p className="rating-footnote">Provisional · {summary.placement?.played??0}/{summary.placement?.required??10} trusted singles matches completed</p>}
   </section>

   <section className="dashboard-card upcoming-card">
    <div className="dashboard-card-heading"><span>UPCOMING GAME</span>{upcoming&&<span className="confirmed-badge">Confirmed</span>}</div>
    {upcoming?<>
     <div className="upcoming-main">
      <div className="game-avatar">{upcoming?.host?.initials||'🏸'}</div>
      <div className="game-person"><strong>{heading}</strong><span>{label(upcoming.format)}{upcoming.rank?` · ${upcoming.rank}`:''}</span></div>
      <div className="game-time"><strong>{dateText(upcoming.startsAt)}</strong><span>{timeText(upcoming.startsAt)}</span></div>
     </div>
     <div className="game-location"><MapPin size={18}/><span>{upcoming.location||upcoming.suburb||'Location TBC'}</span></div>
     <div className="dashboard-two-buttons">
      <button type="button" className="outline-button" onClick={()=>navigate(`/games/${upcoming.id}`)}>View Game</button>
      <button type="button" className="muted-button" onClick={()=>navigate('/find')}>Find Games</button>
     </div>
    </>:<div className="dashboard-empty"><CalendarDays size={26}/><p>No upcoming games confirmed.</p><button className="dashboard-small-button" onClick={()=>navigate('/find')}>Find a Game <ChevronRight size={16}/></button></div>}
   </section>

   <section className="dashboard-card mini-league-card">
    <div className="dashboard-card-heading"><span>MINI LEAGUE</span><button type="button" className="dashboard-link" onClick={()=>navigate('/leagues')}>View <ChevronRight size={16}/></button></div>
    {featuredLeague?<>
     <div className="mini-league-main"><div className="league-icon"><Trophy size={26}/></div><div className="league-info"><strong>{featuredLeague.name}</strong><span>{label(featuredLeague.status)} · {dateText(featuredLeague.startDate)} – {dateText(featuredLeague.endDate)}</span></div></div>
     <div className="mini-league-bottom">
      <div className="league-position"><strong>{featuredLeague.standing?.position!=null?`#${featuredLeague.standing.position}`:'–'}</strong><span>Your Position</span></div>
      <div className="league-record"><strong>{featuredLeague.standing?`${featuredLeague.standing.wins??0}W · ${featuredLeague.standing.losses??0}L`:'Your league'}</strong><span>{featuredLeague.standing?'League record':'View league details'}</span></div>
      <button type="button" className="dashboard-small-button" onClick={()=>navigate(`/leagues/${featuredLeague.leagueId}`)}>View League</button>
     </div>
    </>:<div className="dashboard-empty"><Trophy size={26}/><p>You haven't joined a mini league yet.</p><button className="dashboard-small-button" onClick={()=>navigate('/leagues')}>Explore Leagues <ChevronRight size={16}/></button></div>}
   </section>

   <section className="activity-section">
    <h2>RECENT ACTIVITY</h2>
    {notifications.length?<div className="activity-list">{notifications.map(item=><div className="activity-card" key={item.notificationId}>
     <div className="activity-icon"><Trophy size={22}/></div>
     <div className="activity-text"><strong>{item.title||item.message}</strong><span>{label(item.type)}</span></div>
     <span className="activity-time">{ago(item.createdAt)}</span>
    </div>)}</div>:<div className="activity-empty">No recent activity yet.</div>}
   </section>
  </main>}
 </div>;
}

export default DashboardPage;
