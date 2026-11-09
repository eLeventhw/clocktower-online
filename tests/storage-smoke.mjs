import assert from 'node:assert/strict';
import {makeCloudbaseStore,makeStore} from '../server/storage.mjs';
const rows=new Map();
const fake={
 async add(row){if(rows.has(row._id)){const e=new Error('duplicate');e.code='DATABASE_DUPLICATE_WRITE';throw e;}rows.set(row._id,{...row});},
 doc(id){return{async get(){return {data:rows.has(id)?[{...rows.get(id)}]:[]};}}},
 where({ _id,version }){return{
  async update(data){const row=rows.get(_id);if(!row||row.version!==version)return{updated:0};rows.set(_id,{...row,...data});return{updated:1};},
  async remove(){const row=rows.get(_id);if(!row||row.version!==version)return{deleted:0};rows.delete(_id);return{deleted:1};}
 }}
};
const store=makeCloudbaseStore(fake), initial={code:'ABC234',players:[]};
assert.equal(await store.insert(initial),true);assert.equal(await store.insert(initial),false);
const a=await store.load(initial.code), b=await store.load(initial.code);
assert.deepEqual(a.game,initial);assert.equal(await store.save({...a.game,a:1},a.version),true);assert.equal(await store.save({...b.game,b:1},b.version),false);
assert.equal((await store.load(initial.code)).game.a,1);assert.equal(await store.remove(initial.code,0),false);assert.equal(await store.remove(initial.code,1),true);assert.equal(await store.load(initial.code),null);
process.env.DB_DRIVER='memory';process.env.NODE_ENV='production';await assert.rejects(()=>makeStore(),/仅用于本地测试/);
console.log('PASS: mocked CloudBase adapter checks insert uniqueness and compare-and-swap for concurrent changes; memory is rejected in production.');
