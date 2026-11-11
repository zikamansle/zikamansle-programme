// RFC 8291 aes128gcm and RFC 8292 VAPID, using Workers Web Crypto.
export const enc = s => new TextEncoder().encode(s);
export const b64 = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
export const un64 = s => Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')), c=>c.charCodeAt(0));
const join = (...parts) => {const out=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let i=0;for(const p of parts){out.set(p,i);i+=p.length}return out};
async function hkdf(input,salt,info,length){const key=await crypto.subtle.importKey('raw',input,'HKDF',false,['deriveBits']);return new Uint8Array(await crypto.subtle.deriveBits({name:'HKDF',hash:'SHA-256',salt,info},key,length*8))}
export function validEndpoint(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.port&&!u.username&&!u.password&&!u.hash&&value.length<2048&&(u.hostname==='fcm.googleapis.com'||u.hostname==='updates.push.services.mozilla.com'||u.hostname==='web.push.apple.com'||u.hostname.endsWith('.notify.windows.com'))}catch{return false}}
export function safePath(value){return typeof value==='string'&&value.length<=500&&value.startsWith('/')&&!value.startsWith('//')&&!/[\\\r\n]/.test(value)&&new URL(value,'https://festival.test').origin==='https://festival.test'}
export async function encrypt(subscription,payload){
 const ua=un64(subscription.keys.p256dh),auth=un64(subscription.keys.auth);
 const peer=await crypto.subtle.importKey('raw',ua,{name:'ECDH',namedCurve:'P-256'},false,[]);
 const pair=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
 const pub=new Uint8Array(await crypto.subtle.exportKey('raw',pair.publicKey));
 const secret=new Uint8Array(await crypto.subtle.deriveBits({name:'ECDH',public:peer},pair.privateKey,256));
 const ikm=await hkdf(secret,auth,join(enc('WebPush: info\0'),ua,pub),32),salt=crypto.getRandomValues(new Uint8Array(16));
 const key=await hkdf(ikm,salt,enc('Content-Encoding: aes128gcm\0'),16),nonce=await hkdf(ikm,salt,enc('Content-Encoding: nonce\0'),12);
 const aes=await crypto.subtle.importKey('raw',key,'AES-GCM',false,['encrypt']);
 const plain=enc(JSON.stringify(payload));if(plain.length>3000)throw Error('Payload too large');
 const ciphertext=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv:nonce},aes,join(plain,new Uint8Array([2]))));
 return join(salt,new Uint8Array([0,0,16,0,65]),pub,ciphertext);
}
export async function authorization(endpoint,jwk,publicKey){
 const input=b64(enc(JSON.stringify({typ:'JWT',alg:'ES256'})))+'.'+b64(enc(JSON.stringify({aud:new URL(endpoint).origin,exp:Math.floor(Date.now()/1000)+3600,sub:'mailto:zikamansle@gmail.com'})));
 const key=await crypto.subtle.importKey('jwk',jwk,{name:'ECDSA',namedCurve:'P-256'},false,['sign']);
 const signature=await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},key,enc(input));
 return 'vapid t='+input+'.'+b64(signature)+', k='+publicKey;
}
export class PushFailure extends Error {
 constructor(stage,cause){super('Push failed at '+stage);this.stage=stage;this.kind=['AbortError','TimeoutError','TypeError','SyntaxError','DataError','OperationError','NotSupportedError','InvalidAccessError'].includes(cause?.name)?cause.name:'Error'}
}
export async function sendPush(subscription,payload,env){
 if(!validEndpoint(subscription.endpoint))throw new PushFailure('endpoint');
 let body,auth,response;
 try{body=await encrypt(subscription,payload)}catch(e){throw new PushFailure('encryption',e)}
 try{auth=await authorization(subscription.endpoint,JSON.parse(env.VAPID_PRIVATE_JWK),env.VAPID_PUBLIC_KEY)}catch(e){throw new PushFailure('signature',e)}
 try{response=await fetch(subscription.endpoint,{method:'POST',redirect:'manual',headers:{Authorization:auth,TTL:'86400',Urgency:'normal','Content-Encoding':'aes128gcm','Content-Type':'application/octet-stream'},body,signal:AbortSignal.timeout(10000)})}catch(e){throw new PushFailure('network',e)}
 // The provider's response status remains authoritative if stream cleanup fails.
 try{await response.body?.cancel()}catch{}
 return response.status;
}
