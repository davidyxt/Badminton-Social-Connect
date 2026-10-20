import {useEffect,useState} from 'react';
import {Trophy,MapPin,TrendingUp,Clock3,Info} from 'lucide-react';
import * as api from '../services/badmintonApi';
import '../styles/RankingsPage.css';

const displayBand=value=>value?String(value).replaceAll('_',' ').replace(/\b\w/g,letter=>letter.toUpperCase()):'Unrated';
const displayDate=value=>{
 if(!value)return null;
 const date=new Date(value);
 return Number.isNaN(date.getTime())?null:date.toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'numeric'});
};
const initials=value=>(value||'P').trim().split(/\s+/).map(word=>word[0]).slice(0,2).join('').toUpperCase();

function RatingChart({points=[]}){
 const valid=points.filter(point=>point&&Number.isFinite(Number(point.rating))&&point.date);
 if(!valid.length)return <p className="ranking-chart-empty">Your rating history will appear after your first rated match.</p>;
 const values=valid.map(point=>Number(point.rating));
 const lowest=Math.min(...values),highest=Math.max(...values);
 const padding=Math.max(20,(highest-lowest)*0.12);
 const min=lowest-padding,max=highest+padding;
 const left=38,right=608,top=18,bottom=148;
 const coords=valid.map((point,index)=>({
  x:valid.length===1?(left+right)/2:left+index*(right-left)/(valid.length-1),
  y:bottom-(Number(point.rating)-min)/(max-min)*(bottom-top)
 }));
 const path=coords.map(point=>`${point.x},${point.y}`).join(' ');
 return <div className="ranking-chart">
  <svg className="ranking-chart-svg" viewBox="0 0 640 174" role="img" aria-label={`Rating history from ${valid[0].date} to ${valid[valid.length-1].date}`}>
   {[0,0.5,1].map((fraction,index)=>{
    const y=top+fraction*(bottom-top);
    return <g key={index}>
     <line x1={left} x2={right} y1={y} y2={y} className="ranking-chart-guide"/>
     <text x={left-7} y={y+4} textAnchor="end" className="ranking-chart-axis">{Math.round(max-fraction*(max-min))}</text>
    </g>;
   })}
   {coords.length>1&&<polyline points={path} className="ranking-chart-line"/>}
   {coords.length===1&&<circle cx={coords[0].x} cy={coords[0].y} r="5" className="ranking-chart-point latest"/>}
   {coords.length>1&&<circle cx={coords[coords.length-1].x} cy={coords[coords.length-1].y} r="5" className="ranking-chart-point latest"/>}
  </svg>
  <div className="ranking-chart-labels"><span>{displayDate(valid[0].date)||valid[0].date}</span><span>{displayDate(valid[valid.length-1].date)||valid[valid.length-1].date}</span></div>
 </div>;
}

