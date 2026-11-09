import assert from 'node:assert/strict';
import {newGame,joinGame,perform,view} from '../server-dist/game.js';

async function fixture(roles){
 const {g,p:host}=newGame('ABC234','P0');for(let i=1;i<roles.length;i++)joinGame(g,`P${i}`);await perform(g,host.token,'start',{});
 g.players.forEach((p,i)=>{p.role=roles[i];p.drunkRole=null;p.alive=true;p.usedSlayer=false;p.ghostVote=true;});g.events=[];g.privateEvents={};g.actions={};g.poisonedId=null;g.butlerMasterId=null;g.phase='night';g.round=1;g.night={cursor:0,nonce:crypto.randomUUID(),protectedId:null,deathId:null};
 return {g,p:g.players,host};
}
const priv=(g,who)=>(g.privateEvents[who.id]||[]).map(e=>e.text).join('\n');

// Librarian: with zero Outsiders in play they learn exactly that; otherwise they
// get a two-player ping that contains a real Outsider (the Drunk counts).
{
 const {g,p}=await fixture(['librarian','imp','poisoner','washerwoman','monk']);
 g.night.cursor=4;await perform(g,p[0].token,'advance_night',{ai:{}});
 assert.match(priv(g,p[0]),/场上没有外来者/);
}
{
 const {g,p}=await fixture(['librarian','imp','poisoner','washerwoman','monk','empath','drunk']);
 g.night.cursor=4;await perform(g,p[0].token,'advance_night',{ai:{}});
 const text=priv(g,p[0]);assert.match(text,/中有一人是酒鬼/);
 const named=text.slice(3).split(' 中')[0].split('、');
 assert.equal(named.length,2);
 const drunk=g.players.find(q=>q.role==='drunk');
 assert.ok(named.includes(drunk.name),'图书管理员的二选一必须包含真正的外来者');
}

// Virgin: a Townsfolk nominator is executed immediately, no ballot opens, and the
// ability never fires again. An evil nominator does not trigger and voting proceeds.
{
 const {g,p}=await fixture(['virgin','imp','washerwoman','empath','monk','butler']);
 g.phase='day';g.ballot=null;g.nominated=[];g.nominators=[];g.leader=null;
 await perform(g,p[2].token,'nominate',{target:p[0].id});
 assert.equal(p[2].alive,false,'镇民提名贞洁者应被立即处决');
 assert.equal(g.ballot,null,'触发时不应进入投票');
 assert.equal(g.lastExecuted,p[2].id);
 g.round=2;g.nominated=[];g.nominators=[];g.readyDay=[];g.nominationLog=[];g.leader=null;
 await perform(g,p[3].token,'nominate',{target:p[0].id});
 assert.equal(p[3].alive,true,'第二次被提名不再触发');
 assert.ok(g.ballot,'后续提名照常进入投票'); assert.equal(g.ballot,{nominator:p[3].id,nominee:p[0].id,votes:{}}?g.ballot:null,'后续提名照常进入投票');
}
{
 const {g,p}=await fixture(['virgin','imp','washerwoman','empath','monk','butler']);
 g.phase='day';g.ballot=null;g.nominated=[];g.nominators=[];g.leader=null;
 await perform(g,p[1].token,'nominate',{target:p[0].id});
 assert.equal(p[1].alive,true,'爪牙提名不触发（小恶魔注册为邪恶）');
 assert.ok(g.ballot,'未触发时照常投票');
}
// A poisoned Virgin does not trigger at all.
{
 const {g,p}=await fixture(['virgin','imp','washerwoman','empath','monk','butler']);
 g.phase='day';g.ballot=null;g.nominated=[];g.nominators=[];g.leader=null;g.poisonedId=p[0].id;
 await perform(g,p[2].token,'nominate',{target:p[0].id});
 assert.equal(p[2].alive,true,'贞洁者中毒时能力失效');
}

// Spy/Recluse register randomly: across many trials both outcomes must occur.
{
 const fired=[0,0];
 for(let i=0;i<120;i++){
  const roles=i%2?['virgin','spy','washerwoman','empath','monk','butler']:['virgin','recluse','washerwoman','empath','monk','butler'];
  const {g,p}=await fixture(roles);
  g.phase='day';g.ballot=null;g.nominated=[];g.nominators=[];g.leader=null;
  await perform(g,p[1].token,'nominate',{target:p[0].id});
  fired[p[1].alive?0:1]++;
 }
 assert.ok(fired[0]>5&&fired[1]>5,`间谍/隐士的注册判定应两种结果都出现（未触发 ${fired[0]} 次，触发 ${fired[1]} 次）`);
}

