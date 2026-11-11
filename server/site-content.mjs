// Only public pages from the bundled site catalog can be fetched.
export function safeURL(value, base) {
 try { const u=new URL(typeof value==='string'?cleanText(value):value,base); return ['https:','http:','mailto:','tel:'].includes(u.protocol)?u.href:''; } catch { return ''; }
}
export function cleanText(value) {
 return value.replace(/&#(x[0-9a-f]+|\d+);/gi,(_,n)=>{const c=n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n);return c<=0x10ffff?String.fromCodePoint(c):''})
 .replace(/&(amp|lt|gt|quot|apos|nbsp);/g,(_,n)=>({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '})[n]).replace(/\s+/g,' ').trim();
}
export async function extractPage(response,page,Rewriter=globalThis.HTMLRewriter) {
 const blocks=[],active=[];let main=false;
 const add=b=>{if(blocks.length<1200)blocks.push(b)};
 const rewriter=new Rewriter().on('main',{element(){main=true},text(t){for(const b of active)b.value+=t.text}})
 .on('main h1, main h2, main h3, main h4, main h5, main h6, main p, main li, main a',{
  element(el){const tag=el.tagName;const b={type:tag==='a'?'link':tag[0]==='h'?'heading':'text',value:''};if(tag==='a')b.url=safeURL(el.getAttribute('href'),page.url);add(b);active.push(b);el.onEndTag(()=>{const i=active.indexOf(b);if(i>=0)active.splice(i,1)})}
 }).on('main br',{element(){for(const b of active)b.value+=' '}})
 .on('main wow-image',{element(el){try{const d=JSON.parse(cleanText(el.getAttribute('data-image-info')||'{}')).imageData;if(d?.uri){const value=safeURL(d.uri.startsWith('http')?d.uri:'https://static.wixstatic.com/media/'+d.uri,page.url);if(value)add({type:'image',value,alt:d.name||''})}}catch{}}})
 .on('main img',{element(el){const value=safeURL(el.getAttribute('src')||'',page.url);if(value&&el.getAttribute('src'))add({type:'image',value,alt:el.getAttribute('alt')||''})}});
 // Consume without retaining the multi-megabyte Wix document.
 const reader=rewriter.transform(response).body.getReader();while(!(await reader.read()).done){}
 const seenImages=new Set();const result=blocks.map(b=>({...b,value:b.type==='image'?b.value:cleanText(b.value)})).filter(b=>{
  if(!b.value||(b.type==='link'&&!b.url))return false;
  if(b.type==='image'){const key=b.value.split('/v1/')[0];if(seenImages.has(key))return false;seenImages.add(key)}return true;
 });
 if(!main||!result.some(b=>b.type==='text'||b.type==='heading'))throw Error('Missing public content');
 return {...page,blocks:result,updatedAt:new Date().toISOString()};
}
const pageCache=new Map();
export async function siteContent(request,pages,cache=null,fetcher=fetch,Rewriter=globalThis.HTMLRewriter){
 const slug=new URL(request.url).searchParams.get('slug');const page=pages.find(p=>p.slug===slug);
 if(!page)return Response.json({error:'Page inconnue'},{status:404});
 const hit=pageCache.get(slug);if(hit&&Date.now()-hit.time<300000)return Response.json(hit.data,{headers:{'Cache-Control':'no-store'}});
 try{
  const response=await fetcher(page.url,{redirect:'manual',signal:AbortSignal.timeout(10000),headers:{Accept:'text/html'}});
  if(!response.ok||!response.headers.get('content-type')?.includes('text/html'))throw Error('Source unavailable');
  const data=await extractPage(response,page,Rewriter);
  const output=Response.json(data,{headers:{'Cache-Control':'public, max-age=300','X-Content-Type-Options':'nosniff'}});
  pageCache.set(slug,{data,time:Date.now()});
  return output;
 }catch(error){console.error('site-content-sync',error instanceof Error?error.message:'Unknown error');return Response.json({error:'Site temporairement indisponible. La copie enregistrée reste accessible.'},{status:503,headers:{'Cache-Control':'no-store'}})}
}
