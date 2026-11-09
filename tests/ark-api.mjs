import assert from 'node:assert/strict';
import {newGame,joinGame,perform,view,synthesizePublicVoice} from '../server-dist/game.js';
// Volcengine Ark is OpenAI-compatible, but the endpoint, the model identifier and the
// error wording are provider specific. Only public context may reach it.
const {g,p:host}=newGame('ARK234','Host');const guest=joinGame(g,'Guest');
const key='ark-test-key-1234567';
const original=globalThis.fetch;
let seen=null;
try{
 globalThis.fetch=async(url,opts)=>{
  seen={url:String(url),auth:opts?.headers?.Authorization,body:JSON.parse(opts.body)};
  return Response.json({choices:[{message:{content:'钟声在雾里响起。'}}]});
 };
 // A model name works, and so does an inference endpoint id.
 for(const model of ['doubao-seed-2-1-pro-260915','ep-20261103-abcdef']){
  await perform(g,host.token,'narrate',{ai:{key,provider:'ark',model}});
  assert.equal(seen.url,'https://ark.cn-beijing.volces.com/api/v3/chat/completions');
  assert.equal(seen.auth,`Bearer ${key}`);
  assert.equal(seen.body.model,model);
  assert.ok(Array.isArray(seen.body.messages)&&seen.body.messages.length===2);
  assert.equal(seen.body.stream,false);
 }
 // The key never reaches the room document or another player's view.
 assert.ok(!JSON.stringify(g).includes(key));
 for(const p of [host,guest])assert.ok(!JSON.stringify(view(g,p.token)).includes(key));
 // Ark keys cannot synthesise speech: that is a different Volcengine service.
 const eventId=view(g,host.token).events.at(-1).id;
 // Speech needs its own key on the Volcengine speech endpoint; a text key is never reused.
 await assert.rejects(()=>synthesizePublicVoice(g,host.token,eventId,{key,provider:'ark',model:'doubao-seed-2-1-pro-260915'},'Cherry'),/请填写有效的豆包语音 Key/);
 // A missing model is reported before any network call.
 seen=null;
 await assert.rejects(()=>perform(g,host.token,'narrate',{ai:{key,provider:'ark'}}),/请填写有效的火山方舟模型 ID/);
 assert.equal(seen,null,'no request may be sent without a model');
 // A provider failure surfaces with the provider name, not "Qwen".
 globalThis.fetch=async()=>new Response('{"error":"bad model"}',{status:404});
 await assert.rejects(()=>perform(g,host.token,'narrate',{ai:{key,provider:'ark',model:'nope'}}),/火山方舟 API 返回 404/);
 // DashScope keeps working exactly as before.
 globalThis.fetch=async(url,opts)=>{seen={url:String(url),body:JSON.parse(opts.body)};return Response.json({choices:[{message:{content:'旁白'}}]});};
 await perform(g,host.token,'narrate',{ai:{key:'sk-test-123456',region:'aliyun'}});
 assert.equal(seen.url,'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions');
 assert.equal(seen.body.model,'qwen-plus');
 // The default provider is DashScope, so old clients that never send `provider` still work.
 seen=null;
 await perform(g,host.token,'narrate',{ai:{key:'sk-test-123456'}});
 assert.equal(seen.url,'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions');
 console.log('PASS: Ark chat endpoint/model/header, no key persistence, speech refused, missing model rejected offline, provider-specific errors, DashScope unaffected.');
}finally{globalThis.fetch=original;}
