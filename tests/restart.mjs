import assert from 'node:assert/strict';
import {newGame,joinGame,perform,leaveGame,view} from '../server-dist/game.js';

// After a game ends the host can reset the room to the lobby (same code, same seats,
// clean state) so new guests can join, and any player may leave the table.
function fixture(n=5){
 const {g,p}=newGame('RST456','P0');const players=[p];
 for(let i=1;i<n;i++)players.push(joinGame(g,`P${i}`));
 return {g,players,host:p};
}

{
 const {g,players:p,host}=fixture();
 await perform(g,host.token,'start',{});
 g.phase='ended';g.winner='善良阵营';
 // Only the host may reset.
 await assert.rejects(()=>perform(g,p[1].token,'restart',{}),/只有房主/);
 // Resetting mid-game is refused — a running story must not be thrown away by accident.
 g.phase='day';g.round=3;
 await assert.rejects(()=>perform(g,host.token,'restart',{}),/本局尚未结束/);
 g.phase='ended';
 const before=g.players.map(q=>q.id);
 await perform(g,host.token,'restart',{});
 assert.equal(g.phase,'lobby');
 assert.equal(g.winner,null);
 assert.equal(g.round,0);
 assert.deepEqual(g.players.map(q=>q.id),before,'players keep their seats');
 for(const q of g.players){assert.equal(q.role,null);assert.equal(q.alive,true);assert.equal(q.ghostVote,true);assert.equal(q.usedSlayer,false);assert.equal(q.drunkRole,null);}
 assert.ok(!g.ballot&&!g.leader&&!g.nominated.length&&!g.nominators.length&&!g.readyDay.length&&!(g.nominationLog||[]).length);
 assert.ok(g.events.some(e=>e.text.includes('已回到大厅')));
 // New guests can join the same room code after the reset.
 const late=joinGame(g,'P5');
 assert.equal(g.players.length,6);
 // And a fresh game starts cleanly (no stale winner/round).
 await perform(g,host.token,'start',{});
 assert.equal(g.phase,'night');assert.equal(g.round,1);assert.equal(g.winner,null);
 view(g,late.token);view(g,host.token);
}

{
 const {g,players:p,host}=fixture();
 // Leaving is fine before the game starts; the host seat moves to the next player.
 leaveGame(g,p[2]);
 assert.equal(g.players.length,4);
 assert.equal(g.hostId,host.id,'host keeps the seat while the host stays');
 leaveGame(g,host);
 assert.equal(g.hostId,p[1].id,'host passes to the first remaining player');
 // Mid-game leaving is refused.
 await assert.rejects(async()=>{g.phase='night';leaveGame(g,p[1]);},/游戏进行中不能退出/);
 // After the game ends everyone may leave, including the last player (room dies with them).
 g.phase='ended';
 leaveGame(g,p[1]);
 assert.equal(g.players.length,2);
 leaveGame(g,p[3]);leaveGame(g,p[4]);
 assert.equal(g.players.length,0);
 assert.ok(g.events.some(e=>e.text.includes('离开了房间')));
}

// A finished room still takes guests, and "再来一局" deals a fresh game to the new roster
// while keeping the room code, the seats and the host's settings.
{
 const {g,players:p,host}=fixture();
 await perform(g,host.token,'start',{});
 g.phase='ended';g.winner='邪恶阵营';
 const late=joinGame(g,'晚到的人');
 assert.equal(g.players.length,6,'guests may join a finished room');
 assert.equal(view(g,late.token).me.role,null,'a late guest has no identity yet');
 leaveGame(g,p[1]);
 assert.equal(g.players.length,5,'old members may leave the finished room');
 await assert.rejects(()=>perform(g,p[2].token,'rematch',{}),/只有房主/);
 await perform(g,host.token,'rematch',{});
 assert.equal(g.phase,'night');assert.equal(g.round,1);assert.equal(g.winner,null);
 assert.ok(g.players.every(q=>q.role),'every seat is dealt a role again');
 assert.ok(g.players.some(q=>q.id===late.id&&q.role),'the late guest plays the new game');
 assert.ok(!g.events.some(e=>e.text.includes('回到了大厅')),'no lobby round-trip required');
 // Too few players cannot start a rematch.
 g.phase='ended';
 for(const q of g.players.filter(q=>q.id!==host.id))leaveGame(g,q);
 g.phase='ended';
 await assert.rejects(async()=>perform(g,host.token,'rematch',{}),/需要 5/);
}

console.log('PASS restart');
