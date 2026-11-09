import assert from 'node:assert/strict';
import {newGame,joinGame,perform,view,synthesizePublicVoice,probeVoice} from '../server-dist/game.js';

// A player's own action advances the table inside that same request: the next player never
// waits for the host's poll, and a backgrounded host tab can no longer stall the night.
async function fixture(roles){
 const {g,p}=newGame('AUTO23','P0');const players=[p];for(let i=1;i<roles.length;i++)players.push(joinGame(g,`P${i}`));
 await perform(g,p.token,'start',{});g.players.forEach((q,i)=>q.role=roles[i]);g.privateEvents={};g.events=[];g.poisonedId=null;g.pendingDemonId=null;
 return {g,players,host:p};
}
const action=(g,p,targets,auto)=>perform(g,p.token,'night_action',{targets:targets.map(q=>q.id),auto});

// Poisoner acts -> the server walks every non-targeted stage (Spy grimoire, first-night
// information) and stops on the next role that must act. No host click anywhere.
{
 const {g,players:p,host}=await fixture(['poisoner','spy','washerwoman','investigator','chef','empath','fortune','imp']);
 assert.equal(view(g,p[0].token).me.canAct,true);
 await action(g,p[0],[p[2]],true);
 assert.equal(g.phase,'night');
 assert.equal(g.night.cursor,7,'cursor advanced to the Fortune Teller without a host request');
 assert.equal(view(g,p[6].token).me.canAct,true,'next actor is prompted immediately');
 assert.equal(view(g,p[0].token).me.canAct,false);
 assert.ok(view(g,p[1].token).privateEvents.some(n=>n.text.includes('魔典：')),'skipped stages still resolve');
 assert.ok(view(g,p[2].token).privateEvents.some(n=>n.text.startsWith('线索：')));
 // The last acting role finishes the night in the same request.
 await action(g,p[6],[p[0],p[7]],true);
 assert.equal(g.phase,'day');
 assert.ok(view(g,host.token).events.some(e=>e.text.startsWith('天亮了')));
}

// Without the flag (direct callers, tooling) the old manual flow is untouched.
{
 const {g,players:p}=await fixture(['poisoner','spy','washerwoman','investigator','chef','empath','fortune','imp']);
 await action(g,p[0],[p[2]],false);
 assert.equal(g.night.cursor,0,'no implicit advance without the auto flag');
 assert.equal(view(g,p[0].token).nightProgress.readyToAdvance,true);
}

// A ballot closes itself when the last voter who could still add a "yes" has voted.
{
 const {g,players:p}=await fixture(['poisoner','spy','washerwoman','investigator','chef']);g.phase='day';g.round=1;
 await perform(g,p[0].token,'nominate',{target:p[4].id});
 // Statement → defense → vote. Only the last beat accepts hands, so the auto-close can
 // never fire while someone is still speaking.
 await perform(g,p[0].token,'advance_ballot',{});
 await perform(g,p[4].token,'advance_ballot',{});
 assert.equal(g.ballot.stage,'vote');
 for(const q of p.slice(0,-1))await perform(g,q.token,'vote',{yes:true,auto:true});
 assert.ok(g.ballot,'still open while someone has not voted');
 await perform(g,p[4].token,'vote',{yes:true,auto:true});
 assert.equal(g.ballot,null,'last vote closed the ballot in the same request');
 assert.equal(g.leader.votes,5);
}

// 玲玲姐姐 is the 2.0 voice id now; the retired 1.0 ids are mapped instead of going silent.
{
 const original=globalThis.fetch;const speakers=[];
 globalThis.fetch=async(_url,options)=>{
  speakers.push(JSON.parse(options.body).req_params.speaker);
  return new Response(`${JSON.stringify({code:0,data:Buffer.from([1,2,3]).toString('base64')})}\n${JSON.stringify({code:20000000})}\n`,{headers:{'content-type':'application/json'}});
 };
 try{
  const {g,players:p,host}=await fixture(['poisoner','spy','washerwoman','investigator','chef']);
  g.events.push({id:'voice-event',text:'天亮了。昨夜无人死亡。',at:Date.now()});
  const eventId='voice-event',key='ark-test-speech-key-0123456789';
  await synthesizePublicVoice(g,host.token,eventId,{provider:'ark',voiceKey:key});
  await synthesizePublicVoice(g,host.token,eventId,{provider:'ark',voiceKey:key,speaker:'zh_female_zhiling_moon_bigtts'});
  await synthesizePublicVoice(g,host.token,eventId,{provider:'ark',voiceKey:key,speaker:'zh_female_linzhiling_mars_bigtts'});
  assert.deepEqual(speakers,['zh_female_lingling_uranus_bigtts','zh_female_lingling_uranus_bigtts','zh_female_lingling_uranus_bigtts']);
  const probe=await probeVoice({provider:'ark',voiceKey:key});
  assert.equal(probe.speaker,'zh_female_lingling_uranus_bigtts');
  assert.equal(p.length,5);
 }finally{globalThis.fetch=original;}
}
console.log('PASS: a submitted night action advances the table server-side, the last vote closes its own ballot, and 玲玲姐姐 2.0 is the default voice with the retired ids mapped.');
