import assert from 'node:assert/strict';
import { newGame, joinGame, perform, view } from '../server-dist/game.js';

// When a night takes the last townsfolk the story is over: the storyteller announces the
// winner and nothing else — no new day, no whisper/discussion hand-off, no daybreak prose.
{
  const { g, p: host } = newGame('WIN123', 'P0');
  for (let i = 1; i < 5; i++) joinGame(g, `P${i}`);
  await perform(g, host.token, 'start', {});
  // 5 players: one demon, four good. Two good are already dead, the night kill takes a
  // third, leaving exactly two alive → evil wins.
  ['imp', 'chef', 'empath', 'soldier', 'monk'].forEach((r, i) => { g.players[i].role = r; g.players[i].drunkRole = null; });
  g.players[3].alive = false; g.players[3].ghostVote = false;
  g.players[4].alive = false; g.players[4].ghostVote = false;
  // The night engine kills the victim during the night; mirror that state here so the
  // resolution step only has to announce it.
  g.players[2].alive = false; g.players[2].ghostVote = false;
  g.night.deathId = g.players[2].id;
  g.events = [];
  g.night.cursor = 9;
  await perform(g, host.token, 'advance_night', {});

  assert.equal(g.phase, 'ended', '当夜即分出胜负');
  assert.equal(g.winner, '邪恶阵营');
  const texts = g.events.map(e => e.text);
  assert.ok(texts.some(t => t.includes('邪恶阵营获胜')), '说书人宣布胜利方');
  assert.ok(texts.some(t => t.includes('在夜里死亡')), '死亡结果照常公布');
  // No second day is opened after the verdict.
  // The death of the night is still announced; what must not follow is the new day.
  for (const banned of ['私聊时间开始', '按座位顺序发言', '自由讨论']) {
    assert.ok(!texts.some(t => t.includes(banned)), `判定后不应再出现「${banned}」：${texts.join(' | ')}`);
  }
  assert.ok(!texts.some(t => t.startsWith('说书人：')), '判定后不再生成白天旁白');
  const endView = view(g, host.token);
  assert.equal(endView.day?.stage ?? null, null, '判定后不再有进行中的白天阶段');
  assert.equal(endView.day?.nominateOpen, false, '判定后不能提名');
  assert.equal(endView.phase, 'ended');
}

// A quiet night still opens the day as before: death notice, whisper hand-off and (with a
// key) room for the daybreak prose.
{
  const { g, p: host } = newGame('WIN124', 'P0');
  for (let i = 1; i < 6; i++) joinGame(g, `P${i}`);
  await perform(g, host.token, 'start', {});
  g.players.forEach((q, i) => { q.role = ['imp', 'chef', 'empath', 'soldier', 'monk', 'butler'][i]; });
  g.night.deathId = null;
  g.events = [];
  g.night.cursor = 9;
  await perform(g, host.token, 'advance_night', {});
  assert.equal(g.phase, 'day', '没分出胜负就照常天亮');
  assert.ok(g.events.some(e => e.text.includes('私聊时间开始')), '仍然开启私聊环节');
  assert.equal(view(g, host.token).day.stage, 'whisper');
}

console.log('PASS: 胜负判定后只宣布胜利方，不再开启新一天、不再产生白天旁白');
