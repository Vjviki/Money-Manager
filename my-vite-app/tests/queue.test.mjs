import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import assert from 'node:assert/strict';
const home=readFileSync(new URL('../src/components/Home/index.jsx',import.meta.url),'utf8');
const method=home.slice(home.indexOf('  const addAllDetectedTransactions ='),home.indexOf('\n  const recentTransactions'));
async function upload(failSecond=false,newArrival=false) {
 let pending=[{id:'A'},{id:'B'}], calls=0, saved=[]; const busy={current:false};
 const run=new Function('detectedTransactions','queueBusy','fetch','API','headers','buildDetectedPayload','DetectedTransaction','setAddingAll','setDetectedTransactions','toast','loadHome','checkDetectedTransactions','console',method+'\nreturn addAllDetectedTransactions();');
 await run([...pending],busy,async()=>{ calls++; if(calls===2&&failSecond)return {ok:false};saved.push(calls===1?'A':'B');if(calls===1&&newArrival)pending.push({id:'C'});return {ok:true};},'mock',{},x=>x,{removePending:async({id})=>{pending=pending.filter(x=>x.id!==id);},clearAllPending:()=>{throw Error('Must not clear all');}},()=>{},()=>{},{success(){},error(){}},async()=>{},async()=>{},{error(){}});
 return {pending:pending.map(x=>x.id),saved,busy:busy.current};
}
test('new payment survives Add All',async()=>assert.deepEqual(await upload(false,true),{pending:['C'],saved:['A','B'],busy:false}));
test('failed upload keeps only unacknowledged items',async()=>assert.deepEqual(await upload(true,false),{pending:['B'],saved:['A'],busy:false}));
test('Java parser: directions, recipients, grouped summary, replay and distinct references',()=>{
 const dir=mkdtempSync(join(tmpdir(),'money-parser-'));
 try {execFileSync('javac',['-d',dir,'android/app/src/main/java/com/vjviki/moneymanager/TransactionParser.java','tests/TransactionParserTest.java']);assert.match(execFileSync('java',['-cp',dir,'com.vjviki.moneymanager.TransactionParserTest'],{encoding:'utf8'}),/16 checks passed/);}finally{rmSync(dir,{recursive:true,force:true});}
});
const backend=readFileSync(new URL('../../backend/index.js',import.meta.url),'utf8');
const route=backend.slice(backend.indexOf('app.post("/", authenticateToken'),backend.indexOf('\napp.get("/", authenticateToken'));
test('backend retry acknowledges an existing payment, IDs scoped to user',async()=>{
 let handler;const rows=new Map();const Transaction={init:async()=>{},create:async row=>{const key=row.user_id+':'+row.detected_id;if(rows.has(key))throw Object.assign(new Error('duplicate'),{code:11000});rows.set(key,row);},exists:async row=>rows.has(row.user_id+':'+row.detected_id)};
 new Function('app','authenticateToken','Transaction',route)({post:(_p,_a,fn)=>{handler=fn;}},()=>{},Transaction);
 const req={user:{id:'user-1'},body:{detected_id:'v2-payment',amount:20,type:'Income'}};const responses=[];
 const res={send:value=>responses.push(value),status(code){throw Error(`Unexpected HTTP ${code}`);}};
 await handler(req,res);await handler(req,res);assert.equal(rows.size,1);assert.equal(responses[1].message,'Transaction already added');await handler({...req,user:{id:'user-2'}},res);assert.equal(rows.size,2);
});
