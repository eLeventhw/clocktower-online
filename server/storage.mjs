// All room documents are server-only: never use this module in browser code.
//
// Drivers:
//   file      durable JSON-per-room store with atomic replace + version CAS (default)
//   cloudbase CloudBase document database adapter (used when a cloud env is configured)
//   memory    in-process only, rejected outside NODE_ENV=test
//
// Every driver implements the same contract used by server/index.mjs:
//   insert(game) -> boolean          false when the room code already exists
//   load(code)   -> {game,version}   null when the room does not exist
//   save(game,version) -> boolean    false when the stored version moved on (CAS)
//   remove(code,version) -> boolean  false when the stored version moved on (CAS)
import {mkdir, open, readdir, readFile, rename, unlink} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {randomUUID} from 'node:crypto';

const CODE_RE = /^[A-Z2-9]{6}$/;

export function makeMemoryStore() {
  const rooms = new Map();
  return {
    async insert(game) { if (rooms.has(game.code)) return false; rooms.set(game.code,{data:JSON.stringify(game),version:0}); return true; },
    async load(code) { const r=rooms.get(code); return r ? {game:JSON.parse(r.data),version:r.version} : null; },
    async save(game, version) {const r=rooms.get(game.code);if(!r||r.version!==version)return false;rooms.set(game.code,{data:JSON.stringify(game),version:version+1});return true;},
    async remove(code,version){const r=rooms.get(code);if(!r||r.version!==version)return false;return rooms.delete(code);}
  };
}

// Durable store: one JSON document per room, replaced atomically (temp file + rename),
// with per-room serialization so a version check and the following write cannot interleave.
export function makeFileStore(dir = process.env.CLOCKTOWER_DATA_DIR || resolve(process.cwd(), 'data')) {
  const root = join(dir, 'rooms');
  const chains = new Map();
  const file = (code) => {
    if (!CODE_RE.test(code)) throw new Error('房间码应为 6 位');
    return join(root, `${code}.json`);
  };
  const withLock = async (key, fn) => {
    const prev = chains.get(key) || Promise.resolve();
    let release;
    const gate = new Promise((r) => { release = r; });
    const chain = prev.then(() => gate);
    chains.set(key, chain);
    await prev.catch(() => {});
    try { return await fn(); } finally { release(); if (chains.get(key) === chain) chains.delete(key); }
  };
  const read = async (code) => {
    let raw;
    try { raw = await readFile(file(code), 'utf8'); }
    catch (e) { if (e?.code === 'ENOENT') return null; throw e; }
    return JSON.parse(raw);
  };
  const writeAtomic = async (target, row) => {
    const tmp = `${target}.${randomUUID()}.tmp`;
    const handle = await open(tmp, 'w');
    try { await handle.writeFile(JSON.stringify(row)); await handle.sync(); }
    finally { await handle.close(); }
    await rename(tmp, target);
  };
  return {
    async ready() { await mkdir(root, {recursive: true}); return root; },
    async insert(game) {
      await mkdir(root, {recursive: true});
      const target = file(game.code);
      return withLock(game.code, async () => {
        let handle;
        try { handle = await open(target, 'wx'); }
        catch (e) { if (e?.code === 'EEXIST') return false; throw e; }
        try { await handle.writeFile(JSON.stringify({version: 0, data: JSON.stringify(game), updatedAt: Date.now()})); await handle.sync(); }
        finally { await handle.close(); }
        return true;
      });
    },
    async load(code) {
      const row = await read(code);
      if (!row) return null;
      return {game: JSON.parse(row.data), version: row.version};
    },
    async save(game, version) {
      const target = file(game.code);
      return withLock(game.code, async () => {
        const row = await read(game.code);
        if (!row || row.version !== version) return false;
        await writeAtomic(target, {version: version + 1, data: JSON.stringify(game), updatedAt: Date.now()});
        return true;
      });
    },
    async remove(code, version) {
      const target = file(code);
      return withLock(code, async () => {
        const row = await read(code);
        if (!row || row.version !== version) return false;
        await unlink(target);
        return true;
      });
    },
    // Release rooms nobody has touched for ttlMs. Used for abandoned games,
    // which never hit the lobby `leave` path because players cannot leave once started.
    async sweep(ttlMs) {
      let names;
      try { names = await readdir(root); }
      catch (e) { if (e?.code === 'ENOENT') return 0; throw e; }
      const cutoff = Date.now() - ttlMs;
      let released = 0;
      for (const name of names) {
        if (!name.endsWith('.json')) continue;
        const code = name.slice(0, -'.json'.length);
        if (!CODE_RE.test(code)) continue;
        const gone = await withLock(code, async () => {
          const row = await read(code);
          if (!row) return false;
          if ((row.updatedAt ?? 0) >= cutoff) return false;
          await unlink(file(code));
          return true;
        });
        if (gone) released++;
      }
      return released;
    }
  };
}

export async function makeStore() {
  const driver = process.env.DB_DRIVER || 'file';
  if (driver === 'memory') {
    if (process.env.NODE_ENV !== 'test') throw new Error('memory 存储仅用于本地测试，部署必须使用持久化存储');
    return makeMemoryStore();
  }
  if (driver === 'file') {
    const store = makeFileStore();
    const root = await store.ready();
    console.log(`Clocktower storage: durable file store at ${root}`);
    return store;
  }
  if(driver!=='cloudbase') throw new Error('未知数据库类型');
  const imported = await import('@cloudbase/node-sdk');
  const tcb = imported.default || imported;
  const envId = process.env.CLOUDBASE_ENV_ID || process.env.TCB_ENV_ID;
  const app=tcb.init({env:envId || tcb.SYMBOL_CURRENT_ENV});
  const collection=app.database().collection(process.env.CLOCKTOWER_COLLECTION || 'clocktower_rooms');
  return makeCloudbaseStore(collection);
}

export function makeCloudbaseStore(collection) {
  const count=(result, key)=>{
    const n=result?.[key] ?? result?.stats?.[key] ?? (key==='deleted'?result?.removed:undefined) ?? (key==='deleted'?result?.stats?.removed:undefined);
    if(typeof n!=='number')throw new Error('云数据库返回的更新结果无法确认，请检查云数据库适配');
    return n;
  };
  return {
    async insert(game){try{await collection.add({_id:game.code,data:JSON.stringify(game),version:0,updatedAt:Date.now()});return true;}catch(e){if(e?.code==='DATABASE_DUPLICATE_WRITE'||/duplicate|E11000|already exists/i.test(String(e?.message||'')))return false;throw e;}},
    async load(code){const result=await collection.doc(code).get();const row=Array.isArray(result?.data)?result.data[0]:result?.data;if(!row)return null;return {game:JSON.parse(row.data),version:row.version};},
    async save(game,version){const r=await collection.where({_id:game.code,version}).update({data:JSON.stringify(game),version:version+1,updatedAt:Date.now()});return count(r,'updated')===1;},
    async remove(code,version){const r=await collection.where({_id:code,version}).remove();return count(r,'deleted')===1;}
  };
}
