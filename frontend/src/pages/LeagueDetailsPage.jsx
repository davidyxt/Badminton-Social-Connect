import {useEffect,useState} from 'react';
import {useNavigate,useParams} from 'react-router-dom';
import {ArrowLeft,CalendarDays,MapPin,Trophy,Users} from 'lucide-react';
import * as api from '../services/badmintonApi';
import '../styles/LeagueDetailsPage.css';

const statusLabel=value=>value?String(value).charAt(0).toUpperCase()+String(value).slice(1).replaceAll('_',' '):'Unknown';
const dateText=value=>value?new Date(value).toLocaleDateString('en-AU',{day:'numeric',month:'short'}):'TBC';
function LeagueDetailsPage(){
 const navigate=useNavigate();const {leagueId}=useParams();
 const [league,setLeague]=useState(null),[standings,setStandings]=useState([]),[matches,setMatches]=useState([]),[tab,setTab]=useState('table');
 const [id,setId]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
 const load=async()=>{const [userId,row,table,games,people]=await Promise.all([api.getCurrentUserId(),api.getLeague(leagueId),api.getStandings(leagueId),api.getLeagueMatches(leagueId),api.listPlayers()]);
  if(!row)throw new Error('League not found.');const names=Object.fromEntries(people.map(p=>[p.playerId,p.displayName]));
  setId(userId);setLeague(api.mapLeague(row));setStandings(table.map(s=>({...s,name:names[s.playerId]||'Player'})));setMatches(games);};
 useEffect(()=>{let live=true;(async()=>{try{await load();}catch(e){if(live)setError(e.message);}finally{if(live)setLoading(false);}})();return()=>{live=false;};},[leagueId]);
 const joined=standings.some(s=>s.playerId===id)||league?.organiserId===id;
 const me=standings.find(s=>s.playerId===id);
 const join=async()=>{setError('');setBusy(true);try{await api.joinMiniLeague(leagueId);await load();}catch(e){setError(e.message);}finally{setBusy(false);}};
 return <div className="league-details-page"><header className="league-details-header"><button type="button" className="league-details-back" onClick={()=>navigate('/leagues')} aria-label="Back to leagues"><ArrowLeft size={20}/></button><h1>League Details</h1></header>
 {error&&<p role="alert">{error}</p>}{loading&&<p>Loading league...</p>}
 {league&&<><section className="league-details-hero"><div className="league-hero-main"><div className="league-hero-title"><Trophy size={24}/><h2>{league.name}</h2></div><div className="league-hero-meta"><span className={`league-status-pill status-${String(league.availability||'').toLowerCase()}`}>{statusLabel(league.availability)}</span><span className="league-hero-chip"><CalendarDays size={13}/>{dateText(league.startDate)} {'\u2013'} {dateText(league.endDate)}</span><span className="league-hero-chip"><Users size={13}/>{standings.length} players</span></div></div>{me&&<div className="league-position-box"><strong>#{me.position??'-'}</strong><span>Your position</span></div>}</section>
 <main className="league-details-content"><div className="league-details-tabs"><button type="button" className={tab==='table'?'active':''} onClick={()=>setTab('table')}>Standings</button><button type="button" className={tab==='matches'?'active':''} onClick={()=>setTab('matches')}>Matches</button><button type="button" className={tab==='players'?'active':''} onClick={()=>setTab('players')}>Players</button></div>
 {tab==='table'&&<section className="league-table"><div className="league-table-header"><span>#</span><span>Player</span><span>P</span><span>W</span><span>L</span><span>Pts</span></div>
 {standings.map(p=><div className={`league-table-row ${p.playerId===id?'current-player':''}`} key={p.playerId}><strong className="table-position">{p.position??'-'}</strong><div className="table-player"><div className="table-avatar">{p.name.split(' ').map(w=>w[0]).join('').slice(0,2)}</div><strong>{p.name}{p.playerId===id?' (You)':''}</strong></div><span>{(p.wins||0)+(p.losses||0)}</span><span className="table-win">{p.wins??0}</span><span className="table-loss">{p.losses??0}</span><strong>{p.points??0}</strong></div>)}
 {!standings.length&&<p>No standings yet.</p>}</section>}
 {tab==='matches'&&<section className="league-matches-list">{matches.map(m=><article key={m.matchId} className="league-match-card"><div className="league-match-top"><span className={`match-status ${String(m.status||'').toLowerCase().replaceAll('_','-')}`}>{statusLabel(m.status)}</span><span className="league-match-date">{m.playedAt?new Date(m.playedAt).toLocaleString('en-AU',{weekday:'short',day:'numeric',month:'short',hour:'numeric',minute:'2-digit'}):'Date TBC'}</span></div><p className="league-match-where"><MapPin size={15}/>{m.format||'Badminton'} match {'\u00b7'} {m.suburb||'Area TBC'}</p><button type="button" className="league-outline-button" onClick={()=>navigate(`/matches/${m.matchId}`)}>View Match</button></article>)}{!matches.length&&<p>No league matches yet.</p>}</section>}
 {tab==='players'&&<section className="league-player-list">{standings.map(p=><article key={p.playerId} className={`league-player-card ${p.playerId===id?'current-league-player':''}`}><div className="league-player-avatar">{p.name.split(' ').map(w=>w[0]).join('').slice(0,2)}</div><div className="league-player-details"><strong>{p.name}{p.playerId===id?' (You)':''}</strong><span>{p.points??0} league points</span></div><button type="button" className="league-outline-button" onClick={()=>navigate(`/players/${p.playerId}`)}>View</button></article>)}</section>}
 </main>{!joined&&league.availability==='active'&&<div className="join-league-area"><p>Joining requires the league organiser to add you. Self-joining is not available in this database version.</p></div>}</>}
 </div>;
}
export default LeagueDetailsPage;
