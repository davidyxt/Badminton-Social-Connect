import { supabase } from './supabase';
/** Creates a GamePost. The spec stores a suburb and start timestamp; not venue,
 * duration, style, notes, ability level or participant count. */
export const createGame=async form=>{
  if(!form.date||!form.startTime||!form.venue?.trim()) throw new Error('Date, time and suburb are required.');
  const date=new Date(`${form.date}T${form.startTime}:00`);
  if(Number.isNaN(date.getTime()))throw new Error('Invalid date or time.');
  const payload={format:form.format,suburb:form.venue.trim(),proposedTime:date.toISOString(),status:'open'};
  const {data,error}=await supabase.from('game_post').insert(payload).select().single();
  if(error)throw error;
  return {id:data.postId,...form,...data,venue:data.suburb};
};
