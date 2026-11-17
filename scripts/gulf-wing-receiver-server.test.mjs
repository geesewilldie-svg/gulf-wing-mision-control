import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHmac,randomBytes} from 'node:crypto';
import {createReceiverServer} from './gulf-wing-receiver-server.mjs';
import {readGulfWingInbox} from '../lib/server/gulf-wing-integration.ts';
test('dedicated host validates configuration before opening a listener',()=>{
 assert.throws(()=>createReceiverServer({env:{}}),/Configure/);
 assert.throws(()=>createReceiverServer({env:{GULF_WING_COMPANY_ID:'fixture',GULF_WING_INTEGRATION_KEY:'a'.repeat(64),GW_SYNC_DATA_DIR:'relative'}}),/absolute/);
});
test('dedicated HTTP inbox exposes no Controller routes and preserves signed idempotent events after restart',async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'gw-dedicated-inbox-')),key=randomBytes(32).toString('hex');
 const env={GULF_WING_COMPANY_ID:'fixture-company',GULF_WING_INTEGRATION_KEY:key,GW_SYNC_DATA_DIR:dir};let server;
 const start=async()=>{server=createReceiverServer({env});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));return 'http://127.0.0.1:'+server.address().port};
 try{
  let base=await start();assert.equal((await fetch(base+'/healthz')).status,200);
  for(const route of ['/','/api/sync/session','/api/sync/workspace','/api/integrations/gulf-wing/inbox'])assert.equal((await fetch(base+route)).status,404);
  const event={version:1,companyId:env.GULF_WING_COMPANY_ID,eventId:'fixture-event',eventType:'job.approved',jobId:'fixture-job',occurredAt:new Date().toISOString()};
  async function send(extra={}){const body=JSON.stringify(event),stamp=String(Math.floor(Date.now()/1000)),signature=createHmac('sha256',Buffer.from(key,'hex')).update(stamp+'.'+body).digest('hex');return fetch(base+'/api/integrations/gulf-wing/events',{method:'POST',headers:{'Content-Type':'application/json','x-gw-timestamp':stamp,'x-gw-signature':signature,...extra},body});}
  assert.equal((await send({origin:'https://browser.invalid'})).status,403);
  assert.equal((await fetch(base+'/api/integrations/gulf-wing/events',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(event)})).status,401);
  const result=await send();assert.equal(result.status,200);assert.equal((await result.json()).duplicate,false);assert.ok(result.headers.get('x-gw-signature'));
  await new Promise(resolve=>server.close(resolve));server=null;base=await start();
  assert.equal((await (await send()).json()).duplicate,true);assert.equal(readGulfWingInbox({env}).length,1);
  assert.equal((await fetch(base+'/api/integrations/gulf-wing/events')).status,405);
 }finally{if(server)await new Promise(resolve=>server.close(resolve));rmSync(dir,{recursive:true,force:true});}
});
