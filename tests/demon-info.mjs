import assert from 'node:assert/strict';
import {newGame,joinGame,perform,view,ROLE_INFO,synthesizePublicVoice} from '../server-dist/game.js';

const goodRoles=new Set(['washerwoman','investigator','librarian','chef','empath','fortune','monk','soldier','undertaker','slayer','ravenkeeper','virgin','mayor','butler','drunk','recluse','saint']);
for(const n of [5,6,7,8,9])for(let run=0;run<100;run++){
 const {g,p:host}=newGame('ABC234','P0');for(let i=1;i<n;i++)joinGame(g,`P${i}`);await perform(g,host.token,'start',{});
 const demon=g.players.find(p=>['imp','fanggu','nodashii'].includes(p.role));const minion=g.players.find(p=>['poisoner','spy','scarlet','baron'].includes(p.role));assert.ok(demon&&minion);
 const demonNotes=view(g,demon.token).privateEvents;const minionNotes=view(g,minion.token).privateEvents;
 if(n<7){assert.deepEqual(demonNotes,[]);assert.deepEqual(minionNotes,[]);}
 else{
  assert.equal(demonNotes.length,2);assert.equal(minionNotes.length,1);
  assert.equal(demonNotes[0].text,`你的爪牙玩家是：${minion.name}。`);assert.equal(minionNotes[0].text,`恶魔玩家是：${demon.name}。`);
  const line=demonNotes[1].text;assert.ok(line.startsWith('不在场的善良角色（可用于伪装）：'));
  const names=line.split('：')[1].replace(/。$/,'').split('、');assert.equal(names.length,3);assert.equal(new Set(names).size,3);
  const actual=new Set(g.players.flatMap(p=>[p.role,p.drunkRole]).filter(Boolean));
  for(const name of names){const role=Object.keys(ROLE_INFO).find(r=>ROLE_INFO[r].name===name);assert.ok(role&&goodRoles.has(role));assert.ok(!actual.has(role));}
  for(const p of g.players.filter(p=>p!==demon)){const json=JSON.stringify(view(g,p.token));assert.ok(!json.includes(line));for(const name of names)assert.ok(!json.includes(`不在场的善良角色（可用于伪装）：${name}`));}
  assert.ok(!JSON.stringify(g.events).includes('不在场的善良角色'));
  await assert.rejects(()=>synthesizePublicVoice(g,host.token,demonNotes[1].id,{key:'mock-key-123',region:'aliyun'},'Cherry'),/公开事件不存在|只有房主/);
  // A Demon can choose to share the information privately once day starts.
  g.phase='day';await perform(g,demon.token,'chat',{to:minion.id,text:`安全伪装：${names.join('、')}`});
  assert.equal(view(g,minion.token).messages.at(-1).text,`安全伪装：${names.join('、')}`);
  assert.equal(view(g,g.players.find(p=>p!==demon&&p!==minion).token).messages.length,0);
 }
}
// Even in a small game, a Spy may see the Grimoire via their own role ability.
let spyTested=false;
for(let run=0;run<100&&!spyTested;run++){
 const {g,p:host}=newGame('ABC234','H');for(let i=1;i<5;i++)joinGame(g,`S${i}`);await perform(g,host.token,'start',{});
 const spy=g.players.find(p=>p.role==='spy');if(!spy)continue;spyTested=true;
 await perform(g,host.token,'advance_night',{});assert.ok(view(g,spy.token).privateEvents.some(x=>x.text.startsWith('魔典：')));
}
assert.ok(spyTested);
console.log('PASS: first-night Demon bluffs and Minion information, 5–6 player rules, private sharing, public/TTS isolation, Spy exception.');
