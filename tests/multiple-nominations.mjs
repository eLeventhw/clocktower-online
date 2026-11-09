import assert from 'node:assert/strict';
import {newGame,joinGame,perform,view} from '../server-dist/game.js';

// A single day can hold several nominations. Each player may nominate once per
// day and each target may be nominated once per day. Reaching the vote threshold
// does NOT execute anyone immediately: at day end the nomination with the highest
// vote count (and no tie) across the whole day is executed.
async function fixture(n){
 const {g,p}=newGame('ABC234','P0');const players=[p];
 for(let i=1;i<n;i++)players.push(joinGame(g,`P${i}`));
 await perform(g,p.token,'start',{});
 const roles=['empath','chef','investigator','washerwoman','soldier','imp','monk','undertaker','butler'];
 g.players.forEach((q,i)=>{q.role=roles[i];q.drunkRole=null;});
 g.privateEvents={};g.events=[];g.poisonedId=null;g.pendingDemonId=null;g.lastExecuted=null;g.butlerMasterId=null;
 g.phase='day';g.round=2;g.rulesVersion=2;g.night={cursor:0,nonce:'n',protectedId:null,deathId:null};
 g.ballot=null;g.nominated=[];g.nominators=[];g.leader=null;g.readyDay=[];g.nominationLog=[];
 return {g,players,host:p};
}
// Close a nomination with an explicit list of "yes" voters; everyone else abstains.
async function tally(g,host,nominator,nominee,yesVoters){
 await perform(g,nominator.token,'nominate',{target:nominee.id});
 for(const q of yesVoters)await perform(g,q.token,'vote',{yes:true});
 await perform(g,host.token,'close_vote',{});
}

// 1) A later nomination with more votes beats an earlier one that already
//    reached the threshold. Only the day-end highest vote is executed.
{
 const {g,players:p,host}=await fixture(6);
 assert.equal(view(g,p[0].token).dayNominations.length,0);
 await tally(g,host,p[0],p[1],[p[0],p[2],p[3]]);           // 3 votes, threshold 3
 assert.deepEqual(g.leader,{id:p[1].id,votes:3,tie:false});
 assert.equal(p[1].alive,true);
 await tally(g,host,p[2],p[3],[p[0],p[1],p[2],p[4]]);      // 4 votes
 assert.deepEqual(g.leader,{id:p[3].id,votes:4,tie:false});
 const list=view(g,p[4].token).dayNominations;
 assert.equal(list.length,2);
 assert.deepEqual(list[0],{nominee:'P1',nominator:'P0',votes:3,threshold:3,voters:['P0','P2','P3'],leading:false});
 assert.deepEqual(list[1],{nominee:'P3',nominator:'P2',votes:4,threshold:3,voters:['P0','P1','P2','P4'],leading:true});
 const texts=g.events.map(e=>e.text);
 assert.ok(texts.includes('P1 获得 3 票（处决门槛 3 票）：P0、P2、P3。'));
 assert.ok(texts.includes('P3 获得 4 票（处决门槛 3 票）：P0、P1、P2、P4。'));
 await perform(g,host.token,'end_day',{});
 assert.equal(p[3].alive,false);
 assert.equal(p[1].alive,true);
 assert.equal(g.lastExecuted,p[3].id);
 assert.ok(g.events.some(e=>e.text==='P3 被处决。'));
 assert.ok(!g.events.some(e=>e.text==='P1 被处决。'));
 // The "今日" tally is cleared once the day is over.
 assert.equal(view(g,p[2].token).dayNominations.length,0);
}

// 2) One nomination per player per day, and one nomination per target per day.
{
 const {g,players:p,host}=await fixture(6);
 await tally(g,host,p[0],p[1],[p[0],p[2],p[3]]);
 await assert.rejects(()=>perform(g,p[0].token,'nominate',{target:p[4].id}),/本日你已经提名过/);
 await assert.rejects(()=>perform(g,p[2].token,'nominate',{target:p[1].id}),/该玩家今天已被提名过/);
 const state=view(g,p[3].token);
 assert.deepEqual(state.nominators,[p[0].id]);
 assert.deepEqual(state.nominees,[p[1].id]);
 assert.equal(state.dayNominations.length,1);
}

// 3) A nomination below the threshold is still recorded in the tally but never
//    becomes the leader; an exact tie at the top executes nobody.
{
 const {g,players:p,host}=await fixture(6);
 await tally(g,host,p[0],p[1],[p[0],p[2]]);                 // 2 votes, below 3
 assert.equal(g.leader,null);
 await tally(g,host,p[2],p[3],[p[0],p[1],p[2],p[4]]);      // 4 votes
 const list=view(g,p[0].token).dayNominations;
 assert.deepEqual(list.map(e=>e.votes),[2,4]);
 assert.deepEqual(list.map(e=>e.leading),[false,true]);
 await perform(g,host.token,'end_day',{});
 assert.equal(p[3].alive,false);
 assert.equal(p[1].alive,true);
}
{
 const {g,players:p,host}=await fixture(6);
 await tally(g,host,p[0],p[1],[p[0],p[2],p[3],p[4]]);      // 4 votes
 await tally(g,host,p[2],p[3],[p[0],p[1],p[2],p[4]]);      // 4 votes -> tie
 assert.equal(g.leader.tie,true);
 const list=view(g,p[5].token).dayNominations;
 assert.deepEqual(list.map(e=>e.leading),[false,false]);
 await perform(g,host.token,'end_day',{});
 assert.equal(p[1].alive,true);
 assert.equal(p[3].alive,true);
 assert.equal(g.lastExecuted,null);
 assert.ok(g.events.some(e=>e.text==='最高票平票，今天无人被处决。'));
}

// 4) Rooms saved before nominationLog existed still load: ??= creates it on the
//    first closed vote and the public view degrades to an empty list.
{
 const {g,players:p,host}=await fixture(6);
 delete g.nominationLog;
 assert.deepEqual(view(g,p[2].token).dayNominations,[]);
 await tally(g,host,p[0],p[1],[p[0]]);
 assert.equal(g.nominationLog.length,1);
 assert.equal(view(g,p[2].token).dayNominations[0].votes,1);
}

console.log('PASS: multiple nominations per day, per-player/per-target limits, tallies, and highest-vote (non-tie) day-end execution.');
