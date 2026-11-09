import assert from 'node:assert/strict';
import {newGame,joinGame,perform,view,tick,NOMINATION_VOTE_SECONDS} from '../server-dist/game.js';

// A nomination is a three-beat scene: the nominator states the case, the nominee answers,
// and only then does the 15-second vote open. Silence at the end of the countdown counts
// as "no". The host can press either button for a disconnected player, and can close the
// whole thing early; a ballot written by an older build (no stage) still behaves as a
// plain open vote.
async function fixture(n=6){
 const {g,p}=newGame('DEB234','P0');const players=[p];
 for(let i=1;i<n;i++)players.push(joinGame(g,`P${i}`));
 await perform(g,p.token,'start',{});
 const roles=['empath','chef','investigator','washerwoman','soldier','undertaker'];
 g.players.forEach((q,i)=>{q.role=roles[i];q.drunkRole=null;});
 g.privateEvents={};g.events=[];g.poisonedId=null;g.lastExecuted=null;g.butlerMasterId=null;
 g.phase='day';g.round=2;g.rulesVersion=2;g.dayFlow=2;g.dayStage='discussion';g.discussionOver=false;
 g.night={cursor:0,nonce:'n',protectedId:null,deathId:null};
 g.ballot=null;g.nominated=[];g.nominators=[];g.leader=null;g.readyDay=[];g.nominationLog=[];g.history=[{day:2,nightDeaths:[],nominations:[],executed:null}];
 return {g,players,host:p};
}

// 1) Nominating opens the statement, not the poll: no countdown, no votes counted yet,
//    and only the nominator (or the host) may hand the floor to the nominee.
{
 const {g,players:p,host}=await fixture();
 await perform(g,p[0].token,'nominate',{target:p[1].id});
 assert.equal(g.ballot.stage,'accuse');
 assert.equal(g.ballot.endsAt,null);
 assert.equal(g.dayStage,'discussion','提名不应结束自由讨论');
 const asNominator=view(g,p[0].token).ballot,asNominee=view(g,p[1].token).ballot,asOnlooker=view(g,p[2].token).ballot;
 assert.equal(asNominator.stage,'accuse');
 assert.equal(asNominator.canAdvance,true);
 assert.equal(asNominee.canAdvance,false,'被提名者还不能抢话');
 assert.equal(asOnlooker.canAdvance,false);
 assert.equal(asNominator.seconds,NOMINATION_VOTE_SECONDS);
 await assert.rejects(()=>perform(g,p[2].token,'advance_ballot',{}),/现在只能由提名者本人或房主推进/);
 await assert.rejects(()=>perform(g,p[1].token,'advance_ballot',{}),/现在只能由提名者本人或房主推进/);
 assert.equal(g.ballot.stage,'accuse');
 assert.ok(g.events.some(e=>e.text==='P0 提名了 P1。先由 P0 陈述提名理由，说完点「陈述完毕」。'));

 // The statement ends; the nominee now owns the floor.
 await perform(g,p[0].token,'advance_ballot',{});
 assert.equal(g.ballot.stage,'defense');
 assert.equal(view(g,p[1].token).ballot.canAdvance,true);
 assert.equal(view(g,p[2].token).ballot.canAdvance,false,'旁观者仍然不能推进');
 await assert.rejects(()=>perform(g,p[2].token,'advance_ballot',{}),/现在只能由被提名者本人或房主推进/);
 assert.ok(g.events.some(e=>e.text==='P0 陈述完毕。轮到 P1 狡辩。'));
 assert.equal(view(g,host.token).ballot.canAdvance,true,'房主可以代按被提名者那一步');

 // The defense ends and the clock starts.
 const before=Date.now();
 await perform(g,p[1].token,'advance_ballot',{});
 assert.equal(g.ballot.stage,'vote');
 assert.ok(g.ballot.endsAt>=before+NOMINATION_VOTE_SECONDS*1000);
 assert.ok(g.ballot.endsAt<=Date.now()+NOMINATION_VOTE_SECONDS*1000);
 assert.ok(g.events.some(e=>e.text==='P1 狡辩结束。开始 15 秒投票，没有投票的人视为不赞成。'));
 await assert.rejects(()=>perform(g,p[1].token,'advance_ballot',{}),/投票已经开始/);
}

