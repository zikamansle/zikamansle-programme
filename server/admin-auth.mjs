import {createRemoteJWKSet, jwtVerify} from 'jose';
const resolvers = new Map();
export async function verifyAdminToken(token, env, resolver) {
  if (!token || !env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD || !env.ADMIN_EMAIL) return false;
  if (!/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(env.ACCESS_TEAM_DOMAIN)) return false;
  const issuer = 'https://' + env.ACCESS_TEAM_DOMAIN;
  try {
    if (!resolver) {
      if (!resolvers.has(issuer)) resolvers.set(issuer, createRemoteJWKSet(new URL(issuer + '/cdn-cgi/access/certs')));
      resolver = resolvers.get(issuer);
    }
    const {payload} = await jwtVerify(token, resolver, {issuer, audience:env.ACCESS_AUD, algorithms:['RS256'], requiredClaims:['exp','sub','email']});
    return typeof payload.email === 'string' && payload.email.toLowerCase() === env.ADMIN_EMAIL.toLowerCase();
  } catch { return false; }
}
export function isAdmin(request, env) {
  return verifyAdminToken(request.headers.get('Cf-Access-Jwt-Assertion'), env);
}
