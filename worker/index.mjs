import {handle} from '../server/push-api.mjs';
import {siteContent} from '../server/site-content.mjs';
import {isAdmin} from '../server/admin-auth.mjs';
import catalog from '../public/data/site.json' with {type:'json'};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    let response;
    if (url.pathname.startsWith('/api/push/')) response = await handle(request,env);
    else if (url.pathname === '/api/site-page' && request.method === 'GET') response = await siteContent(request,catalog.pages);
    else if (url.pathname === '/healthz') response = Response.json({app:'ZikaMansle',environment:env.APP_ENV || 'staging'});
    else if (/^\/admin-notifications(?:\.html)?\/?$/.test(url.pathname)) {
      if (!await isAdmin(request,env)) return new Response('Accès administrateur requis. Connectez-vous via Cloudflare Access.',{status:403,headers:{'Cache-Control':'no-store','Content-Type':'text/plain; charset=utf-8'}});
      url.pathname='/admin-notifications.html';
      response = await env.ASSETS.fetch(new Request(url,request));
    } else response = await env.ASSETS.fetch(request);
    response = new Response(response.body,response);
    response.headers.set('X-Content-Type-Options','nosniff');
    response.headers.set('Referrer-Policy','strict-origin-when-cross-origin');
    if (url.pathname.startsWith('/admin-notifications')) response.headers.set('Cache-Control','no-store');
    if (url.pathname === '/sw.js') {response.headers.set('Cache-Control','no-cache');response.headers.set('Service-Worker-Allowed','/');}
    return response;
  }
};
