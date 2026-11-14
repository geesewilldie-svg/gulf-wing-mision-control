import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac, timingSafeEqual} from 'node:crypto';
import {mkdtempSync,rmSync,existsSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createGulfWingReceiver,readGulfWingInbox} from '../lib/server/gulf-wing-integration.ts';
const NOW=Date.parse('2026-11-14T15:00:00.000Z');
const env={GULF_WING_COMPANY_ID:'gulf-wing',GULF_WING_INTEGRATION_KEY:'ab'.repeat(32)};
const event={version:1,companyId:'gulf-wing',eventId:'evt_fixture',eventType:'job.approved',jobId:'job_fixture',occurredAt:'2026-11-14T14:59:00.000Z'};
function request(payload,{timestamp=String(NOW/1000),key=env.GULF_WING_INTEGRATION_KEY,signature,extraHeaders={},raw}={}){
 const body=raw??JSON.stringify(payload);
 const signed=signature??createHmac('sha256',Buffer.from(key,'hex')).update(timestamp+'.'+body).digest('hex');
 return new Request('https://nexus.example.test/api/integrations/gulf-wing/events',{method:'POST',headers:{'content-type':'application/json','x-gw-timestamp':timestamp,'x-gw-signature':signed,...extraHeaders},body});
}
function fixture(run){const dataDir=mkdtempSync(path.join(os.tmpdir(),'nexus-gw-inbox-'));try{return Promise.resolve(run({receiver:createGulfWingReceiver({env,now:()=>NOW,dataDir}),dataDir})).finally(()=>rmSync(dataDir,{recursive:true,force:true}));}catch(error){rmSync(dataDir,{recursive:true,force:true});throw error;}}
async function verify(response){assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');const body=await response.text(),stamp=response.headers.get('x-gw-timestamp'),signature=response.headers.get('x-gw-signature');const expected=createHmac('sha256',Buffer.from(env.GULF_WING_INTEGRATION_KEY,'hex')).update(stamp+'.'+body).digest();assert.ok(timingSafeEqual(expected,Buffer.from(signature,'hex')));return JSON.parse(body);}

test('disabled and invalid settings fail closed without creating storage',async()=>fixture(async({dataDir})=>{
 for(const config of [{},{GULF_WING_COMPANY_ID:'gulf-wing'}, {...env,GULF_WING_INTEGRATION_KEY:'bad'}]){
  const receiver=createGulfWingReceiver({env:config,dataDir,now:()=>NOW});assert.equal((await receiver.handle(request(event),'events')).status,503);
 }
 assert.equal(existsSync(path.join(dataDir,'gulf-wing-integration.sqlite')),false);
}));
test('signed nonce handshake authenticates service/company and does not create inbox',async()=>fixture(async({receiver,dataDir})=>{
 const nonce='12'.repeat(16);const response=await receiver.handle(request({version:1,companyId:'gulf-wing',nonce}),'handshake');
 assert.deepEqual(await verify(response),{version:1,companyId:'gulf-wing',nonce,service:'nexus'});
 assert.equal(existsSync(path.join(dataDir,'gulf-wing-integration.sqlite')),false);
 assert.equal((await receiver.handle(request({...event,nonce}),'handshake')).status,400);
}));
test('persisted events deduplicate across receiver restart and conflicts do not overwrite',async()=>fixture(async({receiver,dataDir})=>{
 const first=await verify(await receiver.handle(request(event),'events'));assert.deepEqual(first,{version:1,companyId:'gulf-wing',eventId:event.eventId,accepted:true,duplicate:false});
 const restarted=createGulfWingReceiver({env,now:()=>NOW,dataDir});assert.equal((await verify(await restarted.handle(request(event),'events'))).duplicate,true);
 assert.equal((await restarted.handle(request({...event,eventType:'job.rework'}),'events')).status,409);
 const inbox=readGulfWingInbox({env,dataDir});assert.equal(inbox.length,1);assert.equal(inbox[0].eventType,'job.approved');assert.equal(inbox[0].receivedAt,new Date(NOW).toISOString());
 assert.equal(existsSync(path.join(dataDir,'workspace.json')),false);
}));
test('wrong company, key, signatures, stale/future timestamps and browser requests are rejected',async()=>fixture(async({receiver,dataDir})=>{
 for(const options of [{key:'cd'.repeat(32)},{signature:'0'.repeat(64)},{signature:'bad'},{timestamp:String(NOW/1000-301)},{timestamp:String(NOW/1000+301)},{timestamp:'NaN'},{extraHeaders:{Origin:'https://nexus.example.test'}}]){
  assert.ok((await receiver.handle(request(event,options),'events')).status>=400);
 }
 assert.equal((await receiver.handle(request({...event,companyId:'other-company'}),'events')).status,400);
 assert.equal(existsSync(path.join(dataDir,'gulf-wing-integration.sqlite')),false);
}));
test('strict minimal payload blocks sensitive fields, unsupported events and malformed identifiers',async()=>fixture(async({receiver,dataDir})=>{
 for(const payload of [{...event,photos:[]},{...event,payCents:100},{...event,eventType:'payout.requested'},{...event,eventId:'../escape'},{...event,jobId:'x'.repeat(121)},{...event,occurredAt:'2026-11-14'},{...event,version:2},[]]) assert.equal((await receiver.handle(request(payload),'events')).status,400);
 assert.equal((await receiver.handle(request(event,{raw:'{not-json'}),'events')).status,400);
 assert.equal((await receiver.handle(request(event,{extraHeaders:{'content-type':'text/plain'}}),'events')).status,415);
 assert.equal((await receiver.handle(request(event,{raw:'x'.repeat(16385)}),'events')).status,413);
 assert.equal(existsSync(path.join(dataDir,'gulf-wing-integration.sqlite')),false);
}));
test('out-of-order events stay immutable and configured company inspection is isolated',async()=>fixture(async({receiver,dataDir})=>{
 await receiver.handle(request(event),'events');await receiver.handle(request({...event,eventId:'evt_older',eventType:'job.assigned',occurredAt:'2026-11-13T10:00:00.000Z'}),'events');
 const inbox=readGulfWingInbox({env,dataDir});assert.equal(inbox.length,2);assert.ok(inbox.some(item=>item.eventType==='job.approved'));assert.ok(inbox.some(item=>item.eventType==='job.assigned'));
 assert.deepEqual(readGulfWingInbox({env:{...env,GULF_WING_COMPANY_ID:'another'},dataDir}),[]);
}));
