import assert from 'node:assert/strict';
import {newGame,joinGame,perform,view,nodashiiPoison} from '../server-dist/game.js';

async function fixture(roles){
 const {g,p:host}=newGame('ABC234','P0');for(let i=1;i<roles.length;i++)joinGame(g,`P${i}`);await perform(g,host.token,'start',{});
 g.players.forEach((p,i)=>{p.role=roles[i];p.drunkRole=null;p.alive=true;p.usedSlayer=false;p.ghostVote=true;});g.events=[];g.privateEvents={};g.actions={};g.poisonedId=null;g.butlerMasterId=null;g.fangguMoved=undefined;g.phase='night';g.round=1;g.night={cursor:0,nonce:crypto.randomUUID(),protectedId:null,deathId:null};
 return {g,p:g.players,host};
}
const priv=(g,who)=>(g.privateEvents[who.id]||[]).map(e=>e.text).join('\n');
function night2(g){g.phase='night';g.round=2;g.actions={};g.poisonedId=null;g.night={cursor:4,nonce:crypto.randomUUID(),protectedId:null,deathId:null};}

// Fang Gu: the first Outsider its kill would take becomes an evil, LIVING Fang Gu;
// the demon dies in their place. A second Outsider kill is a normal death.
{
 const {g,p,host}=await fixture(['fanggu','poisoner','butler','washerwoman','monk']);
 night2(g);
 await perform(g,p[0].token,'night_action',{targets:[p[2].id]});
 await perform(g,host.token,'advance_night',{ai:{}});
 assert.equal(p[0].alive,false,'原方古代替外来者死亡');
 assert.equal(p[2].alive,true,'被选中的外来者存活');
 assert.equal(p[2].role,'fanggu','外来者变成方古');
 assert.equal(g.fangguMoved,true);
 assert.equal(g.night.deathId,p[0].id);
 assert.equal(g.phase,'day');
 // next night the new Fang Gu kills normally, even another Outsider-like target
 night2(g);
 await perform(g,p[2].token,'night_action',{targets:[p[3].id]});
 await perform(g,host.token,'advance_night',{ai:{}});
 assert.equal(p[3].alive,false,'转移后再次袭击按正常死亡结算');
 // killing the new Fang Gu ends the game for good
 g.phase='day';g.ballot=null;g.leader={id:p[2].id,votes:3,tie:false};
 await perform(g,host.token,'end_day',{});
 assert.equal(g.phase,'ended');assert.equal(g.winner,'善良阵营','新的方古也是恶魔，死亡则善良获胜');
}
// Monk protection prevents the kill, so no transfer happens either.
{
 const {g,p,host}=await fixture(['fanggu','poisoner','monk','butler','washerwoman']);
 night2(g);g.night.cursor=0; // walk LATER order: poisoner -> monk -> ... -> demon
 await perform(g,p[1].token,'night_action',{targets:[p[4].id]});
 await perform(g,host.token,'advance_night',{ai:{}});
 await perform(g,p[2].token,'night_action',{targets:[p[3].id]});
 await perform(g,host.token,'advance_night',{ai:{}});
 await perform(g,p[0].token,'night_action',{targets:[p[3].id]});
 await perform(g,host.token,'advance_night',{ai:{}});
 assert.equal(p[3].alive,true,'受保护的外来者不死');
 assert.equal(g.fangguMoved,undefined,'保护使击杀失败，转移不触发');
 assert.equal(p[0].alive,true,'方古也不死');
}
// Fang Gu dies by execution before any transfer: no demon alive, good wins.
{
 const {g,p,host}=await fixture(['fanggu','poisoner','washerwoman','empath','monk']);
 g.phase='day';g.ballot=null;g.leader={id:p[0].id,votes:3,tie:false};
 await perform(g,host.token,'end_day',{});
 assert.equal(g.phase,'ended');assert.equal(g.winner,'善良阵营');
}
// No Dashii poisons its two nearest Townsfolk neighbours: skips Outsiders and
// Minions, dead Townsfolk still count; the aura dies with the demon.
{
 const {g,p}=await fixture(['nodashii','poisoner','washerwoman','butler','empath','saint','virgin']);
 const ids=nodashiiPoison(g).map(id=>g.players.find(q=>q.id===id).name);
 assert.deepEqual(ids.sort(),['P2','P6'],'左右最近的镇民中毒，跳过投毒者与管家');
 // a dead Townsfolk still counts as a neighbour — the aura does not move
 p[2].alive=false;
 const ids2=nodashiiPoison(g).map(id=>g.players.find(q=>q.id===id).name);
 assert.deepEqual(ids2.sort(),['P2','P6'],'死亡镇民仍然算，光环不移动');
 // demon dies -> aura ends
 p[0].alive=false;
 assert.deepEqual(nodashiiPoison(g),[]);
}
// No Dashii kill is a normal demon kill (with the Mayor redirect still applying).
{
 const {g,p,host}=await fixture(['nodashii','poisoner','washerwoman','empath','monk']);
 night2(g);
 await perform(g,p[0].token,'night_action',{targets:[p[2].id]});
 await perform(g,host.token,'advance_night',{ai:{}});
 assert.equal(p[2].alive,false);
 assert.equal(g.night.deathId,p[2].id);
}

console.log('PASS: fanggu transfer/protection/win, nodashii aura and kill');
