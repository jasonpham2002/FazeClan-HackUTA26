export async function verifySite(baseUrl:string) {
  const site=new URL(baseUrl);
  if(!['http:','https:'].includes(site.protocol) || site.username || site.password) throw new Error('Use a public site origin without credentials.');
  const origin=site.origin;
  async function get(path:string,type:string) {
    const response=await fetch(origin+path,{signal:AbortSignal.timeout(10000)});
    if(!response.ok) throw new Error(`${path}: HTTP ${response.status}; check the public proxy routing`);
    if(!response.headers.get('content-type')?.includes(type)) throw new Error(`${path}: expected ${type}; check the public proxy routing`);
    return response;
  }
  for(const path of ['/sign-in','/profile','/admin']) await get(path,'text/html');
  const health=await (await get('/api/health','application/json')).json() as {status?:string};
  if(health.status!=='ok') throw new Error('API health is not ready');
  await get('/api/auth/get-session','application/json');
  const me=await fetch(origin+'/api/me',{signal:AbortSignal.timeout(10000)});
  if(me.status!==401 || !me.headers.get('content-type')?.includes('application/json')) throw new Error('/api/me: expected unauthenticated JSON 401');
  const html=await (await get('/sign-in','text/html')).text();
  const scripts=[...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(match=>new URL(match[1],origin));
  for(const url of scripts){
    if(url.origin!==origin)continue;
    const code=await (await fetch(url,{signal:AbortSignal.timeout(10000)})).text();
    if(code.includes('http://104.238.146.107:3001')) throw new Error('Frontend still targets the IP API. Rebuild with VITE_API_BASE_URL=/api.');
  }
  return {status:'ok',sameOriginRouting:true,note:'Request a fresh magic link and verify the authenticated session in a browser.'};
}
if(import.meta.main){try{if(!process.argv[2])throw new Error('Usage: npm run verify:site -- http://manilovefaze.club');console.log(JSON.stringify(await verifySite(process.argv[2])))}catch(error){console.error(error instanceof Error?error.message:'Site verification failed');process.exitCode=1}}
