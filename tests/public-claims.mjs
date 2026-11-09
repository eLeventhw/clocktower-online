import assert from 'node:assert/strict';
import {newGame,joinGame,perform,view,ROLE_INFO} from '../server-dist/game.js';

// Public-trigger bluffing, the ghost-vote rule, and the Undertaker's execution info.
async function fixture(roles){
 const {g,p}=newGame('ABC234','P0');const players=[p];
 for(let i=1;i<roles.length;i++)players.push(joinGame(g,`P${i}`));
 await perform(g,p.token,'start',{});
 g.players.forEach((q,i)=>{q.role=roles[i];q.drunkRole=null;});
 g.privateEvents={};g.events=[];g.poisonedId=null;g.pendingDemonId=null;g.lastExecuted=null;
 g.phase='day';g.round=2;g.rulesVersion=2;g.night={cursor:0,nonce:'n',protectedId:null,deathId:null};
 g.ballot=null;g.nominated=[];g.nominators=[];g.leader=null;g.readyDay=[];g.publicClaims={};
 return {g,players,host:p};
}
async function driveNight(g,host,players,impTargetId){
 for(let i=0;i<30&&g.phase==='night';i++){
  if(view(g,host.token).nightProgress.readyToAdvance){await perform(g,host.token,'advance_night',{});continue;}
  const who=players.find(q=>view(g,q.token).me.canAct);
  if(!who){await perform(g,host.token,'advance_night',{});continue;}
  let targets;
  if(who.role==='imp')targets=[impTargetId];
  else targets=[who.id]; // poison themselves: leaves the Imp and the Undertaker sober
  await perform(g,who.token,'night_action',{targets});
 }
}
async function execute(g,host,players,target){
 g.nominated=[];g.nominators=[];
 await perform(g,host.token,'nominate',{target:target.id});
 for(const q of players)await perform(g,q.token,'vote',{yes:true});
 await perform(g,host.token,'close_vote',{});
 await perform(g,host.token,'end_day',{});
}

// Any living player may publicly claim the Slayer shot; a fake claim only says
// "nothing happened" and never spends the real Slayer's once-per-game attempt.
{
 const {g,players:p}=await fixture(['empath','imp','poisoner','chef','soldier']);
 await perform(g,p[0].token,'slayer',{target:p[1].id});
 assert.equal(p[1].alive,true);assert.equal(p[0].usedSlayer,false);
 assert.equal(view(g,p[0].token).me.claimedToday,true);
 const texts=g.events.map(e=>e.text);
 assert.ok(texts.includes(`${p[0].name} 宣称使用杀手能力，选择了 ${p[1].name}。`));
 assert.ok(texts.includes('没有人因这次能力死亡。'));
 assert.ok(!texts.some(t=>t.endsWith('死亡。')&&t!=='没有人因这次能力死亡。'));
 await assert.rejects(()=>perform(g,p[0].token,'slayer',{target:p[2].id}),/本日你已经宣称/);
 // The cap is per day, not per game.
 g.round=3;await perform(g,p[0].token,'slayer',{target:p[2].id});
 assert.equal(g.publicClaims[p[0].id],'day-3');
 assert.equal(view(g,p[0].token).me.claimedToday,true);
}
// A genuine Slayer still kills, and a bluff made earlier the same day does not
// consume that shot.
{
 const {g,players:p}=await fixture(['slayer','imp','poisoner','empath','monk']);
 await perform(g,p[2].token,'slayer',{target:p[1].id});
 assert.equal(p[1].alive,true);assert.equal(p[0].usedSlayer,false);
 assert.equal(view(g,p[2].token).me.claimedToday,true);
 await perform(g,p[0].token,'slayer',{target:p[1].id});
 assert.equal(p[1].alive,false);assert.equal(p[0].usedSlayer,true);
 assert.ok(g.events.some(e=>e.text==='P1 死亡。'));
}
// Ghost vote: "no" never spends it; one "yes" per game; "no" stays available after.
{
 const {g,players:p,host}=await fixture(['undertaker','imp','poisoner','empath','chef']);
 p[3].alive=false;p[3].ghostVote=true;
 await perform(g,host.token,'nominate',{target:p[4].id});
 await perform(g,p[3].token,'vote',{yes:false});
 await perform(g,host.token,'close_vote',{});
 assert.equal(p[3].ghostVote,true,'a no vote must not consume the ghost vote');
 g.nominated=[];g.nominators=[];
 await perform(g,host.token,'nominate',{target:p[4].id});
 await perform(g,p[3].token,'vote',{yes:true});
 await perform(g,host.token,'close_vote',{});
 assert.equal(p[3].ghostVote,false,'one yes vote per game');
 g.nominated=[];g.nominators=[];
 await perform(g,host.token,'nominate',{target:p[4].id});
 await perform(g,p[3].token,'vote',{yes:false});
 assert.equal(g.ballot.votes[p[3].id],false);
 // A spent ghost vote still counts as "no" for the player, but not toward the
 // auto-close tally, so the ballot cannot close early.
 const state=view(g,p[3].token);assert.equal(state.ballot.myVote,false);
 assert.equal(state.ballot.submitted,0);assert.equal(state.ballot.eligible,4);
 await assert.rejects(()=>perform(g,p[3].token,'vote',{yes:true}),/你已用完死者票/);
}
// Undertaker learns the executed player's real role on the following night.
{
 const {g,players:p,host}=await fixture(['undertaker','chef','imp','poisoner','empath']);
 await execute(g,host,p,p[1]);
 assert.equal(g.lastExecuted,p[1].id);
 await driveNight(g,host,p,p[4].id); // Imp kills the Empath, Undertaker survives
 assert.equal(g.phase,'day');assert.equal(p[0].alive,true);
 const notes=view(g,p[0].token).privateEvents.map(e=>e.text);
 assert.ok(notes.includes(`昨日被处决的 ${p[1].name} 的身份是 ${ROLE_INFO[p[1].role].name}。`),JSON.stringify(notes));
 for(const q of p.filter(x=>x!==p[0]))assert.ok(!view(g,q.token).privateEvents.some(n=>n.text.startsWith('昨日被处决的')),'info stays private');
}
// Official night order: the Imp acts before the Undertaker. An Undertaker killed
// that night is never woken, so no execution info is delivered. This is the case
// that looks like "the Undertaker got nothing".
{
 const {g,players:p,host}=await fixture(['undertaker','chef','imp','poisoner','empath']);
 await execute(g,host,p,p[1]);
 await driveNight(g,host,p,p[0].id); // Imp kills the Undertaker
 assert.equal(p[0].alive,false);
 assert.ok(!view(g,p[0].token).privateEvents.some(n=>n.text.startsWith('昨日被处决的')));
}
console.log('PASS: public ability claims, ghost-vote no/yes rules, and Undertaker execution info (including the Imp-before-Undertaker night order).');
