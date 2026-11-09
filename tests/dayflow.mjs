import assert from 'node:assert/strict';
import {newGame,joinGame,leaveGame,perform,view,tick,DEFAULT_SETTINGS} from '../server-dist/game.js';

async function room(n=6){
 const {g,p:host}=newGame('ABC234','P0');for(let i=1;i<n;i++)joinGame(g,`P${i}`);
 await perform(g,host.token,'start',{});
 g.events=[];g.privateEvents={};g.actions={};g.night.deathId=null;
 return {g,p:g.players,host};
}
// Skipping the night engine: moving the cursor past the last stage resolves the night.
async function toDay(g,host){g.night.cursor=9;await perform(g,host.token,'advance_night',{});assert.equal(g.phase,'day');}

// 1) Seat numbers are stable, shown publicly, and a freed chair is reused.
{
 const {g,p:host}=newGame('ABC234','P0');const p=[host];for(let i=1;i<6;i++)p.push(joinGame(g,`P${i}`));
 assert.deepEqual(g.players.map(q=>q.seat),[1,2,3,4,5,6]);
 const s=view(g,p[3].token);assert.equal(s.me.seat,4);
 assert.deepEqual(s.players.map(q=>q.seat),[1,2,3,4,5,6]);
 const guest=joinGame(g,'Later');assert.equal(guest.seat,7);
 leaveGame(g,p[0]);
 const back=joinGame(g,'Again');assert.equal(back.seat,1,'离开后空出的座位会被重用');
}

// 2) The day opens with whispers, then one speech per living player in seat order.
{
 const {g,p,host}=await room(6);await toDay(g,host);
 const opening=view(g,p[0].token).day;
 assert.equal(opening.stage,'whisper','白天从私聊开始');
 assert.equal(opening.speakerId,null);assert.equal(opening.whisperOpen,true);
 assert.equal(opening.whisperEndsAt>Date.now(),true);
 assert.equal(opening.nominateOpen,false,'私聊阶段不能提名');
 await perform(g,host.token,'end_whisper',{});
 const day=view(g,p[0].token).day;
 assert.equal(day.stage,'speech');assert.equal(day.speakerId,p[0].id,'从 1 号座位开始');
 assert.ok(day.speechEndsAt>Date.now()&&day.speechEndsAt<=Date.now()+DEFAULT_SETTINGS.speechSeconds*1000+50);
 assert.equal(day.whisperOpen,false,'私聊环节已结束');
 // The speaker may end early; the host may also skip anyone.
 await perform(g,p[0].token,'end_speech',{});
 assert.equal(view(g,p[0].token).day.speakerId,p[1].id);
 await perform(g,host.token,'end_speech',{});
 assert.equal(view(g,p[0].token).day.speakerId,p[2].id);
 // Running out of time advances automatically when the clock is consulted.
 g.speechEndsAt=Date.now()-1;assert.equal(tick(g),true);
 assert.equal(view(g,p[0].token).day.speakerId,p[3].id);
 // A player who is not speaking cannot end someone else's turn (the host always may).
 await assert.rejects(()=>perform(g,p[1].token,'end_speech',{}),/现在不是你的发言时间/);
}

// 3) After the last speech the table moves to free discussion, where nominations open; the
//    host may cut the discussion short.
{
 const {g,p,host}=await room(6);await toDay(g,host);
 await perform(g,host.token,'end_whisper',{});
 for(let i=0;i<6;i++){const speaker=view(g,p[0].token).day.speakerId;if(!speaker)break;await perform(g,g.players.find(q=>q.id===speaker).token,'end_speech',{});}
 assert.equal(view(g,p[0].token).day.stage,'discussion');
 assert.equal(view(g,p[0].token).day.nominateOpen,true);
 assert.ok(view(g,p[0].token).day.discussionEndsAt>Date.now());
 // The host cuts the discussion: the storyteller announces it, nominations stay open.
 await perform(g,host.token,'end_discussion',{});
 assert.equal(view(g,p[0].token).day.stage,'discussion');
 assert.equal(view(g,p[0].token).day.discussionOver,true);
 assert.equal(view(g,p[0].token).day.nominateOpen,true);
 // Free discussion also ends by itself, with the same announcement.
 const {g:g2,p:p2,host:h2}=await room(6);await toDay(g2,h2);
 await perform(g2,h2.token,'end_whisper',{});
 for(let i=0;i<6;i++){const speaker=view(g2,p2[0].token).day.speakerId;if(!speaker)break;await perform(g2,g2.players.find(q=>q.id===speaker).token,'end_speech',{});}
 g2.discussionEndsAt=Date.now()-1;assert.equal(tick(g2),true);
 assert.equal(view(g2,p2[0].token).day.stage,'discussion');
 assert.equal(view(g2,p2[0].token).day.discussionOver,true);
 assert.ok(g2.events.some(e=>e.text.includes('说书人宣布：自由讨论结束')));
}

