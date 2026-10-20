import {useEffect,useMemo,useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {Search,Clock3,MapPin,Users} from 'lucide-react';
import * as api from '../services/badmintonApi';
import '../styles/FindGamesPage.css';
function FindGamesPage(){
 const navigate=useNavigate();const [games,setGames]=useState([]),[players,setPlayers]=useState([]);
 const [tab,setTab]=useState('matches'),[search,setSearch]=useState(''),[format,setFormat]=useState('all');
 const [error,setError]=useState(''),[loading,setLoading]=useState(true);
 useEffect(()=>{let active=true;(async()=>{try{
  const found=tab==='matches'?await api.searchGames(search,format):await api.searchPlayers(search);
  if(active){if(tab==='matches')setGames(found.map(api.mapGame));else setPlayers(found.map(api.mapPlayer));}
 }catch(e){if(active)setError(e.message);}finally{if(active)setLoading(false);}})();return()=>{active=false;};},[tab,search,format]);
 const foundGames=useMemo(()=>games,[games,format,search]);
 const foundPlayers=useMemo(()=>players,[players,search]);
 return <div className="find-games-page">
  <section className="find-games-header"><h1>Find Games</h1>
   <div className="find-search-wrapper"><Search size={18}/><input type="search" placeholder={tab==='matches'?'Search games or suburbs':'Search players or suburbs'} value={search} onChange={e=>setSearch(e.target.value)} /></div>
   <div className="find-tab-switcher"><button type="button" className={tab==='matches'?'active':''} onClick={()=>setTab('matches')}>Find Games</button><button type="button" className={tab==='players'?'active':''} onClick={()=>setTab('players')}>Find Players</button></div>
   {tab==='matches'&&<div className="find-filter-row"><select value={format} onChange={e=>setFormat(e.target.value)}><option value="all">All Formats</option><option value="singles">Singles</option><option value="doubles">Doubles</option></select></div>}
  </section>
  {error&&<p role="alert" className="find-error">{error}</p>}
  {loading?<p>Loading...</p>:tab==='matches'?<section className="find-results">
   {foundGames.map(game=><article className="game-card" key={game.id}>
    <div className="game-image game-image-empty"><div className="game-badges"><span className="game-format-badge">{game.format}</span></div><h2>{game.title}</h2></div>
    <div className="game-card-content"><div className="game-info-row"><Clock3 size={17}/><span>{game.date}, {game.time}</span></div><div className="game-info-row"><MapPin size={17}/><span>{game.location}</span></div>
    <div className="game-card-actions"><button type="button" className="game-primary-button" onClick={()=>navigate(`/games/${game.id}`)}>Request to Play</button><button type="button" className="game-secondary-button" onClick={()=>navigate(`/games/${game.id}`)}>View Details</button></div></div>
   </article>)}
   {!foundGames.length&&<div className="find-empty-state"><Search size={28}/><h3>No open games found</h3><p>Try another suburb or format.</p></div>}
  </section>:<section className="find-results">
   {foundPlayers.map(player=><article className="player-card" key={player.id}><div className="player-avatar">{player.initials}</div><div className="player-info"><h2>{player.name}</h2><span>{player.rank}</span><p>{player.location||'Location not provided'}</p></div><button type="button" className="game-secondary-button" onClick={()=>navigate(`/players/${player.id}`)}>View Profile</button></article>)}
   {!foundPlayers.length&&<div className="find-empty-state"><Users size={28}/><h3>No players found</h3></div>}
  </section>}
 </div>;
}
export default FindGamesPage;
