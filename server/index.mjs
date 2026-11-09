import http from 'node:http';
import {access,readFile} from 'node:fs/promises';
import {extname,resolve,sep} from 'node:path';
import {newGame,joinGame,leaveGame,normalizeName,perform,view,tick,probeAI,probeVoice,synthesizePublicVoice,attachPublicVoice,downloadPublicVoice,DEFAULT_VOICE_SPEAKER,ROLE_CATALOG,baseComposition} from '../server-dist/game.js';
import {makeStore} from './storage.mjs';

// Server-side defaults for one hosted table: the keys never reach the browser, and a key
// typed into the host page always wins. Tests never load .env, so they stay hermetic.
if(process.env.NODE_ENV!=='test'){try{process.loadEnvFile();}catch{}}
// Keys come from the environment (or .env) only — nothing is hard-coded in this repo.
// A host can also paste their own key in the settings modal; without any key the game
// still runs, just without AI narration and voice.
// Tests must stay hermetic: no key, no outbound call, no bill.
const isTest=process.env.NODE_ENV==='test';
const BUILTIN_TEXT_KEY='';
const BUILTIN_VOICE_KEY='';

const envText=(name)=>{const v=String(process.env[name]||'').trim();return v;};
const DEFAULT_AI={
  provider:'ark',
  model:envText('CLOCKTOWER_ARK_MODEL')||envText('ARK_MODEL')||'doubao-seed-2-1-lite-260915',
  key:isTest?'':(envText('CLOCKTOWER_ARK_API_KEY')||BUILTIN_TEXT_KEY),
  voiceKey:isTest?'':(envText('CLOCKTOWER_VOICE_KEY')||BUILTIN_VOICE_KEY),
  speaker:envText('CLOCKTOWER_SPEAKER')||envText('VOLC_SPEAKER')||DEFAULT_VOICE_SPEAKER,
};
function withDefaults(value){
  const ai=value&&typeof value==='object'?{...value}:{};
  const provider=String(ai.provider||'');
  if(!String(ai.key||'').trim()&&DEFAULT_AI.key&&(!provider||provider==='ark')){
    ai.provider='ark';ai.key=DEFAULT_AI.key;
    if(!String(ai.model||'').trim()||ai.model==='qwen-plus')ai.model=DEFAULT_AI.model;
  }
  if(!String(ai.voiceKey||'').trim()&&DEFAULT_AI.voiceKey)ai.voiceKey=DEFAULT_AI.voiceKey;
  if(!String(ai.speaker||'').trim()&&DEFAULT_AI.speaker)ai.speaker=DEFAULT_AI.speaker;
  return ai;
}
// What the client may know about the defaults: which provider speaks and whether a key is
// already configured server-side. The keys themselves never leave the server.
const configView=()=>({provider:DEFAULT_AI.key?'ark':'dashscope',model:DEFAULT_AI.model,speaker:DEFAULT_AI.speaker,hasTextKey:!!DEFAULT_AI.key,hasVoiceKey:!!DEFAULT_AI.voiceKey,roles:ROLE_CATALOG,compositionTable:[5,6,7,8,9].map(baseComposition)});

const store=await makeStore();
// Release rooms abandoned for longer than the TTL: a started game can never hit the
// lobby `leave` path, so without this its record would stay on disk forever.
const roomTtlHours=Number(process.env.CLOCKTOWER_ROOM_TTL_HOURS||12);
if(typeof store.sweep==='function'){
  const releaseIdle=async()=>{try{const n=await store.sweep(roomTtlHours*3600000);if(n)console.log(`released ${n} idle room(s) older than ${roomTtlHours}h`);}catch(e){console.log('room sweep failed:',String(e?.message||e));}};
  await releaseIdle();
  setInterval(releaseIdle,3600000).unref();
}
const codeOf=v=>typeof v==='string'?v.toUpperCase().replace(/[^A-Z2-9]/g,'').slice(0,6):'';
const randomCode=()=>{const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';const a=new Uint8Array(6);crypto.getRandomValues(a);return Array.from(a,n=>chars[n%chars.length]).join('');};
// `web-build` is the current client output; `dist` is only a legacy fallback so a
// partially uploaded deployment can never answer every page with a 500.
const root=await (async()=>{for(const candidate of [resolve('web-build'),resolve('dist')]){try{await access(candidate);return candidate;}catch{}}return resolve('web-build');})();
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2','.ico':'image/x-icon'};
function json(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));}
async function readBody(req){let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>20000)throw new Error('请求过大');chunks.push(chunk);}try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new Error('请求格式无效');}}

