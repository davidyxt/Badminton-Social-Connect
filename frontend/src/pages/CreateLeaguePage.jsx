import {useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {ArrowLeft} from 'lucide-react';
import * as api from '../services/badmintonApi';
import '../styles/CreateLeaguePage.css';
function CreateLeaguePage(){
 const navigate=useNavigate();
 const [form,setForm]=useState({name:'',startDate:'',endDate:''});
 const [error,setError]=useState('');const [saving,setSaving]=useState(false);
 const update=e=>setForm(p=>({...p,[e.target.name]:e.target.value}));
 const submit=async e=>{e.preventDefault();setError('');
   if(!form.name.trim())return setError('Enter a league name.');
   if(!form.startDate||!form.endDate||form.endDate<form.startDate)return setError('Choose valid start and end dates.');
   setSaving(true);
   try{const startDate=new Date(`${form.startDate}T00:00:00`).toISOString();
     const endDate=new Date(`${form.endDate}T23:59:59`).toISOString();
     const saved=await api.createMiniLeague(form.name.trim(),startDate,endDate);
     if(!saved?.leagueId)throw new Error('League was created without a league ID.');
     navigate(`/leagues/${saved.leagueId}/created`,{state:{league:api.mapLeague(saved)}});
   }catch(err){setError(err.message||'Unable to create league.');}finally{setSaving(false);}
 };
 return <div className="create-league-page">
  <header className="create-league-header"><button type="button" className="create-league-back-button" onClick={()=>navigate('/leagues')} aria-label="Back to leagues"><ArrowLeft size={22}/></button><h1>Create League</h1></header>
  <form className="create-league-form" onSubmit={submit}>
   <div className="create-league-card">
    <div className="create-league-field"><label htmlFor="leagueName">League Name</label><input id="leagueName" name="name" value={form.name} onChange={update} placeholder="e.g. UniMelb Social League" required/></div>
    <div className="create-league-two-column"><div className="create-league-field"><label htmlFor="startDate">Start Date</label><input id="startDate" type="date" name="startDate" value={form.startDate} onChange={update} required/></div>
    <div className="create-league-field"><label htmlFor="endDate">End Date</label><input id="endDate" type="date" name="endDate" min={form.startDate||undefined} value={form.endDate} onChange={update} required/></div></div>
    <p className="field-helper-text">The current league API stores a name and date range. Rounds, formats, invitations, player limits and descriptions are not currently stored.</p>
    {error&&<p role="alert" className="create-league-error">{error}</p>}
   </div><div className="create-league-actions"><button className="create-league-submit-button" disabled={saving} type="submit">{saving?'Creating...':'Create League'}</button></div>
  </form>
 </div>;
}
export default CreateLeaguePage;
