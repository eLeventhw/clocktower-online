export type PublicNotice = {id:string;text:string};
export type PublicEventSnapshot = {code:string;events:PublicNotice[]}|null;
/** Returns newly published events only; switching rooms never reads historical or private events aloud. */
export function createPublicEventTracker(){
 let code='';let seen=new Set<string>();
 return (snapshot:PublicEventSnapshot):PublicNotice[]=>{
  if(!snapshot){code='';seen=new Set();return [];}
  if(code!==snapshot.code){code=snapshot.code;seen=new Set(snapshot.events.map(e=>e.id));return [];}
  const next:PublicNotice[]=[];
  for(const e of snapshot.events)if(!seen.has(e.id)){seen.add(e.id);next.push(e);}
  if(seen.size>500)seen=new Set(snapshot.events.map(e=>e.id));
  return next;
 };
}

export type VoicedNotice = PublicNotice & {voice?:{ready:boolean;expiresAt:number}};
export type VoiceSnapshot = {code:string;events:VoicedNotice[]}|null;
/** Wait for audio to be attached to NEW public events; ignore pre-existing events. */
export function createReadyVoiceTracker(){
 let code='';let seen=new Set<string>();
 return {
  reset(snapshot:VoiceSnapshot){code=snapshot?.code||'';seen=new Set(snapshot?.events.map(e=>e.id)||[]);},
  next(snapshot:VoiceSnapshot):VoicedNotice[]{
   if(!snapshot){code='';seen=new Set();return [];}
   if(code!==snapshot.code){this.reset(snapshot);return [];}
   const ready:VoicedNotice[]=[];
   for(const e of snapshot.events)if(e.voice?.ready&&!seen.has(e.id)){seen.add(e.id);ready.push(e);}
   if(seen.size>500)seen=new Set(snapshot.events.map(e=>e.id));
   return ready;
  }
 };
}
