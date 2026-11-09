// Server-side rules for the 5–9 player introductory script.
// Private identities, the grimoire and player tokens never appear in public views.
export type Role = 'washerwoman'|'investigator'|'librarian'|'chef'|'empath'|'fortune'|'monk'|'soldier'|'undertaker'|'slayer'|'ravenkeeper'|'virgin'|'mayor'|'poisoner'|'spy'|'scarlet'|'baron'|'imp'|'fanggu'|'nodashii'|'butler'|'drunk'|'recluse'|'saint';
export type Player = { id:string; token:string; name:string; seat:number; role:Role|null; alive:boolean; ghostVote:boolean; usedSlayer:boolean; drunkRole?:Role|null };
type VoiceAttachment = {url?:string;data?:string;mime?:string;expiresAt:number};
type Notice = {id:string;text:string;at:number;voice?:VoiceAttachment};
type ChatMessage = {id:string;from:string;to:string|null;text:string;at:number;groupId?:string;audience?:string[]};
type ChatGroup = {id:string;name:string;members:string[];createdAt:number};
type NightState = {cursor:number; nonce:string; protectedId:string|null; deathId:string|null};
// Day timing: host-adjustable, persisted per room so a refresh never resets the clock.
export type Settings = {speechSeconds:number; discussionMinutes:number; whisperMinutes:number};
export const DEFAULT_SETTINGS:Settings = {speechSeconds:120, discussionMinutes:10, whisperMinutes:8};
// A nomination is a three-beat scene: the nominator speaks, the nominee answers, and only
// then does the table vote. Fifteen seconds is enough to raise a hand, short enough that
// a silent table resolves instead of stalling; anyone who misses it counts as "no".
export const NOMINATION_VOTE_SECONDS=15;
export type VoteRecord = {nomineeId:string;nominee:string;nominator:string;votes:number;threshold:number;voters:string[]};
export type HistoryEntry = {day:number; nightDeaths:string[]; nominations:VoteRecord[]; executed:string|null};
export type Game = {
  code:string; hostId:string; phase:'lobby'|'night'|'day'|'ended'; round:number;
  players:Player[]; actions:Record<string,string[]>; poisonedId:string|null;
  events:Notice[]; privateEvents:Record<string,Notice[]>;
  messages:ChatMessage[];
  chatGroups?:ChatGroup[];chatActivity?:Notice[];chatActivityKeys?:Record<string,string>;
  // One public ability claim per player per day (optional anti-spam rule). Optional
  // so rooms saved before this field still load fine.
  publicClaims?:Record<string,string>;
  // A nomination runs as a short debate before the tally: the nominator states the case,
  // the nominee answers, then the table gets a 15-second vote. `stage`/`endsAt` are
  // optional so ballots written by an older build still load as a plain open vote.
  ballot:null|{nominator:string;nominee:string;votes:Record<string,boolean>;stage?:'accuse'|'defense'|'vote';endsAt?:number|null};
  nominated:string[]; nominators:string[]; leader:null|{id:string;votes:number;tie:boolean};
  virginUsed?:boolean; ravenPending?:string|null; ravenPoisoned?:boolean; fangguMoved?:boolean;
  // Full per-day nomination tally for the "今日提名榜单" UI. Optional so rooms
  // saved before this field was introduced still load without migration.
  nominationLog?:VoteRecord[];
  // Post-game review: one entry per day, with the night deaths, every nomination and
  // who voted yes. Optional so old rooms load unchanged.
  history?:HistoryEntry[];
  settings?:Settings; redHerringId?:string|null;
  // Structured day: whispers → speeches in seat order → free discussion (nominations)
  // → settlement. `dayFlow` marks rooms dealt by the whisper-first timeline; rooms from
  // an older build keep the stage machine they were dealt with.
  dayStage?:'whisper'|'speech'|'discussion'|'vote'; dayFlow?:number; speakerId?:string|null; discussionOver?:boolean;
  speechQueue?:string[]; speechIndex?:number; speechEndsAt?:number|null;
  discussionEndsAt?:number|null; whisperEndsAt?:number|null;
  readyDay:string[]; lastExecuted:string|null; winner:string|null; agent:string;
  rulesVersion?:number; night?:NightState; pendingDemonId?:string|null; butlerMasterId?:string|null;
};
export const ROLE_INFO:Record<Role,{name:string;team:string;description:string}>={
  washerwoman:{name:'洗衣妇',team:'善良',description:'首夜得知两人中有一位是指定的镇民。'},
  investigator:{name:'调查员',team:'善良',description:'首夜得知两人中有一位是指定的爪牙。'},
  chef:{name:'厨师',team:'善良',description:'首夜得知座位相邻的邪恶玩家有多少对。'},
  empath:{name:'共情者',team:'善良',description:'每夜得知左右最近的存活玩家中有多少人是邪恶阵营。'},
  fortune:{name:'占卜师',team:'善良',description:'每夜选择两名不同玩家，得知其中是否有恶魔。开局会固定一名善良玩家作为红鲱鱼，被占卜时视为恶魔。'},
  monk:{name:'僧侣',team:'善良',description:'从第二夜起，每夜保护一名其他存活玩家免受恶魔袭击。'},
  soldier:{name:'士兵',team:'善良',description:'只要能力生效，你不会被恶魔的夜间袭击杀死。'},
  undertaker:{name:'送葬者',team:'善良',description:'第二夜起，如果白天有人被处决，得知其身份。'},
  slayer:{name:'杀手',team:'善良',description:'白天限一次公开选择一名存活玩家；若其为恶魔且能力生效，恶魔死亡。'},
  librarian:{name:'图书管理员',team:'善良',description:'首夜得知两人中有一位是指定的外来者；若场上没有外来者，你会得知这一点。'},
  ravenkeeper:{name:'守鸦人',team:'善良',description:'如果夜晚死亡，你可以醒来选择一名玩家，得知其角色。'},
  virgin:{name:'贞洁者',team:'善良',description:'第一次被提名时，如果提名者被判定为镇民，提名者立即被处决。无论是否触发，都只看第一次提名。'},
  mayor:{name:'镇长',team:'善良',description:'能力生效时，如果只剩三名玩家且当天无人被处决，善良阵营获胜；夜晚本应死亡时，可能由其他玩家代死。'},
  poisoner:{name:'投毒者',team:'邪恶',description:'每夜选择一人中毒，持续到下一夜开始；中毒者的能力可能失效或得到错误信息。'},
  spy:{name:'间谍',team:'邪恶',description:'每夜私下查看魔典；某些能力可能把你识别为善良。'},
  scarlet:{name:'红唇女郎',team:'邪恶',description:'恶魔死亡时若死亡前至少有 5 人存活且你的能力生效，你会成为小恶魔。'},
  baron:{name:'男爵',team:'邪恶',description:'游戏开始时，场上额外多两名外来者（相当于两名镇民位变为外来者）。'},
  imp:{name:'小恶魔',team:'邪恶',description:'从第二夜起，每夜选择一名其他存活玩家袭击。精简剧本不支持自杀传位。'},
  fanggu:{name:'方古',team:'邪恶',description:'从第二夜起，每夜选择一名玩家使其死亡。第一次成功杀死外来者时，方古自己死亡，该外来者变成邪恶的方古（整局仅一次）；开局多一名外来者。'},
  nodashii:{name:'诺-达鲺',team:'邪恶',description:'从第二夜起，每夜选择一名玩家使其死亡。它左右两侧最近的镇民持续中毒：跳过外来者和爪牙，已死亡的镇民仍然算。'},
  butler:{name:'管家',team:'善良',description:'每夜选择一名其他玩家为主人；你的能力生效时，白天只有主人投赞成票时你才能投赞成票。'},
  drunk:{name:'酒鬼',team:'善良',description:'你以为自己是一名镇民，实际上没有其能力。'},
  recluse:{name:'隐士',team:'善良',description:'你可能被能力识别为邪恶、爪牙或恶魔，即使已经死亡。'},
  saint:{name:'圣徒',team:'善良',description:'如果你被处决而死，且能力生效，你的阵营落败。'},
};
const GOOD:Role[]=['washerwoman','investigator','librarian','chef','empath','fortune','monk','soldier','undertaker','slayer','ravenkeeper','virgin','mayor'];
const MINIONS:Role[]=['poisoner','spy','scarlet','baron'];
const DEMONS:Role[]=['imp','fanggu','nodashii'];
const OUTSIDERS:Role[]=['butler','drunk','recluse','saint'];
const OUTSIDER_COUNT:Record<number,number>={5:0,6:1,7:1,8:1,9:2};
const FIRST:Role[]=['poisoner','spy','washerwoman','investigator','librarian','chef','empath','fortune','butler'];
const LATER:Role[]=['poisoner','monk','spy','scarlet','imp','undertaker','empath','fortune','butler'];
const TARGETED=new Set<Role>(['poisoner','monk','imp','fortune','butler']);
// The rules page lists characters by class, in the order the official sheet prints them.
// It is served from here so the guide can never drift away from the real role pool again.
export type RoleCategory='镇民'|'外来者'|'爪牙'|'恶魔';
export const ROLE_CATALOG:{key:Role;name:string;category:RoleCategory;team:string;description:string}[]=[...GOOD,...OUTSIDERS,...MINIONS,...DEMONS].map(key=>({key,name:ROLE_INFO[key].name,category:(GOOD.includes(key)?'镇民':OUTSIDERS.includes(key)?'外来者':MINIONS.includes(key)?'爪牙':'恶魔') as RoleCategory,team:ROLE_INFO[key].team,description:ROLE_INFO[key].description}));
// The default seating chart for a given head count — one Demon, one Minion, everything
// else split between Townsfolk and Outsiders. Setup abilities (Baron, Fang Gu) are
// deliberately ignored: those changes are a surprise, so the guide always quotes the
// base numbers, e.g. six players still reads "1 outsider" even when a Baron dealt three.
export function baseComposition(n:number){
 const outsiders=OUTSIDER_COUNT[n]??0;
 return {players:n,townsfolk:Math.max(n-2-outsiders,0),outsiders,minions:1,demons:1,evilKnows:n>=7};
}
const uid=()=>crypto.randomUUID();
export function randomToken(){const b=new Uint8Array(32);crypto.getRandomValues(b);return Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');}
function randomInt(n:number){const a=new Uint32Array(1);crypto.getRandomValues(a);return a[0]%n;}
function shuffle<T>(arr:T[]):T[]{const a=arr.slice();for(let i=a.length-1;i>0;i--){const j=randomInt(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;}
// Weighted pick: a role with weight 2 is twice as likely as one with weight 1.
function weightedPick(pool:Role[],weight:(r:Role)=>number):Role{const total=pool.reduce((s,r)=>s+weight(r),0);let x=randomInt(total);for(const r of pool){x-=weight(r);if(x<0)return r;}return pool[pool.length-1];}
function assert(c:unknown,msg:string):asserts c {if(!c)throw new Error(msg);}
function event(g:Game,text:string){g.events.push({id:uid(),text,at:Date.now()});g.events=g.events.slice(-100);}
function privateEvent(g:Game,id:string,text:string){(g.privateEvents[id]??=[]).push({id:uid(),text,at:Date.now()});g.privateEvents[id]=g.privateEvents[id].slice(-50);}
function pById(g:Game,id:string){return g.players.find(p=>p.id===id);}
function evil(p:Player){return p.role?ROLE_INFO[p.role].team==='邪恶':false;}
// Poison state is evaluated live instead of being a single stored flag, so that:
//   * a Poisoner who dies (or is themselves poisoned) stops poisoning immediately;
//   * the No Dashii aura and the Poisoner's pick coexist as independent sources, and
//     clearing one never clears the other.
// Old rooms (rulesVersion 1) keep the single-field behaviour they were dealt with.
function poisonerActive(g:Game){
  if(g.rulesVersion!==2)return true;
  const poisoners=g.players.filter(q=>q.role==='poisoner');
  // No Poisoner in play at all (older rooms, hand-built scenarios): keep the stored state.
  if(!poisoners.length)return true;
  const p=poisoners.find(q=>q.alive);
  if(!p)return false;
  // A Poisoner who poisoned themself, or who is inside the No Dashii aura, is poisoned
  // too — their ability fails, and with it their ongoing poison.
  if(g.poisonedId===p.id)return false;
  return !nodashiiPoison(g).includes(p.id);
}
export function isPoisoned(g:Game,id:string){
  if(nodashiiPoison(g).includes(id))return true;
  if(id!==g.poisonedId)return false;
  if(g.rulesVersion!==2)return true;
  // A Poisoner who drank their own poison is poisoned, even though their ability (and
  // therefore the poison they spread) has stopped working.
  if(pById(g,id)?.role==='poisoner')return true;
  return poisonerActive(g);
}
// The No Dashii's aura: its nearest Townsfolk neighbours on both sides, skipping
// Outsiders and Minions. Dead Townsfolk still count. A dead or poisoned No Dashii has
// no aura at all.
export function nodashiiPoison(g:Game):string[]{
  const d=g.players.find(p=>p.alive&&p.role==='nodashii'&&p.id!==g.poisonedId);
  if(!d)return [];
  const i=g.players.indexOf(d),n=g.players.length;
  const nearest=(dir:number)=>{for(let k=1;k<n;k++){const q=g.players[(i+dir*k+2*n)%n];if(q.role&&GOOD.includes(q.role))return q.id;}return null;};
  return [...new Set([nearest(1),nearest(-1)].filter((x):x is string=>!!x))];
}
// A living Drunk is shown a distinct out-of-play Townsfolk identity.
function apparentRole(p:Player):Role|null{return p.role==='drunk'?(p.drunkRole||null):p.role;}
function detectedEvil(g:Game,p:Player){if(!isPoisoned(g,p.id)&&(p.role==='spy'||p.role==='recluse'))return randomInt(2)===1;return evil(p);}
// The Fortune Teller's red herring always registers as a Demon, even when dead. It is
// picked once when the game starts and never shown to ordinary players.
function detectedDemon(g:Game,p:Player|undefined){
  if(!p)return false;
  if(g.redHerringId&&p.id===g.redHerringId)return true;
  if(p.role&&DEMONS.includes(p.role))return true;
  return p.role==='recluse'&&!isPoisoned(g,p.id)&&randomInt(2)===1;
}
function getActor(g:Game,token:string){const p=g.players.find(x=>x.token===token);assert(p,'身份凭证已失效，请重新加入房间');return p;}
function requireHost(g:Game,p:Player){assert(p.id===g.hostId,'只有房主可以执行此操作');}
function legacyActive(g:Game,p:Player){if(!p.alive)return false;if(p.role==='poisoner'||p.role==='fortune')return true;return (p.role==='monk'||p.role==='imp')&&g.round>1;}
function legacyEligible(g:Game){return g.players.filter(p=>legacyActive(g,p));}
function ordered(g:Game){return g.rulesVersion===2&&!!g.night;}
function orderOf(g:Game){return g.round===1?FIRST:LATER;}
function currentStage(g:Game){return g.night?orderOf(g)[g.night.cursor]:undefined;}
// The night-order slot labelled 'imp' is the generic demon slot: whichever demon is
// in play (Imp, Fang Gu or No Dashii) acts there.
function stageActor(g:Game,stage:Role|undefined){if(!stage)return undefined;if(stage==='imp')return g.players.find(p=>p.alive&&p.role&&DEMONS.includes(p.role));return g.players.find(p=>p.alive&&apparentRole(p)===stage);}
function stageMatches(g:Game,p:Player,stage:Role|undefined){return !!stage&&(stage==='imp'?!!p.role&&DEMONS.includes(p.role):stage===apparentRole(p));}
function needsAdvance(g:Game){if(!ordered(g)||g.phase!=='night')return false;const stage=currentStage(g);if(!stage)return true;const actor=stageActor(g,stage);return !actor||!TARGETED.has(stage)||!!g.actions[actor.id];}
// A submitted action can complete the current stage. Advancing inside the same request
// means the next player is prompted immediately instead of waiting for the host's poll —
// and it no longer depends on the host tab staying awake in the foreground.
async function autoAdvance(g:Game,config:AiConfig){
 if(!needsAdvance(g))return;
 try{await advanceNight(g,config);}catch{/* the host-side effect retries if this ever fails */}
}
function initNight(g:Game){g.actions={};g.night={cursor:0,nonce:uid(),protectedId:null,deathId:null};}
function publicAlive(g:Game,p:Player){return p.alive||(g.phase==='night'&&g.night?.deathId===p.id);}
function kill(g:Game,target:Player){
  if(!target.alive)return;
  const aliveBefore=g.players.filter(p=>p.alive).length;
  target.alive=false;
  if(target.role&&DEMONS.includes(target.role)&&aliveBefore>=5){
    const successor=g.players.find(p=>p.alive&&p.role==='scarlet'&&p.id!==g.poisonedId);
    if(successor){successor.role=target.role;g.pendingDemonId=successor.id;}
  }
}
// Official Mayor rule (confirmed with the user): a sober, unpoisoned Mayor has a
// 50% chance that a night death is redirected to another living player instead.
function mayorRedirect(g:Game,target:Player):Player{
  if(target.role!=='mayor'||isPoisoned(g,target.id)||randomInt(2)!==1)return target;
  const others=g.players.filter(p=>p.alive&&p.id!==target.id);
  return others.length?shuffle(others)[0]:target;
}
function checkWinner(g:Game){const living=g.players.filter(p=>p.alive);if(!living.some(p=>p.role&&DEMONS.includes(p.role))){g.phase='ended';g.winner='善良阵营';event(g,'恶魔已死亡。善良阵营获胜！');return true;}if(living.length<=2){g.phase='ended';g.winner='邪恶阵营';event(g,'存活玩家只剩两人。邪恶阵营获胜！');return true;}return false;}
export function newGame(code:string,name:string){const p:Player={id:uid(),token:randomToken(),name,seat:1,role:null,alive:true,ghostVote:true,usedSlayer:false};const g:Game={code,hostId:p.id,phase:'lobby',round:0,players:[p],actions:{},poisonedId:null,events:[],privateEvents:{},messages:[],ballot:null,nominated:[],nominators:[],leader:null,readyDay:[],nominationLog:[],history:[],lastExecuted:null,winner:null,agent:'未连接'};event(g,'房间已创建，等待玩家入座。');return {g,p};}
// Joining is open while the room waits in the lobby and again once a game has ended, so
// a finished table can take new guests without the host having to reset anything first.
export function joinGame(g:Game,name:string){assert(g.phase==='lobby'||g.phase==='ended','游戏已经开始，暂不能加入');assert(g.players.length<9,'房间已满（最多 9 人）');assert(!g.players.some(p=>p.name===name),'这个昵称已被占用');const seat=lowestFreeSeat(g);const p:Player={id:uid(),token:randomToken(),name,seat,role:null,alive:true,ghostVote:true,usedSlayer:false};g.players.push(p);event(g,`${name} 坐到了 ${seat} 号座位。`);return p;}
// Chair numbers stay stable while a game runs: a guest who leaves frees their chair,
// and the next arrival takes the lowest free one.
function lowestFreeSeat(g:Game){const taken=new Set(g.players.map(p=>p.seat));for(let i=1;i<=9;i++)if(!taken.has(i))return i;return g.players.length+1;}
// Wipe every trace of the finished story while keeping the room code and the seated
// players, so the next game starts from a clean table.
function resetRoom(g:Game){
 for(const q of g.players){q.role=null;q.drunkRole=null;q.alive=true;q.ghostVote=true;q.usedSlayer=false;}
 g.actions={};g.poisonedId=null;g.phase='lobby';g.round=0;g.night=undefined;g.rulesVersion=undefined;g.pendingDemonId=null;g.butlerMasterId=null;g.fangguMoved=undefined;
 g.ballot=null;g.nominated=[];g.nominators=[];g.leader=null;g.readyDay=[];g.nominationLog=[];g.history=[];g.lastExecuted=null;g.winner=null;
 g.publicClaims={};g.privateEvents={};g.chatActivity=undefined;g.chatActivityKeys=undefined;g.chatGroups=undefined;g.agent='未连接';
 g.virginUsed=undefined;g.ravenPending=null;g.ravenPoisoned=undefined;g.redHerringId=null;
 g.dayStage=undefined;g.speakerId=null;g.speechQueue=undefined;g.speechIndex=undefined;g.speechEndsAt=null;g.discussionEndsAt=null;g.whisperEndsAt=null;
 // A new story starts with an empty table: last game's chat would only confuse people.
 g.messages=[];g.events=[];
}
// After a game ends the host can park the room back in the lobby: same room code and
// seats, no identities, so guests come and go freely until the table is full again.
export function backToLobby(g:Game,p:Player){
 requireHost(g,p);assert(g.phase==='ended','本局尚未结束，不能回到大厅');
 resetRoom(g);event(g,'本局结束，已回到大厅。房主可以等新玩家加入，凑齐 5–9 人后开始新一局。');
}
// "再来一局": same room, same seats, same storyteller settings, a freshly dealt game.
export function rematch(g:Game,p:Player){
 requireHost(g,p);assert(g.phase==='ended','本局尚未结束，不能重新开局');
 assert(g.players.length>=5&&g.players.length<=9,'需要 5–9 名玩家才能开始');
 resetRoom(g);startGame(g);
}
// Guests may take their seat back in the lobby or once a game has ended; leaving mid-game
// would break the count, so that stays blocked until the story is over.
export function leaveGame(g:Game,p:Player){
 assert(g.phase==='lobby'||g.phase==='ended','游戏进行中不能退出，请等本局结束后再离开');
 g.players=g.players.filter(q=>q.id!==p.id);
 if(g.hostId===p.id&&g.players.length)g.hostId=g.players[0].id;
 event(g,`${p.name} 离开了房间。`);
}
// The host runs the lobby: a guest who joined by mistake (or a duplicate tab) can be seen
// off before the deal. Nobody carries a role yet, so removing them only frees a chair.
export function kickPlayer(g:Game,host:Player,targetId:unknown){
 requireHost(g,host);
 assert(g.phase==='lobby','只能请出还没开始的房间里的玩家');
 const id=typeof targetId==='string'?targetId:'';
 const target=g.players.find(q=>q.id===id);
 assert(target,'该玩家已经不在房间里');
 assert(target.id!==host.id,'房主不能请出自己，想离开请点「退出房间」');
 g.players=g.players.filter(q=>q.id!==target.id);
 // Whatever the guest left behind in the lobby (a whisper draft, a discussion group) goes
 // with them; the room code and everyone else's seat stay untouched.
 if(g.chatGroups)g.chatGroups=g.chatGroups.map(gr=>({...gr,members:gr.members.filter(m=>m!==target.id)})).filter(gr=>gr.members.length>1);
 if(g.messages)g.messages=g.messages.filter(m=>m.from!==target.id);
 if(g.privateEvents)delete g.privateEvents[target.id];
 event(g,`${target.name} 被房主请出了房间，${target.seat} 号座位空了出来。`);
 return target;
}
function startGame(g:Game){
  assert(g.phase==='lobby','游戏已经开始');assert(g.players.length>=5&&g.players.length<=9,'需要 5–9 名玩家才能开始');
  // The Baron needs room to breathe: without him 5–6 player games would drop to a
  // single Townsfolk (or none), so he only enters the minion pool at 7+ players —
  // and at reduced weight (1 vs 2 for each other minion) per design tuning.
  const minionPool=g.players.length>=7?MINIONS:MINIONS.filter(r=>r!=='baron');
  const minion=weightedPick(minionPool,r=>r==='baron'?1:2);const demon=weightedPick(DEMONS,()=>1);
  // The Baron adds two extra Outsiders and the Fang Gu one, replacing Townsfolk slots.
  // Never exceed the four Outsider characters, and always keep at least one Townsfolk.
  const outsiderCount=Math.min(OUTSIDER_COUNT[g.players.length]+(minion==='baron'?2:0)+(demon==='fanggu'?1:0),OUTSIDERS.length,g.players.length-3);const townCount=g.players.length-2-outsiderCount;
  const towns=shuffle<Role>(GOOD).slice(0,townCount);
  const outsiders=shuffle(OUTSIDERS).slice(0,outsiderCount);
  const roles=shuffle<Role>([demon,minion,...towns,...outsiders]);
  const drunkDisguise=shuffle(GOOD.filter(r=>!towns.includes(r)))[0];
  g.players.forEach((p,i)=>{p.role=roles[i];p.drunkRole=p.role==='drunk'?drunkDisguise:null;});g.butlerMasterId=null;g.phase='night';g.round=1;g.rulesVersion=2;g.pendingDemonId=null;g.agent='规则主持';initNight(g);
  // The red herring is fixed for the whole game and never revealed to ordinary players;
  // it only ever affects the Fortune Teller's "is there a Demon here?" reading.
  const goodSeats=g.players.filter(p=>p.role&&ROLE_INFO[p.role].team==='善良'&&p.role!=='fortune');
  g.redHerringId=(goodSeats.length?shuffle(goodSeats)[0]:undefined)?.id??null;
  g.settings={...DEFAULT_SETTINGS,...(g.settings||{})};g.history=[];
  event(g,'游戏开始。夜幕降临，请查看你的秘密身份。');
  // Standard first-night information is given only at 7+ players. The Spy may
  // separately learn the Grimoire through their own ability, even at 5–6.
  if(g.players.length>=7){
    const demon=g.players.find(p=>p.role&&DEMONS.includes(p.role));const minions=g.players.filter(p=>p.role&&MINIONS.includes(p.role));
    assert(demon&&minions.length===1,'无法生成首夜邪恶阵营信息');
    for(const minion of minions)privateEvent(g,minion.id,`恶魔玩家是：${demon.name}。`);
    privateEvent(g,demon.id,`你的爪牙玩家是：${minions.map(p=>p.name).join('、')}。`);
    // Avoid even the Drunk's assumed Townsfolk, so these are safe bluff choices.
    const occupied=new Set(g.players.flatMap(p=>[p.role,apparentRole(p)]).filter((r):r is Role=>!!r));
    const bluffs=shuffle<Role>([...GOOD,...OUTSIDERS].filter(r=>!occupied.has(r))).slice(0,3);
    assert(bluffs.length===3,'无法生成三个不在场的善良角色');
    privateEvent(g,demon.id,`不在场的善良角色（可用于伪装）：${bluffs.map(r=>ROLE_INFO[r].name).join('、')}。`);
  }
}
function submitAction(g:Game,p:Player,targets:unknown){
  assert(g.phase==='night','现在不是夜晚');
  const isOrdered=ordered(g);
  if(isOrdered){assert(stageMatches(g,p,currentStage(g))&&p.alive&&(TARGETED.has(apparentRole(p)!)||(p.role&&DEMONS.includes(p.role))),'还没有轮到你行动');assert(!g.actions[p.id],'本轮行动已经提交，请等待说书人');}
  else assert(legacyActive(g,p),'当前没有需要你提交的夜间行动');
  assert(Array.isArray(targets)&&targets.every(x=>typeof x==='string'),'行动目标无效');
  const role=apparentRole(p);const need=role==='fortune'?2:1;assert(targets.length===need&&new Set(targets).size===need,`请选择 ${need} 名不同玩家`);
  for(const id of targets){const target=pById(g,id);assert(target,'目标不存在');if(role==='monk'||(role&&DEMONS.includes(role)))assert(target.alive&&target.id!==p.id,'请选择其他存活玩家');if(role==='butler')assert(target.id!==p.id,'管家请选择其他玩家');}
  g.actions[p.id]=targets as string[];
}
export type AiConfig={key?:string;region?:string;model?:string;provider?:string;voiceKey?:string;speaker?:string};
const ENDPOINTS:Record<string,string>={aliyun:'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',singapore:'https://ap-southeast-1.maas.qwencloudapi.com/compatible-mode/v1/chat/completions',beijing:'https://cn-beijing.maas.qwencloudapi.com/compatible-mode/v1/chat/completions',virginia:'https://us-east-1.maas.qwencloudapi.com/compatible-mode/v1/chat/completions'};
// Volcengine Ark speaks the same OpenAI-compatible dialect as DashScope, so only the
// endpoint, the model identifier and the wording of the errors differ.
const ARK_ENDPOINT='https://ark.cn-beijing.volces.com/api/v3/chat/completions';
function isArk(config:AiConfig){return (config?.provider||'dashscope')==='ark';}
function chatEndpoint(config:AiConfig){if(isArk(config))return ARK_ENDPOINT;const endpoint=ENDPOINTS[config?.region||'aliyun'];assert(endpoint,'不支持此 API 地域');return endpoint;}
function chatModel(config:AiConfig){if(isArk(config)){const model=String(config?.model||'').trim();assert(model,'请填写有效的火山方舟模型 ID 或推理接入点 ID（ep-…）');return model;}return String(config?.model||'qwen-plus').trim();}
function aiLabel(config:AiConfig){return isArk(config)?'火山方舟':'Qwen';}
// A hanging model call used to stall the whole table (the night only finished after
// the request returned), so every model request is bounded.
const AI_TIMEOUT_MS=15000;
async function askAI(config:AiConfig,system:string,prompt:string){
 const label=aiLabel(config);
 const key=typeof config?.key==='string'?config.key.trim():'';
 assert(key.length>=8&&key.length<=500,`请填写有效的 ${label} API Key`);
 const endpoint=chatEndpoint(config);
 const model=chatModel(config);
 assert(/^[a-zA-Z0-9._-]{1,80}$/.test(model),'模型名称格式无效');
 const payload:any={model,messages:[{role:'system',content:system},{role:'user',content:prompt}],temperature:0.7,max_tokens:200,stream:false};
 const send=async(extra:any)=>{
  try{
   const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${key}`},body:JSON.stringify(extra?{...payload,...extra}:payload),signal:AbortSignal.timeout(AI_TIMEOUT_MS)});
   return {response,raw:await response.text()};
  }catch(e:any){
   if(e?.name==='TimeoutError'||e?.name==='AbortError')throw new Error(`${label} API 超过 ${Math.round(AI_TIMEOUT_MS/1000)} 秒未响应，已放弃本次旁白`);
   throw new Error(`无法连接 ${label} API，请检查地域和网络`);
  }
 };
 // Doubao seed-2.x reasons before it answers: a 60-character line took 17 seconds while
 // thinking is on. Turning it off brings the same line back in ~1.5s. A model that does
 // not know the switch rejects it with 400, so that case retries with a plain payload.
 let {response,raw}=await send(isArk(config)?{thinking:{type:'disabled'}}:null);
 if(!response.ok&&isArk(config)&&response.status===400&&/thinking/i.test(raw))({response,raw}=await send(null));
 if(!response.ok){
  let detail='';try{const e:any=JSON.parse(raw);detail=String(e?.error?.code||e?.error?.type||e?.error?.message||e?.code||'').replace(/\s+/g,' ').slice(0,60);}catch{}
  const hint=response.status===404?'；模型 ID 必须与控制台完全一致（例如 doubao-seed-2-1-lite-260915），或填推理接入点 ID（ep-…）':'';
  throw new Error(`${label} API 返回 ${response.status}${detail?`（${detail}）`:''}，请检查密钥、地域和模型名称${hint}`);
 }
 let j:any;try{j=JSON.parse(raw);}catch{throw new Error(`${label} 未返回有效内容`);}
 const output=j?.choices?.[0]?.message?.content;
 assert(typeof output==='string'&&output.trim(),`${label} 未返回有效内容`);
 return output.trim().slice(0,800);
}
// Host-facing connection check: proves the key, the region and the model ID before
// anyone spends a game on a broken configuration.
export async function probeAI(config:AiConfig){const sample=await askAI(config,'你是连通性检查助手。','只回复四个字：连接正常');return {provider:aiLabel(config),model:chatModel(config),sample:sample.slice(0,60)};}
// Every candidate carries a server-side truth flag. Nothing is considered "false" just
// because it differs from an earlier answer — each option is checked against the actual
// game state before the Storyteller is allowed to hand it out.
type InfoOption={text:string;truth:boolean};
type Info={player:Player;question:string;truth:string;options:InfoOption[];prefix:string};
// Tuning knob requested by the table: poisoned or drunk information is usually wrong,
// but never reliably so (official rules forbid a fixed 50/50 or "always false").
export const POISON_FALSE_CHANCE=0.8;
// Walk the table by chair number: seat order is the physical circle, and it can differ
// from join order once a freed seat has been reused.
function seatCircle(g:Game){return [...g.players].sort((a,b)=>a.seat-b.seat);}
function aliveNeighbors(g:Game,p:Player){const circle=seatCircle(g);const i=circle.indexOf(p),n=circle.length;let left:Player|undefined,right:Player|undefined;for(let d=1;d<n;d++){const x=circle[(i-d+n)%n];if(x.alive){left=x;break;}}for(let d=1;d<n;d++){const x=circle[(i+d)%n];if(x.alive){right=x;break;}}return [left,right].filter(Boolean) as Player[];}
// A poisoned or drunk ability still wakes the player and still hands over information on
// time: the only difference is that the answer is usually, not always, wrong. Model
// output never decides the rules — it may only pick among candidates validated here, and
// any failure falls back to the server's own choice.
async function deliverInfo(g:Game,x:Info,config:AiConfig){
  const fooled=isPoisoned(g,x.player.id)||x.player.role==='drunk';
  let answer=x.truth;
  if(fooled){
    // Rooms dealt before this rules version keep their original storyteller behaviour.
    if(g.rulesVersion!==2){
      privateEvent(g,x.player.id,`${x.prefix}${shuffle(x.options)[0].text}。`);
      return;
    }
    const wrong=x.options.filter(o=>!o.truth).map(o=>o.text);
    // Usually wrong, never reliably wrong: the server makes the rules call first, then the
    // model may only pick the wording among candidates that were already validated.
    const pickWrong=wrong.length>0&&randomInt(100)<Math.round(POISON_FALSE_CHANCE*100);
    answer=pickWrong?shuffle(wrong)[0]:x.truth;
    if(config?.key){
      try{
        const candidates=pickWrong?wrong:[x.truth];
        const raw=await askAI(config,'你是社交推理游戏的说书人助手。这个角色的能力已被干扰，请从候选信息中挑一条给出。只输出一个完整候选，不解释。',`第 ${g.round} 夜。问题：${x.question}。候选信息：${candidates.join(' | ')}。请选择一条。`);
        const found=candidates.find(o=>raw===o||raw.replace(/[。\s"“”]/g,'')===o.replace(/[。\s"“”]/g,''));
        if(found)answer=found;
        g.agent=aiLabel(config);
      }catch{/* a broken model never blocks the night: keep the server-side answer */}
    }
  }
  privateEvent(g,x.player.id,`${x.prefix}${answer}。`);
}
function infoPair(g:Game,p:Player,role:'washerwoman'|'investigator'|'librarian'):Info{
  const allOthers=g.players.filter(q=>q.id!==p.id);
  const pool=role==='washerwoman'?GOOD:role==='investigator'?MINIONS:OUTSIDERS;
  const label=role==='washerwoman'?'镇民':role==='investigator'?'爪牙':'外来者';
  const targets=allOthers.filter(q=>q.role&&pool.includes(q.role));
  if(role==='librarian'&&!targets.length){
    const pair=shuffle(allOthers).slice(0,2).map(q=>q.name).join('、');
    return {player:p,question:'场上是否有外来者',truth:'场上没有外来者',options:[{text:'场上没有外来者',truth:true},{text:`${pair} 中有一人是外来者`,truth:false}],prefix:'线索：'};
  }
  const chosen=shuffle(targets)[0];assert(chosen?.role,'无法生成首夜线索');
  const decoy=shuffle(allOthers.filter(q=>q.id!==chosen.id))[0];assert(decoy,'无法生成首夜线索');
  const pair=shuffle([chosen,decoy]).map(q=>q.name).join('、');
  const trueName=ROLE_INFO[chosen.role].name;
  // A wrong statement must be provably wrong: neither of the two players may really be
  // (or register as) that character.
  const taken=new Set([chosen.role,decoy.role,apparentRole(chosen),apparentRole(decoy)].filter((r):r is Role=>!!r));
  const fakeRoles=pool.filter(r=>!taken.has(r)&&r!=='spy'&&r!=='recluse');
  const wrong=shuffle(fakeRoles).slice(0,2).map(r=>`${pair} 中有一人是${ROLE_INFO[r].name}`);
  const truth=`${pair} 中有一人是${trueName}`;
  return {player:p,question:`两人中的${label}身份`,truth,options:[{text:truth,truth:true},...wrong.map(text=>({text,truth:false}))],prefix:'线索：'};
}
function roleInfo(g:Game,p:Player,stage:Role):Info|null{
  if(stage==='washerwoman'||stage==='investigator'||stage==='librarian')return infoPair(g,p,stage);
  if(stage==='chef'){
    // A Spy may register differently for this one calculation. Neighbours are chairs
    // around the table, so the circle must be walked in seat order, never join order
    // (a replaced chair can sit later in the array).
    const circle=seatCircle(g);
    const detected=new Map(circle.map(q=>[q.id,detectedEvil(g,q)]));let count=0;
    for(let i=0;i<circle.length;i++)if(detected.get(circle[i].id)&&detected.get(circle[(i+1)%circle.length].id))count++;
    const options=Array.from({length:Math.max(3,circle.length)},(_,i)=>({text:`${i} 对`,truth:i===count}));
    return {player:p,question:'座位相邻的邪恶玩家对数',truth:`${count} 对`,options,prefix:'座位相邻的邪恶玩家共有 '};
  }
  if(stage==='empath'){
    const count=aliveNeighbors(g,p).filter(q=>detectedEvil(g,q)).length;
    return {player:p,question:'两侧最近存活者中的邪恶人数',truth:String(count),options:[0,1,2].map(n=>({text:String(n),truth:n===count})),prefix:'左右最近的存活玩家中，邪恶人数为 '};
  }
  if(stage==='fortune'){
    const ids=g.actions[p.id]||[];const yes=ids.some(id=>detectedDemon(g,pById(g,id)));
    return {player:p,question:'所选两人是否包括恶魔',truth:yes?'是':'否',options:[{text:'是',truth:yes},{text:'否',truth:!yes}],prefix:`你选择的 ${ids.map(id=>pById(g,id)?.name).join('、')} 中存在恶魔：`};
  }
  if(stage==='undertaker'&&g.lastExecuted){
    const target=pById(g,g.lastExecuted);if(!target?.role)return null;
    // Undertaker reads how the executed player registers: an unpoisoned Spy or Recluse
    // may be shown as something else entirely.
    const poisoned=isPoisoned(g,target.id);
    const shown=!poisoned&&target.role==='spy'&&randomInt(2)===0?shuffle(GOOD)[0]:!poisoned&&target.role==='recluse'&&randomInt(2)===0?shuffle<Role>([...MINIONS,'imp'])[0]:target.role;
    const name=ROLE_INFO[shown].name;
    const others=Object.values(ROLE_INFO).map(r=>r.name).filter(n=>n!==name);
    const wrong=shuffle(others).slice(0,4).map(text=>({text,truth:false}));
    return {player:p,question:'昨日处决者的身份',truth:name,options:[{text:name,truth:true},...wrong],prefix:`昨日被处决的 ${target.name} 的身份是 `};
  }
  return null;
}
// The day runs in three beats, all host-adjustable: private whispers first (8 minutes by
// default, host may cut it short), then one speech per living player in seat order (2
// minutes each, the speaker or the host may cut it short), then free discussion (10
// minutes) with nominations open. When the discussion clock runs out the storyteller
// announces the end, but the table keeps accepting nominations; only the host ends the
// day, executing the current top vote — or, with no nomination at all, going to night.
// (Rooms dealt before dayFlow 2 still fall back to the old settlement stage.)
function daySettings(g:Game){const s={...DEFAULT_SETTINGS,...(g.settings||{})};s.speechSeconds=Math.min(600,Math.max(30,Math.round(Number(s.speechSeconds)||DEFAULT_SETTINGS.speechSeconds)));s.discussionMinutes=Math.min(60,Math.max(1,Math.round(Number(s.discussionMinutes)||DEFAULT_SETTINGS.discussionMinutes)));s.whisperMinutes=Math.min(60,Math.max(1,Math.round(Number(s.whisperMinutes)||DEFAULT_SETTINGS.whisperMinutes)));g.settings=s;return s;}
function beginDay(g:Game,nightDeaths:string[]){
  const settings=daySettings(g);const now=Date.now();
  g.actions={};g.phase='day';g.ballot=null;g.nominated=[];g.nominators=[];g.leader=null;g.readyDay=[];g.nominationLog=[];
  // Rooms created from this version on run the whisper-first day; older rooms keep the
  // timeline they were dealt with, so a redeploy never yanks the clock out from under a
  // table that is already talking.
  g.dayFlow=2;
  const queue=g.players.filter(p=>p.alive).sort((a,b)=>a.seat-b.seat).map(p=>p.id);
  g.speechQueue=queue;g.speechIndex=0;g.speakerId=null;g.speechEndsAt=null;g.discussionEndsAt=null;
  g.dayStage='whisper';g.whisperEndsAt=now+settings.whisperMinutes*60000;g.discussionOver=false;
  (g.history??=[]).push({day:g.round,nightDeaths,nominations:[],executed:null});
  event(g,`私聊时间开始，共 ${settings.whisperMinutes} 分钟，房主可以提前结束。之后按座位顺序发言，再进入自由讨论。`);
  checkWinner(g);
}
// Whispers done: hand the floor to the first living player in seat order. Kept separate
// from tick() because the host can start the speeches before the clock runs out.
function enterSpeech(g:Game,now=Date.now()){
  const settings=daySettings(g);const queue=g.speechQueue||[];
  g.whisperEndsAt=now;
  let i=0;while(i<queue.length&&!pById(g,queue[i])?.alive)i++;
  if(i<queue.length){
    g.dayStage='speech';g.speechIndex=i;g.speakerId=queue[i];g.speechEndsAt=now+settings.speechSeconds*1000;
    event(g,`私聊结束，开始按座位顺序发言，先从 ${pById(g,queue[i])?.name} 开始，每人最多 ${settings.speechSeconds} 秒。`);
  }else{
    g.dayStage='discussion';g.speakerId=null;g.speechEndsAt=null;g.discussionEndsAt=now+settings.discussionMinutes*60000;
    event(g,`私聊结束，进入自由讨论，共 ${settings.discussionMinutes} 分钟。自由讨论期间可以发起提名。`);
  }
}
// Moves the clock forward. Called on every room request and by the server's timer, so the
// table advances even when nobody is clicking.
export function tick(g:Game,now=Date.now()){
  if(g.phase!=='day')return false;
  let changed=false;const settings=daySettings(g);
  if(g.dayStage==='whisper'&&g.whisperEndsAt&&now>=g.whisperEndsAt){enterSpeech(g,now);changed=true;}
  while(g.dayStage==='speech'&&g.speechEndsAt&&now>=g.speechEndsAt){
    const queue=g.speechQueue||[];let i=(g.speechIndex??0)+1;
    while(i<queue.length&&!pById(g,queue[i])?.alive)i++;
    const finished=pById(g,g.speakerId||'')?.name;
    if(i<queue.length){
      g.speechIndex=i;g.speakerId=queue[i];g.speechEndsAt=now+settings.speechSeconds*1000;
      // A silent hand-over looks like the table froze; announce every timeout so the
      // change also reaches the voice channel as a storyteller reminder.
      event(g,`${finished||'上一位'} 的发言时间到了，轮到 ${pById(g,queue[i])?.name}（每人 ${settings.speechSeconds} 秒）。`);
    }
    else{g.dayStage='discussion';g.speakerId=null;g.speechEndsAt=null;g.discussionEndsAt=now+settings.discussionMinutes*60000;event(g,`顺序发言结束，进入自由讨论，共 ${settings.discussionMinutes} 分钟。自由讨论期间可以发起提名。`);}
    changed=true;
  }
  // An open ballot keeps the discussion alive even after its clock runs out: nobody
  // should lose the chance to vote because the timer expired mid-tally. In the new flow
  // the clock ending only means the storyteller announces it — nominations stay open
  // and the day ends when the host says so.
  if(g.dayStage==='discussion'&&!g.ballot&&g.discussionEndsAt&&now>=g.discussionEndsAt){
    g.discussionEndsAt=null;
    if(g.dayFlow===2){g.discussionOver=true;event(g,'说书人宣布：自由讨论结束。提名继续开放；如果没有人被提名，房主可以直接结束白天。');}
    else{g.dayStage='vote';event(g,'自由讨论结束。确认提名结果后，房主可以结束白天。');}
    changed=true;
  }
  // Voting is timed: once the nominee has answered, the table gets NOMINATION_VOTE_SECONDS.
  // The clock lives on the server, so a tab that goes quiet cannot hold the tally open;
  // a missing vote never lands in the "yes" pile, which makes silence a "no".
  if(g.ballot&&ballotStageOf(g.ballot)==='vote'&&g.ballot.endsAt&&now>=g.ballot.endsAt){
    closeBallot(g,true);changed=true;
  }
  return changed;
}
function endSpeech(g:Game,now=Date.now()){
  assert(g.phase==='day'&&g.dayStage==='speech','现在不在顺序发言阶段');
  g.speechEndsAt=now;tick(g,now);
}
function endDiscussion(g:Game,now=Date.now()){
  assert(g.phase==='day'&&(g.dayStage==='whisper'||g.dayStage==='speech'||g.dayStage==='discussion'),'现在不在讨论阶段');
  assert(!g.ballot,'请先结束当前投票');
  // Cutting the day short from the whisper stage still walks the table through the
  // speeches first; only an explicit cut from the discussion skips to settlement.
  if(g.dayStage==='whisper'){enterSpeech(g,now);return;}
  // In the new flow the host's cut ends the discussion clock wherever it is — even from
  // the speeches — and the storyteller announces it; nominations never close.
  if(g.dayFlow===2){g.dayStage='discussion';g.speakerId=null;g.speechEndsAt=null;g.discussionEndsAt=null;g.discussionOver=true;event(g,'房主宣布：自由讨论结束。提名继续开放；如果没有人被提名，房主可以直接结束白天。');return;}
  g.dayStage='vote';g.speakerId=null;g.speechEndsAt=null;g.discussionEndsAt=null;event(g,'房主结束了自由讨论。确认提名结果后，点「结束白天」结算。');
}
function updateSettings(g:Game,p:Player,body:any){
  requireHost(g,p);
  const next:Settings={...DEFAULT_SETTINGS,...(g.settings||{})};
  for(const [key,min,max] of [['speechSeconds',30,600],['discussionMinutes',1,60],['whisperMinutes',1,60]] as [keyof Settings,number,number][]){
    if(body?.[key]===undefined)continue;
    const value=Math.round(Number(body[key]));
    assert(Number.isFinite(value)&&value>=min&&value<=max,`${key==='speechSeconds'?'每人发言秒数':'分钟数'}须在 ${min}–${max} 之间`);
    next[key]=value;
  }
  g.settings=next;
  if(g.phase==='day'){
    // Apply immediately to the stage that is still running, so a host never has to wait
    // for the next beat before a new length takes effect.
    if(g.dayStage==='whisper')g.whisperEndsAt=Date.now()+next.whisperMinutes*60000;
    if(g.dayStage==='speech'&&g.speakerId)g.speechEndsAt=Date.now()+next.speechSeconds*1000;
    if(g.dayStage==='discussion'&&!g.discussionOver)g.discussionEndsAt=Date.now()+next.discussionMinutes*60000;
    if(g.dayFlow!==2&&g.whisperEndsAt&&Date.now()<g.whisperEndsAt)g.whisperEndsAt=Date.now()+next.whisperMinutes*60000;
  }
  event(g,`房主调整了讨论设置：私聊 ${next.whisperMinutes} 分钟，每人发言 ${next.speechSeconds} 秒，自由讨论 ${next.discussionMinutes} 分钟。`);
}
// Private chat is open during the whisper beat only. Rooms dealt by an older build keep
// the old timeline (a whisper clock running alongside the speeches).
function whisperOpen(g:Game){
  if(g.phase!=='day')return true;
  if(g.dayFlow===2)return g.dayStage==='whisper'&&(!g.whisperEndsAt||Date.now()<g.whisperEndsAt);
  return !g.whisperEndsAt||Date.now()<g.whisperEndsAt;
}
function endWhisper(g:Game,p:Player){
  requireHost(g,p);assert(g.phase==='day','私聊时间只在白天开放');
  if(g.dayFlow===2){assert(g.dayStage==='whisper','现在不在私聊环节');enterSpeech(g,Date.now());return;}
  g.whisperEndsAt=Date.now();event(g,'房主结束了本日的私聊时间。');
}
async function finishNight(g:Game,config:AiConfig){
  const death=g.night?.deathId?pById(g,g.night.deathId):undefined;
  if(death)event(g,`天亮了，${death.name} 在夜里死亡。`);else event(g,'天亮了。昨夜无人死亡。');
  // A Ravenkeeper killed at night wakes up and chooses a player to learn. The
  // choice happens during the following day so the night engine never blocks.
  if(death?.role==='ravenkeeper'){g.ravenPending=death.id;g.ravenPoisoned=isPoisoned(g,death.id);privateEvent(g,death.id,'守鸦人能力发动：你在今夜死去。请在白天选择一名玩家，得知其角色。');}
  // A night that takes the last townsfolk decides the game on the spot: the storyteller
  // only announces the winner. No new day is opened, so no whisper/discussion hand-off
  // and no daybreak narration follow the verdict.
  if(checkWinner(g))return;
  beginDay(g,death?[death.name]:[]);
  if(g.phase==='ended')return;
  if(config?.key){const publicContext=g.events.slice(-6).map(e=>e.text).join('\n');try{const narrative=await askAI(config,'你是中文悬疑桌游的说书人。只根据公开事件写一段不超过 60 字的气氛旁白。不编造新事件、角色、死亡、行动或获胜结果，不猜测身份，不给操作建议。',publicContext);event(g,`说书人：${narrative}`);g.agent=aiLabel(config);}catch{g.agent='规则主持';}}
}
async function advanceNight(g:Game,config:AiConfig){
  assert(g.phase==='night'&&ordered(g),'当前不能推进夜间顺序');const night=g.night!;
  while(night.cursor<orderOf(g).length){
    const stage=orderOf(g)[night.cursor];
    if(stage==='scarlet'){
      if(g.pendingDemonId){const successor=pById(g,g.pendingDemonId);if(successor?.alive&&successor.role&&DEMONS.includes(successor.role))privateEvent(g,successor.id,`你的身份变为${ROLE_INFO[successor.role].name}。今晚起你拥有它的恶魔能力。`);g.pendingDemonId=null;}
      night.cursor++;night.nonce=uid();continue;
    }
    const p=stageActor(g,stage);
    if(!p){night.cursor++;night.nonce=uid();continue;}
    if(TARGETED.has(stage)&&!g.actions[p.id])break;
    if(stage==='poisoner')g.poisonedId=isPoisoned(g,p.id)?null:g.actions[p.id][0];
    else if(stage==='monk')night.protectedId=isPoisoned(g,p.id)||p.role==='drunk'?null:g.actions[p.id][0];
    else if(stage==='butler')g.butlerMasterId=g.actions[p.id][0];
    else if(stage==='imp'){
      if(!isPoisoned(g,p.id)){const target=pById(g,g.actions[p.id][0]);
        if(target?.alive&&target.id!==night.protectedId&&!(target.role==='soldier'&&!isPoisoned(g,target.id))){
          const victim=mayorRedirect(g,target);
          // Fang Gu: the first Outsider this ability would kill becomes an evil,
          // living Fang Gu and the demon dies in their place — once per game.
          if(p.role==='fanggu'&&!g.fangguMoved&&victim.role&&OUTSIDERS.includes(victim.role)&&victim.id!==p.id){
            victim.role='fanggu';g.fangguMoved=true;p.alive=false;night.deathId=p.id;
            privateEvent(g,victim.id,'方古能力发动：你变成邪恶的方古。原方古代替你死亡，从今晚起由你继续袭击。');
          }else{kill(g,victim);night.deathId=victim.id;}
          if(g.players.filter(q=>q.alive).length<=2){night.cursor=orderOf(g).length;await finishNight(g,config);return;}
        }}
    }else if(stage==='spy'){
      // A poisoned Spy still sees a grimoire — it is simply not guaranteed to be true.
      // There is no "the grimoire is blurry" tell, which would expose the poison.
      const poisoned=isPoisoned(g,p.id);
      const rows=g.players.map(q=>{
        let role=q.role!;let note='';
        if(poisoned&&q.id!==p.id&&randomInt(3)===0){role=shuffle<Role>([...GOOD,...MINIONS,...OUTSIDERS,...DEMONS].filter(r=>r!==role))[0];note='';}
        return `${q.name}（${ROLE_INFO[role].name}${q.role==='drunk'&&q.drunkRole?`，自认为${ROLE_INFO[q.drunkRole].name}`:''}，${q.alive?'存活':'死亡'}${!poisoned&&isPoisoned(g,q.id)?'，中毒':''}${!poisoned&&q.id===night.protectedId?'，受保护':''}）${note}`;
      });
      privateEvent(g,p.id,`魔典：${rows.join('；')}。`);
    }else{const info=roleInfo(g,p,stage);if(info)await deliverInfo(g,info,config);}
    night.cursor++;night.nonce=uid();
  }
  if(night.cursor>=orderOf(g).length)await finishNight(g,config);
}
// Rooms that were already in progress before this update retain the previous simultaneous night flow.
async function resolveLegacyNight(g:Game,config:AiConfig){
  assert(g.phase==='night'&&!ordered(g),'现在不是旧版夜晚');const missing=legacyEligible(g).filter(p=>!g.actions[p.id]);assert(!missing.length,`还有 ${missing.length} 名玩家未完成夜间行动`);
  const poisoned=g.players.find(p=>p.alive&&p.role==='poisoner');g.poisonedId=poisoned?(g.actions[poisoned.id]?.[0]||null):null;
  const monk=g.players.find(p=>p.alive&&p.role==='monk');const protectedId=monk&&monk.id!==g.poisonedId?g.actions[monk.id]?.[0]:null;
  const imp=g.players.find(p=>p.alive&&p.role==='imp');let death:Player|undefined;
  if(g.round>1&&imp&&imp.id!==g.poisonedId){const target=pById(g,g.actions[imp.id]?.[0]);if(target&&target.alive&&target.id!==protectedId&&!(target.role==='soldier'&&target.id!==g.poisonedId)){kill(g,target);death=target;}}
  for(const p of g.players){if(!p.alive||!p.role)continue;if((p.role==='chef'&&g.round===1)||p.role==='empath'||p.role==='fortune'||(p.role==='undertaker'&&g.round>1)){const info=roleInfo(g,p,p.role);if(info)await deliverInfo(g,info,config);}}
  if(death)event(g,`天亮了，${death.name} 在夜里死亡。`);else event(g,'天亮了。昨夜无人死亡。');
  g.actions={};g.phase='day';g.ballot=null;g.nominated=[];g.nominators=[];g.leader=null;g.readyDay=[];g.nominationLog=[];checkWinner(g);
  if(config?.key){const publicContext=g.events.slice(-6).map(e=>e.text).join('\n');try{const narrative=await askAI(config,'你是中文悬疑桌游的说书人。只根据公开事件写一段不超过 60 字的气氛旁白，不编造事实或猜测身份。',publicContext);event(g,`说书人：${narrative}`);g.agent=aiLabel(config);}catch{g.agent='规则主持';}}
}
// Official registration rule (confirmed with the user): the Virgin's judgement reads
// how the nominator *registers*. A Drunk counts as their assumed Townsfolk; a Spy or
// a Recluse may register as a Townsfolk (and die) or not — decided at random here,
// mirroring the existing detectedEvil/detectedDemon conventions.
function registersTownsfolk(g:Game,p:Player):boolean{
  if(isPoisoned(g,p.id))return false;const r=p.role;
  if(r==='drunk')return true;
  if(r==='spy'||r==='recluse')return randomInt(2)===1;
  return !!r&&GOOD.includes(r);
}
function nominate(g:Game,p:Player,id:string){assert(g.phase==='day'&&!g.ballot,'当前不能发起提名');
 // Nominations belong to free discussion: whispers and the seat-order speeches stay a
 // pure talking phase. Older rooms keep the old rule (nominating ends the speeches).
 if(g.dayFlow===2)assert(g.dayStage==='discussion','只有自由讨论阶段可以发起提名');
 assert(p.alive,'只有存活玩家可以提名');assert(!g.nominators.includes(p.id),'本日你已经提名过');const target=pById(g,id);assert(target&&target.alive,'请选择一名存活玩家');assert(!g.nominated.includes(id),'该玩家今天已被提名过');g.readyDay=[];g.nominators.push(p.id);g.nominated.push(id);
 // The ballot opens inside the discussion, so the table can keep talking and nominate
 // again once this one is closed.
 if(g.dayFlow!==2){g.dayStage='vote';g.speakerId=null;g.speechEndsAt=null;g.discussionEndsAt=null;}
 // Virgin: only the first nomination of the game is judged, trigger or not.
 if(target.role==='virgin'&&!g.virginUsed){
  // A poisoned Virgin's ability fails, but the once-per-game chance is still spent.
  g.virginUsed=true;
  if(!isPoisoned(g,target.id)&&registersTownsfolk(g,p)){
   kill(g,p);g.lastExecuted=p.id;
   event(g,`${p.name} 提名了 ${target.name}。贞洁者能力发动：${p.name} 被判定为镇民，立即被处决！`);
   checkWinner(g);return;
  }
  event(g,`${p.name} 提名了 ${target.name}。贞洁者第一次被提名，但提名者未被判定为镇民，能力未触发。先由 ${p.name} 陈述提名理由。`);
 }
 else event(g,`${p.name} 提名了 ${target.name}。先由 ${p.name} 陈述提名理由，说完点「陈述完毕」。`);
 // The ballot opens on the nominator's statement. No votes are counted yet; the table
 // only starts raising hands after the nominee has had their say.
 g.ballot={nominator:p.id,nominee:id,votes:{},stage:'accuse',endsAt:null};}
function ballotStageOf(b:{stage?:'accuse'|'defense'|'vote'}){return b.stage||'vote';}
// The two debate beats. Whoever owns the floor presses their own button; the host keeps an
// override so a disconnected player cannot freeze the table on a nomination forever.
function advanceBallot(g:Game,p:Player){
 const b=g.ballot;assert(g.phase==='day'&&b,'当前没有进行中的提名');
 const stage=ballotStageOf(b);const nameOf=(id:string)=>pById(g,id)?.name||'玩家';
 if(stage==='accuse'){
  assert(p.id===b.nominator||p.id===g.hostId,'现在只能由提名者本人或房主推进');
  b.stage='defense';b.endsAt=null;
  event(g,`${nameOf(b.nominator)} 陈述完毕。轮到 ${nameOf(b.nominee)} 狡辩。`);
  return;
 }
 if(stage==='defense'){
  assert(p.id===b.nominee||p.id===g.hostId,'现在只能由被提名者本人或房主推进');
  b.stage='vote';b.endsAt=Date.now()+NOMINATION_VOTE_SECONDS*1000;
  event(g,`${nameOf(b.nominee)} 狡辩结束。开始 ${NOMINATION_VOTE_SECONDS} 秒投票，没有投票的人视为不赞成。`);
  return;
 }
 assert(false,'投票已经开始，请等待倒计时结束或由房主结算');
}
// Official ghost vote: a dead player may always vote "no" without spending their
// one vote; only a "yes" consumes it (closeBallot does that). Once spent, "no" is
// still allowed but "yes" is refused for the rest of the game.
// Votes are recorded whenever a ballot exists. The UI only offers the buttons during the
// 15-second window, and the auto-close below only fires in the vote stage, so an early
// hand raised during the debate is simply kept for the tally.
function cast(g:Game,p:Player,yes:boolean){assert(g.phase==='day','现在不是白天');assert(g.ballot,'投票已经结束');if(!p.alive&&yes)assert(p.ghostVote,'你已用完死者票');g.ballot.votes[p.id]=!!yes;}
// Everyone who could still add a "yes" has voted: the server can close the ballot in
// the same request, so the table never sits on "已投 5/5" waiting for the host.
function ballotComplete(g:Game){const b=g.ballot;if(!b)return false;const submitted=Object.keys(b.votes).filter(id=>{const q=pById(g,id);return !!q&&(q.alive||q.ghostVote);}).length;return submitted>=g.players.filter(p=>p.alive||p.ghostVote).length;}
function closeBallot(g:Game,timedOut=false){assert(g.phase==='day'&&g.ballot,'当前没有进行中的投票');const b=g.ballot;
 // A timed-out vote is still a vote: whoever stayed silent simply never added a "yes".
 // The count is announced so the table knows how many hands were missing, not who.
 if(timedOut){
  const missing=g.players.filter(p=>(p.alive||p.ghostVote)&&b.votes[p.id]===undefined).length;
  event(g,missing?`投票时间到，${missing} 人没有投票，视为不赞成。`:'投票时间到，所有人都投了票。');
 }
 const yes=Object.entries(b.votes).filter(([id,v])=>{const p=pById(g,id);return v&&!(p?.alive&&p.role==='butler'&&!isPoisoned(g,p.id)&&g.butlerMasterId&&b.votes[g.butlerMasterId]!==true);});for(const [id] of yes){const p=pById(g,id);if(p&&!p.alive)p.ghostVote=false;}const threshold=Math.ceil(g.players.filter(p=>p.alive).length/2);const target=pById(g,b.nominee)!;
 // Who voted yes is public at the table, so it is stored with the tally and the review.
 const voters=yes.map(([id])=>pById(g,id)?.name).filter((n):n is string=>!!n);
 const record={nomineeId:target.id,nominee:target.name,nominator:pById(g,b.nominator)?.name||'—',votes:yes.length,threshold,voters};
 if(yes.length>=threshold){if(!g.leader||yes.length>g.leader.votes)g.leader={id:target.id,votes:yes.length,tie:false};else if(yes.length===g.leader.votes)g.leader.tie=true;}
 (g.nominationLog??=[]).push(record);
 const entry=(g.history??=[]).find(h=>h.day===g.round);entry?.nominations.push(record);
 event(g,`${target.name} 获得 ${yes.length} 票（处决门槛 ${threshold} 票）${voters.length?`：${voters.join('、')}。`:'。'}`);g.ballot=null;}
function finishHistory(g:Game,executedName:string|null){const entry=(g.history??=[]).find(h=>h.day===g.round);if(entry)entry.executed=executedName;}
function endDay(g:Game){
  assert(g.phase==='day'&&!g.ballot,'请先结束投票');const executedToday=!!(g.leader&&!g.leader.tie);g.lastExecuted=null;g.nominationLog=[];
  let executedName:string|null=null;
  if(g.leader&&!g.leader.tie){const target=pById(g,g.leader.id);if(target?.alive){kill(g,target);g.lastExecuted=target.id;executedName=target.name;event(g,`${target.name} 被处决。`);if(target.role==='saint'&&!isPoisoned(g,target.id)){finishHistory(g,executedName);g.phase='ended';g.winner='邪恶阵营';event(g,'圣徒被处决。邪恶阵营获胜！');return;}}}
  else event(g,g.leader?.tie?'最高票平票，今天无人被处决。':'今天无人被处决。');
  finishHistory(g,executedName);
  if(checkWinner(g))return;
  // Mayor: exactly three players live, nobody was executed today and a sober Mayor
  // is among them — good wins immediately.
  const living=g.players.filter(p=>p.alive);
  if(!executedToday&&living.length===3&&living.some(p=>p.role==='mayor'&&!isPoisoned(g,p.id))){
    g.phase='ended';g.winner='善良阵营';event(g,'镇长能力生效：只剩三名玩家且今天无人被处决。善良阵营获胜！');return;
  }
  g.phase='night';g.round++;g.actions={};g.poisonedId=null;g.dayStage=undefined;g.speakerId=null;g.speechQueue=undefined;g.speechIndex=undefined;g.speechEndsAt=null;g.discussionEndsAt=null;g.whisperEndsAt=null;if(g.rulesVersion===2)initNight(g);event(g,`第 ${g.round} 夜降临。`);
}
// Official "public trigger" rule: any player may claim to be a character with a
// publicly-triggered ability, and the Storyteller plays along. A fake claim is
// indistinguishable from a genuine miss: both just say "nothing happened".
function useSlayer(g:Game,p:Player,id:string){
 assert(g.phase==='day'&&!g.ballot,'请在白天且没有投票时使用能力');assert(p.alive,'你无法使用此能力');
 const target=pById(g,id);assert(target&&target.alive&&target.id!==p.id,'请选择另一名存活玩家');
 const day=`day-${g.round}`;const claims=g.publicClaims??={};assert(claims[p.id]!==day,'本日你已经宣称使用过公开能力');claims[p.id]=day;
 const apparent=apparentRole(p)==='slayer';
 // Only a sober, unpoisoned, real Slayer with an unused shot can actually kill.
 // A drunk who thinks they are the Slayer still spends their own attempt.
 const genuine=apparent&&!p.usedSlayer&&p.role!=='drunk'&&!isPoisoned(g,p.id);
 if(apparent&&!p.usedSlayer)p.usedSlayer=true; // a bluff never consumes the real Slayer's shot
 event(g,`${p.name} 宣称使用杀手能力，选择了 ${target.name}。`);
 if(genuine&&detectedDemon(g,target)){kill(g,target);event(g,`${target.name} 死亡。`);checkWinner(g);}
 else event(g,'没有人因这次能力死亡。');
}
// The Ravenkeeper's choice is delivered after their death: they pick anyone at the
// table and learn that player's character. A poisoned Ravenkeeper gets a wrong answer.
function ravenChoose(g:Game,p:Player,id:string){
 assert(g.ravenPending===p.id,'现在没有需要守鸦人做出的选择');
 const target=pById(g,id);assert(target,'请选择一名玩家');
 const shown=g.ravenPoisoned?shuffle(Object.keys(ROLE_INFO).filter(r=>r!==target.role))[0]:target.role;
 privateEvent(g,p.id,`守鸦人能力发动：你选择了 ${target.name}，其身份是 ${ROLE_INFO[shown as Role].name}。`);
 g.ravenPending=null;g.ravenPoisoned=undefined;
}
function chatAllowed(g:Game){assert(g.phase==='lobby'||g.phase==='day','夜晚请保持安静，结束后不能聊天');}
function publicChatActivity(g:Game,text:string){(g.chatActivity??=[]).push({id:uid(),text,at:Date.now()});g.chatActivity=g.chatActivity.slice(-200);}
function oncePerDay(g:Game,key:string,text:string){
 const day=g.phase==='lobby'?'lobby':`day-${g.round}`;const recorded=g.chatActivityKeys??={};
 if(recorded[key]===day)return;recorded[key]=day;publicChatActivity(g,text);
}
function validInvitees(g:Game,p:Player,ids:unknown){
 assert(Array.isArray(ids)&&ids.length>0&&ids.length<=8&&ids.every(x=>typeof x==='string'),'请选择要邀请的玩家');
 const unique=[...new Set(ids)] as string[];assert(unique.length===ids.length&&unique.every(id=>id!==p.id&&!!pById(g,id)),'邀请的玩家无效');return unique;
}
function myGroup(g:Game,p:Player,id:unknown){
 assert(typeof id==='string'&&id.length<=80,'讨论组不存在');const group=(g.chatGroups||[]).find(x=>x.id===id);
 assert(group&&group.members.includes(p.id),'讨论组不存在或你不是成员');return group;
}
function groupNames(g:Game,ids:string[]){return ids.map(id=>pById(g,id)?.name||'已离席玩家').join('、');}
function createGroup(g:Game,p:Player,ids:unknown,name:unknown){
 chatAllowed(g);const invitees=validInvitees(g,p,ids);
 const groups=g.chatGroups??=[];assert(groups.length<60,'讨论组已达数量上限');
 assert(typeof name==='string'&&name.trim().length<=24&&!/[\x00-\x1f\x7f]/.test(name),'讨论组名称须不超过 24 字');
 let groupId=uid();while(g.players.some(q=>q.id===groupId)||groups.some(q=>q.id===groupId))groupId=uid();
 const group:ChatGroup={id:groupId,name:name.trim()||`讨论组 ${groups.length+1}`,members:[p.id,...invitees],createdAt:Date.now()};
 groups.push(group);publicChatActivity(g,`${p.name} 邀请 ${groupNames(g,invitees)} 创建了讨论组。`);
}
function inviteGroup(g:Game,p:Player,id:unknown,ids:unknown){
 chatAllowed(g);const group=myGroup(g,p,id),invitees=validInvitees(g,p,ids);
 assert(invitees.every(x=>!group.members.includes(x)),'所选玩家已在讨论组中');
 group.members.push(...invitees);publicChatActivity(g,`${p.name} 邀请 ${groupNames(g,invitees)} 加入了讨论组（当前成员：${groupNames(g,group.members.filter(x=>!!pById(g,x)))}）。`);
}
function leaveGroup(g:Game,p:Player,id:unknown){
 chatAllowed(g);const group=myGroup(g,p,id);const previous=group.members.filter(x=>!!pById(g,x));group.members=group.members.filter(x=>x!==p.id);
 publicChatActivity(g,`${p.name} 离开了讨论组（原成员：${groupNames(g,previous)}）。`);
}
function chat(g:Game,p:Player,text:unknown,to:unknown,groupId:unknown){
 chatAllowed(g);assert(typeof text==='string'&&text.trim().length>0&&text.trim().length<=400,'消息长度须为 1–400 字');
 assert(to==null||typeof to==='string','私聊对象不存在');assert(groupId==null||(typeof groupId==='string'&&groupId.length>0),'讨论组不存在');assert(!(to&&groupId),'请选择一个聊天对象');
 // Private conversations run in the whisper beat (8 minutes by default) and stop for good
 // once it closes. Public chat is never limited, so the town can still talk afterwards.
 if(to||groupId)assert(whisperOpen(g),g.dayFlow===2?'私聊环节已结束，现在只能公开聊天':'本日私聊时间已结束，房主可以重新开放或调整时长');
 if(groupId){
  const group=myGroup(g,p,groupId);const audience=group.members.filter(id=>!!pById(g,id));assert(audience.length>=2,'讨论组至少需要两名在房间中的成员');
  // Save a frozen audience with each message: newly invited members cannot read history.
  // `to` is non-null even for old room viewers, which prevents old code from treating a group message as public.
  g.messages.push({id:uid(),from:p.id,to:group.id,groupId:group.id,audience,text:text.trim(),at:Date.now()});
  oncePerDay(g,`group:${group.id}`,`${p.name} 在讨论组中发起私聊（成员：${groupNames(g,audience)}）。`);
 }else if(to){
  const target=pById(g,to as string);assert(target&&target.id!==p.id,'私聊对象不存在');
  g.messages.push({id:uid(),from:p.id,to:target.id,text:text.trim(),at:Date.now()});
  const pair=[p.id,target.id].sort().join(':');oncePerDay(g,`pair:${pair}`,`${p.name} 与 ${target.name} 发起了私聊。`);
 }else g.messages.push({id:uid(),from:p.id,to:null,text:text.trim(),at:Date.now()});
 g.messages=g.messages.slice(-200);
}

export async function perform(g:Game,token:string,op:string,body:any){
 const p=getActor(g,token);
 // `auto` is set by the HTTP layer: a player's own action advances the table in the same
 // request. Direct callers (tests, tooling) keep the manual host-driven flow.
 const auto=body?.auto===true,ai=body?.ai||{};
 // Any request is a chance to move a stale day clock forward: a table whose speaker ran
 // out of time should never be stuck waiting for the host to click.
 if(g.phase==='day')tick(g);
 if(op==='start'){requireHost(g,p);startGame(g);}
 else if(op==='restart'){requireHost(g,p);backToLobby(g,p);}
 else if(op==='rematch'){requireHost(g,p);rematch(g,p);}
 else if(op==='kick')kickPlayer(g,p,body.target);
 else if(op==='night_action'){submitAction(g,p,body.targets);if(auto)await autoAdvance(g,ai);}
 else if(op==='advance_night'){requireHost(g,p);await advanceNight(g,body.ai||{});}
 else if(op==='resolve_night'){requireHost(g,p);if(ordered(g))await advanceNight(g,body.ai||{});else await resolveLegacyNight(g,body.ai||{});}
 else if(op==='nominate')nominate(g,p,body.target);
 else if(op==='advance_ballot')advanceBallot(g,p);
 else if(op==='vote'){cast(g,p,body.yes===true);if(auto&&g.ballot&&ballotStageOf(g.ballot)==='vote'&&ballotComplete(g))closeBallot(g);}
 else if(op==='close_vote'){requireHost(g,p);closeBallot(g);}
 else if(op==='end_speech'){assert(g.phase==='day'&&g.dayStage==='speech','现在不在顺序发言阶段');assert(p.id===g.speakerId||p.id===g.hostId,'现在不是你的发言时间');endSpeech(g);}
 else if(op==='end_discussion'){requireHost(g,p);endDiscussion(g);}
 else if(op==='end_whisper'){endWhisper(g,p);}
 else if(op==='update_settings')updateSettings(g,p,body);
 else if(op==='end_day'){requireHost(g,p);endDay(g);}
 else if(op==='ready_day'){assert(g.phase==='day'&&!g.ballot&&p.alive,'当前不能准备进入夜晚');assert(g.dayFlow!==2?g.dayStage==='vote':g.dayStage==='discussion','当前不能准备入夜');g.readyDay??=[];g.readyDay=g.readyDay.includes(p.id)?g.readyDay.filter(id=>id!==p.id):[...g.readyDay,p.id];if(g.players.filter(q=>q.alive).every(q=>g.readyDay.includes(q.id)))endDay(g);}
 else if(op==='slayer')useSlayer(g,p,body.target);
 else if(op==='ravenkeeper')ravenChoose(g,p,body.target);
 else if(op==='create_group')createGroup(g,p,body.members,body.name??'');
 else if(op==='invite_group')inviteGroup(g,p,body.groupId,body.members);
 else if(op==='leave_group')leaveGroup(g,p,body.groupId);
 else if(op==='chat')chat(g,p,body.text,body.to,body.groupId);
 else if(op==='narrate'){requireHost(g,p);const publicContext=g.events.slice(-6).map(e=>e.text).join('\n');const narrative=await askAI(body.ai||{},'你是中文悬疑桌游的说书人。仅根据公开事件写一段不超过 60 字的旁白。不编造事实、角色或死亡，不猜测身份。',publicContext);event(g,`说书人：${narrative}`);g.agent=aiLabel(body.ai||{});}
 else throw new Error('不支持的操作');return p;
}
export function view(g:Game,token:string){
 const me=getActor(g,token),isOrdered=ordered(g),stage=currentStage(g);
 const displayRole=(g.phase!=='ended'&&g.pendingDemonId===me.id&&me.role==='imp')?'scarlet':(g.phase==='ended'?me.role:apparentRole(me));
 const can=isOrdered?(g.phase==='night'&&stageMatches(g,me,stage)&&me.alive&&(TARGETED.has(apparentRole(me)!)||(me.role&&DEMONS.includes(me.role)))):legacyActive(g,me);
 return {code:g.code,phase:g.phase,round:g.round,now:Date.now(),
  players:g.players.map(p=>({id:p.id,name:p.name,seat:p.seat,alive:publicAlive(g,p),host:p.id===g.hostId,...(g.phase==='ended'?{role:p.role?ROLE_INFO[p.role].name:null,redHerring:!!g.redHerringId&&p.id===g.redHerringId}:{})})),
  me:{id:me.id,name:me.name,seat:me.seat,host:me.id===g.hostId,alive:publicAlive(g,me),ghostVote:me.ghostVote,roleKey:displayRole,role:displayRole?ROLE_INFO[displayRole]:null,butlerMasterId:me.role==='butler'?(g.butlerMasterId||null):null,usedSlayer:me.usedSlayer,claimedToday:g.publicClaims?.[me.id]===`day-${g.round}`,canAct:g.phase==='night'&&can,actionSubmitted:!!g.actions[me.id]},
  // Day clock and host settings. `whisperOpen` is authoritative for the composer.
  settings:{...DEFAULT_SETTINGS,...(g.settings||{})},
  // Default seating chart for the current head count, shown in the rules guide. Public
  // information by design and never inferred from the real deal.
  composition:baseComposition(g.players.length),
  day:{stage:g.dayStage||null,speakerId:g.speakerId||null,speaker:g.speakerId?g.players.find(p=>p.id===g.speakerId)?.name||null:null,speechEndsAt:g.speechEndsAt||null,discussionEndsAt:g.discussionEndsAt||null,whisperEndsAt:g.whisperEndsAt||null,whisperOpen:whisperOpen(g),discussionOver:!!g.discussionOver,
   // Whether the table is accepting nominations right now (per-player limits are still
   // enforced by nominate itself and shown next to the button).
   nominateOpen:g.phase==='day'&&!g.ballot&&(g.dayFlow===2?g.dayStage==='discussion':g.dayStage!=='vote')},
  history:(g.history||[]).map(h=>({day:h.day,nightDeaths:h.nightDeaths,nominations:h.nominations.map(n=>({...n})),executed:h.executed})),
  nightProgress:{mode:isOrdered?'ordered':'legacy',readyToAdvance:isOrdered?needsAdvance(g):false,advanceToken:isOrdered?g.night?.nonce:null,submitted:isOrdered?0:legacyEligible(g).filter(p=>!!g.actions[p.id]).length,total:isOrdered?0:legacyEligible(g).length},
  events:g.events.map(e=>({id:e.id,text:e.text,at:e.at,...(e.voice&&e.voice.expiresAt>Date.now()?{voice:{ready:true,expiresAt:e.voice.expiresAt}}:{})})),privateEvents:g.privateEvents[me.id]||[],
  chatActivity:(g.chatActivity||[]).map(e=>({id:e.id,text:e.text,at:e.at})),
  groups:(g.chatGroups||[]).filter(group=>group.members.includes(me.id)).map(group=>({id:group.id,name:group.name,members:group.members.filter(id=>!!pById(g,id)),createdAt:group.createdAt})),
  messages:g.messages.filter(m=>m.groupId?((g.chatGroups||[]).some(group=>group.id===m.groupId&&group.members.includes(me.id))&&Array.isArray(m.audience)&&m.audience.includes(me.id)):(!m.to||m.to===me.id||m.from===me.id)).map(({audience,...message})=>message),
  // Dead players without a ghost vote may still vote "no", but that vote cannot
  // affect the outcome. Counting only voters who could add a "yes" keeps the
  // auto-close threshold (submitted >= eligible) unchanged.
  ballot:g.ballot?{nominator:g.ballot.nominator,nominee:g.ballot.nominee,// The debate beats and the vote countdown; `canAdvance` drives the one button the
   // player who owns the floor sees (the host can always press it for them).
   stage:ballotStageOf(g.ballot),voteEndsAt:g.ballot.endsAt||null,seconds:NOMINATION_VOTE_SECONDS,
   canAdvance:me.id===g.hostId||(ballotStageOf(g.ballot)==='accuse'?me.id===g.ballot.nominator:ballotStageOf(g.ballot)==='defense'?me.id===g.ballot.nominee:false),
   submitted:Object.keys(g.ballot.votes).filter(id=>{const q=pById(g,id);return !!q&&(q.alive||q.ghostVote);}).length,eligible:g.players.filter(p=>p.alive||p.ghostVote).length,myVote:g.ballot.votes[me.id]??null,// Voting is public at the table: everyone sees who raised a hand.
   yes:Object.entries(g.ballot.votes).filter(([,v])=>v).map(([id])=>pById(g,id)?.name).filter((n):n is string=>!!n),no:Object.entries(g.ballot.votes).filter(([,v])=>!v).map(([id])=>pById(g,id)?.name).filter((n):n is string=>!!n)}:null,
  leader:g.leader,dayNominations:(g.nominationLog||[]).map(e=>({nominee:e.nominee,nominator:e.nominator,votes:e.votes,threshold:e.threshold,voters:e.voters||[],leading:!!g.leader&&!g.leader.tie&&e.nomineeId===g.leader.id&&e.votes===g.leader.votes})),readyDay:{count:(g.readyDay||[]).length,total:g.players.filter(p=>p.alive).length,mine:(g.readyDay||[]).includes(me.id)},nominees:g.nominated,nominators:g.nominators,winner:g.winner,agent:g.agent,
  // The red herring is a storyteller secret for the whole game; it is only named once the
  // story is over, so the table can see why the Fortune Teller kept reading "yes". The key
  // is omitted entirely while playing, so no view can leak its existence.
  ...(g.phase==='ended'?{redHerring:g.redHerringId?(g.players.find(p=>p.id===g.redHerringId)?.name??null):null}:{}),
  // Only the dead Ravenkeeper themself sees this flag; it drives their choice prompt.
  ravenPending:g.ravenPending===me.id};
}
// Qwen speech is generated only from an existing public event. The signed audio
// URL is stored server-side and is never included in a player's room view.
const TTS_ENDPOINTS:Record<string,string>={
 aliyun:'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
 beijing:'https://cn-beijing.maas.qwencloudapi.com/api/v1/services/aigc/multimodal-generation/generation',
 singapore:'https://ap-southeast-1.maas.qwencloudapi.com/api/v1/services/aigc/multimodal-generation/generation',
 virginia:'https://us-east-1.maas.qwencloudapi.com/api/v1/services/aigc/multimodal-generation/generation',
};
const MAX_AUDIO_BYTES=8*1024*1024;
function audioUrl(value:unknown){
 assert(typeof value==='string'&&value.length<=4096,'Qwen 语音地址无效');
 let url:URL;try{url=new URL(value);}catch{throw new Error('Qwen 语音地址无效');}
 assert((url.protocol==='http:'||url.protocol==='https:')&&!url.username&&!url.password&&!url.port&&!url.hash&&/^dashscope-result(?:-[a-z0-9-]+)?\.oss-[a-z0-9-]+\.aliyuncs\.com$/.test(url.hostname),'Qwen 语音地址不受支持');
 // OSS supports HTTPS; the presigned URL path and query are unchanged.
 url.protocol='https:';return url.toString();
}
function publicNotice(g:Game,eventId:unknown){
 assert(typeof eventId==='string'&&eventId.length<=80,'公开事件不存在');
 const notice=g.events.find(e=>e.id===eventId);assert(notice,'公开事件不存在');return notice;
}
const VOLC_TTS_ENDPOINT='https://openspeech.bytedance.com/api/v3/plan/tts/unidirectional';
const VOLC_RESOURCE='seed-tts-2.0';
// 玲玲姐姐（林志玲同款娃娃音）现在是 2.0 音色。1.0 的玲玲姐姐/志玲姐姐已于
// 2026-06-30 随一批 1.0 音色下线，旧 ID 继续调用会没有声音，因此在服务端做别名映射。
const VOLC_SPEAKER='zh_female_lingling_uranus_bigtts';
// Exported so the config endpoint can advertise the same default the speech call uses.
export const DEFAULT_VOICE_SPEAKER=VOLC_SPEAKER;
const SPEAKER_ALIASES:Record<string,string>={
 'zh_female_linzhiling_mars_bigtts':VOLC_SPEAKER,
 'zh_female_zhiling_moon_bigtts':VOLC_SPEAKER,
};
// Upstream codes worth translating: the raw text is a server-side English message.
const VOLC_HINTS:Record<number,string>={
 45000030:'Agent Plan 语音抵扣未开启，请先在方舟控制台开启语音抵扣，或改用标准语音服务的 AppID/Token',
 45000001:'语音 Key 无效或未授权',
};
// Volcengine speech is a separate product from Ark model inference: it speaks the
// line-delimited JSON protocol below and needs its own key in X-Api-Key.
async function volcSpeech(text:string,config:AiConfig):Promise<VoiceAttachment>{
 const key=typeof config?.voiceKey==='string'?config.voiceKey.trim():'';
 assert(key.length>=16&&key.length<=500,'请填写有效的豆包语音 Key（语音接口专用，与文字 Key 不通用）');
 const speaker=SPEAKER_ALIASES[String(config?.speaker||'').trim()]||String(config?.speaker||'').trim()||VOLC_SPEAKER;
 assert(/^[a-z0-9_]{4,60}$/.test(speaker),'音色 ID 格式无效');
 let response:Response;
 try{
  response=await fetch(VOLC_TTS_ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json','X-Api-Key':key,'X-Api-Resource-Id':VOLC_RESOURCE},body:JSON.stringify({req_params:{text,speaker,audio_params:{format:'mp3',sample_rate:24000}}}),signal:AbortSignal.timeout(20000)});
 }catch(e:any){if(e?.name==='TimeoutError'||e?.name==='AbortError')throw new Error('豆包语音接口 20 秒未返回，已放弃这一段音频');throw new Error('无法连接豆包语音接口，请检查网络');}
 if(!response.ok)throw new Error(`豆包语音接口返回 ${response.status}，请检查语音 Key 和额度`);
 assert(response.body,'豆包语音未返回内容');
 const reader=response.body.getReader();const decoder=new TextDecoder();const chunks:Uint8Array[]=[];
 let buffer='',size=0,ended=false;
 const handle=(line:string)=>{
  if(!line)return;
  let packet:any;try{packet=JSON.parse(line);}catch{return;}
  const code=Number(packet?.code??0);
  if(code===20000000){ended=true;return;}
  if(code>0)throw new Error(`豆包语音返回错误 ${code}${VOLC_HINTS[code]?`：${VOLC_HINTS[code]}`:packet?.message?`：${String(packet.message).slice(0,60)}`:''}`);
  if(typeof packet?.data==='string'&&packet.data){const bytes=Buffer.from(packet.data,'base64');size+=bytes.length;assert(size<=MAX_AUDIO_BYTES,'语音文件过大');chunks.push(new Uint8Array(bytes));}
 };
 try{
  while(!ended){
   const {done,value}=await reader.read();if(done)break;
   buffer+=decoder.decode(value,{stream:true});
   let index:number;
   while((index=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,index).trim();buffer=buffer.slice(index+1);handle(line);if(ended)break;}
  }
  if(!ended)handle(buffer.trim());
 }finally{await reader.cancel().catch(()=>{});}
 assert(size>0,'豆包语音未返回音频');
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
 return {data:Buffer.from(bytes).toString('base64'),mime:'audio/mpeg',expiresAt:Date.now()+24*3600*1000};
}
async function qwenSpeech(text:string,config:AiConfig,voice:unknown):Promise<VoiceAttachment>{
 const key=typeof config?.key==='string'?config.key.trim():'';assert(key.length>=8&&key.length<=500,'请填写有效的 Qwen API Key');
 const endpoint=TTS_ENDPOINTS[config.region||'aliyun'];assert(endpoint,'不支持此 API 地域');
 assert(voice==='Cherry'||voice==='Serena','不支持此 Qwen 音色');
 let response:Response;
 try{response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${key}`},body:JSON.stringify({model:'qwen3-tts-flash',input:{text,voice,language_type:'Chinese'}}),signal:AbortSignal.timeout(45000)});}catch{throw new Error('无法连接 Qwen 语音接口，请检查地域和网络');}
 if(!response.ok)throw new Error(`Qwen 语音接口返回 ${response.status}，请检查密钥、地域和额度`);
 let data:any;try{data=await response.json();}catch{throw new Error('Qwen 未返回有效语音');}
 const url=audioUrl(data?.output?.audio?.url);const expiresAt=Number(data?.output?.audio?.expires_at)*1000;
 assert(Number.isFinite(expiresAt)&&expiresAt>Date.now()&&expiresAt<=Date.now()+48*3600*1000,'Qwen 语音有效期无效');
 return {url,expiresAt};
}
// Inline bytes are already base64; a signed URL has to be fetched before it can be
// handed back as audio. Shared by the room pipeline and the one-shot voice probe.
async function readVoiceBytes(voice:VoiceAttachment):Promise<{data:string;mime:string}>{
 if(typeof voice.data==='string'&&voice.data.length)return {data:voice.data,mime:voice.mime||'audio/mpeg'};
 const url=audioUrl(voice.url);let response:Response;
 try{response=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(20000)});}catch{throw new Error('无法读取 Qwen 语音');}
 assert(response.ok&&!response.redirected,'无法读取 Qwen 语音');
 const length=Number(response.headers.get('content-length')||0);assert(!length||length<=MAX_AUDIO_BYTES,'语音文件过大');
 assert(response.body,'语音内容为空');const reader=response.body.getReader();let size=0;const chunks:Uint8Array[]=[];
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;assert(size<=MAX_AUDIO_BYTES,'语音文件过大');chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}
 assert(size>0,'语音内容为空');const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
 return {data:Buffer.from(bytes).toString('base64'),mime:'audio/wav'};
}
export async function synthesizePublicVoice(g:Game,token:string,eventId:unknown,config:AiConfig,voice:unknown):Promise<VoiceAttachment>{
 const player=getActor(g,token);requireHost(g,player);const notice=publicNotice(g,eventId);
 if(notice.voice&&notice.voice.expiresAt>Date.now())return notice.voice;
 const text=notice.text.replace(/^说书人：/,'').trim().slice(0,600);assert(text,'公开事件没有可朗读的内容');
 return isArk(config)?volcSpeech(text,config):qwenSpeech(text,config,voice);
}
// One-shot speech probe: the host can confirm the voice key really speaks before a
// game starts. Nothing is written to a room and no game event is consumed.
export async function probeVoice(config:AiConfig,voice:unknown):Promise<{provider:string;speaker:string;mime:string;data:string}>{
 const text='说书人语音测试成功，钟楼的第一声钟响即将传来。';
 const speaker=isArk(config)?(SPEAKER_ALIASES[String(config?.speaker||'').trim()]||String(config?.speaker||'').trim()||VOLC_SPEAKER):String(voice||'Cherry');
 const audio=isArk(config)?await volcSpeech(text,config):await qwenSpeech(text,config,voice);
 const {data,mime}=await readVoiceBytes(audio);
 return {provider:aiLabel(config),speaker,mime,data};
}
// Inline audio is bounded so a long game cannot grow the room document without limit.
function pruneVoice(g:Game){
 const voiced=g.events.filter(e=>e.voice);const excess=voiced.length-24;
 if(excess>0)for(const e of voiced.slice(0,excess))delete e.voice;
}
// Called after synthesis and again after a concurrent-write retry; does not
// re-request audio and never overwrites another host request's fresh result.
export function attachPublicVoice(g:Game,token:string,eventId:unknown,voice:VoiceAttachment){
 const player=getActor(g,token);requireHost(g,player);const notice=publicNotice(g,eventId);
 if(notice.voice&&notice.voice.expiresAt>Date.now())return false;
 assert(Number.isFinite(voice?.expiresAt)&&voice.expiresAt>Date.now()&&voice.expiresAt<=Date.now()+48*3600*1000,'语音有效期无效');
 if(typeof voice?.data==='string'&&voice.data.length){
  assert(voice.data.length<=Math.ceil(MAX_AUDIO_BYTES/3)*4,'语音文件过大');
  const mime=String(voice?.mime||'audio/mpeg');
  assert(['audio/mpeg','audio/mp3','audio/wav','audio/x-wav','audio/ogg'].includes(mime),'语音格式不受支持');
  notice.voice={data:voice.data,mime,expiresAt:voice.expiresAt};
 }else{
  notice.voice={url:audioUrl(voice?.url),expiresAt:voice.expiresAt};
 }
 pruneVoice(g);return true;
}
export async function downloadPublicVoice(g:Game,token:string,eventId:unknown){
 getActor(g,token);const notice=publicNotice(g,eventId);assert(notice.voice&&notice.voice.expiresAt>Date.now(),'语音未生成或已过期');
 if(typeof notice.voice.data==='string'&&notice.voice.data.length){
  const bytes=Buffer.from(notice.voice.data,'base64');assert(bytes.length>0&&bytes.length<=MAX_AUDIO_BYTES,'语音内容为空');
  return {bytes,mime:notice.voice.mime||'audio/mpeg'};
 }
 const url=audioUrl(notice.voice.url);let response:Response;
 try{response=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(20000)});}catch{throw new Error('无法读取 Qwen 语音');}
 assert(response.ok&&!response.redirected,'无法读取 Qwen 语音');
 const length=Number(response.headers.get('content-length')||0);assert(!length||length<=MAX_AUDIO_BYTES,'语音文件过大');
 const mime=(response.headers.get('content-type')||'').split(';')[0].toLowerCase();
 assert(!mime||mime==='application/octet-stream'||mime==='audio/wav'||mime==='audio/x-wav'||mime==='audio/wave','语音格式不受支持');
 assert(response.body,'语音内容为空');const reader=response.body.getReader();let size=0;const chunks:Uint8Array[]=[];
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;assert(size<=MAX_AUDIO_BYTES,'语音文件过大');chunks.push(value);}}catch(e){await reader.cancel().catch(()=>{});throw e;}
 assert(size>0,'语音内容为空');const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
 return {bytes,mime:'audio/wav'};
}
export function normalizeName(value:unknown){assert(typeof value==='string','请输入昵称');const name=value.trim();assert(name.length>=1&&name.length<=16&&!/[\x00-\x1f\x7f]/.test(name),'昵称长度须为 1–16 字');return name;}
