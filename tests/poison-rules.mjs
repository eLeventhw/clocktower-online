import assert from 'node:assert/strict';
import {newGame,joinGame,perform,view,isPoisoned,nodashiiPoison,POISON_FALSE_CHANCE} from '../server-dist/game.js';

async function fixture(roles){
 const {g,p:host}=newGame('ABC234','P0');for(let i=1;i<roles.length;i++)joinGame(g,`P${i}`);await perform(g,host.token,'start',{});
 g.players.forEach((q,i)=>{q.role=roles[i];q.drunkRole=null;q.alive=true;q.usedSlayer=false;q.ghostVote=true;});
 g.events=[];g.privateEvents={};g.actions={};g.poisonedId=null;g.butlerMasterId=null;g.fangguMoved=undefined;g.phase='night';g.round=2;
 g.night={cursor:0,nonce:crypto.randomUUID(),protectedId:null,deathId:null};g.redHerringId=null;g.virginUsed=undefined;
 return {g,p:g.players,host};
}
const lastNote=(g,who)=>(g.privateEvents[who.id]||[]).at(-1)?.text||'';

// 1) The red herring is a fixed good player who reads as a Demon to the Fortune Teller,
//    is never exposed in any player's view, and disappears in rooms started before it.
{
 const {g,p,host}=await fixture(['fortune','imp','monk','poisoner','soldier','butler']);
 const herring=p[2];g.redHerringId=herring.id;g.night.cursor=7;g.actions[p[0].id]=[p[1].id,herring.id];
 await perform(g,host.token,'advance_night',{});
 assert.match(lastNote(g,p[0]),/存在恶魔：是/,'红鲱鱼按恶魔登记');
 assert.ok(view(g,p[5].token).players.every(q=>!(q.id===herring.id&&'redHerring' in q)));
 assert.ok(!JSON.stringify(view(g,p[5].token)).includes('redHerring'));
 assert.equal(g.redHerringId,herring.id,'红鲱鱼整局固定');
 // Once the story ends the herring is named on that player — and only that player.
 g.phase='ended';g.winner='善良阵营';
 const end=view(g,p[5].token);
 assert.equal(end.redHerring,herring.name);
 assert.deepEqual(end.players.filter(q=>q.redHerring).map(q=>q.name),[herring.name]);
 assert.deepEqual(view(g,p[1].token).players.filter(q=>q.redHerring).map(q=>q.name),[herring.name],'所有人都看到同一名红鲱鱼');
 // A fresh story clears it, and lobby views do not even carry the field.
 await perform(g,host.token,'restart',{});
 assert.equal(g.redHerringId,null);
 assert.ok(!('redHerring' in view(g,host.token)));
 // Same pair without the red herring reads "no" (Imp not selected).
 const {g:g2,p:p2,host:h2}=await fixture(['fortune','imp','monk','poisoner','soldier','butler']);
 g2.night.cursor=7;g2.actions[p2[0].id]=[p2[2].id,p2[4].id];await perform(g2,h2.token,'advance_night',{});
 assert.match(lastNote(g2,p2[0]),/存在恶魔：否/,'没有红鲱鱼时同组好人不是恶魔');
}

// 2) Poisoned information is usually wrong (80%) but not always — never a fixed 50/50 and
//    never "always false".
{
 let wrong=0;const total=240;
 for(let i=0;i<total;i++){
  const {g,p,host}=await fixture(['empath','imp','poisoner','soldier','monk','butler']);
  // Neighbours of the Empath are the Imp (evil) and the Butler (good): the true answer is 1.
  g.poisonedId=p[0].id;g.night.cursor=6;await perform(g,host.token,'advance_night',{});
  const text=lastNote(g,p[0]);assert.match(text,/邪恶人数为 [012]/);
  if(!text.endsWith('1。'))wrong++;
 }
 const rate=wrong/total;
 assert.ok(rate>0.65&&rate<0.93,`中毒假信息比例应接近 ${POISON_FALSE_CHANCE}，实测 ${rate.toFixed(3)}`);
}

