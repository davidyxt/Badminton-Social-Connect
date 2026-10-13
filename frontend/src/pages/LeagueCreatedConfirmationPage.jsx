import {useLocation,useNavigate,useParams} from 'react-router-dom';
import {Trophy} from 'lucide-react';
import ConfirmationPage from '../components/common/ConfirmationPage';
import '../styles/LeagueCreatedConfirmationPage.css';
function LeagueCreatedConfirmationPage(){const navigate=useNavigate(),location=useLocation(),{leagueId}=useParams(),league=location.state?.league;
 if(!league) return <div className="league-created-page"><p>There is no new league confirmation in this navigation.</p><button type="button" onClick={()=>navigate(`/leagues/${leagueId}`)}>View League</button></div>;
 return <ConfirmationPage icon={<Trophy size={42}/>} title="League Created!" description={<><strong>{league.name}</strong> has been created.</>} primaryLabel="View League" onPrimary={()=>navigate(`/leagues/${league.id}`)} secondaryLabel="Back to Mini Leagues" onSecondary={()=>navigate('/leagues')}>
 <div className="league-created-card"><div className="league-created-header"><div className="league-created-avatar">{league.name?.split(' ').map(w=>w[0]).slice(0,2).join('')||'L'}</div><div className="league-created-title"><h2>{league.name}</h2><span>{league.availability||'Created'}</span></div></div><div className="league-created-divider"/>
 <div className="league-created-detail"><span>Starts</span><strong>{league.startDate?new Date(league.startDate).toLocaleDateString('en-AU'):'Not set'}</strong></div><div className="league-created-detail"><span>Ends</span><strong>{league.endDate?new Date(league.endDate).toLocaleDateString('en-AU'):'Not set'}</strong></div></div>
 </ConfirmationPage>;
}
export default LeagueCreatedConfirmationPage;
