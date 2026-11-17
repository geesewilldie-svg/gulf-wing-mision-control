// Minimal host for the dedicated inbox; no Controller or Next.js routes are served.
import http from 'node:http';
import {Readable} from 'node:stream';
import {mkdirSync,accessSync,constants} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createGulfWingReceiver} from '../lib/server/gulf-wing-integration.ts';
export function createReceiverServer({env=process.env}={}){
 if(!/^[A-Za-z0-9_-]{1,120}$/.test(env.GULF_WING_COMPANY_ID||'')||!/^[a-f0-9]{64}$/.test(env.GULF_WING_INTEGRATION_KEY||''))throw Error('Configure a company identifier and dedicated integration key before hosting.');
 if(!env.GW_SYNC_DATA_DIR||!path.isAbsolute(env.GW_SYNC_DATA_DIR))throw Error('Configure an absolute persistent inbox directory.');
 mkdirSync(env.GW_SYNC_DATA_DIR,{recursive:true,mode:0o700});accessSync(env.GW_SYNC_DATA_DIR,constants.W_OK|constants.R_OK);
 const receiver=createGulfWingReceiver({env});
 const server=http.createServer({maxHeaderSize:16384,requestTimeout:15000,headersTimeout:10000},(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');
  const json=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(value));};
  let route;try{route=new URL(req.url,'http://receiver.local').pathname;}catch{json(400,{error:'Invalid request'});req.resume();return;}
  if(route==='/healthz'&&req.method==='GET'){try{accessSync(env.GW_SYNC_DATA_DIR,constants.W_OK|constants.R_OK);json(200,{ok:true,service:'gulf-wing-inbox'});}catch{json(503,{ok:false});}req.resume();return;}
  const action=route==='/api/integrations/gulf-wing/handshake'?'handshake':route==='/api/integrations/gulf-wing/events'?'events':null;
  if(!action){json(404,{error:'Not found'});req.resume();return;}
  if(req.method!=='POST'){json(405,{error:'POST required'});req.resume();return;}
  const headers=new Headers();for(const [name,value]of Object.entries(req.headers))if(value!==undefined)headers.set(name,Array.isArray(value)?value.join(','):value);
  const request=new Request('http://receiver.local'+route,{method:'POST',headers,body:Readable.toWeb(req),duplex:'half'});
  void receiver.handle(request,action).then(async response=>{
   if(res.destroyed)return;
   res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
  }).catch(()=>{if(!res.headersSent)json(503,{error:'Inbox unavailable'});else res.destroy();});
 });
 return server;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const port=Number(process.env.PORT||8788);if(!Number.isInteger(port)||port<1||port>65535)throw Error('Invalid port');
  const server=createReceiverServer();server.listen(port,process.env.HOST||'127.0.0.1',()=>console.log('Dedicated Gulf Wing inbox listening; no Controller routes.'));
  for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>{server.closeIdleConnections();server.close(()=>{process.exitCode=0});setTimeout(()=>process.exit(1),20000).unref();});
 }catch{console.error('Inbox startup failed. Check dedicated integration settings, persistent storage permissions and port. Secret values are omitted.');process.exitCode=1;}
}