// 3) Multiple poison sources stay independent: killing the Poisoner ends only their own
//    poison, while the No Dashii aura keeps working.
{
 const {g,p}=await fixture(['nodashii','poisoner','monk','washerwoman','soldier','butler']);
 // Aura: nearest Townsfolk to the No Dashii on each side = Monk (right) and Soldier (left).
 assert.deepEqual(new Set(nodashiiPoison(g)),new Set([p[2].id,p[4].id]));
 g.poisonedId=p[3].id; // the Poisoner's own pick
 assert.ok(isPoisoned(g,p[3].id)&&isPoisoned(g,p[2].id));
 p[1].alive=false; // Poisoner dies: their pick ends at once
 assert.equal(isPoisoned(g,p[3].id),false,'投毒者死亡后其投毒立即结束');
 assert.equal(isPoisoned(g,p[2].id),true,'诺-达鲺的光环不受投毒者死亡影响');
 p[0].alive=false; // No Dashii dies too: nothing is left
 assert.equal(isPoisoned(g,p[2].id),false);
}

// 4) A poisoned Soldier loses their protection and can be killed by a working Demon.
{
 const {g,p,host}=await fixture(['soldier','imp','poisoner','monk','butler','empath']);
 g.poisonedId=p[0].id;g.night.cursor=4;g.actions[p[1].id]=[p[0].id];
 await perform(g,host.token,'advance_night',{});
 assert.equal(p[0].alive,false,'中毒的士兵无法抵御恶魔袭击');
}

// 5) A poisoned Slayer's shot fails but is still spent — even after the poison ends.
{
 const {g,p,host}=await fixture(['slayer','imp','poisoner','monk','butler','empath']);
 g.phase='day';g.ballot=null;g.poisonedId=p[0].id;
 await perform(g,p[0].token,'slayer',{target:p[1].id});
 assert.equal(p[1].alive,true,'中毒的杀手开枪无效');
 assert.equal(p[0].usedSlayer,true,'机会仍然消耗');
 g.poisonedId=null;
 await assert.rejects(()=>perform(g,p[0].token,'slayer',{target:p[1].id}),/本日你已经宣称/);
}

// 6) A poisoned Saint executed by the town does not hand evil the game.
{
 const {g,p,host}=await fixture(['saint','imp','poisoner','monk','butler','empath']);
 g.phase='day';g.ballot=null;g.poisonedId=p[0].id;g.leader={id:p[0].id,votes:4,tie:false};
 await perform(g,host.token,'end_day',{});
 assert.equal(p[0].alive,false);
 assert.equal(g.winner,null,'中毒的圣徒能力不生效');
}

// 7) A poisoned Virgin still spends her once-per-game chance.
{
 const {g,p}=await fixture(['virgin','imp','poisoner','monk','butler','empath']);
 g.phase='day';g.ballot=null;g.poisonedId=p[0].id;
 await perform(g,p[3].token,'nominate',{target:p[0].id});
 assert.equal(p[3].alive,true,'中毒的贞洁者不触发');
 assert.equal(g.virginUsed,true,'首次机会仍然消耗');
}

// 8) A poisoned Spy still sees a grimoire — it is just not guaranteed true, and there is
//    no "the grimoire is blurry" tell that would expose the poison.
{
 let sawWrong=0;
 for(let i=0;i<40;i++){
  const {g,p,host}=await fixture(['spy','imp','poisoner','monk','butler','empath']);
  g.poisonedId=p[0].id;g.night.cursor=2;await perform(g,host.token,'advance_night',{});
  const text=lastNote(g,p[0]);
  assert.match(text,/魔典：/);assert.ok(!text.includes('模糊'),'不能用模糊提示暴露中毒');
  if(!text.includes('（间谍')||!text.includes('（共情者'))sawWrong++;
 }
 assert.ok(sawWrong>0,'中毒的间谍偶尔会看到错误身份');
}

// 9) A Doctor-free check: poison never changes role or team.
{
 const {g,p}=await fixture(['soldier','imp','poisoner','monk','butler','empath']);
 g.poisonedId=p[0].id;
 assert.equal(p[0].role,'soldier');assert.equal(view(g,p[0].token).me.roleKey,'soldier');
}

console.log('PASS: red herring, 80% poisoned misinformation, independent poison sources, Poisoner death, Soldier/Slayer/Saint/Virgin/Spy poison interactions');
