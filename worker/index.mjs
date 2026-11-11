import {handle} from '../server/push-api.mjs';
import {siteContent} from '../server/site-content.mjs';
import {isAdmin} from '../server/admin-auth.mjs';
import catalog from '../public/data/site.json' with {type:'json'};

const isLegacyAdminPath = path => /^\/admin-notifications(?:\.html)?\/?$/.test(path);
const isAdminPage = path => /^\/administration\/notifications\/?$/.test(path);
const isAdminAPI = path => /^\/administration\/api\/(admin|upload|create|send|clear-history)$/.test(path);

// Static Assets normalizes .html to an extensionless URL. Fetch the canonical
// extensionless asset directly, otherwise /administration/notifications redirects
// to /admin-notifications and back forever.
export function adminAssetRequest(request) {
  const url=new URL(request.url);
  url.pathname='/admin-notifications';
  return new Request(url,request);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    // Old bookmarks are redirected to a single protected administration prefix.
    if (isLegacyAdminPath(path) || path === '/administration' || path === '/administration/') {
      return Response.redirect(new URL('/administration/notifications',url),302);
    }
    let response;
    if (path.startsWith('/api/push/') || isAdminAPI(path)) {
      // Both legacy and new API routes enforce the cryptographically verified Access JWT.
      response = await handle(request,env);
    }
    else if (path === '/api/site-page' && request.method === 'GET') response = await siteContent(request,catalog.pages);
    else if (path === '/healthz') response = Response.json({app:'ZikaMansle',environment:env.APP_ENV || 'staging'});
    else if (isAdminPage(path)) {
      if (!await isAdmin(request,env)) return new Response('Accès administrateur requis. Connectez-vous via Cloudflare Access.',{status:403,headers:{'Cache-Control':'no-store','Content-Type':'text/plain; charset=utf-8'}});
      response = await env.ASSETS.fetch(adminAssetRequest(request));
    } else response = await env.ASSETS.fetch(request);
    response = new Response(response.body,response);
    response.headers.set('X-Content-Type-Options','nosniff');
    response.headers.set('Referrer-Policy','strict-origin-when-cross-origin');
    if (path.startsWith('/administration/')) response.headers.set('Cache-Control','no-store');
    if (path === '/sw.js') {response.headers.set('Cache-Control','no-cache');response.headers.set('Service-Worker-Allowed','/');}
    return response;
  }
};