function RankingsPage(){
 const [me,setMe]=useState(null),[player,setPlayer]=useState(null),[summary,setSummary]=useState(null),[trend,setTrend]=useState([]);
 const [scope,setScope]=useState('state'),[leaderboard,setLeaderboard]=useState(null);
 const [error,setError]=useState(''),[leaderboardError,setLeaderboardError]=useState('');
 const [loading,setLoading]=useState(true),[leaderboardLoading,setLeaderboardLoading]=useState(true);

 useEffect(()=>{
  let alive=true;
  (async()=>{
   try{
    const id=await api.getCurrentUserId();
    if(!id)throw new Error('Please log in to view your rankings.');
    const [person,details,history]=await Promise.all([
     api.getPlayer(id),api.getRatingSummary(),api.getRatingTrend(30)
    ]);
    if(!details)throw new Error('No rating summary is available. Please complete player registration first.');
    if(alive){setMe(id);setPlayer(person);setSummary(details);setTrend(history?.points||[]);}
   }catch(e){if(alive)setError(e.message||'Unable to load rankings.');}
   finally{if(alive)setLoading(false);}
  })();
  return()=>{alive=false;};
 },[]);

 useEffect(()=>{
  if(!me)return;
  let alive=true;
  setLeaderboardLoading(true);
  setLeaderboardError('');
  (async()=>{
   try{
    const result=await api.getLeaderboard(scope);
    if(!result)throw new Error('Leaderboard information is not available for this account.');
    if(alive)setLeaderboard(result);
   }catch(e){if(alive){setLeaderboard(null);setLeaderboardError(e.message||'Unable to load leaderboard.');}}
   finally{if(alive)setLeaderboardLoading(false);}
  })();
  return()=>{alive=false;};
 },[scope,me]);

 const name=player?.username||player?.displayName||'Your ranking';
 const established=summary?.status==='Established';
 const delta=summary?.change30Days;
 const changeText=delta==null?'–':`${delta>0?'+':''}${delta}`;
 const location=summary?.state||'Your state';
 const nearby=summary?.suburb||'Your suburb';
 const entries=leaderboard?.entries||[];
 const ownEntry=leaderboard?.me;
 const myRowShown=entries.some(row=>row.isMe||row.id===me);
 const renderRow=(row,index)=>{
  const blocked=Boolean(row.blockRelation);
  return <div key={row.id} className={`leaderboard-row ${row.isMe||row.id===me?'current-user-row':''}`}>
   <div className={`leaderboard-position ${row.rank<=3?`position-${row.rank}`:''}`}>{row.rank<=3?<Trophy size={17}/>:row.rank}</div>
   <div className={`leaderboard-avatar ${row.isMe?'current-user-avatar':''}`}>
    {!blocked&&row.profileImageUrl?<img src={row.profileImageUrl} alt=""/>:blocked?'–':row.initials||initials(row.name)}
   </div>
   <div className="leaderboard-player"><strong>{row.name||'Player'}{row.isMe||row.id===me?' (You)':''}</strong><span>{blocked?'Profile unavailable':[row.grade?`Grade ${row.grade}`:null,row.suburb].filter(Boolean).join(' · ')||'Established player'}</span></div>
   <div className="leaderboard-rating"><strong>{row.rating??'–'}</strong><span>points</span></div>
  </div>;
 };

 return <div className="rankings-page">
  <section className="ranking-hero">
   <div className="ranking-hero-heading"><h1>RANKING</h1><span>Singles</span></div>
   <div className="ranking-user-card">
    <div className="ranking-user-top">
     <div className="ranking-avatar">{initials(name)}</div>
     <div className="ranking-user-info"><strong>{name}</strong><span>{summary?.grade?`Grade ${summary.grade}`:displayBand(player?.selfRatingBand)}</span></div>
     {summary?.status&&<span className={`ranking-status ${established?'established':'provisional'}`}>{summary.status}</span>}
    </div>
    <div className="ranking-user-stats">
     <div className="ranking-stat"><strong>{summary?.rating??'–'}</strong><span>{summary?.isStartingRating?'Starting rating':'Singles rating'}</span></div>
     <div className="ranking-stat"><strong className={delta>0?'rating-up':delta<0?'rating-down':''}>{changeText}</strong><span>30-day change</span></div>
     <div className="ranking-stat"><strong>{summary?.stateRank??'–'}{summary?.stateTotal? <small>/{summary.stateTotal}</small>:null}</strong><span>{location} rank</span></div>
     <div className="ranking-stat"><strong>{summary?.nearbyRank??'–'}{summary?.nearbyTotal?<small>/{summary.nearbyTotal}</small>:null}</strong><span>Nearby rank</span></div>
    </div>
    {summary&&!established&&<div className="ranking-placement">
     <div className="ranking-placement-heading"><strong>Placement progress</strong><span>{summary.placement?.played??0}/{summary.placement?.required??10} trusted matches</span></div>
     <progress value={Math.min(summary.placement?.played??0,summary.placement?.required??10)} max={summary.placement?.required??10}/>
     <p>{summary.placement?.opponents??0}/{summary.placement?.opponentsRequired??5} different opponents · Your grade and geographic ranks appear once established.</p>
    </div>}
    {displayDate(summary?.ratingsUpdatedAt)&&<p className="ranking-updated"><Clock3 size={13}/> Ratings updated {displayDate(summary.ratingsUpdatedAt)}</p>}
   </div>
  </section>

  <main className="rankings-content">
   {error&&<p className="ranking-error" role="alert">{error}</p>}
   {loading&&<p className="ranking-loading">Loading rankings...</p>}
   {!loading&&!error&&<>
    <section className="ranking-card">
     <div className="ranking-card-header"><h2><TrendingUp size={18}/> Rating history</h2><span>Last 30 days</span></div>
     <RatingChart points={trend}/>
    </section>

    <section className="leaderboard-section">
     <div className="leaderboard-heading"><h2>Leaderboard</h2><div className="ranking-format-label">Singles <span title="Doubles ratings are not supported by the current rating engine">Doubles coming soon</span></div></div>
     <div className="leaderboard-tabs" aria-label="Leaderboard location">
      <button type="button" className={scope==='state'?'active':''} aria-pressed={scope==='state'} onClick={()=>setScope('state')}><MapPin size={14}/> State</button>
      <button type="button" className={scope==='nearby'?'active':''} aria-pressed={scope==='nearby'} onClick={()=>setScope('nearby')}><MapPin size={14}/> Nearby</button>
     </div>
     <p className="ranking-leaderboard-description">{scope==='state'?`Top established singles players in ${leaderboard?.state||location}.`:`Top established singles players near ${leaderboard?.suburb||nearby}.`} Rankings update after the nightly rating run.</p>
     {leaderboardError&&<p className="ranking-error" role="alert">{leaderboardError}</p>}
     {leaderboardLoading?<p className="ranking-loading">Loading leaderboard...</p>:!leaderboardError&&<div className="leaderboard-card">
      <div className="leaderboard-list">
       {entries.map(renderRow)}
       {!entries.length&&<div className="leaderboard-empty"><Trophy size={25}/><strong>No established players yet</strong><span>Players appear here once they complete placement requirements.</span></div>}
      </div>
      {ownEntry&&!myRowShown&&<div className="leaderboard-own-position"><span>Your position</span>{renderRow(ownEntry,entries.length)}</div>}
      <div className="leaderboard-footer"><Info size={14}/><span>{leaderboard?.total??0} established players · Showing up to 50</span></div>
     </div>}
    </section>
   </>}
  </main>
 </div>;
}
export default RankingsPage;