// 2) The countdown is the only thing that closes a vote: silence is a "no", and the
//    tally event names how many hands were missing without naming them.
{
 const {g,players:p,host}=await fixture();
 await perform(g,p[0].token,'nominate',{target:p[1].id});
 await perform(g,p[0].token,'advance_ballot',{});
 await perform(g,p[1].token,'advance_ballot',{});
 await perform(g,p[0].token,'vote',{yes:true});
 await perform(g,p[2].token,'vote',{yes:true});
 await perform(g,p[3].token,'vote',{yes:true});
 assert.equal(tick(g,Date.now()),false,'时间没到不应提前结算');
 assert.equal(g.ballot.votes[p[5].id],undefined);
 assert.equal(view(g,p[4].token).ballot.submitted,3);

 const late=Date.now()+NOMINATION_VOTE_SECONDS*1000+10;
 assert.equal(tick(g,late),true);
 assert.equal(g.ballot,null);
 assert.deepEqual(g.leader,{id:p[1].id,votes:3,tie:false});
 assert.ok(g.events.some(e=>e.text==='投票时间到，3 人没有投票，视为不赞成。'));
 assert.ok(g.events.some(e=>e.text==='P1 获得 3 票（处决门槛 3 票）：P0、P2、P3。'));
 await assert.rejects(()=>perform(g,p[4].token,'vote',{yes:true}),/投票已经结束/);
 // The day is still in free discussion, so another nomination can follow immediately.
 assert.equal(g.dayStage,'discussion');
 assert.equal(view(g,p[4].token).day.nominateOpen,true);
 await perform(g,p[4].token,'nominate',{target:p[5].id});
 assert.equal(g.ballot.stage,'accuse');
}

// 3) The host can carry the scene for a player whose tab went dark, and can cut the whole
//    nomination short — a skipped nomination simply tallies zero yes votes.
{
 const {g,players:p,host}=await fixture();
 await perform(g,p[2].token,'nominate',{target:p[3].id});
 assert.equal(view(g,host.token).ballot.canAdvance,true,'房主始终可以代按');
 await perform(g,host.token,'advance_ballot',{});
 assert.equal(g.ballot.stage,'defense');
 await perform(g,host.token,'advance_ballot',{});
 assert.equal(g.ballot.stage,'vote');

}
{
 const {g,players:p,host}=await fixture();
 await perform(g,p[2].token,'nominate',{target:p[4].id});
 await perform(g,host.token,'advance_ballot',{});
 await perform(g,host.token,'close_vote',{});
 assert.equal(g.ballot,null);
 assert.equal(g.nominationLog.length,1);
 assert.equal(g.nominationLog[0].votes,0);
 assert.equal(g.leader,null);
 assert.ok(g.events.some(e=>e.text==='P4 获得 0 票（处决门槛 3 票）。'));
}

// 4) Votes cast during the debate are kept but never auto-close the ballot: only the vote
//    stage reacts to a full tally.
{
 const {g,players:p,host}=await fixture(5);
 await perform(g,p[0].token,'nominate',{target:p[1].id});
 for(const q of p)await perform(g,q.token,'vote',{yes:true,auto:true});
 assert.equal(g.ballot.stage,'accuse','陈述阶段不应被自动结算');
 assert.equal(Object.keys(g.ballot.votes).length,5);
 await perform(g,p[0].token,'advance_ballot',{});
 await perform(g,p[1].token,'advance_ballot',{});
 await perform(g,p[2].token,'vote',{yes:true,auto:true});
 assert.equal(g.ballot,null,'进入投票阶段后满票应立即结算');
 assert.deepEqual(g.leader,{id:p[1].id,votes:5,tie:false});
}

// 5) A ballot saved by an older build has no stage: it is treated as an open vote and the
//    host's "结束投票" still works, so a redeploy never strands a table mid-nomination.
{
 const {g,players:p,host}=await fixture();
 g.ballot={nominator:p[0].id,nominee:p[1].id,votes:{}};
 const state=view(g,p[2].token).ballot;
 assert.equal(state.stage,'vote');
 assert.equal(state.voteEndsAt,null);
 assert.equal(state.canAdvance,false,'旧投票没有可推进的环节');
 assert.equal(view(g,host.token).ballot.canAdvance,true,'房主仍可收尾');
 await perform(g,p[0].token,'vote',{yes:true});
 await perform(g,host.token,'close_vote',{});
 assert.equal(g.ballot,null);
 assert.equal(g.nominationLog.length,1);
 assert.equal(g.nominationLog[0].votes,1);
 assert.equal(g.leader,null,'1 票未到门槛，不产生最高票');
 await assert.rejects(()=>perform(g,host.token,'advance_ballot',{}),/当前没有进行中的提名/);
}

// 6) The debate sits inside free discussion: the discussion clock stays paused while a
//    nomination is on the floor and resumes once it is settled.
{
 const {g,players:p,host}=await fixture();
 const soon=Date.now()+1000;g.discussionEndsAt=soon;
 await perform(g,p[0].token,'nominate',{target:p[1].id});
 assert.equal(tick(g,soon+4000),false,'投票进行中不应推进讨论计时');
 assert.equal(g.discussionOver,false);
 await perform(g,p[0].token,'advance_ballot',{});
 await perform(g,p[1].token,'advance_ballot',{});
 await perform(g,host.token,'close_vote',{});
 assert.equal(tick(g,soon+4000),true,'投票结束后讨论计时继续推进');
 assert.equal(g.discussionOver,true);
}
console.log('nomination debate ok');
