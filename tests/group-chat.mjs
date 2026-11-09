import assert from 'node:assert/strict';
import {newGame,joinGame,perform,view,synthesizePublicVoice} from '../server-dist/game.js';
const {g,p:a}=newGame('ABC234','Alice');const b=joinGame(g,'Bob'),c=joinGame(g,'Chen'),d=joinGame(g,'Dana'),e=joinGame(g,'Eve');
const act=(p,op,body={})=>perform(g,p.token,op,body);
const state=p=>view(g,p.token);
// Legacy rooms have no group/activity fields; public and direct messages stay compatible.
delete g.chatGroups;delete g.chatActivity;delete g.chatActivityKeys;
await act(a,'chat',{text:'public hello',to:null});for(const p of [a,b,c,d,e])assert.ok(state(p).messages.some(m=>m.text==='public hello'));
await act(a,'chat',{text:'direct secret',to:b.id});
assert.ok(state(a).messages.some(m=>m.text==='direct secret'));assert.ok(state(b).messages.some(m=>m.text==='direct secret'));
for(const p of [c,d,e])assert.ok(!JSON.stringify(state(p)).includes('direct secret'));
assert.match(state(e).chatActivity.at(-1).text,/Alice.*Bob/);assert.ok(!JSON.stringify(state(e).chatActivity).includes('direct secret'));
const directCount=g.chatActivity.length;await act(b,'chat',{text:'reply secret',to:a.id});assert.equal(g.chatActivity.length,directCount);
// A newly created group is visible only to members, but its member activity is public.
await act(a,'create_group',{name:'线索小组',members:[b.id,c.id]});const group=state(a).groups[0];assert.ok(group);assert.equal(group.members.length,3);
assert.equal(state(b).groups[0].id,group.id);assert.deepEqual(state(d).groups,[]);assert.ok(!JSON.stringify(state(d)).includes('线索小组'));assert.match(state(e).chatActivity.at(-1).text,/Alice.*Bob.*Chen/);
await assert.rejects(()=>act(d,'chat',{groupId:group.id,text:'hacked'}),/不是成员/);
await assert.rejects(()=>act(d,'invite_group',{groupId:group.id,members:[e.id]}),/不是成员/);
await assert.rejects(()=>act(d,'leave_group',{groupId:group.id}),/不是成员/);
await assert.rejects(()=>act(a,'chat',{groupId:group.id,to:d.id,text:'mixed destination'}),/请选择一个聊天对象/);
assert.ok(!state(d).messages.some(m=>m.text==='mixed destination'));
await assert.rejects(()=>act(a,'create_group',{members:[]}),/请选择要邀请的玩家/);
await assert.rejects(()=>act(a,'chat',{groupId:0,text:'invalid group must not become public'}),/讨论组不存在/);
assert.ok(!state(e).messages.some(m=>m.text==='invalid group must not become public'));
await assert.rejects(()=>act(a,'create_group',{members:[a.id,b.id]}),/邀请的玩家无效/);
await act(a,'chat',{groupId:group.id,text:'first group secret',audience:[d.id]});
for(const p of [a,b,c]){const msg=state(p).messages.find(m=>m.text==='first group secret');assert.ok(msg);assert.equal(msg.groupId,group.id);assert.ok(!('audience' in msg));}
for(const p of [d,e])assert.ok(!JSON.stringify(state(p)).includes('first group secret'));
const first=g.messages.find(m=>m.text==='first group secret');assert.equal(first.to,group.id);assert.deepEqual(first.audience,[a.id,b.id,c.id]);
const groupCount=g.chatActivity.length;await act(c,'chat',{groupId:group.id,text:'second group secret'});assert.equal(g.chatActivity.length,groupCount);
// Newly invited members cannot see messages sent before their membership.
await act(b,'invite_group',{groupId:group.id,members:[d.id]});assert.ok(state(d).groups.some(x=>x.id===group.id));
assert.ok(!JSON.stringify(state(d)).includes('first group secret'));assert.ok(!JSON.stringify(state(d)).includes('second group secret'));
await act(d,'chat',{groupId:group.id,text:'after Dana joined'});
for(const p of [a,b,c,d])assert.ok(state(p).messages.some(m=>m.text==='after Dana joined'));assert.ok(!JSON.stringify(state(e)).includes('after Dana joined'));
assert.match(state(e).chatActivity.at(-1).text,/Bob.*Dana/);
// A former member loses access while away and cannot see messages sent during absence after rejoining.
await act(b,'leave_group',{groupId:group.id});assert.deepEqual(state(b).groups,[]);assert.ok(!JSON.stringify(state(b)).includes('first group secret'));
await assert.rejects(()=>act(b,'chat',{groupId:group.id,text:'after leaving'}),/不是成员/);
await act(a,'chat',{groupId:group.id,text:'while Bob away'});await act(c,'invite_group',{groupId:group.id,members:[b.id]});
assert.ok(state(b).messages.some(m=>m.text==='first group secret'));assert.ok(!JSON.stringify(state(b)).includes('while Bob away'));
await act(b,'chat',{groupId:group.id,text:'Bob back'});assert.ok(state(a).messages.some(m=>m.text==='Bob back'));
// The public activity feed contains participant names only; it is not sent to Qwen narration or TTS.
for(const content of ['direct secret','reply secret','first group secret','second group secret','after Dana joined','while Bob away','Bob back']){
 assert.ok(!JSON.stringify(g.chatActivity).includes(content));assert.ok(!JSON.stringify(g.events).includes(content));
}
const activityId=g.chatActivity.at(-1).id;await assert.rejects(()=>synthesizePublicVoice(g,a.token,activityId,{key:'mock-key-123',region:'aliyun'},'Cherry'),/公开事件不存在/);
const normalEvents=JSON.stringify(g.events);assert.ok(!normalEvents.includes('发起了私聊'));assert.ok(!normalEvents.includes('讨论组'));