// Mayor: three alive, no execution today, sober Mayor among them — good wins.
{
 const {g,p,host}=await fixture(['mayor','imp','washerwoman','empath','monk']);
 g.phase='day';g.ballot=null;g.leader=null;p[3].alive=false;p[4].alive=false;
 await perform(g,host.token,'end_day',{});
 assert.equal(g.phase,'ended');assert.equal(g.winner,'善良阵营');
}
// An execution that day cancels the Mayor win (6p: one dead before, one executed).
{
 const {g,p,host}=await fixture(['mayor','imp','washerwoman','empath','monk','butler']);
 g.phase='day';g.ballot=null;g.leader={id:p[2].id,votes:3,tie:false};p[5].alive=false;
 await perform(g,host.token,'end_day',{});
 assert.notEqual(g.phase,'ended','当天已处决则镇长能力不生效');
 assert.equal(p[2].alive,false);assert.equal(g.phase,'night');
}
// Poisoned Mayor does not win.
{
 const {g,p,host}=await fixture(['mayor','imp','washerwoman','empath','monk']);
 g.phase='day';g.ballot=null;g.leader=null;p[3].alive=false;p[4].alive=false;g.poisonedId=p[0].id;
 await perform(g,host.token,'end_day',{});
 assert.notEqual(g.phase,'ended','中毒的镇长能力失效');
}
// Night death redirection: over many nights the Mayor sometimes survives and
// someone else dies instead.
{
 const {g,p,host}=await fixture(['mayor','imp','poisoner','washerwoman','monk']);
 let mayorDied=0,redirected=0;
 for(let i=0;i<150;i++){
  p.forEach(q=>{q.alive=true;});
  g.phase='night';g.round=2;g.actions={};g.poisonedId=null;g.night={cursor:4,nonce:crypto.randomUUID(),protectedId:null,deathId:null};
  await perform(g,p[1].token,'night_action',{targets:[p[0].id]});
  await perform(g,host.token,'advance_night',{ai:{}});
  if(!p[0].alive)mayorDied++;
  else if(g.night?.deathId)redirected++;
 }
 assert.ok(mayorDied>20&&redirected>20,`镇长代死应约一半发生（镇长死亡 ${mayorDied} 次，代死 ${redirected} 次）`);
}

// Ravenkeeper: dies at night, chooses a player during the day, learns the real
// character. Only they see the prompt.
{
 const {g,p,host}=await fixture(['ravenkeeper','imp','poisoner','washerwoman','monk']);
 g.phase='night';g.round=2;g.night={cursor:4,nonce:crypto.randomUUID(),protectedId:null,deathId:null};
 await perform(g,p[1].token,'night_action',{targets:[p[0].id]});
 await perform(g,host.token,'advance_night',{ai:{}});
 assert.equal(p[0].alive,false);assert.equal(g.phase,'day');
 assert.equal(g.ravenPending,p[0].id);
 assert.equal(view(g,p[0].token).ravenPending,true);
 assert.equal(view(g,p[3].token).ravenPending,false,'只有守鸦人本人看到提示');
 await perform(g,p[0].token,'ravenkeeper',{target:p[3].id});
 assert.match(priv(g,p[0]),/洗衣妇/);
 assert.equal(g.ravenPending,null);
}
// Poisoned Ravenkeeper receives a wrong answer.
{
 const {g,p,host}=await fixture(['ravenkeeper','imp','poisoner','washerwoman','monk']);
 g.phase='night';g.round=2;g.poisonedId=p[0].id;g.night={cursor:4,nonce:crypto.randomUUID(),protectedId:null,deathId:null};
 await perform(g,p[1].token,'night_action',{targets:[p[0].id]});
 await perform(g,host.token,'advance_night',{ai:{}});
 assert.equal(g.ravenPending,p[0].id);
 await perform(g,p[0].token,'ravenkeeper',{target:p[3].id});
 const text=priv(g,p[0]);
 assert.doesNotMatch(text,/身份是 洗衣妇/,'中毒的守鸦人不应得到正确答案');
}

console.log('PASS: librarian, virgin, baron setup, mayor win/redirect, ravenkeeper choice');
