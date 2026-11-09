import assert from 'node:assert/strict';
import {newGame,joinGame,perform,view,baseComposition,ROLE_CATALOG,ROLE_INFO} from '../server-dist/game.js';

// 1) The guide quotes the default seating chart for every legal head count, and the
//    Townsfolk slot always absorbs the remainder (5–9 players, one Minion, one Demon).
{
 const expect={5:[3,0],6:[3,1],7:[4,1],8:[5,1],9:[5,2]};
 for(const [n,[townsfolk,outsiders]] of Object.entries(expect)){
  const c=baseComposition(Number(n));
  assert.equal(c.townsfolk,townsfolk,`${n} 人局镇民数`);
  assert.equal(c.outsiders,outsiders,`${n} 人局外来者数`);
  assert.equal(c.minions,1);assert.equal(c.demons,1);
  assert.equal(c.townsfolk+c.outsiders+c.minions+c.demons,Number(n),'基础配置必须刚好坐满');
  assert.equal(c.evilKnows,Number(n)>=7,`${n} 人局首夜是否互认`);
 }
}

// 2) The catalogue is grouped into the four classes, covers every role exactly once and
//    never drifts from ROLE_INFO (this is what the rules page renders).
{
 assert.equal(ROLE_CATALOG.length,Object.keys(ROLE_INFO).length);
 assert.deepEqual(new Set(ROLE_CATALOG.map(r=>r.key)),new Set(Object.keys(ROLE_INFO)));
 const by=(c)=>ROLE_CATALOG.filter(r=>r.category===c);
 assert.deepEqual([by('镇民').length,by('外来者').length,by('爪牙').length,by('恶魔').length],[13,4,4,3]);
 for(const r of ROLE_CATALOG){
  assert.equal(r.name,ROLE_INFO[r.key].name);
  assert.equal(r.description,ROLE_INFO[r.key].description);
  assert.equal(r.team,ROLE_INFO[r.key].team);
 }
 // Spot-check the classes rather than trusting the counts alone.
 assert.equal(by('恶魔').find(r=>r.key==='fanggu')?.name,'方古');
 assert.equal(by('外来者').find(r=>r.key==='drunk')?.team,'善良');
 assert.equal(by('爪牙').find(r=>r.key==='baron')?.team,'邪恶');
 assert.ok(by('镇民').every(r=>r.team==='善良'));
}

// 3) The room view always reports the *default* chart, even when the deal bends it: a
//    Baron adds two Outsiders, yet a 7-player room must still read "1 outsider".
{
 let found=null;
 for(let attempt=0;attempt<120&&!found;attempt++){
  const {g,p:host}=newGame('ABC234','P0');for(let i=1;i<7;i++)joinGame(g,`P${i}`);
  await perform(g,host.token,'start',{});
  // Baron only: a Fang Gu deal adds one more Outsider and is covered elsewhere.
  if(g.players.some(p=>p.role==='baron')&&!g.players.some(p=>p.role==='fanggu'))found={g,host};
 }
 assert.ok(found,'七人局应当能抽到男爵');
 const {g,host}=found;
 const outsiderRoles=['butler','drunk','recluse','saint'];
 const actual=g.players.filter(p=>outsiderRoles.includes(p.role)).length;
 assert.equal(actual,3,'男爵在场：1 基础 + 2 额外 = 3 名外来者');
 const v=view(g,host.token);
 assert.deepEqual(v.composition,{players:7,townsfolk:4,outsiders:1,minions:1,demons:1,evilKnows:true});
 assert.notEqual(v.composition.outsiders,actual,'说明里显示的是默认人数，不是实际人数');
 // The card must never leak the real deal either way.
 assert.ok(!JSON.stringify(v.composition).includes('baron'));
}

// 4) 5–6 player rooms advertise "no first-night recognition", and the deal agrees:
//    minions learn nothing about the Demon before day one.
{
 for(const n of [5,6]){
  const {g,p:host}=newGame('ABC234','P0');for(let i=1;i<n;i++)joinGame(g,`P${i}`);
  await perform(g,host.token,'start',{});
  const demon=g.players.find(p=>['imp','fanggu','nodashii'].includes(p.role));
  const minion=g.players.find(p=>['poisoner','spy','scarlet','baron'].includes(p.role));
  assert.ok(demon&&minion);
  assert.equal(view(g,demon.token).composition.evilKnows,false);
  assert.ok(!(view(g,minion.token).privateEvents||[]).some(e=>e.text.includes(demon.name)),`${n} 人局爪牙不应得知恶魔`);
  assert.ok(!(view(g,demon.token).privateEvents||[]).some(e=>e.text.includes(minion.name)),`${n} 人局恶魔不应得知爪牙`);
 }
}
console.log('PASS: rules guide quotes the default chart per head count (Baron/Fang Gu ignored), groups all 24 roles into 镇民/外来者/爪牙/恶魔, and matches first-night recognition rules');