// Each new day can show the pair/group once again, while individual messages never generate public text.
g.phase='day';g.round=1;const beforeDay=g.chatActivity.length;await act(a,'chat',{to:b.id,text:'day1 first'});await act(b,'chat',{to:a.id,text:'day1 reply'});assert.equal(g.chatActivity.length,beforeDay+1);
g.round=2;await act(a,'chat',{to:b.id,text:'day2 first'});assert.equal(g.chatActivity.length,beforeDay+2);
// Room membership is required; night and post-game actions are blocked.
await assert.rejects(()=>perform(g,'bad-token','chat',{to:b.id,text:'no'}),/身份凭证/);
g.phase='night';for(const [op,body] of [['chat',{to:b.id,text:'no'}],['chat',{groupId:group.id,text:'no'}],['create_group',{members:[b.id,c.id]}],['invite_group',{groupId:group.id,members:[e.id]}],['leave_group',{groupId:group.id}]])await assert.rejects(()=>act(a,op,body),/夜晚请保持安静/);
g.phase='ended';await assert.rejects(()=>act(a,'chat',{text:'no'}),/结束后不能聊天/);
// A player can create a discussion with only one other person, then invite more.
{
 const {g:room,p:one}=newGame('TWO234','One');const two=joinGame(room,'Two'),three=joinGame(room,'Three');
 await perform(room,one.token,'create_group',{name:'两人私聊',members:[two.id]});
 const pair=view(room,one.token).groups[0];assert.deepEqual(pair.members,[one.id,two.id]);
 await perform(room,two.token,'chat',{groupId:pair.id,text:'two-person secret'});
 assert.ok(view(room,one.token).messages.some(m=>m.text==='two-person secret'));assert.ok(!JSON.stringify(view(room,three.token)).includes('two-person secret'));
 assert.match(view(room,three.token).chatActivity[0].text,/One.*Two/);
 await perform(room,one.token,'invite_group',{groupId:pair.id,members:[three.id]});
 assert.ok(!JSON.stringify(view(room,three.token)).includes('two-person secret'));
 await perform(room,three.token,'chat',{groupId:pair.id,text:'all three'});for(const player of [one,two,three])assert.ok(view(room,player.token).messages.some(m=>m.text==='all three'));
}
console.log('PASS: public private-chat metadata; group access, invite/leave, frozen message audiences, no history leak, 5-player compatibility and no TTS leakage.');
