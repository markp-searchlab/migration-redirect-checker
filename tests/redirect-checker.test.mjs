import assert from 'node:assert/strict';
import vm from 'node:vm';
import worker,{checkRedirect,safeURL} from '../worker/index.js';
const old='https://old.example.org/service/',target='https://new.example.org/services/';
const mock=map=>async url=>{const [status,location]=map[url]||[404];return new Response(null,{status,headers:location?{location}:{}});};
let r=await checkRedirect(old,target,mock({[old]:[301,target],[target]:[200]}));assert.equal(r.status,'pass');assert.equal(r.chain.length,2);
r=await checkRedirect(old,target,mock({[old]:[200]}));assert.equal(r.label,'No redirect found');
r=await checkRedirect(old,target,mock({[old]:[301,target],[target]:[404]}));assert.equal(r.label,'Page missing');
r=await checkRedirect(old,target,mock({[old]:[302,target],[target]:[200]}));assert.equal(r.status,'review');assert.equal(r.label,'Temporary redirect');
r=await checkRedirect(old,target,mock({[old]:[301,'https://middle.example.org/'],['https://middle.example.org/']:[301,target],[target]:[200]}));assert.equal(r.label,'Redirect chain');
r=await checkRedirect(old,old,mock({[old]:[200]}));assert.equal(r.label,'URL unchanged');
r=await checkRedirect(old,'https://new.example.org/',mock({[old]:[301,'https://new.example.org/'],['https://new.example.org/']:[200]}));assert.equal(r.label,'Homepage redirect');
r=await checkRedirect(old,target,mock({[old]:[301,target],[target]:[403]}));assert.equal(r.status,'unverified');
r=await checkRedirect(old,target,mock({[old]:[301,target],[target]:[301,old]}));assert.equal(r.label,'Redirect loop');
r=await checkRedirect(old,'',mock({[old]:[200]}));assert.equal(r.status,'review');
r=await checkRedirect(old,target,mock({[old]:[301,'http://127.0.0.1/']}));assert.equal(r.status,'unverified');
for(const code of [408,504,522,524]){r=await checkRedirect(old,target,mock({[old]:[301,target],[target]:[code]}));assert.equal(r.status,'unverified');assert.equal(r.label,'Request timed out');}
for(const u of ['http://127.0.0.1','http://[::1]/','file:///etc/passwd','https://user:pw@example.org','http://localhost/','http://foo.internal/'])assert.throws(()=>safeURL(u));
const html=await(await worker.fetch(new Request('https://tool.example.org/tools/migration-redirect-checker'))).text();const js=html.match(/<script>([\s\S]*?)<\/script>/)[1];new vm.Script(js);
const element={addEventListener(){},classList:{},style:{}};const ctx={navigator:{onLine:true,userAgent:'test'},window:{addEventListener(){},matchMedia(){return {matches:false,addEventListener(){}};}},document:{getElementById(){return element;},querySelectorAll(){return[];}},URL,Blob,setTimeout};vm.createContext(ctx);vm.runInContext(js,ctx);
let p=vm.runInContext(`parseMapping('Old URL,New URL\\r\\n"https://old.example.org/a,b",https://new.example.org/a\\r\\n')`,ctx);assert.equal(p.length,1);assert.equal(p[0].old,'https://old.example.org/a,b');
p=vm.runInContext(`parseMapping('source_url\\ttarget_url\\nhttps://old.example.org/\\thttps://new.example.org/')`,ctx);assert.equal(p[0].expected,'https://new.example.org/');
assert.throws(()=>vm.runInContext(`parseMapping('https://a.example.org/\\n'.repeat(51))`,ctx),/50/);
assert.throws(()=>vm.runInContext(`parseMapping('bad url,https://example.org')`,ctx),/Row 1/);
assert.equal(vm.runInContext(`csvCell('=1+1')`,ctx),`"'=1+1"`);
assert.ok(!vm.runInContext(`safeLink('javascript:alert(1)')`,ctx).includes('<a'));
assert.equal((await worker.fetch(new Request('https://tool.example.org/api/tools/migration-redirect-checker',{method:'POST',headers:{origin:'https://foreign.example.org'},body:'{}'}))).status,403);
console.log('Passed: redirect classification, loops, restricted requests, address validation, CSV parsing, row limits, safe links, export escaping and origin checks.');

const manifestResponse=await worker.fetch(new Request('https://tool.example.org/tools/migration-redirect-checker/manifest.webmanifest'));assert.equal(manifestResponse.status,200);assert.equal(manifestResponse.headers.get('content-type'),'application/manifest+json');const manifest=await manifestResponse.json();assert.equal(manifest.display,'standalone');assert.equal(manifest.id,'/tools/migration-redirect-checker');assert.equal(manifest.scope,'/tools/migration-redirect-checker');
for(const icon of manifest.icons){const res=await worker.fetch(new Request('https://tool.example.org'+icon.src));assert.equal(res.status,200);const bytes=Buffer.from(await res.arrayBuffer());assert.equal(bytes.subarray(1,4).toString(),'PNG');const size=Number(icon.sizes.split('x')[0]);assert.equal(bytes.readUInt32BE(16),size);assert.equal(bytes.readUInt32BE(20),size);}
const apple=await worker.fetch(new Request('https://tool.example.org/tools/migration-redirect-checker/icons/apple-touch-icon.png'));assert.equal(apple.status,200);
const service=await worker.fetch(new Request('https://tool.example.org/tools/migration-redirect-checker/sw.js'));assert.equal(service.status,200);new vm.Script(await service.text());assert.equal(service.headers.get('service-worker-allowed'),'/tools/migration-redirect-checker');
assert.ok(html.includes('rel="manifest"'));assert.ok(html.includes('id="install"'));assert.ok(html.includes('id="offline"'));console.log('Passed: install manifest, icon sizes, service worker syntax, offline notice and install controls.');

assert.ok(html.includes('rel="canonical" href="https://optimizemywebsites.com/tools/migration-redirect-checker"'));
const swText=await(await worker.fetch(new Request('https://tool.example.org/tools/migration-redirect-checker/sw.js'))).text();
assert.ok(!swText.includes("const SHELL=['/',"));
assert.ok(swText.includes("url.pathname==='/tools/migration-redirect-checker'"));
assert.equal((await worker.fetch(new Request('https://tool.example.org/'))).status,302);
assert.equal((await worker.fetch(new Request('https://tool.example.org/sw.js'))).status,404);
console.log('Passed: canonical URL and isolated app scope, shell cache and service worker.');
