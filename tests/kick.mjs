import assert from 'node:assert/strict';
const root = '/Users/bytedance/WorkBuddy AI/2026-11-03-11-40-27/clocktower/clocktower-workbuddy';
const { newGame, joinGame, perform, view, leaveGame } = await import(root + '/server-dist/game.js?v=' + Date.now());

// 1) The host can clear a seat while the room is still in the lobby.
{
  const { g, p: host } = newGame('ABC234', 'P0');
  for (let i = 1; i < 6; i++) joinGame(g, `P${i}`);
  const guest = g.players[3];
  const seat = guest.seat;
  const token = guest.token;
  await perform(g, host.token, 'kick', { target: guest.id });
  assert.equal(g.players.length, 5, '少了一名玩家');
  assert.equal(g.players.some(q => q.id === guest.id), false, '被请出的玩家不在名单里');
  assert.ok(g.events.at(-1).text.includes('被房主请出了房间'), '事件里说明谁被请出');
  assert.ok(g.events.at(-1).text.includes('座位空了出来'), '提示座位已空出');
  // The stale token no longer resolves to a seat.
  assert.throws(() => view(g, token), /身份凭证/);
  // The freed chair is the lowest one available again.
  const back = joinGame(g, 'P3');
  assert.equal(back.seat, seat, '空出来的座位优先补位');
}

// 2) Only the host, only in the lobby, never the host themself.
{
  const { g, p: host } = newGame('ABC234', 'P0');
  for (let i = 1; i < 6; i++) joinGame(g, `P${i}`);
  await assert.rejects(() => perform(g, g.players[1].token, 'kick', { target: g.players[2].id }), /只有房主/);
  await assert.rejects(() => perform(g, host.token, 'kick', { target: host.id }), /房主不能请出自己/);
  await assert.rejects(() => perform(g, host.token, 'kick', { target: 'nope' }), /该玩家已经不在房间里/);
}

// 3) Mid-game seats are frozen: nobody can be kicked once cards are dealt.
{
  const { g, p: host } = newGame('ABC234', 'P0');
  for (let i = 1; i < 6; i++) joinGame(g, `P${i}`);
  await perform(g, host.token, 'start', {});
  assert.equal(g.phase, 'night');
  await assert.rejects(() => perform(g, host.token, 'kick', { target: g.players[4].id }), /只能请出还没开始的房间里的玩家/);
  assert.equal(g.players.length, 6, '开局后人数不变');
}

// 4) A kicked guest leaves nothing behind in the lobby chat.
{
  const { g, p: host } = newGame('ABC234', 'P0');
  for (let i = 1; i < 6; i++) joinGame(g, `P${i}`);
  const guest = g.players[2];
  await perform(g, g.players[1].token, 'chat', { text: '公开说一句' });
  await perform(g, g.players[1].token, 'chat', { text: '悄悄话', to: guest.id });
  const group = await perform(g, g.players[1].token, 'create_group', { members: [guest.id, g.players[3].id], name: '三人小组' });
  assert.ok(group);
  await perform(g, host.token, 'kick', { target: guest.id });
  assert.equal((g.messages || []).some(m => m.from === guest.id), false, '被请出者的消息不留在房间里');
  const stillThere = view(g, g.players[1].token).messages.some(m => m.text === '公开说一句');
  assert.equal(stillThere, true, '其他人的聊天不受影响');
}

// 5) After a game ends the room returns to the lobby, and the host may kick again.
{
  const { g, p: host } = newGame('ABC234', 'P0');
  for (let i = 1; i < 6; i++) joinGame(g, `P${i}`);
  await perform(g, host.token, 'start', {});
  g.phase = 'ended';
  await perform(g, host.token, 'restart', {});
  assert.equal(g.phase, 'lobby');
  const guest = g.players[2];
  await perform(g, host.token, 'kick', { target: guest.id });
  assert.equal(g.players.length, 5);
}

// 6) A guest leaving by themself still works, and when the host leaves the next player
//    takes the room over.
{
  const { g, p: host } = newGame('ABC234', 'P0');
  for (let i = 1; i < 6; i++) joinGame(g, `P${i}`);
  leaveGame(g, g.players[2]);
  assert.equal(g.players.length, 5);
  leaveGame(g, host);
  assert.equal(g.hostId, g.players[0].id, '房主离开后由下一位接管');
}

console.log('PASS: 大厅踢人（房主专属、开局后冻结、空座优先补位、聊天记录随人清理、房主离开后自动移交）');