// --- live push -------------------------------------------------------------------
// One long-lived response per player. Every successful write fans the fresh view out to
// that room only, so a submitted action reaches the next player in milliseconds instead
// of waiting for the next poll tick (or for a backgrounded host tab to wake up).
const streams=new Map();
function publish(game){
  const set=streams.get(game.code);if(!set)return;
  for(const sub of [...set]){
    let payload;try{payload=view(game,sub.token);}catch{
      // The token no longer belongs to a seat: the guest was kicked (or the room was
      // reset). Tell that one page why it stops updating instead of letting it hang.
      try{sub.res.write(`data: ${JSON.stringify({removed:true,reason:'你已被房主请出房间'})}\n\n`);sub.res.end();}catch{}
      set.delete(sub);continue;
    }
    try{sub.res.write(`data: ${JSON.stringify(payload)}\n\n`);}catch{}
  }
  if(!set.size&&streams.get(game.code)===set)streams.delete(game.code);
}
function addStream(code,token,res){
  let set=streams.get(code);if(!set){set=new Set();streams.set(code,set);}
  const entry={res,token};set.add(entry);
  const heartbeat=setInterval(()=>{try{res.write(': ping\n\n');}catch{}},20000);heartbeat.unref?.();
  const drop=()=>{clearInterval(heartbeat);set.delete(entry);if(!set.size&&streams.get(code)===set)streams.delete(code);};
  res.on('close',drop);res.on('error',drop);
}
async function stream(req,res,url){
  const code=codeOf(url.searchParams.get('code')),token=String(req.headers['x-room-token']||'');
  if(code.length!==6||!token)return json(res,400,{error:'缺少房间码或身份凭证'});
  let game;try{({game}=await load(code));}catch(e){return json(res,400,{error:String(e?.message||'没有找到房间')});}
  let snapshot;try{snapshot=view(game,token);}catch(e){return json(res,400,{error:String(e?.message||'身份凭证已失效')});}
  res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-store','Connection':'keep-alive','X-Accel-Buffering':'no','X-Content-Type-Options':'nosniff'});
  res.write('retry: 1500\n\n');
  res.write(`data: ${JSON.stringify(snapshot)}\n\n`);
  addStream(code,token,res);
}

