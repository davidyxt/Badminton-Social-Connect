import {useEffect,useMemo,useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {Plus,Trophy} from 'lucide-react';
import * as api from '../services/badmintonApi';
import '../styles/MiniLeaguesPage.css';
function MiniLeaguesPage(){
 const navigate=useNavigate();const [all,setAll]=useState([]),[joinedIds,setJoinedIds]=useState([]),[myId,setMyId]=useState(null);
 const [filter,setFilter]=useState('all'),[error,setError]=useState(''),[loading,setLoading]=useState(true);
 useEffect(()=>{let active=true;(async()=>{try{const id=await api.getCurrentUserId();const [rows,standings]=await Promise.all([api.listLeagues(),id?api.getMyStandings(id):Promise.resolve([])]);if(active){setMyId(id);setAll(rows.map(api.mapLeague));setJoinedIds(standings.map(s=>s.leagueId));}}catch(e){if(active)setError(e.message);}finally{if(active)setLoading(false);}})();return()=>{active=false;};},[]);
 const mine=all.filter(l=>joinedIds.includes(l.id)||l.organiserId===myId);
 const discover=all.filter(l=>!joinedIds.includes(l.id)&&l.organiserId!==myId&&(filter==='all'||l.availability===filter));
 const card=league=><article className="mini-league-card" key={league.id} onClick={()=>navigate(`/leagues/${league.id}`)}><div className="league-card-image league-card-image-empty"><div className="league-image-placeholder"><Trophy size={28}/><span>Mini League</span></div></div><div className="league-card-content"><h3>{league.name}</h3><div className="league-card-bottom"><div className="league-card-information"><span>{league.startDate?new Date(league.startDate).toLocaleDateString('en-AU'):'Start TBC'} – {league.endDate?new Date(league.endDate).toLocaleDateString('en-AU'):'End TBC'}</span><span className="league-style-tag">{league.availability||'Status TBC'}</span></div><button type="button" className="view-league-button" onClick={e=>{e.stopPropagation();navigate(`/leagues/${league.id}`);}}>View League</button></div></div></article>;
 return <div className="mini-leagues-page"><header className="mini-leagues-header"><h1>Mini Leagues</h1><button type="button" className="create-league-button" onClick={()=>navigate('/leagues/create')}>Create League <Plus size={14}/></button></header>
 {error&&<p role="alert">{error}</p>}{loading?<p>Loading leagues...</p>:<main className="mini-leagues-content">
 <section className="league-section"><h2>Your Leagues</h2><div className="league-list">{mine.length?mine.map(card):<div className="league-empty-state"><Trophy size={28}/><h3>No leagues joined</h3><p>Join an existing league below or create one.</p></div>}</div></section>
 <section className="league-section discover-section"><h2>Discover Leagues</h2><div className="league-filter-row"><select value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">All Statuses</option><option value="active">Active</option><option value="draft">Draft</option><option value="cancelled">Cancelled</option><option value="completed">Completed</option></select></div>
 <div className="league-list">{discover.length?discover.map(card):<div className="league-empty-state"><Trophy size={28}/><h3>No leagues found</h3></div>}</div></section>
 </main>}</div>;
}
export default MiniLeaguesPage;
