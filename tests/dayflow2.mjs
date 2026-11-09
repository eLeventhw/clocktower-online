import assert from 'node:assert/strict';
const root='/Users/bytedance/WorkBuddy AI/2026-11-03-11-40-27/clocktower/clocktower-workbuddy';
const {newGame,joinGame,perform,view,tick}=await import(root+'/server-dist/game.js?v='+Date.now());

async function room(n=6){
 const {g,p:host}=newGame('ABC234','P0');for(let i=1;i<n;i++)joinGame(g,`P${i}`);
 await perform(g,host.token,'start',{});
 g.events=[];g.privateEvents={};g.actions={};g.night.deathId=null;
 g.night.cursor=9;await perform(g,host.token,'advance_night',{});
 assert.equal(g.phase,'day');
 return {g,p:g.players,host};
}
const stage=(g,t)=>view(g,t).day.stage;

// 1) 天亮先私聊
{
 const {g,p,host}=await room();
 const d=view(g,p[0].token).day;
 assert.equal(d.stage,'whisper','白天第一个阶段是私聊');
 assert.equal(d.whisperOpen,true);
 assert.equal(d.speakerId,null,'私聊阶段还没轮到任何人发言');
 assert.ok(d.whisperEndsAt>Date.now());
 assert.equal(d.nominateOpen,false,'私聊阶段不能提名');
 await assert.rejects(()=>perform(g,p[0].token,'nominate',{target:p[1].id}),/只有自由讨论阶段可以发起提名/);
 await perform(g,p[0].token,'chat',{text:'悄悄话',to:p[1].id});
 // 房主提前结束私聊 → 直接进入轮流发言
 await perform(g,host.token,'end_whisper',{});
 const after=view(g,p[0].token).day;
 assert.equal(after.stage,'speech');assert.equal(after.speakerId,p[0].id,'从 1 号座位开始');
 assert.equal(after.whisperOpen,false);
 await assert.rejects(()=>perform(g,p[1].token,'chat',{text:'晚了',to:p[0].id}),/私聊环节已结束/);
 await perform(g,p[1].token,'chat',{text:'公开说',to:null});
 assert.ok(view(g,p[2].token).messages.some(m=>m.text==='公开说'),'公开聊天不受影响');
}

// 2) 私聊计时到点自动进入发言
{
 const {g,p}=await room();
 g.whisperEndsAt=Date.now()-1;assert.equal(tick(g),true);
 assert.equal(stage(g,p[0].token),'speech');
}

// 3) 发言轮完 → 自由讨论，讨论期间才能提名
{
 const {g,p,host}=await room();
 await perform(g,host.token,'end_whisper',{});
 for(let i=0;i<6;i++){const sp=view(g,p[0].token).day.speakerId;if(!sp)break;await perform(g,g.players.find(q=>q.id===sp).token,'end_speech',{});}
 const d=view(g,p[0].token).day;
 assert.equal(d.stage,'discussion');assert.equal(d.nominateOpen,true);
 assert.ok(d.discussionEndsAt>Date.now());
 // 提名不改变阶段，投票后还能继续讨论、继续提名
 await perform(g,p[0].token,'nominate',{target:p[1].id});
 assert.equal(stage(g,p[2].token),'discussion','提名不再切走阶段');
 await perform(g,p[2].token,'vote',{yes:true});
 await perform(g,host.token,'close_vote',{});
 assert.equal(view(g,p[2].token).dayNominations.length,1);
 await perform(g,p[3].token,'nominate',{target:p[4].id});
 assert.equal(stage(g,p[2].token),'discussion');
 await perform(g,host.token,'close_vote',{});
 assert.equal(view(g,p[2].token).dayNominations.length,2,'讨论中可以多次提名');
}

