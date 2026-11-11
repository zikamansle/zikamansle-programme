import {createRemoteJWKSet, jwtVerify} from 'jose';
const resolvers = new Map();

// Verify Cloudflare Access signed JWT on every private request.
// The e-mail is taken ONLY from the verified JWT, never from client input.
export async function verifyAccessIdentity(token,env,resolver){
 if(!token||!env.ACCESS_TEAM_DOMAIN||!env.ACCESS_AUD)return null;
 if(!/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(env.ACCESS_TEAM_DOMAIN))return null;
 const issuer='https://'+env.ACCESS_TEAM_DOMAIN;
 try{
  if(!resolver){
   if(!resolvers.has(issuer))resolvers.set(issuer,createRemoteJWKSet(new URL(issuer+'/cdn-cgi/access/certs')));
   resolver=resolvers.get(issuer);
  }
  const {payload}=await jwtVerify(token,resolver,{
   issuer,audience:env.ACCESS_AUD,algorithms:['RS256'],requiredClaims:['exp','sub','email']
  });
  if(typeof payload.email!=='string')return null;
  const email=payload.email.trim().toLowerCase();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)return null;
  return {email,sub:payload.sub};
 }catch{return null}
}

export async function verifyAdminToken(token,env,resolver){
 if(!env.ADMIN_EMAIL)return false;
 const identity=await verifyAccessIdentity(token,env,resolver);
 return Boolean(identity&&identity.email===env.ADMIN_EMAIL.trim().toLowerCase());
}

export function isAdmin(request,env){
 return verifyAdminToken(request.headers.get('Cf-Access-Jwt-Assertion'),env);
}