// 4) Private chat is limited to the whisper beat; public chat never is.
{
 const {g,p,host}=await room(6);await toDay(g,host);
 await perform(g,p[0].token,'chat',{text:'psst',to:p[1].id});
 await perform(g,host.token,'end_whisper',{});
 assert.equal(view(g,p[0].token).day.whisperOpen,false);
 await assert.rejects(()=>perform(g,p[1].token,'chat',{text:'too late',to:p[0].id}),/私聊环节已结束/);
 await perform(g,p[1].token,'chat',{text:'still public',to:null});
 assert.ok(view(g,p[2].token).messages.some(m=>m.text==='still public'));
}

// 5) Host settings are validated, persisted for later days, and shown to everyone.
{
 const {g,p,host}=await room(6);await toDay(g,host);
 await assert.rejects(()=>perform(g,host.token,'update_settings',{speechSeconds:5}),/每人发言秒数须在 30–600/);
 await assert.rejects(()=>perform(g,p[1].token,'update_settings',{speechSeconds:90}),/只有房主/);
 await perform(g,host.token,'update_settings',{speechSeconds:90,discussionMinutes:3,whisperMinutes:4});
 assert.deepEqual(view(g,p[3].token).settings,{speechSeconds:90,discussionMinutes:3,whisperMinutes:4});
 assert.ok(view(g,p[3].token).day.whisperEndsAt<=Date.now()+4*60000+50);
 await perform(g,host.token,'end_whisper',{});
 assert.ok(view(g,p[3].token).day.speechEndsAt<=Date.now()+90*1000+50);
}

// 6) Votes are public: the ballot shows who raised a hand, the tally keeps the names, and
//    the review remembers every day.
{
 const {g,p,host}=await room(6);await toDay(g,host);
 await perform(g,host.token,'end_whisper',{});
 for(let i=0;i<6;i++){const speaker=view(g,p[0].token).day.speakerId;if(!speaker)break;await perform(g,g.players.find(q=>q.id===speaker).token,'end_speech',{});}
 await perform(g,p[0].token,'nominate',{target:p[1].id});
 await perform(g,p[0].token,'vote',{yes:true});
 await perform(g,p[2].token,'vote',{yes:true});
 await perform(g,p[3].token,'vote',{yes:false});
 await perform(g,p[4].token,'vote',{yes:true});
 const b=view(g,p[4].token).ballot;
 assert.deepEqual(b.yes,['P0','P2','P4']);assert.deepEqual(b.no,['P3']);
 // A first-night death can leave exactly five voters, in which case the ballot closes on
 // its own the moment the last one votes; only ask the host to close it when still open.
 if(view(g,p[4].token).ballot)await perform(g,host.token,'close_vote',{});
 const list=view(g,p[4].token).dayNominations;
 assert.deepEqual(list[0].voters,['P0','P2','P4']);
 const history=view(g,p[4].token).history;
 assert.equal(history.at(-1).day,1);assert.deepEqual(history.at(-1).nominations[0].voters,['P0','P2','P4']);
 // Nominating inside the discussion does not end the discussion.
 assert.equal(view(g,p[4].token).day.stage,'discussion');
 await perform(g,host.token,'end_day',{});
 const after=view(g,p[4].token).history.at(-1);
 assert.equal(after.executed,'P1');
 assert.ok(view(g,p[4].token).history.length===1);
}

// 7) No private rule state leaks through the ordinary view.
{
 const {g,p}=await room(6);
 g.poisonedId=p[0].id;g.redHerringId=p[1].id;
 const json=JSON.stringify(view(g,p[2].token));
 for(const secret of ['redHerring','poisonedId','red herring'])assert.ok(!json.includes(secret));
}

console.log('PASS: seat numbers, whisper-first day (whisper → speeches → discussion, storyteller ends it but nominations stay open), clocks, host settings, public votes and day review history');