// 4) 讨论时间到 → 说书人宣布结束，提名继续开放；房主可直接结束白天
{
 const {g,p,host}=await room();
 await perform(g,host.token,'end_whisper',{});
 for(let i=0;i<6;i++){const sp=view(g,p[0].token).day.speakerId;if(!sp)break;await perform(g,g.players.find(q=>q.id===sp).token,'end_speech',{});}
 // 讨论阶段就能准备入夜
 await perform(g,p[1].token,'ready_day',{});
 assert.equal(view(g,p[1].token).readyDay.count,1);
 await perform(g,p[1].token,'ready_day',{}); // 取消
 await perform(g,p[0].token,'nominate',{target:p[1].id});
 g.discussionEndsAt=Date.now()-1;assert.equal(tick(g),false,'投票未结束不宣布');
 assert.equal(stage(g,p[0].token),'discussion');
 await perform(g,host.token,'close_vote',{});
 assert.equal(tick(g),true);
 // 没有结算阶段：计时结束后仍在 discussion，说书人宣布，提名继续开放
 assert.equal(stage(g,p[0].token),'discussion','不再进入结算阶段');
 assert.equal(view(g,p[0].token).day.discussionOver,true,'说书人已宣布讨论结束');
 assert.equal(view(g,p[0].token).day.nominateOpen,true,'提名继续开放');
 assert.ok(g.events.some(e=>e.text.includes('说书人宣布：自由讨论结束')));
 await perform(g,p[2].token,'nominate',{target:p[3].id});
 await perform(g,host.token,'close_vote',{});
 assert.equal(view(g,p[2].token).dayNominations.length,2,'宣布结束后仍可提名');
 // 结束白天按最高票处决并进入夜晚
 await perform(g,host.token,'end_day',{});assert.equal(g.phase,'night');
}

// 4b) 全程无人提名时，房主可以直接结束白天进入夜晚
{
 const {g,p,host}=await room();
 await perform(g,host.token,'end_whisper',{});
 for(let i=0;i<6;i++){const sp=view(g,p[0].token).day.speakerId;if(!sp)break;await perform(g,g.players.find(q=>q.id===sp).token,'end_speech',{});}
 g.discussionEndsAt=Date.now()-1;tick(g);
 assert.equal(view(g,p[0].token).day.discussionOver,true);
 await perform(g,host.token,'end_day',{});
 assert.equal(g.phase,'night','无人提名时房主可直接结束白天');
 assert.ok(g.events.some(e=>e.text.includes('今天无人被处决')));
}

// 5) 房主结束讨论 / 结束私聊 的边角情况
{
 const {g,p,host}=await room();
 await perform(g,host.token,'end_whisper',{});
 await assert.rejects(()=>perform(g,host.token,'end_whisper',{}),/现在不在私聊环节/);
 await perform(g,host.token,'end_discussion',{});
 assert.equal(stage(g,p[0].token),'discussion','房主宣布结束讨论后仍是 discussion');
 assert.equal(view(g,p[0].token).day.discussionOver,true);
 assert.equal(view(g,p[0].token).day.nominateOpen,true,'宣布后仍可提名');
}

// 6) 私聊时长改动只影响当前私聊阶段
{
 const {g,p,host}=await room();
 await perform(g,host.token,'update_settings',{whisperMinutes:12,speechSeconds:90,discussionMinutes:6});
 const d=view(g,p[0].token).day;
 assert.ok(d.whisperEndsAt<=Date.now()+12*60000+60);
 assert.equal(d.speechEndsAt,null,'还没到发言阶段');
}
// 7) 发言超时自动换人时，说书人会广播提醒（事件流里可见，也会被语音朗读）
{
 const {g,p,host}=await room();
 await perform(g,host.token,'end_whisper',{});
 assert.equal(stage(g,p[0].token),'speech');
 const before=g.events.length;
 g.speechEndsAt=Date.now()-1;tick(g);
 const added=g.events.slice(before).map(e=>e.text).join('\n');
 assert.ok(added.includes('发言时间到了'),'有超时提醒');
 assert.ok(added.includes(p[1].name),'提醒下一位发言人');
 assert.equal(stage(g,p[0].token),'speech');
 // 一直超时会依次走完所有人并进入自由讨论，最后一条提醒说明讨论开始
 g.speechQueue=g.players.filter(q=>q.alive).map(q=>q.id);g.speechIndex=g.speechQueue.indexOf(g.speakerId);
 for(let i=0;i<8;i++){g.speechEndsAt=Date.now()-1;if(!tick(g))break;}
 assert.equal(stage(g,p[0].token),'discussion');
 assert.ok(g.events.at(-1).text.includes('自由讨论'),'最后广播讨论开始');
}
console.log('PASS: 私聊 → 轮流发言 → 自由讨论（可提名，计时结束说书人宣布后提名继续）→ 房主结束白天');
