import assert from 'node:assert/strict';
import { newGame, joinGame, perform } from '../server-dist/game.js';

// The Chef counts PAIRS of evil players sitting in adjacent chairs; chairs form a circle
// by seat number, which can differ from join order once a freed seat is reused.
async function chefRoom() {
  const { g, p: host } = newGame('CHF123', 'P0');
  for (let i = 1; i < 6; i++) joinGame(g, `P${i}`); // seats 1..6, join order = array order
  const kicked = g.players[1]; // seat 2
  await perform(g, host.token, 'kick', { target: kicked.id });
  const back = joinGame(g, 'P6'); // takes the freed seat 2, but sits last in the array
  assert.equal(back.seat, 2);
  await perform(g, host.token, 'start', {});
  return { g, host };
}

async function chefSees(g, host, roles) {
  g.players.forEach((q, i) => { q.role = roles[i]; q.drunkRole = null; q.alive = true; });
  g.events = []; g.privateEvents = {}; g.actions = {}; g.poisonedId = null; g.butlerMasterId = null;
  g.phase = 'night'; g.round = 1;
  g.night = { cursor: 5, nonce: crypto.randomUUID(), protectedId: null, deathId: null }; // chef's slot
  g.redHerringId = null;
  await perform(g, host.token, 'advance_night', {});
  const chef = g.players.find(q => q.role === 'chef');
  return (g.privateEvents[chef.id] || []).at(-1)?.text || '';
}

// 1) One minion + one demon on neighbouring chairs (seats 2 and 3); evils at array idx 1 and 5 → exactly 1 pair.
//    The old code walked the array instead: imp and spy were NOT array-neighbours → 0.
{
  const { g, host } = await chefRoom();
  // array order is P0,P2,P3,P4,P5,P6 (seats 1,3,4,5,6,2)
  const note = await chefSees(g, host, ['chef', 'imp', 'monk', 'soldier', 'butler', 'poisoner']);
  assert.match(note, /座位相邻的邪恶玩家共有 1 对/, `座位 2、3 相邻 → 1 对，实际：${note}`);
}

// 2) Same two evils on non-adjacent chairs (seats 3 and 5) → 0 pairs.
{
  const { g, host } = await chefRoom();
  const note = await chefSees(g, host, ['chef', 'imp', 'monk', 'poisoner', 'butler', 'soldier']);
  assert.match(note, /座位相邻的邪恶玩家共有 0 对/, `座位 3、5 不相邻 → 0 对，实际：${note}`);
}

// 3) Three evils in a row on seats 2,3,4 (baron P6, imp P2, scarlet P3) → two pairs.
{
  const { g, host } = await chefRoom();
  const note = await chefSees(g, host, ['chef', 'imp', 'scarlet', 'monk', 'butler', 'baron']);
  assert.match(note, /座位相邻的邪恶玩家共有 2 对/, `座位 2、3、4 连坐 → 2 对，实际：${note}`);
}

// 4) The Empath also reads her two chairs in seat order: evil on seat 6 is her left
//    neighbour even though that player sits mid-array.
{
  const { g, host } = await chefRoom();
  g.players.forEach((q, i) => { q.role = ['empath', 'monk', 'soldier', 'butler', 'imp', 'chef'][i]; q.drunkRole = null; q.alive = true; });
  g.events = []; g.privateEvents = {}; g.actions = {}; g.poisonedId = null; g.butlerMasterId = null;
  g.phase = 'night'; g.round = 1;
  g.night = { cursor: 5, nonce: crypto.randomUUID(), protectedId: null, deathId: null };
  g.redHerringId = null;
  await perform(g, host.token, 'advance_night', {});
  const empath = g.players.find(q => q.role === 'empath');
  const note = (g.privateEvents[empath.id] || []).at(-1)?.text || '';
  assert.match(note, /邪恶人数为 1/, `座位 6 的恶魔是共情者（座位 1）的邻座 → 1，实际：${note}`);
}

console.log('PASS: 厨师按座位环计算相邻邪恶对数，共情者按座位号找邻座');
