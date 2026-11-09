import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {makeFileStore, makeStore} from '../server/storage.mjs';

const dir = await mkdtemp(join(tmpdir(), 'clocktower-'));
const code = 'ABC234';
const initial = {code, phase: 'lobby', players: [], round: 0};
try {
  const store = makeFileStore(dir);
  await store.ready();

  // insert is exclusive on the room code
  assert.equal(await store.insert(initial), true);
  assert.equal(await store.insert(initial), false);

  // two readers see the same version; only the first write wins
  const a = await store.load(code);
  const b = await store.load(code);
  assert.deepEqual(a.game, initial);
  assert.equal(a.version, 0);
  assert.equal(await store.save({...a.game, round: 1}, a.version), true);
  assert.equal(await store.save({...b.game, round: 2}, b.version), false, 'stale version must not overwrite');

  // a fresh store instance over the same directory still reads the room (restart durability)
  const reopened = makeFileStore(dir);
  const afterRestart = await reopened.load(code);
  assert.equal(afterRestart.game.round, 1);
  assert.equal(afterRestart.version, 1);

  // concurrent writers holding the same version: exactly one commits
  const race = await Promise.all(
    Array.from({length: 8}, (_, i) => reopened.save({...afterRestart.game, round: 100 + i}, afterRestart.version))
  );
  assert.equal(race.filter(Boolean).length, 1, 'exactly one concurrent write may commit');
  const settled = await reopened.load(code);
  assert.equal(settled.version, 2);

  // unknown rooms and bad codes
  assert.equal(await reopened.load('ZZZZZZ'), null);
  await assert.rejects(() => reopened.load('../etc'), /房间码/);

  // remove is also version guarded
  assert.equal(await reopened.remove(code, settled.version - 1), false);
  assert.equal(await reopened.remove(code, settled.version), true);
  assert.equal(await reopened.load(code), null);

  // idle rooms are released, rooms still in use are kept
  assert.equal(await reopened.insert({code: 'SWEEP2', phase: 'night', players: []}), true);
  assert.equal(await reopened.sweep(60 * 60 * 1000), 0, 'a fresh room must survive the sweep');
  assert.equal(await reopened.load('SWEEP2').then((r) => r !== null), true);
  assert.equal(await reopened.sweep(-1), 1, 'an idle room must be released');
  assert.equal(await reopened.load('SWEEP2'), null);

  // memory stays test-only
  process.env.DB_DRIVER = 'memory';
  process.env.NODE_ENV = 'production';
  await assert.rejects(() => makeStore(), /仅用于本地测试/);

  console.log('PASS: durable file store survives restart, rejects stale/concurrent writes, releases idle rooms, and memory is refused in production.');
} finally {
  await rm(dir, {recursive: true, force: true});
}
