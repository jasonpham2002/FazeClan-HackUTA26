import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {test} from 'node:test';
import {verifySite} from '../src/verify-site.ts';
test('site verifier detects API/page misrouting and stale IP builds',async context=>{
 let mode='ready';
 const server=createServer((req,res)=>{
  const path=req.url;
  if(path==='/admin'&&mode==='page-misroute'){res.writeHead(404,{'content-type':'application/json'});res.end('{}');return}
  if(['/admin','/profile','/sign-in'].includes(path??'')){res.writeHead(200,{'content-type':'text/html'});res.end('<script src="/assets/app.js"></script>');return}
  if(path==='/assets/app.js'){res.writeHead(200,{'content-type':'text/javascript'});res.end(mode==='ip-build'?'const api="http://104.238.146.107:3001"':'const api="/api"');return}
  if(path==='/api/health'&&mode==='api-misroute'){res.writeHead(200,{'content-type':'text/html'});res.end('<html>');return}
  res.writeHead(path==='/api/me'?401:200,{'content-type':'application/json'});
  res.end(path==='/api/health'?'{"status":"ok"}':'null');
 });
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 context.after(()=>new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve())));
 const address=server.address();assert.ok(address&&typeof address!=='string');
 const base=`http://127.0.0.1:${address.port}`;
 assert.equal((await verifySite(base)).sameOriginRouting,true);
 mode='page-misroute';await assert.rejects(verifySite(base),/admin: HTTP 404/);
 mode='api-misroute';await assert.rejects(verifySite(base),/expected application.json/);
 mode='ip-build';await assert.rejects(verifySite(base),/Frontend still targets the IP/);
});
