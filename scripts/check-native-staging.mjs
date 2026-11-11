// Read-only diagnostic: only number of staging Android device registrations, never tokens.
const required=['CLOUDFLARE_API_TOKEN','CLOUDFLARE_ACCOUNT_ID'];
if(process.env.GITHUB_ACTIONS!=='true'||process.env.GITHUB_REF!=='refs/heads/migration/application-autonome'||required.some(k=>!process.env[k])){
 console.error('Diagnostic réservé à GitHub et au compte Cloudflare staging.');
 process.exitCode=1;
}else{
 try {
  const {CLOUDFLARE_API_TOKEN:token,CLOUDFLARE_ACCOUNT_ID:account}=process.env;
  const databases=await fetch('https://api.cloudflare.com/client/v4/accounts/'+account+'/d1/database?per_page=100',{headers:{Authorization:'Bearer '+token}});
  if(!databases.ok)throw Error('Liste D1 inaccessible (HTTP '+databases.status+')');
  const listed=await databases.json();
  if(!listed.success)throw Error('Liste D1 refusée');
  const found=(listed.result||[]).filter(d=>d.name==='zikamansle-app-staging');
  if(found.length!==1||!found[0].uuid)throw Error('La base D1 staging est introuvable ou ambiguë');
  const db=found[0].uuid;
  const endpoint='https://api.cloudflare.com/client/v4/accounts/'+account+'/d1/database/'+db+'/query';
  const r=await fetch(endpoint,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({sql:'SELECT COUNT(*) AS n FROM native_push_devices'})});
  if(!r.ok)throw Error('D1 inaccessible (HTTP '+r.status+')');
  const data=await r.json();
  if(!data.success)throw Error('La requête D1 a été refusée.');
  const n=data.result?.[0]?.results?.[0]?.n;
  if(!Number.isInteger(n)||n<0)throw Error('Le compteur D1 est illisible.');
  console.log('Compteur Android Firebase Cloudflare staging : '+n+' appareil(s) enregistrés.');
  console.log(n===0?'Aucun appareil Android enregistré : le bouton doit rester désactivé.':n===1?'Un téléphone Android enregistré : le bouton peut envoyer le test.':'Plusieurs appareils enregistrés : test ciblé bloqué par précaution.');
  console.log('Aucun jeton FCM ni autre secret n’a été lu ou affiché.');
 }catch(e){console.error('Contrôle D1 : '+e.message);process.exitCode=1;}
}