async function load(code){const found=await store.load(code);if(!found)throw new Error('没有找到房间，请检查房间码');return found;}
async function save(game,version){if(!await store.save(game,version))throw new Error('房间状态刚刚发生变化，请重试');publish(game);}
// Day timers advance without anyone clicking: every watched room is ticked twice a second,
// and a changed clock is written back (CAS) and pushed to the table immediately.
const dayClock=setInterval(async()=>{
 for(const code of [...streams.keys()]){
  try{
   const {game,version}=await store.load(code);
   if(!game||game.phase!=='day')continue;
   if(!tick(game))continue;
   if(await store.save(game,version))publish(game);
  }catch{/* the next tick retries */}
 }
},2000);
dayClock.unref?.();
// A player's own action advances the table inside that same request. The host keeps the
// manual "继续夜晚 / 结束白天 / 结束投票" buttons as an override and as a safety net.
const AUTO_OPS=new Set(['night_action','vote']);
async function api(req,res,url){
 try{
  if(req.method==='GET'){
   const code=codeOf(url.searchParams.get('code'));const token=String(req.headers['x-room-token']||'');if(code.length!==6||!token)return json(res,400,{error:'缺少房间码或身份凭证'});
   const {game,version}=await load(code);
   // Reading a room is also a chance to move the day clock forward.
   if(tick(game)){try{await save(game,version);}catch{/* another writer wins, timer retries */}}
   // Audio is proxied server-side so a signed Qwen URL never reaches the browser.
   if(url.searchParams.has('voice')){const {bytes,mime}=await downloadPublicVoice(game,token,url.searchParams.get('voice'));res.writeHead(200,{'Content-Type':mime||'audio/mpeg','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'});return res.end(bytes);}
   return json(res,200,view(game,token));
  }
  if(req.method!=='POST')return json(res,405,{error:'不支持此请求'});
  const body=await readBody(req);const op=body?.op;
  if(op==='create'){
   const name=normalizeName(body.name);
   for(let i=0;i<5;i++){const {g,p}=newGame(randomCode(),name);if(await store.insert(g))return json(res,200,{token:p.token,state:view(g,p.token)});}
   throw new Error('暂时无法创建房间，请重试');
  }
  // A one-shot connectivity probe: the host can verify key/region/model before a game
  // without touching any room record.
  if(op==='test_ai')return json(res,200,await probeAI(withDefaults(body.ai)));
  // Same idea for speech: proves the voice key and the audio round trip before a game.
  if(op==='test_voice')return json(res,200,await probeVoice(withDefaults(body.ai),body.voice));
  const code=codeOf(body.code);if(code.length!==6)throw new Error('房间码应为 6 位');const {game,version}=await load(code);
  if(op==='join'){const p=joinGame(game,normalizeName(body.name));await save(game,version);return json(res,200,{token:p.token,state:view(game,p.token)});}
  const token=String(req.headers['x-room-token']||'');
  if(op==='generate_voice'){
   // Synthesis happens once. A lost CAS race re-reads the room and re-attaches the
   // same audio, so a retry never issues a second paid TTS call.
   const audio=await synthesizePublicVoice(game,token,body.eventId,withDefaults(body.ai),body.voice);
   let current=game,currentVersion=version;
   for(let attempt=0;attempt<8;attempt++){
    if(!attachPublicVoice(current,token,body.eventId,audio))return json(res,200,{state:view(current,token)});
    if(await store.save(current,currentVersion)){publish(current);return json(res,200,{state:view(current,token)});}
    if(attempt<7)await new Promise(r=>setTimeout(r,30*(attempt+1)));
    ({game:current,version:currentVersion}=await load(code));
   }
   throw new Error('房间状态刚刚发生变化，请重试');
  }
  if(op==='leave'){
   const player=game.players.find(p=>p.token===token);if(!player)throw new Error('身份凭证已失效');
   leaveGame(game,player);
   if(!game.players.length){if(!await store.remove(code,version))throw new Error('房间状态刚刚发生变化，请重试');}
   else await save(game,version);
   return json(res,200,{left:true});
  }
  if(AUTO_OPS.has(op)&&body.auto===undefined)body.auto=true;
  body.ai=withDefaults(body.ai);
  await perform(game,token,op,body);await save(game,version);return json(res,200,{state:view(game,token)});
 }catch(e){const message=String(e?.message||'');const known=/^(昵称长度|请输入昵称|房间码应|没有找到房间|缺少房间码|身份凭证|房间状态|房间已满|这个昵称|游戏已经开始|需要 5|游戏开始后|只有房主|只能请出|该玩家已经不在|房主不能请出自己|本局尚未结束|游戏进行中不能退出|现在不是夜晚|现在只能|投票已经开始|投票已经结束|现在没有|守鸦人|无法生成|当前没有|当前不能推进夜间|还没有轮到|本轮行动已经提交|行动目标|请选择|还有 \d+ 名|当前不能|只有存活|只有自由讨论|讨论结束后|私聊环节|本日你已经|该玩家今天|你已用完|请先结束|你无法使用|消息长度|夜晚请|私聊对象|本日私聊时间|现在不在|现在不是你的发言|私聊时间只在|每人发言|分钟数须|不支持的操作|Qwen API 返回|Qwen 未返回|Qwen 的说书决策|无法连接|请填写有效的|火山方舟|不支持此 API|模型名称格式|请求过大|请求格式|公开事件|Qwen 语音|Qwen 未返回有效语音|无法连接 Qwen 语音|不支持此 Qwen|语音未生成|无法读取 Qwen|语音文件|语音格式|语音内容|豆包语音|音色|语音有效期|讨论组|邀请的玩家|所选玩家|请选择要邀请|多人讨论组)/;return json(res,400,{error:known.test(message)?message:'服务暂不可用，请稍后重试'});}
}
const server=http.createServer(async(req,res)=>{
 try{const url=new URL(req.url||'/', 'http://localhost');
  if(url.pathname==='/api/config')return json(res,200,configView());
  if(url.pathname==='/api/room/stream')return await stream(req,res,url);
  if(url.pathname==='/api/room')return await api(req,res,url);
  if(req.method!=='GET'&&req.method!=='HEAD')return json(res,405,{error:'不支持此请求'});
  let name=url.pathname==='/'?'index.html':decodeURIComponent(url.pathname).replace(/^\/+/, '');let file=resolve(root,name);
  if(file!==root&&!file.startsWith(root+sep))return json(res,403,{error:'禁止访问'});
  let bytes;try{bytes=await readFile(file);}catch{if(!extname(name)){file=resolve(root,'index.html');bytes=await readFile(file);}else return json(res,404,{error:'未找到文件'});}
  res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','Cache-Control':name.startsWith('assets/')?'public, max-age=31536000, immutable':'no-cache'});res.end(req.method==='HEAD'?undefined:bytes);
 }catch{return json(res,500,{error:'服务暂不可用'});}
});
const port=Number(process.env.PORT||3000);server.listen(port,'0.0.0.0',()=>console.log(`Clocktower listening on ${port}; storage=${process.env.DB_DRIVER||'file'}${DEFAULT_AI.key?'; ai=server-default':''}`));
