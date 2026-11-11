import {verifyAccessIdentity} from './admin-auth.mjs';
import {getTeamSupabaseIdentity,handleTeamLogin} from './zikateam-login.mjs';
import {sendPush, b64, enc} from './webpush.mjs';

const reply=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const clean=(v,max=160)=>typeof v==='string'?v.trim().slice(0,max):'';
const idok=x=>typeof x==='string'&&/^[a-f\d-]{36}$/i.test(x);
const dateok=s=>typeof s==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(s)&&Number.isFinite(Date.parse(s));
const fail=(message,status=400)=>reply({error:message},status);
const uuid=()=>crypto.randomUUID();
const now=()=>Date.now();
const all=async(db,sql,...values)=>(await db.prepare(sql).bind(...values).all()).results;
const one=async(db,sql,...values)=>db.prepare(sql).bind(...values).first();
const audit=async(db,actor,action,entity,detail='')=>db.prepare('INSERT INTO team_audit (id,actor_email,action,entity_id,detail,created_at) VALUES (?,?,?,?,?,?)').bind(uuid(),actor,action,entity,clean(detail,500),now()).run();
const validKind=k=>['meeting','stand','mission','setup'].includes(k);
const validAudience=a=>['all','leaders','poles','bureau'].includes(a);
const roles=async(db,mid)=>mid?all(db,"SELECT tm.pole_id,p.name AS pole_name,tm.role FROM team_memberships tm JOIN team_poles p ON p.id=tm.pole_id WHERE tm.member_id=? AND p.archived=0 ORDER BY p.name",mid):[];
const charter=async db=>one(db,'SELECT * FROM team_charter WHERE id=1');

async function identify(request,env,verified){
 // Supabase Auth provides a free login without consuming Cloudflare Access seats.
 if(!env.ADMIN_EMAIL)return null;
 const identity=env.TEAM_AUTH_PROVIDER==='supabase'
  ? verified?.identity
  : env.TEAM_ACCESS_AUD&&env.ACCESS_TEAM_DOMAIN
   ? await verifyAccessIdentity(request.headers.get('Cf-Access-Jwt-Assertion'),{...env,ACCESS_AUD:env.TEAM_ACCESS_AUD})
   : null;
 if(!identity)return null;
 const email=identity.email;
 const admin=email===env.ADMIN_EMAIL.toLowerCase().trim();
 const member=await one(env.DB,'SELECT * FROM team_members WHERE email=?',email);
 const join=member&&!member.active?await one(env.DB,'SELECT status FROM team_join_requests WHERE email=?',email):null;
 const pending=!admin&&Boolean(member&&member.active===0&&join?.status==='pending');
 if(!admin&&!member?.active&&!pending)return null;
 const memberships=await roles(env.DB,member?.id);
 const secretariat=Boolean(member&&await one(env.DB,"SELECT member_id FROM team_staff_roles WHERE member_id=? AND role='secretariat'",member.id));
 const passwordReady=env.TEAM_AUTH_PROVIDER!=='supabase'||Boolean(await one(env.DB,'SELECT set_at FROM team_auth_password_setup WHERE email=?',email));
 return {email,admin,member,pending,passwordReady,secretariat:pending?false:secretariat,memberships:pending?[]:memberships,leadPoles:pending?[]:memberships.filter(m=>m.role==='lead').map(m=>m.pole_id)};
}
async function selectedPoles(db,activityId){return (await all(db,'SELECT pole_id FROM team_activity_poles WHERE activity_id=?',activityId)).map(x=>x.pole_id)}
async function audienceMembers(db,activity){
 if(activity.audience==='all')return (await all(db,'SELECT id FROM team_members WHERE active=1')).map(x=>x.id);
 if(activity.audience==='bureau'||activity.audience==='leaders'&&await one(db,'SELECT activity_id FROM team_activity_bureau_audience WHERE activity_id=?',activity.id))
  return (await all(db,"SELECT DISTINCT m.id FROM team_members m JOIN team_member_roles r ON r.member_id=m.id WHERE m.active=1 AND r.role IN ('bureau','director')")).map(x=>x.id);
 if(activity.audience==='leaders')return (await all(db,"SELECT DISTINCT m.id FROM team_members m JOIN team_memberships tm ON tm.member_id=m.id JOIN team_poles p ON p.id=tm.pole_id WHERE m.active=1 AND tm.role='lead' AND p.archived=0")).map(x=>x.id);
 return (await all(db,'SELECT DISTINCT m.id FROM team_members m JOIN team_memberships tm ON tm.member_id=m.id JOIN team_activity_poles ap ON ap.pole_id=tm.pole_id JOIN team_poles p ON p.id=tm.pole_id WHERE m.active=1 AND p.archived=0 AND ap.activity_id=?',activity.id)).map(x=>x.id);
}
async function allowedActivity(db,ctx,a){
 if(ctx.admin)return true;
 if(!ctx.member||a.audience!=='poles'||!ctx.leadPoles.length)return false;
 const poles=await selectedPoles(db,a.id);
 return poles.length>0&&poles.every(p=>ctx.leadPoles.includes(p));
}
async function visibleActivity(db,ctx,a){
 if(await allowedActivity(db,ctx,a))return true;
 if(!ctx.member||a.status==='draft')return false;
 return (await audienceMembers(db,a)).includes(ctx.member.id);
}
const charterAccepted=(c,versions)=>Boolean(c&&versions.some(v=>v.version===c.version));
async function requireCharter(db,ctx){
 const c=await charter(db);
 if(!c||!ctx.member)return false;
 return Boolean(await one(db,'SELECT accepted_at FROM team_charter_acceptances WHERE member_id=? AND version=?',ctx.member.id,c.version));
}
async function enrichActivities(db,activities,memberId=null){
 for(const a of activities){
  const custom=await one(db,'SELECT label FROM team_activity_custom_kinds WHERE activity_id=?',a.id);
  a.custom_kind=custom?.label||null;
  a.poles=await selectedPoles(db,a.id);
  a.shifts=await all(db,'SELECT s.*, (SELECT COUNT(*) FROM team_shift_signups z WHERE z.shift_id=s.id) AS signed_count FROM team_shifts s WHERE s.activity_id=? ORDER BY s.starts_at',a.id);
  a.tasks=await all(db,"SELECT id,activity_id,title,details,assigned_to,status,created_at,updated_at FROM team_activity_tasks WHERE activity_id=? ORDER BY created_at",a.id);
  if(memberId){const r=await one(db,'SELECT answer,updated_at FROM team_activity_rsvps WHERE activity_id=? AND member_id=?',a.id,memberId);a.my_response=r?.answer||'pending';const mine=await all(db,'SELECT shift_id FROM team_shift_signups WHERE member_id=? AND shift_id IN (SELECT id FROM team_shifts WHERE activity_id=?)',memberId,a.id);a.my_shifts=mine.map(x=>x.shift_id);const checkin=await one(db,'SELECT checked_in_at,checked_out_at FROM team_activity_checkins WHERE activity_id=? AND member_id=?',a.id,memberId);a.my_checkin=checkin||null}
 }
 return activities;
}
async function getMine(db,ctx){
 const c=await charter(db);
 const versions=ctx.member?await all(db,'SELECT version,accepted_at FROM team_charter_acceptances WHERE member_id=? ORDER BY accepted_at DESC',ctx.member.id):[];
 const accepted=charterAccepted(c,versions);
 const consentRows=ctx.member?await all(db,'SELECT kind,granted,updated_at FROM team_member_consents WHERE member_id=?',ctx.member.id):[];
 const consents={image:null,phone:null,email:null};
 for(const item of consentRows)if(Object.prototype.hasOwnProperty.call(consents,item.kind))consents[item.kind]=Boolean(item.granted);
 const currentCharter=c?{version:c.version,title:c.title,content:c.content,document_id:c.document_id,published_at:c.published_at}:null;
 const savedPrefs=ctx.member?await one(db,'SELECT chat_mode,sound_mode,vibrate,activity_enabled,urgent_enabled,quiet_enabled,quiet_start,quiet_end FROM team_notification_preferences WHERE member_id=?',ctx.member.id):null;
 const notificationPrefs={chat_mode:savedPrefs?.chat_mode||'grouped',sound_mode:savedPrefs?.sound_mode||'important',vibrate:savedPrefs?Boolean(savedPrefs.vibrate):true,activity_enabled:savedPrefs?Boolean(savedPrefs.activity_enabled):true,urgent_enabled:savedPrefs?Boolean(savedPrefs.urgent_enabled):true,quiet_enabled:savedPrefs?Boolean(savedPrefs.quiet_enabled):true,quiet_start:savedPrefs?.quiet_start||'22:00',quiet_end:savedPrefs?.quiet_end||'08:00'};
 const mutedChats=ctx.member?await all(db,'SELECT channel,channel_id FROM team_chat_mutes WHERE member_id=? AND muted=1',ctx.member.id):[];
 // Une identité vérifiée sans charte acceptée ne reçoit ni équipes ni convocations.
 if(!accepted)return reply({
  email:ctx.email,admin:ctx.admin,pending:ctx.pending,secretariat:false,
  member:ctx.member?{id:ctx.member.id,name:ctx.member.name,email:ctx.member.email}:null,consents,
  leadPoles:[],poles:[],charter:currentCharter,charterAccepted:false,charterAcceptedAt:null,activities:[]
 });
 if(ctx.pending)return reply({
  email:ctx.email,admin:false,pending:true,secretariat:false,
  member:{id:ctx.member.id,name:ctx.member.name,email:ctx.member.email},consents,
  leadPoles:[],poles:[],charter:currentCharter,charterAccepted:true,
  charterAcceptedAt:versions.find(v=>v.version===c?.version)?.accepted_at||null,activities:[]
 });
 const poles=ctx.member?await all(db,"SELECT p.id,p.name,p.description,tm.role,(SELECT group_concat(m.name,', ') FROM team_memberships l JOIN team_members m ON m.id=l.member_id WHERE l.pole_id=p.id AND l.role='lead' AND m.active=1) AS leaders FROM team_poles p JOIN team_memberships tm ON tm.pole_id=p.id WHERE tm.member_id=? AND p.archived=0 ORDER BY p.name",ctx.member.id):[];
 for(const p of poles){
  p.leadersDetails=await all(db,"SELECT m.id,m.name,CASE WHEN ph.member_id IS NOT NULL THEN 1 ELSE 0 END AS has_photo FROM team_memberships tm JOIN team_members m ON m.id=tm.member_id LEFT JOIN team_member_photos ph ON ph.member_id=m.id AND (m.id=? OR ?=1 OR EXISTS(SELECT 1 FROM team_member_consents pc WHERE pc.member_id=m.id AND pc.kind='image' AND pc.granted=1)) WHERE tm.pole_id=? AND tm.role='lead' AND m.active=1 ORDER BY m.name",ctx.member?.id||'',ctx.admin?1:0,p.id);
  // Les coordonnées consenties ne sont révélées qu'aux responsables du pôle concerné, jamais aux autres membres.
  const canViewContacts=ctx.admin||ctx.leadPoles.includes(p.id);
  p.membersDetails=await all(db,"SELECT m.id,m.name,tm.role,CASE WHEN ?=1 AND EXISTS(SELECT 1 FROM team_member_consents c WHERE c.member_id=m.id AND c.kind='email' AND c.granted=1) THEN m.email ELSE '' END AS email,CASE WHEN ?=1 AND EXISTS(SELECT 1 FROM team_member_consents c WHERE c.member_id=m.id AND c.kind='phone' AND c.granted=1) THEN COALESCE(cn.phone,'') ELSE '' END AS phone FROM team_memberships tm JOIN team_members m ON m.id=tm.member_id LEFT JOIN team_member_contacts cn ON cn.member_id=m.id WHERE tm.pole_id=? AND m.active=1 ORDER BY tm.role DESC,m.name",canViewContacts?1:0,canViewContacts?1:0,p.id);
 }
 const selfPhoto=ctx.member?await one(db,'SELECT member_id FROM team_member_photos WHERE member_id=?',ctx.member.id):null;
 const myContact=ctx.member?await one(db,"SELECT COALESCE(phone,'') AS phone FROM team_member_contacts WHERE member_id=?",ctx.member.id):null;
 const activities=await all(db,"SELECT * FROM team_activities WHERE status!='draft' AND ends_at>=? ORDER BY starts_at LIMIT 140",new Date(now()-86400000).toISOString());
 const mine=[];for(const a of activities)if(await visibleActivity(db,ctx,a))mine.push(a);
 await enrichActivities(db,mine,ctx.member?.id);
 const notices=ctx.member?await all(db,"SELECT n.id,n.activity_id,n.reason,n.created_at,n.seen_at,a.title,a.starts_at,a.place,a.status,COALESCE(c.label,'') AS custom_kind FROM team_activity_notices n JOIN team_activities a ON a.id=n.activity_id LEFT JOIN team_activity_custom_kinds c ON c.activity_id=a.id WHERE n.member_id=? AND n.created_at>? ORDER BY n.created_at DESC LIMIT 70",ctx.member.id,now()-45*86400000):[];
 const allowedIds=new Set(mine.map(a=>a.id));
 const visibleNotices=notices.filter(n=>allowedIds.has(n.activity_id)).slice(0,25);
 for(const item of mine)if(await one(db,'SELECT activity_id FROM team_activity_bureau_audience WHERE activity_id=?',item.id))item.audience='bureau';
 return reply({email:ctx.email,admin:ctx.admin,pending:false,secretariat:ctx.secretariat,member:ctx.member?{id:ctx.member.id,name:ctx.member.name,email:ctx.member.email,has_photo:Boolean(selfPhoto)}:null,myContact:{phone:myContact?.phone||''},consents,leadPoles:ctx.leadPoles,poles,charter:currentCharter,charterAccepted:accepted,charterAcceptedAt:versions.find(v=>v.version===c?.version)?.accepted_at||null,activities:mine,notices:visibleNotices,notificationPrefs,mutedChats});
}
async function getManage(db,ctx){
 if(!ctx.admin&&!ctx.leadPoles.length&&!ctx.secretariat)return fail('Droits de gestion requis.',403);
 const poles=ctx.admin?await all(db,'SELECT * FROM team_poles ORDER BY archived,name'):
  ctx.secretariat?await all(db,'SELECT * FROM team_poles WHERE archived=0 ORDER BY name'):
  ctx.leadPoles.length?(await all(db,'SELECT * FROM team_poles WHERE archived=0 ORDER BY name')).filter(p=>ctx.leadPoles.includes(p.id)):
  await all(db,'SELECT id,name,archived FROM team_poles WHERE archived=0 ORDER BY name');
 const members=ctx.admin||ctx.secretariat?await all(db,'SELECT id,name,email,active FROM team_members ORDER BY name'):
  ctx.leadPoles.length?await all(db,"SELECT DISTINCT m.id,m.name,CASE WHEN EXISTS(SELECT 1 FROM team_member_consents c WHERE c.member_id=m.id AND c.kind='email' AND c.granted=1) THEN m.email ELSE '' END AS email,CASE WHEN EXISTS(SELECT 1 FROM team_member_consents c WHERE c.member_id=m.id AND c.kind='phone' AND c.granted=1) THEN COALESCE(contacts.phone,'') ELSE '' END AS phone,m.active FROM team_members m JOIN team_memberships tm ON tm.member_id=m.id LEFT JOIN team_member_contacts contacts ON contacts.member_id=m.id WHERE tm.pole_id IN (SELECT pole_id FROM team_memberships WHERE member_id=? AND role='lead') ORDER BY m.name",ctx.member.id):
  await all(db,'SELECT id,name,active FROM team_members WHERE active=1 ORDER BY name');
 if(ctx.admin||ctx.leadPoles.length||ctx.secretariat){
  const pictures=new Set((await all(db,ctx.admin?'SELECT member_id FROM team_member_photos':"SELECT ph.member_id FROM team_member_photos ph WHERE EXISTS(SELECT 1 FROM team_member_consents c WHERE c.member_id=ph.member_id AND c.kind='image' AND c.granted=1)")).map(x=>x.member_id));
  for(const member of members)member.has_photo=pictures.has(member.id)||member.id===ctx.member?.id;
 }
 if(ctx.admin||ctx.secretariat){
  const allRoles=await all(db,'SELECT member_id,role FROM team_member_roles');
  for(const member of members)member.roles=allRoles.filter(x=>x.member_id===member.id).map(x=>x.role);
 }
 const memberships=ctx.admin||ctx.secretariat?await all(db,'SELECT member_id,pole_id,role FROM team_memberships'):
  ctx.leadPoles.length?await all(db,"SELECT member_id,pole_id,role FROM team_memberships WHERE pole_id IN (SELECT pole_id FROM team_memberships WHERE member_id=? AND role='lead')",ctx.member.id):[];
 const allActivities=await all(db,"SELECT * FROM team_activities ORDER BY starts_at DESC LIMIT 160"),activities=[];
 for(const item of allActivities){
  if(await one(db,'SELECT activity_id FROM team_activity_bureau_audience WHERE activity_id=?',item.id))item.audience='bureau';
  const canEdit=await allowedActivity(db,ctx,item);
  if(canEdit)activities.push({...item,can_edit:true});
  else if(ctx.secretariat&&item.status==='published')activities.push({
   id:item.id,kind:item.kind,title:item.title,starts_at:item.starts_at,ends_at:item.ends_at,
   place:item.place,status:item.status,audience:item.audience,can_edit:false
  });
 }
 await enrichActivities(db,activities);
 for(const item of activities){
  const invited=new Set(await audienceMembers(db,item));
  item.attendance=(await all(db,"SELECT m.id AS member_id,m.name,COALESCE(r.answer,'pending') AS answer,r.updated_at,c.checked_in_at,c.checked_out_at FROM team_members m LEFT JOIN team_activity_rsvps r ON r.member_id=m.id AND r.activity_id=? LEFT JOIN team_activity_checkins c ON c.member_id=m.id AND c.activity_id=? WHERE m.active=1 ORDER BY m.name",item.id,item.id)).filter(m=>invited.has(m.member_id));
  item.responses=item.attendance.filter(x=>x.answer!=='pending');item.invitedCount=invited.size;
  if(!item.can_edit){delete item.tasks;delete item.shifts;}
 }
 const logs=ctx.admin?await all(db,'SELECT actor_email,action,entity_id,detail,created_at FROM team_audit ORDER BY created_at DESC LIMIT 60'):[];
 const secretariatIds=ctx.admin?(await all(db,"SELECT member_id FROM team_staff_roles WHERE role='secretariat'")).map(x=>x.member_id):[];
 const pendingRequests=ctx.admin?await all(db,"SELECT email,name,requested_at FROM team_join_requests WHERE status='pending' ORDER BY requested_at ASC LIMIT 250"):[];
 const invitations=ctx.admin?await all(db,'SELECT id,email,name,created_at,expires_at,used_at,revoked_at FROM team_invitations ORDER BY created_at DESC LIMIT 80'):[];
 const dues=ctx.admin||ctx.secretariat?await all(db,"SELECT m.id AS member_id,m.name,m.active,COALESCE(d.paid,0) AS paid,d.paid_on,d.payment_method,d.updated_by,d.updated_at FROM team_members m LEFT JOIN team_membership_dues d ON d.member_id=m.id WHERE m.active=1 ORDER BY m.name"):[];
 const listMemberships=ctx.admin||ctx.secretariat?await all(db,'SELECT member_id,pole_id,role FROM team_memberships'):[];
 const listRoles=ctx.admin||ctx.secretariat?await all(db,'SELECT member_id,role FROM team_member_roles'):[];
 const consentsAdmin=ctx.admin||ctx.secretariat?await all(db,'SELECT member_id,kind,granted,updated_at FROM team_member_consents'):[];
 const savedLists=ctx.admin||ctx.secretariat?await all(db,'SELECT id,title,columns_json,member_ids_json,created_by,created_at,updated_at FROM team_saved_lists ORDER BY updated_at DESC LIMIT 100'):[];
 const contacts=ctx.admin||ctx.secretariat?await all(db,"SELECT m.id AS member_id,m.name,m.email,m.active,COALESCE(c.phone,'') AS phone,COALESCE(c.address,'') AS address,COALESCE(c.postal_code,'') AS postal_code,COALESCE(c.city,'') AS city,c.updated_at,c.updated_by FROM team_members m LEFT JOIN team_member_contacts c ON c.member_id=m.id WHERE m.active=1 ORDER BY m.name"):[];
 return reply({poles,members,memberships,activities,audit:logs,secretariatIds,pendingRequests,invitations,dues,contacts,listMemberships,listRoles,consentsAdmin,savedLists});
}
async function enqueue(db,a,reason){
 const memberIds=await audienceMembers(db,a);
 for(const memberId of memberIds){
  await db.prepare("INSERT INTO team_activity_notices(id,activity_id,member_id,reason,created_at,seen_at) VALUES(?,?,?,?,?,NULL) ON CONFLICT(activity_id,member_id,reason) DO UPDATE SET created_at=excluded.created_at,seen_at=NULL").bind(uuid(),a.id,memberId,reason,now()).run();
  const pref=await one(db,'SELECT activity_enabled,urgent_enabled FROM team_notification_preferences WHERE member_id=?',memberId);
  const pushAllowed=reason==='cancelled'?(pref?.urgent_enabled!==0):(pref?.activity_enabled!==0);
  if(!pushAllowed)continue;
  const links=await all(db,'SELECT subscription_id FROM team_push_links WHERE member_id=?',memberId);
  for(const l of links){await db.prepare("INSERT INTO team_push_jobs(id,activity_id,member_id,subscription_id,reason,status,created_at) VALUES (?,?,?,?,?,'pending',?) ON CONFLICT(activity_id,subscription_id,reason) DO UPDATE SET status='pending',code=NULL,created_at=excluded.created_at")
   .bind(uuid(),a.id,memberId,l.subscription_id,reason,now()).run();}
 }
 return memberIds.length;
}
// Envoi désactivé par défaut. En staging, seuls les IDs explicites de test
// reçoivent des push; en production, chaque membre concerné et abonné peut en recevoir.
export function teamPushConfigured(env){
 return env.TEAM_PUSH_ENABLED==='true'&&Boolean(env.DB&&env.VAPID_PRIVATE_JWK&&env.VAPID_PUBLIC_KEY)&&
  (env.APP_ENV!=='staging'||Boolean(String(env.TEAM_PUSH_TEST_MEMBER_IDS||'').trim()));
}
export function teamPushRecipientAllowed(env,memberId){
 if(!teamPushConfigured(env)||!memberId)return false;
 if(env.APP_ENV!=='staging')return true;
 return String(env.TEAM_PUSH_TEST_MEMBER_IDS||'').split(',').map(x=>x.trim()).filter(Boolean).includes(memberId);
}

export async function drainTeamPush(env,maximum=40){
 // Never send in staging or when explicitly disabled; jobs stay in the queue.
 if(!teamPushConfigured(env))return {sent:0,disabled:true};
 const db=env.DB,jobs=await all(db,"SELECT * FROM team_push_jobs WHERE status='pending' ORDER BY created_at LIMIT ?",maximum);
 let sent=0;
 for(const job of jobs){
  const claimed=await db.prepare("UPDATE team_push_jobs SET status='processing' WHERE id=? AND status='pending'").bind(job.id).run();if(!claimed.meta.changes)continue;
  const a=await one(db,'SELECT * FROM team_activities WHERE id=?',job.activity_id),m=await one(db,'SELECT active FROM team_members WHERE id=?',job.member_id);
  if(!teamPushRecipientAllowed(env,job.member_id)){await db.prepare("UPDATE team_push_jobs SET status='pending' WHERE id=?").bind(job.id).run();continue;}
  const stillLinked=await one(db,'SELECT member_id FROM team_push_links WHERE member_id=? AND subscription_id=?',job.member_id,job.subscription_id);
  const intended=a&&m?.active&&stillLinked&&(await audienceMembers(db,a)).includes(job.member_id);
  const allowedState=(a?.status==='published'&&job.reason!=='cancelled')||(a?.status==='cancelled'&&job.reason==='cancelled');
  if(!intended||!allowedState){await db.prepare("UPDATE team_push_jobs SET status='failed',code=0 WHERE id=?").bind(job.id).run();continue;}
  const prefs=await one(db,'SELECT activity_enabled,urgent_enabled,quiet_enabled,quiet_start,quiet_end,sound_mode,vibrate FROM team_notification_preferences WHERE member_id=?',job.member_id);
  if(job.reason==='cancelled'&&prefs?.urgent_enabled===0||job.reason!=='cancelled'&&prefs?.activity_enabled===0){await db.prepare("UPDATE team_push_jobs SET status='failed',code=0 WHERE id=?").bind(job.id).run();continue;}
  if(prefs?.quiet_enabled&&!((job.reason==='cancelled')&&prefs?.urgent_enabled!==0)){
   const local=new Date().toLocaleTimeString('en-GB',{timeZone:'Europe/Paris',hour:'2-digit',minute:'2-digit',hour12:false}),start=prefs.quiet_start||'22:00',end=prefs.quiet_end||'08:00';
   const quiet=start<=end?(local>=start&&local<end):(local>=start||local<end);
   if(quiet){await db.prepare("UPDATE team_push_jobs SET status='pending' WHERE id=?").bind(job.id).run();continue;}
  }
  const sub=await one(db,'SELECT endpoint,p256dh,auth FROM push_subscriptions WHERE id=?',job.subscription_id);
  if(!sub){await db.prepare("UPDATE team_push_jobs SET status='failed',code=0 WHERE id=?").bind(job.id).run();continue;}
  const prefix=job.reason==='created'?'Nouvelle activité':job.reason==='cancelled'?'Activité annulée':'Activité modifiée';
  const payload={id:job.id,title:'ZikaTeam · '+prefix,body:a.title+' · '+new Date(a.starts_at).toLocaleString('fr-FR',{timeZone:'Europe/Paris'}),url:'/zikateam#activites',silent:prefs?.sound_mode==='none'||prefs?.sound_mode==='important'&&job.reason!=='cancelled',vibrate:prefs?.vibrate!==0?[120,70,120]:[]};
  let code=0;try{code=await sendPush({endpoint:sub.endpoint,keys:{p256dh:sub.p256dh,auth:sub.auth}},payload,env)}catch{}
  const ok=code>=200&&code<300;
  await db.prepare('UPDATE team_push_jobs SET status=?,code=?,sent_at=? WHERE id=?').bind(ok?'sent':'failed',code,now(),job.id).run();if(ok)sent++;
 }
 return {sent,disabled:false};
}

/** Notification ciblée de discussion : aucune diffusion collective de staging.
 * Une discussion n'est notifiée qu'aux membres actifs autorisés qui ont lié
 * volontairement leur appareil à ZikaTeam. Une seule alerte par appareil.
 */
export async function notifyTeamChat(env,ctx,message){
 if(!teamPushConfigured(env))return {sent:0,disabled:true};
 const db=env.DB;
 const channel=message.channel,channelId=message.channelId||null;
 const members=await all(db,"SELECT id,email FROM team_members WHERE active=1 AND id<>? LIMIT 200",ctx.member.id);
 // Les abonnements suivent les droits réels : groupe général, pôles actuels,
 // responsables et discussions des activités publiées concernées.
 // Le staging n'autorise que les identifiants explicitement prévus pour le test.
 let sent=0;
 for(const recipient of members){
  if(!teamPushRecipientAllowed(env,recipient.id))continue;
  const recipientCtx={admin:recipient.email===String(env.ADMIN_EMAIL||'').toLowerCase().trim(),member:recipient,pending:false,leadPoles:[],memberships:[]};
  recipientCtx.memberships=await all(db,'SELECT pole_id,role FROM team_memberships WHERE member_id=?',recipient.id);
  recipientCtx.leadPoles=recipientCtx.memberships.filter(x=>x.role==='lead').map(x=>x.pole_id);
  if(!await permittedChat(db,recipientCtx,channel,channelId))continue;
  const muted=await one(db,'SELECT muted FROM team_chat_mutes WHERE member_id=? AND channel=? AND channel_id=?',recipient.id,channel,channelId||'');
  if(muted?.muted===1)continue;
  const preferences=await one(db,'SELECT chat_mode,sound_mode,vibrate,quiet_enabled,quiet_start,quiet_end FROM team_notification_preferences WHERE member_id=?',recipient.id);
  if(preferences?.chat_mode==='silent')continue;
  if(preferences?.quiet_enabled){
   const local=new Date().toLocaleTimeString('en-GB',{timeZone:'Europe/Paris',hour:'2-digit',minute:'2-digit',hour12:false});
   const start=preferences.quiet_start||'22:00',end=preferences.quiet_end||'08:00';
   if(start<=end?(local>=start&&local<end):(local>=start||local<end))continue;
  }
  const links=await all(db,'SELECT ps.id,ps.endpoint,ps.p256dh,ps.auth FROM team_push_links l JOIN push_subscriptions ps ON ps.id=l.subscription_id WHERE l.member_id=? LIMIT 5',recipient.id);
  for(const sub of links){
   const title=channel==='general'?'Discussion générale':channel==='leaders'?'Entre responsables':channel==='pole'?'Message dans un pôle':'Discussion d’activité';
   const silent=preferences?.sound_mode==='none';
   const payload={title:'ZikaTeam · '+title,body:(ctx.member.name||'Un bénévole')+' a envoyé un nouveau message.',url:'/zikateam#messages',groupId:(channel+'-'+(channelId||'all')).slice(0,64),silent,vibrate:!silent&&preferences?.vibrate!==0?[120,70,120]:[]};
   let code=0;try{code=await sendPush({endpoint:sub.endpoint,keys:{p256dh:sub.p256dh,auth:sub.auth}},payload,env)}catch{}
   await audit(db,'system-chat-push',code>=200&&code<300?'chat.push.sent':'chat.push.failed',recipient.id,String(code)+' · '+channel+' · '+message.id);
   if(code>=200&&code<300)sent++;
  }
 }
 return {sent,disabled:false};
}

// Rappels horaires, exclusivement pour les destinataires encore autorisés.
export async function scheduleTeamReminders(env,maximum=40){
 if(!teamPushConfigured(env))return {sent:0,disabled:true};
 const db=env.DB,clock=now();
 for(const [kind,hours] of [['24h',24],['2h',2]]){
  const from=new Date(clock+hours*3600000-30*60000).toISOString();
  const until=new Date(clock+hours*3600000+30*60000).toISOString();
  const activities=await all(db,"SELECT * FROM team_activities WHERE status='published' AND starts_at>=? AND starts_at<? ORDER BY starts_at LIMIT 35",from,until);
  for(const activity of activities){
   const members=await audienceMembers(db,activity);
   for(const memberId of members){
    if(!teamPushRecipientAllowed(env,memberId))continue;
    const declined=await one(db,"SELECT answer FROM team_activity_rsvps WHERE activity_id=? AND member_id=?",activity.id,memberId);
    if(declined?.answer==='no')continue;
    const subs=await all(db,'SELECT subscription_id FROM team_push_links WHERE member_id=?',memberId);
    for(const sub of subs)await db.prepare("INSERT OR IGNORE INTO team_reminder_jobs(activity_id,member_id,subscription_id,kind,status,created_at) VALUES(?,?,?,?,'pending',?)").bind(activity.id,memberId,sub.subscription_id,kind,clock).run();
   }
  }
 }
 const jobs=await all(db,"SELECT * FROM team_reminder_jobs WHERE status='pending' ORDER BY created_at LIMIT ?",maximum);
 let sent=0;
 for(const job of jobs){
  const lock=await db.prepare("UPDATE team_reminder_jobs SET status='processing' WHERE activity_id=? AND subscription_id=? AND kind=? AND status='pending'").bind(job.activity_id,job.subscription_id,job.kind).run();
  if(!lock.meta.changes)continue;
  const a=await one(db,'SELECT * FROM team_activities WHERE id=?',job.activity_id);
  if(!teamPushRecipientAllowed(env,job.member_id)){await db.prepare("UPDATE team_reminder_jobs SET status='pending' WHERE activity_id=? AND subscription_id=? AND kind=?").bind(job.activity_id,job.subscription_id,job.kind).run();continue;}
  const linked=await one(db,"SELECT l.member_id FROM team_push_links l JOIN team_members m ON m.id=l.member_id WHERE l.member_id=? AND l.subscription_id=? AND m.active=1",job.member_id,job.subscription_id);
  const audience=a?.status==='published'&&(await audienceMembers(db,a)).includes(job.member_id);
  const r=await one(db,'SELECT answer FROM team_activity_rsvps WHERE activity_id=? AND member_id=?',job.activity_id,job.member_id);
  const sub=await one(db,'SELECT endpoint,p256dh,auth FROM push_subscriptions WHERE id=?',job.subscription_id);
  const prefs=await one(db,'SELECT activity_enabled,quiet_enabled,quiet_start,quiet_end,sound_mode,vibrate FROM team_notification_preferences WHERE member_id=?',job.member_id);
  const local=new Date().toLocaleTimeString('en-GB',{timeZone:'Europe/Paris',hour:'2-digit',minute:'2-digit',hour12:false});
  const start=prefs?.quiet_start||'22:00',end=prefs?.quiet_end||'08:00';
  const quiet=prefs?.quiet_enabled&&(start<=end?(local>=start&&local<end):(local>=start||local<end));
  if(quiet){await db.prepare("UPDATE team_reminder_jobs SET status='pending' WHERE activity_id=? AND subscription_id=? AND kind=?").bind(job.activity_id,job.subscription_id,job.kind).run();continue;}
  let code=0;
  if(linked&&audience&&r?.answer!=='no'&&sub&&prefs?.activity_enabled!==0){
   const data={title:'ZikaTeam · Rappel '+(job.kind==='24h'?'demain':'dans 2 h'),body:a.title+' · '+new Date(a.starts_at).toLocaleString('fr-FR',{timeZone:'Europe/Paris'}),url:'/zikateam#activites',silent:prefs?.sound_mode==='none',vibrate:prefs?.vibrate!==0?[120,70,120]:[]};
   try{code=await sendPush({endpoint:sub.endpoint,keys:{p256dh:sub.p256dh,auth:sub.auth}},data,env)}catch{}
  }
  const ok=code>=200&&code<300;
  await db.prepare('UPDATE team_reminder_jobs SET status=?,code=?,sent_at=? WHERE activity_id=? AND subscription_id=? AND kind=?').bind(ok?'sent':'failed',code,now(),job.activity_id,job.subscription_id,job.kind).run();
  if(ok)sent++;
 }
 return {sent,disabled:false};
}
async function saveMember(db,ctx,d,approving=false){
 if(!ctx.admin)return fail('Réservé à l’administration.',403);
 const name=clean(d.name,110),email=clean(d.email,254).toLowerCase();
 if(!name||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return fail('Nom ou adresse e-mail invalide.');
 if(d.id&& !idok(d.id))return fail('Identifiant invalide.');
 const id=d.id||uuid(),previous=d.id?await one(db,'SELECT * FROM team_members WHERE id=?',id):null;
 if(d.id&&!previous)return fail('Bénévole introuvable.',404);
 if(previous&&previous.email===ctx.email&&d.active===false)return fail('Impossible de désactiver votre propre fiche.');
 const pending=await one(db,"SELECT status FROM team_join_requests WHERE email=?",email);
 if(pending?.status==='pending'&&!approving)return fail('Cette demande doit être validée dans « Bénévoles à valider ».',409);
 const poleRoles=Array.isArray(d.poleRoles)?d.poleRoles:null,labels=Array.isArray(d.roles)?d.roles:null;
 if(poleRoles){
  if(poleRoles.length>100)return fail('Trop de pôles.');
  const seen=new Set();
  for(const item of poleRoles){
   if(!item||!idok(item.poleId)||!['member','lead'].includes(item.role)||seen.has(item.poleId))return fail('Pôle ou fonction invalide.');
   seen.add(item.poleId);
   if(!await one(db,'SELECT id FROM team_poles WHERE id=? AND archived=0',item.poleId))return fail('Pôle inconnu ou archivé.');
  }
 }
 if(labels&&(labels.length>2||new Set(labels).size!==labels.length||labels.some(x=>!['director','bureau'].includes(x))))return fail('Fonction générale invalide.');
 if(d.secretariat!==undefined&&typeof d.secretariat!=='boolean')return fail('Secrétariat invalide.');
 const active=d.active!==false?1:0;
 try{await db.prepare('INSERT INTO team_members(id,name,email,active,created_at,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,email=excluded.email,active=excluded.active,updated_at=excluded.updated_at').bind(id,name,email,active,previous?.created_at||now(),now()).run()}
 catch{return fail('Cette adresse e-mail est déjà utilisée.');}
 if(labels){
  await db.prepare('DELETE FROM team_member_roles WHERE member_id=?').bind(id).run();
  for(const role of labels)await db.prepare('INSERT INTO team_member_roles(member_id,role,created_at) VALUES(?,?,?)').bind(id,role,now()).run();
 }
 if(poleRoles){
  await db.prepare("DELETE FROM team_memberships WHERE member_id=? AND pole_id IN (SELECT id FROM team_poles WHERE archived=0)").bind(id).run();
  for(const item of poleRoles)await db.prepare('INSERT INTO team_memberships(member_id,pole_id,role,created_at) VALUES(?,?,?,?)').bind(id,item.poleId,item.role,now()).run();
 }
 if(typeof d.secretariat==='boolean'){
  if(d.secretariat)await db.prepare("INSERT OR IGNORE INTO team_staff_roles(member_id,role,granted_by,granted_at) VALUES(?,'secretariat',?,?)").bind(id,ctx.email,now()).run();
  else await db.prepare("DELETE FROM team_staff_roles WHERE member_id=? AND role='secretariat'").bind(id).run();
 }
 await audit(db,ctx.email,'member.save',id,name);return reply({ok:true,id});
}
async function savePole(db,ctx,d){
 if(!ctx.admin)return fail('Seule l’administration peut modifier les pôles.',403);
 const name=clean(d.name,100),description=clean(d.description,600);
 if(!name)return fail('Le nom du pôle est obligatoire.');
 const id=d.id||uuid(),previous=d.id?await one(db,'SELECT * FROM team_poles WHERE id=?',id):null;
 if(d.id&&!previous)return fail('Pôle introuvable.',404);
 if(!ctx.admin&&(!d.id||!ctx.leadPoles.includes(d.id)))return fail('Vous pouvez modifier uniquement votre pôle.',403);
 if(previous?.archived&&!ctx.admin)return fail('Pôle archivé.',409);
 await db.prepare('INSERT INTO team_poles(id,name,description,archived,created_at,updated_at) VALUES(?,?,?,0,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,description=excluded.description,updated_at=excluded.updated_at').bind(id,name,description,previous?.created_at||now(),now()).run();
 await audit(db,ctx.email,'pole.save',id,name);return reply({ok:true,id});
}
async function assign(db,ctx,d){
 if(!ctx.admin&&!ctx.secretariat)return fail('Affectations réservées à l’administration et au secrétariat.',403);
 if(!idok(d.memberId)||!idok(d.poleId))return fail('Identifiants incorrects.');
 const member=await one(db,'SELECT id,active FROM team_members WHERE id=?',d.memberId),pole=await one(db,'SELECT id,archived FROM team_poles WHERE id=?',d.poleId);
 if(!member||!pole||pole.archived)return fail('Bénévole ou pôle introuvable.',404);
 const role=d.role==='lead'?'lead':'member';
 const prior=await one(db,'SELECT role FROM team_memberships WHERE member_id=? AND pole_id=?',d.memberId,d.poleId);
 if(d.remove===true){await db.prepare('DELETE FROM team_memberships WHERE member_id=? AND pole_id=?').bind(d.memberId,d.poleId).run();}
 else await db.prepare("INSERT INTO team_memberships(member_id,pole_id,role,created_at) VALUES(?,?,?,?) ON CONFLICT(member_id,pole_id) DO UPDATE SET role=excluded.role").bind(d.memberId,d.poleId,role,now()).run();
 await audit(db,ctx.email,d.remove?'membership.remove':'membership.save',d.poleId,d.memberId);return reply({ok:true});
}
async function setMemberFunctions(db,ctx,d){
 if(!ctx.admin&&!ctx.secretariat)return fail('Fonctions réservées à l’administration et au secrétariat.',403);
 if(!idok(d.memberId))return fail('Fiche bénévole invalide.',400);
 const member=await one(db,'SELECT id,active FROM team_members WHERE id=?',d.memberId);
 if(!member?.active)return fail('Bénévole actif introuvable.',404);
 const labels=d.roles,poleRoles=d.poleRoles;
 if(!Array.isArray(labels)||labels.length>2||new Set(labels).size!==labels.length||labels.some(x=>!['director','bureau'].includes(x)))return fail('Fonctions générales invalides.',400);
 if(!Array.isArray(poleRoles)||poleRoles.length>100)return fail('Liste des pôles invalide.',400);
 const seen=new Set();
 for(const item of poleRoles){
  if(!item||!idok(item.poleId)||!['member','lead'].includes(item.role)||seen.has(item.poleId))return fail('Fonction de pôle invalide.',400);
  seen.add(item.poleId);
  if(!await one(db,'SELECT id FROM team_poles WHERE id=? AND archived=0',item.poleId))return fail('Pôle introuvable ou archivé.',404);
 }
 // Mise à jour des seules fonctions : aucune modification de compte, de charte,
 // d'approbation ou des accès au secrétariat.
 await db.prepare('DELETE FROM team_member_roles WHERE member_id=?').bind(member.id).run();
 for(const role of labels)await db.prepare('INSERT INTO team_member_roles(member_id,role,created_at) VALUES(?,?,?)').bind(member.id,role,now()).run();
 await db.prepare("DELETE FROM team_memberships WHERE member_id=? AND pole_id IN (SELECT id FROM team_poles WHERE archived=0)").bind(member.id).run();
 for(const item of poleRoles)await db.prepare('INSERT INTO team_memberships(member_id,pole_id,role,created_at) VALUES(?,?,?,?)').bind(member.id,item.poleId,item.role,now()).run();
 await audit(db,ctx.email,'member.functions.set',member.id,JSON.stringify({roles:labels,poleRoles}).slice(0,500));
 return reply({ok:true});
}
async function saveActivity(db,ctx,d){
 if(!ctx.admin&&!ctx.leadPoles.length)return fail('Réservé aux responsables.',403);
 if(!(validKind(d.kind)||d.kind==='other')||!validAudience(d.audience)||!clean(d.title,120)||!dateok(d.starts_at)||!dateok(d.ends_at)||Date.parse(d.ends_at)<=Date.parse(d.starts_at)||Date.parse(d.ends_at)-Date.parse(d.starts_at)>90*86400000)return fail('Titre, type, public ou dates invalides.');
 const customKind=d.kind==='other'?clean(d.customKind,90):'';
 if(d.kind==='other'&&customKind.length<3)return fail('Indique l’objet de cette activité (3 caractères minimum).',400);
 const selected=[...new Set(Array.isArray(d.poles)?d.poles:[])];
 if(d.audience==='poles'&&!selected.length)return fail('Sélectionnez au moins un pôle.');
 for(const p of selected){if(!idok(p)||!(await one(db,'SELECT id FROM team_poles WHERE id=? AND archived=0',p)))return fail('Un pôle est inconnu ou archivé.');}
 if(!ctx.admin&&(d.audience!=='poles'||selected.some(p=>!ctx.leadPoles.includes(p))))return fail('Un responsable ne peut convoquer que ses pôles.',403);
 const id=d.id||uuid(),previous=d.id?await one(db,'SELECT * FROM team_activities WHERE id=?',id):null;
 if(d.id&&!previous)return fail('Activité introuvable.',404);
 if(previous&&!await allowedActivity(db,ctx,previous))return fail('Gestion de cette activité refusée.',403);
 const status=['draft','published','cancelled'].includes(d.status)?d.status:'draft';
 const wasBureau=previous?Boolean(await one(db,'SELECT activity_id FROM team_activity_bureau_audience WHERE activity_id=?',id)):false;
 const documentId=d.agenda_document_id||null;
 if(documentId){const doc=await one(db,'SELECT * FROM team_documents WHERE id=? AND kind IN (\'agenda\',\'instructions\')',documentId);if(!doc||doc.activity_id!==id)return fail('Ce document ne concerne pas cette activité.');}
 await db.prepare('INSERT INTO team_activities(id,kind,title,starts_at,ends_at,place,details,agenda,agenda_document_id,audience,status,created_by,updated_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET kind=excluded.kind,title=excluded.title,starts_at=excluded.starts_at,ends_at=excluded.ends_at,place=excluded.place,details=excluded.details,agenda=excluded.agenda,agenda_document_id=excluded.agenda_document_id,audience=excluded.audience,status=excluded.status,updated_by=excluded.updated_by,updated_at=excluded.updated_at').bind(id,d.kind==='other'?'mission':d.kind,clean(d.title,120),d.starts_at,d.ends_at,clean(d.place,190),clean(d.details,3000),clean(d.agenda,8000),documentId,d.audience==='bureau'?'leaders':d.audience,status,previous?.created_by||ctx.email,ctx.email,previous?.created_at||now(),now()).run();
 if(customKind)await db.prepare('INSERT INTO team_activity_custom_kinds(activity_id,label) VALUES(?,?) ON CONFLICT(activity_id) DO UPDATE SET label=excluded.label').bind(id,customKind).run();
 else await db.prepare('DELETE FROM team_activity_custom_kinds WHERE activity_id=?').bind(id).run();
 if(d.audience==='bureau')await db.prepare('INSERT OR IGNORE INTO team_activity_bureau_audience(activity_id,added_at) VALUES(?,?)').bind(id,now()).run();
 else await db.prepare('DELETE FROM team_activity_bureau_audience WHERE activity_id=?').bind(id).run();
 await db.prepare('DELETE FROM team_activity_poles WHERE activity_id=?').bind(id).run();
 if(d.audience==='poles')for(const pole of selected)await db.prepare('INSERT INTO team_activity_poles(activity_id,pole_id) VALUES (?,?)').bind(id,pole).run();
 const result=await one(db,'SELECT * FROM team_activities WHERE id=?',id);
 let invites=0;
 if(status==='published'&&previous?.status!=='published')invites=await enqueue(db,result,'created');
 else if(previous?.status==='published'&&status==='cancelled')invites=await enqueue(db,result,'cancelled');
 else if(previous?.status==='published'&&status==='published'&&(wasBureau!==(d.audience==='bureau')||[previous.title,previous.starts_at,previous.ends_at,previous.place,previous.audience].join('|')!==[result.title,result.starts_at,result.ends_at,result.place,result.audience].join('|')))invites=await enqueue(db,result,'updated');
 await audit(db,ctx.email,'activity.save',id,`${result.kind} · ${result.title} · ${status}`);
 return reply({ok:true,id,invitedMembers:invites,pushEnabled:false});
}
async function saveShift(db,ctx,d){
 if(!idok(d.activityId)||!dateok(d.starts_at)||!dateok(d.ends_at)||Date.parse(d.ends_at)<=Date.parse(d.starts_at)||!Number.isInteger(d.capacity)||d.capacity<1||d.capacity>500)return fail('Créneau invalide.');
 const a=await one(db,'SELECT * FROM team_activities WHERE id=?',d.activityId);
 if(!a||!await allowedActivity(db,ctx,a))return fail('Activité non autorisée.',403);
 if(Date.parse(d.starts_at)<Date.parse(a.starts_at)||Date.parse(d.ends_at)>Date.parse(a.ends_at))return fail('Créneau hors des horaires de l’activité.');
 const id=d.id||uuid();if(d.id){const old=await one(db,'SELECT activity_id FROM team_shifts WHERE id=?',d.id);if(!old||old.activity_id!==a.id)return fail('Créneau inconnu.');}
 const existing=(await one(db,'SELECT COUNT(*) n FROM team_shift_signups WHERE shift_id=?',id))?.n||0;
 if(existing>d.capacity)return fail('Capacité inférieure au nombre déjà inscrit.');
 await db.prepare('INSERT INTO team_shifts(id,activity_id,label,starts_at,ends_at,capacity,created_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET label=excluded.label,starts_at=excluded.starts_at,ends_at=excluded.ends_at,capacity=excluded.capacity').bind(id,a.id,clean(d.label,90)||'Créneau',d.starts_at,d.ends_at,d.capacity,now()).run();
 await audit(db,ctx.email,'shift.save',id,a.id);return reply({ok:true,id});
}
async function saveTask(db,ctx,d){
 if(!idok(d.activityId))return fail('Activité invalide.');
 const a=await one(db,'SELECT * FROM team_activities WHERE id=?',d.activityId);
 if(!a||!await allowedActivity(db,ctx,a))return fail('Gestion de cette activité refusée.',403);
 const title=clean(d.title,160),details=clean(d.details,1500);
 if(!title)return fail('Le titre de la tâche est obligatoire.');
 if(d.id&&!idok(d.id))return fail('Identifiant de tâche invalide.');
 const id=d.id||uuid(),prior=d.id?await one(db,'SELECT * FROM team_activity_tasks WHERE id=?',id):null;
 if(d.id&&(!prior||prior.activity_id!==a.id))return fail('Tâche introuvable.',404);
 const status=['todo','doing','done'].includes(d.status)?d.status:'todo';
 const memberId=d.assigned_to||null;
 if(memberId){if(!idok(memberId)||!(await audienceMembers(db,a)).includes(memberId))return fail('Ce bénévole ne fait pas partie des personnes concernées.',403);}
 await db.prepare('INSERT INTO team_activity_tasks(id,activity_id,title,details,assigned_to,status,created_by,updated_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,details=excluded.details,assigned_to=excluded.assigned_to,status=excluded.status,updated_by=excluded.updated_by,updated_at=excluded.updated_at').bind(id,a.id,title,details,memberId,status,prior?.created_by||ctx.email,ctx.email,prior?.created_at||now(),now()).run();
 await audit(db,ctx.email,'task.save',id,title);return reply({ok:true,id});
}
async function setCheckin(db,ctx,d){
 if(!idok(d.activityId)||!idok(d.memberId))return fail('Activité ou bénévole invalide.');
 const a=await one(db,'SELECT * FROM team_activities WHERE id=?',d.activityId);
 if(!a||!(await allowedActivity(db,ctx,a)||ctx.secretariat&&a.status==='published'))return fail('Pointage non autorisé.',403);
 if(!(await audienceMembers(db,a)).includes(d.memberId))return fail('Bénévole non concerné.',403);
 if(a.status!=='published')return fail('Seule une activité publiée peut faire l’objet d’un pointage.',409);
 const previous=await one(db,'SELECT * FROM team_activity_checkins WHERE activity_id=? AND member_id=?',a.id,d.memberId);
 const time=d.present===true?now():null;
 await db.prepare('INSERT INTO team_activity_checkins(activity_id,member_id,checked_in_at,checked_out_at,checked_by) VALUES(?,?,?,?,?) ON CONFLICT(activity_id,member_id) DO UPDATE SET checked_in_at=excluded.checked_in_at,checked_out_at=excluded.checked_out_at,checked_by=excluded.checked_by').bind(a.id,d.memberId,time,null,ctx.email).run();
 await audit(db,ctx.email,'checkin.set',a.id,d.memberId+(d.present===true?' présent':' non pointé'));return reply({ok:true,previous:previous?.checked_in_at||null});
}
async function memberAction(db,ctx,d){
 if(!ctx.member)return fail('Fiche bénévole nécessaire.',403);
 if(d.op==='notice.read'){
  if(ctx.pending||!ctx.member.active||!await requireCharter(db,ctx))return fail('Accès aux notifications refusé.',403);
  if(!idok(d.id))return fail('Notification invalide.',400);
  await db.prepare('UPDATE team_activity_notices SET seen_at=? WHERE id=? AND member_id=? AND seen_at IS NULL').bind(now(),d.id,ctx.member.id).run();
  return reply({ok:true});
 }
 const memberId=ctx.member.id;
 if(d.op==='notification.settings'){
  if(ctx.pending||!ctx.member.active||!await requireCharter(db,ctx))return fail('Paramètres non disponibles avant validation.',403);
  const p=d.preferences;
  if(!p||!['grouped','all','silent'].includes(p.chat_mode)||!['none','important','all'].includes(p.sound_mode)||['vibrate','activity_enabled','urgent_enabled','quiet_enabled'].some(k=>typeof p[k]!=='boolean')||![p.quiet_start,p.quiet_end].every(x=>typeof x==='string'&&/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/.test(x)))return fail('Préférences invalides.',400);
  await db.prepare('INSERT INTO team_notification_preferences(member_id,chat_mode,sound_mode,vibrate,activity_enabled,urgent_enabled,quiet_enabled,quiet_start,quiet_end,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(member_id) DO UPDATE SET chat_mode=excluded.chat_mode,sound_mode=excluded.sound_mode,vibrate=excluded.vibrate,activity_enabled=excluded.activity_enabled,urgent_enabled=excluded.urgent_enabled,quiet_enabled=excluded.quiet_enabled,quiet_start=excluded.quiet_start,quiet_end=excluded.quiet_end,updated_at=excluded.updated_at').bind(memberId,p.chat_mode,p.sound_mode,p.vibrate?1:0,p.activity_enabled?1:0,p.urgent_enabled?1:0,p.quiet_enabled?1:0,p.quiet_start,p.quiet_end,now()).run();
  await audit(db,ctx.email,'notifications.settings',memberId);
  return reply({ok:true});
 }
 if(d.op==='notification.chat.mute'){
  if(ctx.pending||!ctx.member.active||!await requireCharter(db,ctx))return fail('Accès non autorisé.',403);
  if(typeof d.muted!=='boolean'||!await permittedChat(db,ctx,d.channel,d.channelId||null))return fail('Groupe non autorisé.',403);
  await db.prepare('INSERT INTO team_chat_mutes(member_id,channel,channel_id,muted,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(member_id,channel,channel_id) DO UPDATE SET muted=excluded.muted,updated_at=excluded.updated_at').bind(memberId,d.channel,d.channelId||'',d.muted?1:0,now()).run();
  return reply({ok:true});
 }
 if(d.op==='contact.self'){
  if(ctx.pending||!ctx.member.active)return fail('Seuls les bénévoles validés peuvent renseigner leur téléphone.',403);
  if(!await requireCharter(db,ctx))return fail('Accepte la charte avant de modifier ta fiche.',409);
  const phone=clean(d.phone,40);
  if(phone&&!/^[+()\d\s.\-]{6,40}$/.test(phone))return fail('Numéro de téléphone invalide.',400);
  await db.prepare("INSERT INTO team_member_contacts(member_id,phone,updated_at,updated_by) VALUES(?,?,?,?) ON CONFLICT(member_id) DO UPDATE SET phone=excluded.phone,updated_at=excluded.updated_at,updated_by=excluded.updated_by").bind(memberId,phone,now(),ctx.email).run();
  await audit(db,ctx.email,'contact.self',memberId,'Téléphone personnel actualisé');
  return reply({ok:true});
 }
 if(d.op==='consents.save'){
  const values=d.consents;
  if(!values||typeof values!=='object'||['image','phone','email'].some(k=>typeof values[k]!=='boolean'))return fail('Choisis explicitement Oui ou Non pour chacune des trois autorisations.',400);
  for(const kind of ['image','phone','email']){
   await db.prepare('INSERT INTO team_member_consents(member_id,kind,granted,version,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(member_id,kind) DO UPDATE SET granted=excluded.granted,version=excluded.version,updated_at=excluded.updated_at').bind(memberId,kind,values[kind]?1:0,'2026-11-11',now()).run();
  }
  await audit(db,ctx.email,'consents.update',memberId,'Autorisations image, téléphone et e-mail');
  return reply({ok:true});
 }
 if(d.op==='charter.accept'){
  const c=await charter(db);if(!c)return fail('La charte officielle n’a pas encore été publiée.',409);
  if(d.version!==c.version)return fail('La charte a été actualisée, relisez sa nouvelle version.',409);
  if(d.agree!==true)return fail('Vous devez confirmer explicitement la lecture et l’acceptation.',400);
  // Réponse Oui ou Non obligatoire aux trois questions ; le consentement positif ne l'est jamais.
  if(!d.consents||typeof d.consents!=='object'||['image','phone','email'].some(k=>typeof d.consents[k]!=='boolean'))return fail('Réponds obligatoirement Oui ou Non au droit à l’image, au téléphone et à l’e-mail.',400);
  for(const kind of ['image','phone','email']){
   await db.prepare('INSERT INTO team_member_consents(member_id,kind,granted,version,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(member_id,kind) DO UPDATE SET granted=excluded.granted,version=excluded.version,updated_at=excluded.updated_at').bind(memberId,kind,d.consents[kind]?1:0,'2026-11-11',now()).run();
  }
  await audit(db,ctx.email,'consents.first',memberId);
  const saved=await db.prepare('INSERT OR IGNORE INTO team_charter_acceptances(member_id,version,accepted_at) VALUES(?,?,?)').bind(memberId,c.version,now()).run();
  if(saved.meta.changes)await audit(db,ctx.email,'charter.accept',memberId,c.version);
  return reply({ok:true});
 }
 if(!await requireCharter(db,ctx))return fail('Veuillez accepter la charte avant de répondre ou de discuter.',409);
 if(ctx.pending)return fail('Ta demande attend la validation par l’administration. Aucune conversation n’est accessible avant approbation.',403);
 if(d.op==='activity.rsvp'){
  if(!idok(d.activityId)||!['yes','no','maybe'].includes(d.answer))return fail('Réponse invalide.');
  const a=await one(db,'SELECT * FROM team_activities WHERE id=?',d.activityId);if(!a||a.status!=='published'||!(await audienceMembers(db,a)).includes(memberId))return fail('Convocation indisponible.',403);
  await db.prepare('INSERT INTO team_activity_rsvps(activity_id,member_id,answer,updated_at) VALUES(?,?,?,?) ON CONFLICT(activity_id,member_id) DO UPDATE SET answer=excluded.answer,updated_at=excluded.updated_at').bind(a.id,memberId,d.answer,now()).run();
  if(d.answer==='no')await db.prepare('DELETE FROM team_shift_signups WHERE member_id=? AND shift_id IN(SELECT id FROM team_shifts WHERE activity_id=?)').bind(memberId,a.id).run();
  return reply({ok:true});
 }
 if(d.op==='shift.signup'){
  if(!idok(d.shiftId))return fail('Créneau invalide.');
  const s=await one(db,'SELECT s.*,a.status,a.audience,a.id AS event_id FROM team_shifts s JOIN team_activities a ON a.id=s.activity_id WHERE s.id=?',d.shiftId);
  if(!s||s.status!=='published'||!(await audienceMembers(db,{id:s.event_id,audience:s.audience})).includes(memberId))return fail('Créneau non autorisé.',403);
  if(d.remove===true){await db.prepare('DELETE FROM team_shift_signups WHERE shift_id=? AND member_id=?').bind(s.id,memberId).run();return reply({ok:true});}
  const r=await db.prepare('INSERT OR IGNORE INTO team_shift_signups(shift_id,member_id,signed_at) SELECT ?,?,? WHERE (SELECT COUNT(*) FROM team_shift_signups WHERE shift_id=?) < (SELECT capacity FROM team_shifts WHERE id=?)').bind(s.id,memberId,now(),s.id,s.id).run();
  if(!r.meta.changes&&!(await one(db,'SELECT shift_id FROM team_shift_signups WHERE shift_id=? AND member_id=?',s.id,memberId)))return fail('Ce créneau est complet.',409);
  await db.prepare('INSERT INTO team_activity_rsvps(activity_id,member_id,answer,updated_at) VALUES(?,?,?,?) ON CONFLICT(activity_id,member_id) DO UPDATE SET answer=excluded.answer,updated_at=excluded.updated_at').bind(s.event_id,memberId,'yes',now()).run();
  return reply({ok:true});
 }
 if(d.op==='push.link'){
  const sub=d.subscription;if(typeof sub?.endpoint!=='string'||typeof sub?.keys?.auth!=='string'||sub.endpoint.length>4000)return fail('Abonnement invalide.');
  const subscriptionId=b64(await crypto.subtle.digest('SHA-256',enc(sub.endpoint)));
  const registered=await one(db,'SELECT id,auth FROM push_subscriptions WHERE id=?',subscriptionId);
  if(!registered||registered.auth!==sub.keys.auth)return fail('Activez d’abord les notifications sur cet appareil.',403);
  // One subscription must never be mapped to more than one volunteer.
  await db.prepare('DELETE FROM team_push_links WHERE subscription_id=?').bind(subscriptionId).run();
  await db.prepare('INSERT INTO team_push_links(member_id,subscription_id,linked_at) VALUES (?,?,?)').bind(memberId,subscriptionId,now()).run();
  return reply({ok:true});
 }
 if(d.op==='task.status'){
  const t=idok(d.id)?await one(db,'SELECT t.*,a.status AS activity_status,a.audience FROM team_activity_tasks t JOIN team_activities a ON a.id=t.activity_id WHERE t.id=?',d.id):null;
  if(!t||t.assigned_to!==memberId||t.activity_status!=='published'||!(await audienceMembers(db,{id:t.activity_id,audience:t.audience})).includes(memberId))return fail('Tâche non attribuée.',403);
  if(!['todo','doing','done'].includes(d.status))return fail('Statut invalide.');
  await db.prepare('UPDATE team_activity_tasks SET status=?,updated_by=?,updated_at=? WHERE id=?').bind(d.status,ctx.email,now(),t.id).run();
  await audit(db,ctx.email,'task.status',t.id,d.status);return reply({ok:true});
 }
 if(d.op==='message.send'){
  const message=clean(d.body,1400),channel=d.channel,channelId=d.channelId||null;
  if(!message||!['general','pole','activity','leaders'].includes(channel))return fail('Message invalide.');
  if(channel==='leaders'){
   if(!await permittedChat(db,ctx,channel,channelId))return fail('Discussion réservée aux responsables.',403);
   const id=uuid();
   await db.prepare('INSERT INTO team_leader_messages(id,author_id,body,created_at) VALUES(?,?,?,?)').bind(id,memberId,message,now()).run();
   return reply({ok:true,id});
  }
  if(!await permittedChat(db,ctx,channel,channelId))return fail('Discussion non autorisée.',403);
  if(channel==='pole'&&(!idok(channelId)||!ctx.memberships.some(m=>m.pole_id===channelId)))return fail('Pôle non autorisé.',403);
  if(channel==='activity'){const a=idok(channelId)?await one(db,'SELECT * FROM team_activities WHERE id=?',channelId):null;if(!a||(!ctx.admin&&a.status==='draft')||!await visibleActivity(db,ctx,a))return fail('Discussion non autorisée.',403);}
  const id=uuid();await db.prepare('INSERT INTO team_messages(id,author_id,channel,channel_id,body,created_at) VALUES(?,?,?,?,?,?)').bind(id,memberId,channel,channelId,message,now()).run();return reply({ok:true,id});
 }
 return fail('Action non reconnue.',404);
}

async function getSigning(db,ctx){
 if(!ctx.admin&&!ctx.secretariat)return fail('Émargements réservés à l’administration et au secrétariat.',403);
 const sessions=await all(db,'SELECT id,title,starts_at,place,created_by,created_at,closed_at FROM team_signing_sessions ORDER BY starts_at DESC,created_at DESC LIMIT 80');
 for(const session of sessions){
  session.attendees=await all(db,'SELECT member_id,display_name,quality,added_at,signature_points,signed_at,signed_by_operator FROM team_signing_attendees WHERE session_id=? ORDER BY added_at,display_name',session.id);
 }
 const people=await all(db,`SELECT m.id,m.name,
 CASE WHEN EXISTS(SELECT 1 FROM team_member_roles r WHERE r.member_id=m.id AND r.role='director') THEN 'Dirigeant'
 WHEN EXISTS(SELECT 1 FROM team_memberships tm JOIN team_poles p ON p.id=tm.pole_id WHERE tm.member_id=m.id AND tm.role='lead' AND p.archived=0) THEN 'Responsable'
 WHEN EXISTS(SELECT 1 FROM team_member_roles r WHERE r.member_id=m.id AND r.role='bureau') THEN 'Membre du bureau'
 ELSE 'Bénévole' END AS quality,
 CASE WHEN EXISTS(SELECT 1 FROM team_member_roles r WHERE r.member_id=m.id AND r.role='bureau') THEN 1 ELSE 0 END AS bureau,
 CASE WHEN EXISTS(SELECT 1 FROM team_memberships tm JOIN team_poles p ON p.id=tm.pole_id WHERE tm.member_id=m.id AND tm.role='lead' AND p.archived=0) THEN 1 ELSE 0 END AS leader
 FROM team_members m WHERE m.active=1 ORDER BY m.name`);
 const memberships=await all(db,'SELECT tm.member_id,tm.pole_id FROM team_memberships tm JOIN team_members m ON m.id=tm.member_id JOIN team_poles p ON p.id=tm.pole_id WHERE m.active=1 AND p.archived=0');
 const poles=await all(db,'SELECT id,name FROM team_poles WHERE archived=0 ORDER BY name');
 return reply({sessions,people,memberships,poles});
}
function validSignature(strokes){
 if(!Array.isArray(strokes)||!strokes.length||strokes.length>80)return false;
 let count=0,movement=0;
 for(const line of strokes){
  if(!Array.isArray(line)||line.length<2||line.length>1800)return false;
  for(let i=0;i<line.length;i++){
   const p=line[i];
   if(!Array.isArray(p)||p.length!==2||!Number.isInteger(p[0])||!Number.isInteger(p[1])||p[0]<0||p[0]>1000||p[1]<0||p[1]>400)return false;
   if(i)movement+=Math.hypot(p[0]-line[i-1][0],p[1]-line[i-1][1]);
   if(++count>3200)return false;
  }
 }
 return count>=4&&movement>=30;
}
async function signingAction(db,ctx,d){
 if(!ctx.admin&&!ctx.secretariat)return fail('Émargements réservés à l’administration et au secrétariat.',403);
 if(d.op==='signing.delete'){
  if(!idok(d.sessionId))return fail('Identifiant de feuille invalide.',400);
  const session=await one(db,'SELECT id,title,closed_at FROM team_signing_sessions WHERE id=?',d.sessionId);
  if(!session)return fail('Feuille introuvable.',404);
  const signatures=await one(db,'SELECT COUNT(*) AS n FROM team_signing_attendees WHERE session_id=? AND signed_at IS NOT NULL',d.sessionId);
  if((signatures?.n||0)>0&&!ctx.admin)return fail('Seul un administrateur peut supprimer une feuille contenant des signatures.',403);
  if(d.confirm!==true||((signatures?.n||0)>0&&d.confirmTitle!==session.title))return fail('Confirmation explicite nécessaire pour supprimer cette feuille.',409);
  await db.prepare('DELETE FROM team_signing_attendees WHERE session_id=?').bind(d.sessionId).run();
  await db.prepare('DELETE FROM team_signing_sessions WHERE id=?').bind(d.sessionId).run();
  await audit(db,ctx.email,'signing.delete',d.sessionId,session.title+' · '+(signatures?.n||0)+' signature(s) supprimée(s)');
  return reply({ok:true,deleted:true});
 }
 if(d.op==='signing.create'){
  const title=clean(d.title,180),place=clean(d.place,180),startsAt=d.startsAt;
  if(!title||!place||!dateok(startsAt))return fail('Renseignez l’objet, la date, l’heure et le lieu.',400);
  const id=uuid();
  await db.prepare('INSERT INTO team_signing_sessions(id,title,starts_at,place,created_by,created_at) VALUES(?,?,?,?,?,?)').bind(id,title,startsAt,place,ctx.email,now()).run();
  await audit(db,ctx.email,'signing.create',id,title);
  return reply({ok:true,id});
 }
 if(!idok(d.sessionId))return fail('Séance d’émargement invalide.',400);
 const session=await one(db,'SELECT id,closed_at FROM team_signing_sessions WHERE id=?',d.sessionId);
 if(!session)return fail('Séance introuvable.',404);
 if(session.closed_at)return fail('Cette feuille est clôturée et ne peut plus être modifiée.',409);
 if(d.op==='signing.add'){
  const ids=Array.isArray(d.memberIds)?[...new Set(d.memberIds)]:[];
  if(!ids.length||ids.length>250||ids.some(id=>!idok(id)))return fail('Sélectionnez des bénévoles à ajouter (250 maximum).',400);
  let added=0;
  for(const id of ids){
   const member=await one(db,'SELECT id,name,active FROM team_members WHERE id=?',id);
   if(!member?.active)return fail('Bénévole non approuvé ou introuvable.',404);
   const quality=await one(db,`SELECT CASE
 WHEN EXISTS(SELECT 1 FROM team_member_roles WHERE member_id=? AND role='director') THEN 'Dirigeant'
 WHEN EXISTS(SELECT 1 FROM team_memberships WHERE member_id=? AND role='lead') THEN 'Responsable'
 WHEN EXISTS(SELECT 1 FROM team_member_roles WHERE member_id=? AND role='bureau') THEN 'Membre du bureau'
 ELSE 'Bénévole' END AS quality`,id,id,id);
   const result=await db.prepare('INSERT OR IGNORE INTO team_signing_attendees(session_id,member_id,display_name,quality,added_at) VALUES(?,?,?,?,?)').bind(d.sessionId,id,member.name,quality.quality,now()).run();
   added+=result.meta?.changes||0;
  }
  await audit(db,ctx.email,'signing.add',d.sessionId,String(added)+' participant(s)');
  return reply({ok:true,added});
 }
 if(d.op==='signing.remove'){
  if(!idok(d.memberId))return fail('Participant invalide.',400);
  const result=await db.prepare('DELETE FROM team_signing_attendees WHERE session_id=? AND member_id=? AND signed_at IS NULL').bind(d.sessionId,d.memberId).run();
  if(!result.meta?.changes)return fail('La signature est déjà validée, ou ce bénévole ne figure pas dans la séance.',409);
  await audit(db,ctx.email,'signing.remove',d.sessionId,d.memberId);
  return reply({ok:true});
 }
 if(d.op==='signing.sign'){
  if(!idok(d.memberId)||!validSignature(d.strokes))return fail('Signature invalide ou incomplète.',400);
  const signature=JSON.stringify(d.strokes);
  if(signature.length>26000)return fail('Signature trop longue.',413);
  const existing=await one(db,'SELECT signed_at FROM team_signing_attendees WHERE session_id=? AND member_id=?',d.sessionId,d.memberId);
  if(!existing)return fail('Ce bénévole ne figure pas dans cette feuille.',404);
  if(existing.signed_at)return fail('Cette signature a déjà été validée et ne peut être écrasée.',409);
  const result=await db.prepare('UPDATE team_signing_attendees SET signature_points=?,signed_at=?,signed_by_operator=? WHERE session_id=? AND member_id=? AND signed_at IS NULL').bind(signature,now(),ctx.email,d.sessionId,d.memberId).run();
  if(!result.meta?.changes)return fail('Signature déjà enregistrée.',409);
  await audit(db,ctx.email,'signing.sign',d.sessionId,d.memberId);
  return reply({ok:true});
 }
 if(d.op==='signing.close'){
  await db.prepare('UPDATE team_signing_sessions SET closed_at=? WHERE id=? AND closed_at IS NULL').bind(now(),d.sessionId).run();
  await audit(db,ctx.email,'signing.close',d.sessionId);
  return reply({ok:true});
 }
 return fail('Commande d’émargement inconnue.',404);
}

async function adminAction(db,ctx,d){
 if(d.op==='invite.create'){
  if(!ctx.admin)return fail('Seul un administrateur peut inviter de nouveaux bénévoles.',403);
  const email=clean(d.email,254).toLowerCase(),name=clean(d.name,110);
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||name.length<2)return fail('Indique le nom complet et une adresse e-mail valide.',400);
  const existing=await one(db,'SELECT active FROM team_members WHERE email=?',email);
  if(existing?.active===1)return fail('Cette personne est déjà bénévole : utilise sa fiche.',409);
  const rejected=await one(db,'SELECT status FROM team_join_requests WHERE email=?',email);
  if(rejected?.status==='rejected')return fail('Ce compte a été refusé : contacte l’administration avant de le réinviter.',409);
  const num=await one(db,'SELECT COUNT(*) AS n FROM team_invitations WHERE created_by=? AND created_at>?',ctx.email,now()-3600000);
  if((num?.n||0)>=20)return fail('Limite de 20 invitations par heure atteinte.',429);
  const code=Array.from(crypto.getRandomValues(new Uint8Array(8)),v=>v.toString(16).padStart(2,'0')).join('').toUpperCase();
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(code));
  const hash=Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
  const id=uuid(),created=now(),expires=created+14*86400000;
  await db.prepare('INSERT INTO team_invitations(id,email,name,code_hash,created_by,created_at,expires_at) VALUES(?,?,?,?,?,?,?)').bind(id,email,name,hash,ctx.email,created,expires).run();
  await audit(db,ctx.email,'invite.create',id,'Invitation créée pour '+email+' ; code jamais journalisé');
  return reply({ok:true,id,email,name,code,expiresAt:expires});
 }
 if(d.op==='invite.revoke'){
  if(!ctx.admin)return fail('Action réservée à l’administration.',403);
  if(!idok(d.id))return fail('Invitation invalide.',400);
  const row=await one(db,'SELECT id FROM team_invitations WHERE id=?',d.id);
  if(!row)return fail('Invitation introuvable.',404);
  await db.prepare('UPDATE team_invitations SET revoked_at=? WHERE id=? AND used_at IS NULL').bind(now(),d.id).run();
  await audit(db,ctx.email,'invite.revoke',d.id);
  return reply({ok:true});
 }
 if(d.op==='chat.icon.set'){
  if(!ctx.admin)return fail('Seule l’administration peut modifier les icônes des discussions.',403);
  const channel=d.channel,channelId=d.channelId||null,icon=d.icon;
  const icons=['💬','⭐','🎨','📅','🎵','🎤','🎪','🎭','📢','🧡','💜','💙','💚','🌟','📸','🤝','🎯','🎟️','🍹','🚗','📍','🛠️','🎉','📚','🎬'];
  if(!icons.includes(icon)||!await permittedChat(db,ctx,channel,channelId))return fail('Groupe ou icône invalide.',400);
  await db.prepare('INSERT INTO team_chat_icons(channel,channel_id,icon,image_id,updated_by,updated_at) VALUES(?,?,?,NULL,?,?) ON CONFLICT(channel,channel_id) DO UPDATE SET icon=excluded.icon,image_id=NULL,updated_by=excluded.updated_by,updated_at=excluded.updated_at').bind(channel,channelId||'',icon,ctx.email,now()).run();
  await audit(db,ctx.email,'chat.icon.set',channel+':'+(channelId||''),icon);
  return reply({ok:true});
 }
 if(d.op==='list.save'){
  if(!ctx.admin&&!ctx.secretariat)return fail('Listes réservées à l’administration et au secrétariat.',403);
  const title=clean(d.title,110),columns=Array.isArray(d.columns)?d.columns:[],ids=Array.isArray(d.memberIds)?d.memberIds:[];
  const validColumns=['name','quality','poles','paid','phone','email','address','postal_code','city','paid_on','image_consent','phone_consent','email_consent'];
  if(title.length<2||!columns.length||columns.length>13||columns.some(k=>!validColumns.includes(k))||new Set(columns).size!==columns.length)return fail('Nom ou colonnes de liste invalides.',400);
  if(ids.length>500||ids.some(x=>!idok(x))||new Set(ids).size!==ids.length)return fail('Sélection de bénévoles invalide.',400);
  for(const id of ids)if(!await one(db,'SELECT id FROM team_members WHERE id=? AND active=1',id))return fail('Un bénévole sélectionné n’est plus actif.',409);
  if(d.id!==undefined&&!idok(d.id))return fail('Identifiant de liste invalide.',400);
  const id=d.id||uuid(),existing=d.id?await one(db,'SELECT id,created_at FROM team_saved_lists WHERE id=?',id):null;
  if(d.id&&!existing)return fail('Liste introuvable.',404);
  await db.prepare('INSERT INTO team_saved_lists(id,title,columns_json,member_ids_json,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,columns_json=excluded.columns_json,member_ids_json=excluded.member_ids_json,updated_at=excluded.updated_at').bind(id,title,JSON.stringify(columns),JSON.stringify(ids),ctx.email,existing?.created_at||now(),now()).run();
  await audit(db,ctx.email,'list.save',id,title);return reply({ok:true,id});
 }
 if(d.op==='list.delete'){
  if(!ctx.admin&&!ctx.secretariat)return fail('Listes réservées à l’administration et au secrétariat.',403);
  if(!idok(d.id))return fail('Liste invalide.',400);
  const deleted=await db.prepare('DELETE FROM team_saved_lists WHERE id=?').bind(d.id).run();
  if(!deleted.meta?.changes)return fail('Liste introuvable.',404);
  await audit(db,ctx.email,'list.delete',d.id);return reply({ok:true});
 }
 if(d.op==='member.name.set'){
  if(!ctx.admin&&!ctx.secretariat)return fail('Modification de fiche réservée à l’administration et au secrétariat.',403);
  if(!idok(d.memberId)||!clean(d.name,110)||clean(d.name,110).length<2)return fail('Nom de bénévole invalide.',400);
  if(!await one(db,'SELECT id FROM team_members WHERE id=? AND active=1',d.memberId))return fail('Bénévole introuvable.',404);
  await db.prepare('UPDATE team_members SET name=?,updated_at=? WHERE id=?').bind(clean(d.name,110),now(),d.memberId).run();
  await audit(db,ctx.email,'member.name.set',d.memberId,'Identité mise à jour');
  return reply({ok:true});
 }
 if(d.op.startsWith('signing.'))return signingAction(db,ctx,d);
 if(d.op==='dues.set'){
  if(!ctx.admin&&!ctx.secretariat)return fail('Suivi des adhésions réservé au secrétariat.',403);
  if(!idok(d.memberId)||typeof d.paid!=='boolean')return fail('Adhésion ou bénévole invalide.',400);
  const member=await one(db,'SELECT id FROM team_members WHERE id=? AND active=1',d.memberId);
  if(!member)return fail('Bénévole actif introuvable.',404);
  let paidOn=null,paymentMethod=null;
  if(d.paid){
   const rawDate=typeof d.paidOn==='string'?d.paidOn.trim():'';
   if(rawDate){
    const ms=Date.parse(rawDate+'T00:00:00Z');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(rawDate)||!Number.isFinite(ms)||new Date(ms).toISOString().slice(0,10)!==rawDate)return fail('Date du règlement invalide.',400);
    if(rawDate>new Date().toISOString().slice(0,10))return fail('La date du règlement ne peut pas être dans le futur.',400);
    paidOn=rawDate;
   }
   const method=typeof d.paymentMethod==='string'?d.paymentMethod.trim():'';
   if(method&&!['cash','card','check','transfer','other'].includes(method))return fail('Moyen de paiement invalide.',400);
   paymentMethod=method||null;
  }
  await db.prepare('INSERT INTO team_membership_dues(member_id,paid,paid_on,payment_method,updated_at,updated_by) VALUES(?,?,?,?,?,?) ON CONFLICT(member_id) DO UPDATE SET paid=excluded.paid,paid_on=excluded.paid_on,payment_method=excluded.payment_method,updated_at=excluded.updated_at,updated_by=excluded.updated_by').bind(d.memberId,d.paid?1:0,paidOn,paymentMethod,now(),ctx.email).run();
  await audit(db,ctx.email,'dues.set',d.memberId,d.paid?'À jour'+(paidOn?' — '+paidOn:''):'En attente');
  return reply({ok:true});
 }
 if(d.op==='contact.set'){
  if(!ctx.admin&&!ctx.secretariat)return fail('Coordonnées réservées au secrétariat et à l’administration.',403);
  if(!idok(d.memberId))return fail('Bénévole invalide.',400);
  if(!await one(db,'SELECT id FROM team_members WHERE id=? AND active=1',d.memberId))return fail('Bénévole introuvable.',404);
  const phone=clean(d.phone,40),address=clean(d.address,280),postal=clean(d.postalCode,16),city=clean(d.city,120);
  if(postal&&!/^[\w -]{2,16}$/u.test(postal))return fail('Code postal invalide.',400);
  await db.prepare('INSERT INTO team_member_contacts(member_id,phone,address,postal_code,city,updated_at,updated_by) VALUES(?,?,?,?,?,?,?) ON CONFLICT(member_id) DO UPDATE SET phone=excluded.phone,address=excluded.address,postal_code=excluded.postal_code,city=excluded.city,updated_at=excluded.updated_at,updated_by=excluded.updated_by').bind(d.memberId,phone,address,postal,city,now(),ctx.email).run();
  await audit(db,ctx.email,'contact.set',d.memberId,'Coordonnées mises à jour');
  return reply({ok:true});
 }
 if(d.op==='member.review'){
  if(!ctx.admin)return fail('Réservé à l’administration.',403);
  const email=clean(d.email,254).toLowerCase(),approve=d.approve===true;
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||typeof d.approve!=='boolean')return fail('Demande ou décision invalide.');
  const application=await one(db,"SELECT status FROM team_join_requests WHERE email=?",email);
  if(application?.status!=='pending')return fail('Cette demande n’est plus en attente.',409);
  const member=await one(db,'SELECT id FROM team_members WHERE email=? AND active=0',email);
  if(!member)return fail('Bénévole en attente introuvable.',404);
  if(approve){
   const changes={...d,id:member.id,email,active:true};
   const saved=await saveMember(db,ctx,changes,true);
   if(saved.status!==200)return saved;
  }
  await db.prepare("UPDATE team_join_requests SET status=?,reviewed_at=?,reviewed_by=? WHERE email=? AND status='pending'").bind(approve?'approved':'rejected',now(),ctx.email,email).run();
  await audit(db,ctx.email,approve?'member.approve':'member.reject',member.id,email);
  return reply({ok:true,id:member.id,status:approve?'approved':'rejected'});
 }
 if(d.op==='secretariat.set'){
  if(!ctx.admin)return fail('Seule l’administration désigne le secrétariat.',403);
  if(!idok(d.memberId)||typeof d.enabled!=='boolean')return fail('Bénévole ou choix invalide.');
  const member=await one(db,'SELECT id,active FROM team_members WHERE id=?',d.memberId);
  if(!member||!member.active)return fail('Bénévole actif introuvable.',404);
  if(d.enabled){
   await db.prepare("INSERT INTO team_staff_roles(member_id,role,granted_by,granted_at) VALUES(?,'secretariat',?,?) ON CONFLICT(member_id,role) DO NOTHING").bind(d.memberId,ctx.email,now()).run();
  }else{
   await db.prepare("DELETE FROM team_staff_roles WHERE member_id=? AND role='secretariat'").bind(d.memberId).run();
  }
  await audit(db,ctx.email,d.enabled?'secretariat.grant':'secretariat.revoke',d.memberId);
  return reply({ok:true});
 }
 if(d.op==='member.functions.set')return setMemberFunctions(db,ctx,d);
 if(d.op==='member.save')return saveMember(db,ctx,d);
 if(d.op==='pole.save')return savePole(db,ctx,d);
 if(d.op==='pole.delete'){
  if(!ctx.admin)return fail('Suppression réservée à l’administration.',403);
  if(!idok(d.id))return fail('Identifiant de pôle invalide.',400);
  const pole=await one(db,'SELECT id,name FROM team_poles WHERE id=?',d.id);
  if(!pole)return fail('Pôle introuvable.',404);
  const linkedMembers=await one(db,'SELECT COUNT(*) AS n FROM team_memberships WHERE pole_id=?',d.id);
  const linkedActivities=await one(db,'SELECT COUNT(*) AS n FROM team_activity_poles WHERE pole_id=?',d.id);
  const linkedMessages=await one(db,"SELECT COUNT(*) AS n FROM team_messages WHERE channel='pole' AND channel_id=?",d.id);
  if(linkedMembers.n||linkedActivities.n||linkedMessages.n)
   return fail('Ce pôle possède des bénévoles, des réunions ou des messages. Pour conserver les données, utilise « Archiver » ; retire ses éléments avant une suppression définitive.',409);
  await db.prepare('DELETE FROM team_poles WHERE id=?').bind(d.id).run();
  await audit(db,ctx.email,'pole.delete',d.id,pole.name);
  return reply({ok:true,deleted:true});
 }
 if(d.op==='pole.archive'){
  if(!ctx.admin)return fail('Réservé à l’administration.',403);
  const p=await one(db,'SELECT id FROM team_poles WHERE id=?',d.id);if(!p)return fail('Pôle introuvable.',404);
  await db.prepare('UPDATE team_poles SET archived=?,updated_at=? WHERE id=?').bind(d.archived===false?0:1,now(),d.id).run();await audit(db,ctx.email,'pole.archive',d.id);return reply({ok:true});
 }
 if(d.op==='assignment.set')return assign(db,ctx,d);
 if(d.op==='activity.save')return saveActivity(db,ctx,d);
 if(d.op==='shift.save')return saveShift(db,ctx,d);
 if(d.op==='task.save')return saveTask(db,ctx,d);
 if(d.op==='task.delete'){
  const task=idok(d.id)?await one(db,'SELECT * FROM team_activity_tasks WHERE id=?',d.id):null;
  const a=task?await one(db,'SELECT * FROM team_activities WHERE id=?',task.activity_id):null;
  if(!a||!await allowedActivity(db,ctx,a))return fail('Tâche non autorisée.',403);
  await db.prepare('DELETE FROM team_activity_tasks WHERE id=?').bind(d.id).run();await audit(db,ctx.email,'task.delete',d.id);return reply({ok:true});
 }
 if(d.op==='checkin.set')return setCheckin(db,ctx,d);
 if(d.op==='message.delete'){
  if(idok(d.id)){
   const leaderMsg=await one(db,'SELECT id FROM team_leader_messages WHERE id=?',d.id);
   if(leaderMsg){
    if(!ctx.admin)return fail('Modération réservée à l’administration.',403);
    await db.prepare('UPDATE team_leader_messages SET deleted_at=? WHERE id=?').bind(now(),d.id).run();
    await audit(db,ctx.email,'leaders.message.delete',d.id);
    return reply({ok:true});
   }
  }
  const msg=idok(d.id)?await one(db,'SELECT * FROM team_messages WHERE id=?',d.id):null;
  if(!msg)return fail('Message introuvable.',404);
  if(!ctx.admin){
   if(msg.channel==='general'||(msg.channel==='pole'&&!ctx.leadPoles.includes(msg.channel_id)))return fail('Modération réservée à l’administration ou au responsable du pôle.',403);
   if(msg.channel==='activity'){
    const a=await one(db,'SELECT * FROM team_activities WHERE id=?',msg.channel_id);
    if(!a||!await allowedActivity(db,ctx,a))return fail('Modération refusée.',403);
   }
  }
  await db.prepare('UPDATE team_messages SET deleted_at=? WHERE id=?').bind(now(),d.id).run();
  await audit(db,ctx.email,'message.delete',d.id);return reply({ok:true});
 }
 if(d.op==='shift.delete'){
  const s=idok(d.id)?await one(db,'SELECT a.* FROM team_activities a JOIN team_shifts s ON s.activity_id=a.id WHERE s.id=?',d.id):null;
  if(!s||!await allowedActivity(db,ctx,s))return fail('Créneau non autorisé.',403);
  await db.prepare('DELETE FROM team_shifts WHERE id=?').bind(d.id).run();await audit(db,ctx.email,'shift.delete',d.id);return reply({ok:true});
 }
 if(d.op==='charter.save'){
  if(!ctx.admin)return fail('Réservé à l’administration.',403);
  const version=clean(d.version,60),title=clean(d.title,140),content=clean(d.content,20000);
  if(!version||!title||!content)return fail('Version, titre et texte officiels requis.');
  const old=await charter(db),doc=d.documentId||null;
  if(old?.version===version&&(old.title!==title||old.content!==content))return fail('Modifiez le numéro de version pour publier une charte modifiée.',409);
  // Le PDF de la même charte peut être ajouté après sa première publication sans
  // forcer de nouvelles signatures ; le contenu contractuel reste inchangé.
  if(old?.version===version&&old.document_id&&old.document_id!==doc)return fail('Pour remplacer le PDF existant, publiez une nouvelle version.',409);
  if(doc&&!(await one(db,"SELECT id FROM team_documents WHERE id=? AND kind='charter'",doc)))return fail('Document inconnu.');
  if(old?.version===version&&old.document_id===doc)return reply({ok:true,unchanged:true});
  await db.prepare('INSERT INTO team_charter(id,version,title,content,document_id,published_at) VALUES(1,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET version=excluded.version,title=excluded.title,content=excluded.content,document_id=excluded.document_id,published_at=excluded.published_at').bind(version,title,content,doc,now()).run();
  await audit(db,ctx.email,'charter.save',version);return reply({ok:true});
 }
 return fail('Action non reconnue.',404);
}
async function permittedChat(db,ctx,channel,channelId){
 if(!ctx.member||ctx.pending||!ctx.member.active)return false;
 if(channel==='general')return !channelId;
 if(channel==='leaders')return !channelId&&(ctx.admin||ctx.leadPoles.length>0);
 if(channel==='pole'){
  if(!idok(channelId))return false;
  const pole=await one(db,'SELECT id FROM team_poles WHERE id=? AND archived=0',channelId);
  return Boolean(pole&&(ctx.admin||ctx.memberships.some(m=>m.pole_id===channelId)));
 }
 if(channel==='activity'){
  const a=idok(channelId)?await one(db,'SELECT * FROM team_activities WHERE id=?',channelId):null;
  return Boolean(a&&a.status==='published'&&(ctx.admin||await visibleActivity(db,ctx,a)));
 }
 return false;
}
async function chatRooms(db,ctx){
 if(!ctx.member||ctx.pending||!ctx.member.active)return [];
 const rooms=[{channel:'general',id:null,title:'Discussion générale'}];
 if(ctx.admin||ctx.leadPoles.length)rooms.push({channel:'leaders',id:null,title:'Entre responsables'});
 const poles=ctx.admin?await all(db,'SELECT id,name FROM team_poles WHERE archived=0 ORDER BY name'):
  await all(db,'SELECT p.id,p.name FROM team_poles p JOIN team_memberships tm ON tm.pole_id=p.id WHERE tm.member_id=? AND p.archived=0 ORDER BY p.name',ctx.member.id);
 for(const p of poles)rooms.push({channel:'pole',id:p.id,title:p.name});
 const allActivities=await all(db,"SELECT * FROM team_activities WHERE status='published' ORDER BY starts_at DESC LIMIT 100");
 for(const a of allActivities)if(ctx.admin||await visibleActivity(db,ctx,a))rooms.push({channel:'activity',id:a.id,title:a.title});
 return rooms;
}
async function chatLeaders(db,ctx,room){
 let ids=[];
 if(room.channel==='pole'){
  ids=(await all(db,"SELECT DISTINCT m.id FROM team_members m JOIN team_memberships tm ON tm.member_id=m.id WHERE tm.pole_id=? AND tm.role='lead' AND m.active=1 ORDER BY m.name LIMIT 25",room.id)).map(x=>x.id);
 }else if(room.channel==='activity'){
  ids=(await all(db,"SELECT DISTINCT m.id FROM team_members m JOIN team_memberships tm ON tm.member_id=m.id JOIN team_activity_poles ap ON ap.pole_id=tm.pole_id WHERE ap.activity_id=? AND tm.role='lead' AND m.active=1 ORDER BY m.name LIMIT 25",room.id)).map(x=>x.id);
 }
 if(room.channel==='leaders'){
  ids=(await all(db,"SELECT DISTINCT m.id FROM team_members m JOIN team_memberships tm ON tm.member_id=m.id JOIN team_poles p ON p.id=tm.pole_id WHERE tm.role='lead' AND p.archived=0 AND m.active=1 ORDER BY m.name LIMIT 25")).map(x=>x.id);
 }
 if(room.channel==='general'||room.channel==='activity'&&!ids.length){
  ids=(await all(db,"SELECT DISTINCT m.id FROM team_members m JOIN team_member_roles r ON r.member_id=m.id WHERE m.active=1 AND r.role='director' ORDER BY m.name LIMIT 25")).map(x=>x.id);
 }
 const leaders=[];
 for(const id of ids){
  const person=await one(db,"SELECT m.id,m.name,m.email,COALESCE(cn.phone,'') AS phone FROM team_members m LEFT JOIN team_member_contacts cn ON cn.member_id=m.id WHERE m.id=? AND m.active=1",id);
  if(!person)continue;
  const sharedPole=ctx.member&&await one(db,"SELECT 1 FROM team_memberships a JOIN team_memberships b ON a.pole_id=b.pole_id JOIN team_poles p ON p.id=a.pole_id WHERE a.member_id=? AND b.member_id=? AND a.role='lead' AND p.archived=0 LIMIT 1",ctx.member.id,id);
  const allow=ctx.admin||ctx.secretariat||ctx.member?.id===id||Boolean(sharedPole);
  const consents=allow?await all(db,"SELECT kind,granted FROM team_member_consents WHERE member_id=? AND kind IN ('phone','email')",id):[];
  const granted=Object.fromEntries(consents.map(x=>[x.kind,Boolean(x.granted)]));
  leaders.push({id:person.id,name:person.name,email:allow&&(ctx.admin||ctx.secretariat||ctx.member?.id===id||granted.email)?person.email:'',phone:allow&&(ctx.admin||ctx.secretariat||ctx.member?.id===id||granted.phone)?person.phone:''});
 }
 return leaders;
}
async function chatSummary(db,ctx){
 if(!await requireCharter(db,ctx)||ctx.pending||!ctx.member?.active)return fail('Accès aux discussions refusé.',403);
 const rooms=await chatRooms(db,ctx);
 for(const room of rooms){
  const appearance=await one(db,'SELECT icon,image_id FROM team_chat_icons WHERE channel=? AND channel_id=?',room.channel,room.id||'');
  room.responsibles=await chatLeaders(db,ctx,room);
  room.icon=appearance?.icon||({general:'💬',leaders:'⭐',pole:'🎨',activity:'📅'}[room.channel]||'💬');
  room.image_id=appearance?.image_id||null;
  const leader=room.channel==='leaders',table=leader?'team_leader_messages':'team_messages';
  const filter=leader?'':' AND t.channel=? AND t.channel_id IS ?';
  const params=leader?[]:[room.channel,room.id];
  const read=await one(db,'SELECT last_read_at FROM team_chat_reads WHERE member_id=? AND channel=? AND channel_id=?',ctx.member.id,room.channel,room.id||'');
  const last=await one(db,'SELECT t.body,t.created_at,m.name AS author FROM '+table+' t JOIN team_members m ON m.id=t.author_id WHERE t.deleted_at IS NULL'+filter+' ORDER BY t.created_at DESC LIMIT 1',...params);
  const cnt=await one(db,'SELECT COUNT(*) AS unread FROM '+table+' t WHERE t.deleted_at IS NULL'+filter+' AND t.author_id<>? AND t.created_at>?',...params,ctx.member.id,read?.last_read_at||0);
  room.last=last||null;room.unread=cnt?.unread||0;
 }
 return reply({rooms,total:rooms.reduce((n,x)=>n+x.unread,0)});
}
async function getMessages(db,ctx,url){
 if(!ctx.admin&&(!ctx.member||!await requireCharter(db,ctx)))return fail('Charte à accepter avant les discussions.',403);
 const channel=url.searchParams.get('channel')||'general',channelId=url.searchParams.get('id')||null;
 if(ctx.pending)return fail('Inscription en attente de validation : aucune conversation n’est accessible.',403);
 if(!await permittedChat(db,ctx,channel,channelId))return fail('Discussion non autorisée.',403);
 if(channel==='leaders'){
  if(channelId||(!ctx.admin&&!ctx.leadPoles.length))return fail('Discussion réservée aux responsables.',403);
  const messages=await all(db,"SELECT t.id,t.body,t.created_at,t.author_id,m.name AS author,md.id AS media_id,md.filename,md.mime,CASE WHEN ph.member_id IS NOT NULL AND (t.author_id=? OR ?=1 OR EXISTS(SELECT 1 FROM team_member_consents c WHERE c.member_id=t.author_id AND c.kind='image' AND c.granted=1 AND EXISTS(SELECT 1 FROM team_memberships a JOIN team_memberships b ON b.pole_id=a.pole_id JOIN team_poles p ON p.id=a.pole_id WHERE a.member_id=? AND b.member_id=t.author_id AND p.archived=0))) THEN 1 ELSE 0 END AS has_photo FROM team_leader_messages t JOIN team_members m ON m.id=t.author_id LEFT JOIN team_chat_media md ON md.message_id=t.id LEFT JOIN team_member_photos ph ON ph.member_id=t.author_id WHERE t.deleted_at IS NULL ORDER BY t.created_at DESC LIMIT 80",ctx.member.id,ctx.admin?1:0,ctx.member.id);
  await db.prepare('INSERT INTO team_chat_reads(member_id,channel,channel_id,last_read_at) VALUES(?,?,?,?) ON CONFLICT(member_id,channel,channel_id) DO UPDATE SET last_read_at=MAX(last_read_at,excluded.last_read_at)').bind(ctx.member.id,channel,'',now()).run();
  return reply({messages:messages.reverse()});
 }
 if(!ctx.admin&&channel==='pole'&&(!idok(channelId)||!ctx.memberships.some(p=>p.pole_id===channelId)))return fail('Accès à ce pôle refusé.',403);
 if(channel==='activity'){const a=idok(channelId)?await one(db,'SELECT * FROM team_activities WHERE id=?',channelId):null;if(!a||a.status==='draft'||!await visibleActivity(db,ctx,a))return fail('Accès à la discussion refusé.',403)}
 const messages=await all(db,"SELECT t.id,t.body,t.created_at,t.author_id,m.name AS author,md.id AS media_id,md.filename,md.mime,CASE WHEN ph.member_id IS NOT NULL AND (t.author_id=? OR ?=1 OR EXISTS(SELECT 1 FROM team_member_consents c WHERE c.member_id=t.author_id AND c.kind='image' AND c.granted=1 AND EXISTS(SELECT 1 FROM team_memberships a JOIN team_memberships b ON b.pole_id=a.pole_id JOIN team_poles p ON p.id=a.pole_id WHERE a.member_id=? AND b.member_id=t.author_id AND p.archived=0))) THEN 1 ELSE 0 END AS has_photo FROM team_messages t JOIN team_members m ON m.id=t.author_id LEFT JOIN team_chat_media md ON md.message_id=t.id LEFT JOIN team_member_photos ph ON ph.member_id=t.author_id WHERE t.channel=? AND t.channel_id IS ? AND t.deleted_at IS NULL ORDER BY t.created_at DESC LIMIT 80",ctx.member.id,ctx.admin?1:0,ctx.member.id,channel,channelId);
 await db.prepare('INSERT INTO team_chat_reads(member_id,channel,channel_id,last_read_at) VALUES(?,?,?,?) ON CONFLICT(member_id,channel,channel_id) DO UPDATE SET last_read_at=MAX(last_read_at,excluded.last_read_at)').bind(ctx.member.id,channel,channelId||'',now()).run();
 return reply({messages:messages.reverse()});
}


async function uploadChatIcon(request,env,ctx,url){
 if(!ctx.admin)return fail('Icônes réservées à l’administration.',403);
 if(!env.BUCKET)return fail('Stockage indisponible.',503);
 const channel=url.searchParams.get('channel'),channelId=url.searchParams.get('id')||null;
 if(!await permittedChat(env.DB,ctx,channel,channelId))return fail('Groupe non autorisé.',403);
 const mime=request.headers.get('content-type');
 if(!['image/jpeg','image/png','image/webp'].includes(mime))return fail('Image JPEG, PNG ou WebP uniquement.',415);
 const bytes=new Uint8Array(await request.arrayBuffer());
 if(bytes.length<16||bytes.length>2*1024*1024)return fail('Image invalide ou de plus de 2 Mo.',413);
 const sig=(...values)=>values.every((v,i)=>bytes[i]===v);
 const ascii=(start,count)=>String.fromCharCode(...bytes.slice(start,start+count));
 if(!(mime==='image/jpeg'&&sig(0xff,0xd8,0xff)||
  mime==='image/png'&&sig(0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a)||
  mime==='image/webp'&&ascii(0,4)==='RIFF'&&ascii(8,4)==='WEBP'))return fail('Format de fichier incohérent.',415);
 const id=uuid();
 await env.BUCKET.put('team/chat-icon/'+id,bytes,{httpMetadata:{contentType:mime}});
 try{
  await env.DB.prepare("INSERT INTO team_chat_icons(channel,channel_id,icon,image_id,updated_by,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(channel,channel_id) DO UPDATE SET image_id=excluded.image_id,updated_by=excluded.updated_by,updated_at=excluded.updated_at").bind(channel,channelId||'','💬',id,ctx.email,now()).run();
  await audit(env.DB,ctx.email,'chat.icon.upload',channel+':'+(channelId||''),id);
 }catch(err){await env.BUCKET.delete('team/chat-icon/'+id).catch(()=>{});throw err;}
 return reply({ok:true,id});
}
async function getChatIcon(env,ctx,id){
 if(!idok(id)||!ctx.member?.active||ctx.pending||!await requireCharter(env.DB,ctx))return fail('Icône inaccessible.',403);
 const icon=await one(env.DB,'SELECT channel,channel_id FROM team_chat_icons WHERE image_id=?',id);
 if(!icon||!await permittedChat(env.DB,ctx,icon.channel,icon.channel_id||null))return fail('Icône inaccessible.',403);
 const asset=await env.BUCKET?.get('team/chat-icon/'+id);
 if(!asset)return fail('Image introuvable.',404);
 return new Response(asset.body,{headers:{'Content-Type':asset.httpMetadata?.contentType||'image/png','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"}});
}
async function uploadChatMedia(request,env,ctx,url){
 if(!ctx.member?.active||ctx.pending||!await requireCharter(env.DB,ctx))return fail('Accès refusé.',403);
 if(!env.BUCKET)return fail('Médias indisponibles.',503);
 const channel=url.searchParams.get('channel'),channelId=url.searchParams.get('id')||null;
 if(!await permittedChat(env.DB,ctx,channel,channelId))return fail('Groupe non autorisé.',403);
 const mime=request.headers.get('content-type'),types=['image/jpeg','image/png','image/webp','application/pdf'];
 if(!types.includes(mime))return fail('Format autorisé : JPEG, PNG, WebP ou PDF.',415);
 const limit=8*1024*1024;
 if(Number(request.headers.get('content-length')||0)>limit)return fail('Fichier trop volumineux (8 Mo).',413);
 const bytes=new Uint8Array(await request.arrayBuffer());
 if(bytes.length<12||bytes.length>limit)return fail('Fichier vide ou trop volumineux.',413);
 const sig=(...b)=>b.every((v,i)=>bytes[i]===v);
 const str=(p,n)=>String.fromCharCode(...bytes.slice(p,p+n));
 if(!(mime==='image/jpeg'&&sig(0xff,0xd8,0xff)||
   mime==='image/png'&&sig(0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a)||
   mime==='image/webp'&&str(0,4)==='RIFF'&&str(8,4)==='WEBP'||
   mime==='application/pdf'&&str(0,5)==='%PDF-'))return fail('Le contenu du fichier est invalide.',415);
 const filename=clean(decodeURIComponent(request.headers.get('x-file-name')||'Média'),120).replace(/[\\/<>"]/g,'-');
 const id=uuid(),messageId=uuid(),table=channel==='leaders'?'team_leader_messages':'team_messages';
 await env.BUCKET.put('team/chat/'+id,bytes,{httpMetadata:{contentType:mime}});
 try{
  if(channel==='leaders')await env.DB.prepare('INSERT INTO team_leader_messages(id,author_id,body,created_at) VALUES(?,?,?,?)').bind(messageId,ctx.member.id,filename,now()).run();
  else await env.DB.prepare('INSERT INTO team_messages(id,author_id,channel,channel_id,body,created_at) VALUES(?,?,?,?,?,?)').bind(messageId,ctx.member.id,channel,channelId,filename,now()).run();
  await env.DB.prepare('INSERT INTO team_chat_media(id,channel,channel_id,message_id,filename,mime,size,uploaded_by,created_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(id,channel,channelId,messageId,filename,mime,bytes.length,ctx.email,now()).run();
 }catch(e){await env.BUCKET.delete('team/chat/'+id).catch(()=>{});await env.DB.prepare('UPDATE '+table+' SET deleted_at=? WHERE id=?').bind(now(),messageId).run().catch(()=>{});throw e;}
 return reply({ok:true,id,messageId});
}
async function getChatMedia(env,ctx,id){
 if(!idok(id)||!ctx.member?.active||ctx.pending||!await requireCharter(env.DB,ctx))return fail('Média non autorisé.',403);
 const media=await one(env.DB,'SELECT * FROM team_chat_media WHERE id=?',id);
 if(!media||!await permittedChat(env.DB,ctx,media.channel,media.channel_id))return fail('Média non autorisé.',403);
 const table=media.channel==='leaders'?'team_leader_messages':'team_messages';
 const msg=await one(env.DB,'SELECT id FROM '+table+' WHERE id=? AND deleted_at IS NULL',media.message_id);
 if(!msg)return fail('Média supprimé.',404);
 const object=await env.BUCKET?.get('team/chat/'+id);
 if(!object)return fail('Média introuvable.',404);
 const image=media.mime.startsWith('image/');
 return new Response(object.body,{headers:{'Content-Type':media.mime,'Content-Disposition':(image?'inline':'attachment')+'; filename="media-'+id+(image?'.'+media.mime.split('/')[1]:'.pdf')+'"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"}});
}
async function upload(request,env,ctx,url){
 if(!env.BUCKET)return fail('Stockage documentaire indisponible.',503);
 const kind=url.searchParams.get('kind'),activityId=url.searchParams.get('activity');
 if(!['agenda','charter','instructions'].includes(kind))return fail('Type de document invalide.');
 if(kind==='charter'&&!ctx.admin)return fail('Réservé à l’administration.',403);
 if(kind!=='charter'){const a=idok(activityId)?await one(env.DB,'SELECT * FROM team_activities WHERE id=?',activityId):null;if(!a||!await allowedActivity(env.DB,ctx,a))return fail('Activité non autorisée.',403);}
 if(request.headers.get('content-type')!=='application/pdf')return fail('Seuls les documents PDF sont acceptés.',415);
 const sizeLimit=8*1024*1024;if(Number(request.headers.get('content-length')||0)>sizeLimit)return fail('PDF trop volumineux.',413);
 let size=0;const blocks=[];const reader=request.body?.getReader();if(!reader)return fail('Fichier vide.');
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>sizeLimit){await reader.cancel();return fail('PDF trop volumineux.',413)}blocks.push(value)}
 const buffer=new Uint8Array(size);let offset=0;for(const bytes of blocks){buffer.set(bytes,offset);offset+=bytes.length}
 if(size<8||String.fromCharCode(...buffer.slice(0,5))!=='%PDF-')return fail('Ce fichier ne ressemble pas à un PDF.',415);
 const id=uuid(),name=clean(request.headers.get('x-file-name')||'Document.pdf',120).replace(/[\\/]/g,'-');
 await env.BUCKET.put('team/'+id,buffer,{httpMetadata:{contentType:'application/pdf'}});
 await env.DB.prepare('INSERT INTO team_documents(id,kind,activity_id,name,mime,size,uploaded_by,created_at) VALUES(?,?,?,?,?,?,?,?)').bind(id,kind,kind==='charter'?null:activityId,name,'application/pdf',size,ctx.email,now()).run();
 await audit(env.DB,ctx.email,'document.upload',id,kind);return reply({ok:true,id,name});
}
async function uploadTeamPhoto(request,env,ctx,url){
 if(!env.BUCKET)return fail('Stockage des photos indisponible.',503);
 const memberId=url.searchParams.get('member');
 if(!idok(memberId))return fail('Bénévole invalide.',400);
 const subject=await one(env.DB,'SELECT id FROM team_members WHERE id=? AND active=1',memberId);
 if(!subject)return fail('Bénévole introuvable.',404);
 if(!ctx.admin&&ctx.member?.id!==memberId)return fail('Modification réservée à la personne ou à l’administration.',403);
 const mime=request.headers.get('content-type');
 if(!['image/jpeg','image/png','image/webp'].includes(mime))return fail('Choisissez une photo JPEG, PNG ou WebP.',415);
 if(Number(request.headers.get('content-length')||0)>4194304)return fail('Photo trop volumineuse (4 Mo maximum).',413);
 const bytes=new Uint8Array(await request.arrayBuffer());
 if(bytes.length<16||bytes.length>4194304)return fail('Photo invalide ou trop volumineuse.',413);
 const signature=(...a)=>a.every((x,i)=>bytes[i]===x);
 const ascii=(offset,count)=>String.fromCharCode(...bytes.slice(offset,offset+count));
 const valid=mime==='image/jpeg'?signature(0xff,0xd8,0xff):
  mime==='image/png'?signature(0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a):
  ascii(0,4)==='RIFF'&&ascii(8,4)==='WEBP';
 if(!valid)return fail('Le fichier ne correspond pas au format annoncé.',415);
 await env.BUCKET.put('team/photo/'+memberId,bytes,{httpMetadata:{contentType:mime}});
 await env.DB.prepare('INSERT INTO team_member_photos(member_id,mime,size,updated_by,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(member_id) DO UPDATE SET mime=excluded.mime,size=excluded.size,updated_by=excluded.updated_by,updated_at=excluded.updated_at').bind(memberId,mime,bytes.length,ctx.email,now()).run();
 await audit(env.DB,ctx.email,'photo.save',memberId);return reply({ok:true,memberId});
}
async function getTeamPhoto(env,ctx,id){
 if(!idok(id))return fail('Photo introuvable.',404);
 const photo=await one(env.DB,'SELECT mime FROM team_member_photos WHERE member_id=?',id);
 if(!photo)return fail('Photo introuvable.',404);
 if(!ctx.admin&&ctx.member?.id!==id){
  if(!ctx.member)return fail('Photo non autorisée.',403);
  const consent=await one(env.DB,"SELECT 1 FROM team_member_consents WHERE member_id=? AND kind='image' AND granted=1",id);
  if(!consent)return fail('Droit à l’image non accordé.',403);
  const visible=await one(env.DB,'SELECT 1 FROM team_memberships current JOIN team_memberships subject ON current.pole_id=subject.pole_id JOIN team_poles p ON p.id=current.pole_id WHERE current.member_id=? AND subject.member_id=? AND p.archived=0 LIMIT 1',ctx.member.id,id);
  if(!visible)return fail('Photo non autorisée.',403);
 }
 const obj=await env.BUCKET?.get('team/photo/'+id);
 if(!obj)return fail('Photo indisponible.',404);
 return new Response(obj.body,{headers:{'Content-Type':photo.mime,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"}});
}
async function getDocument(env,ctx,docId){
 if(!idok(docId))return fail('Document introuvable.',404);
 const d=await one(env.DB,'SELECT * FROM team_documents WHERE id=?',docId);if(!d)return fail('Document introuvable.',404);
 if(d.kind==='charter'){
  const c=await charter(env.DB);if(!c||c.document_id!==d.id)return fail('Document non publié.',403);
 }else{
  const a=await one(env.DB,'SELECT * FROM team_activities WHERE id=?',d.activity_id);
  if(!a||!await visibleActivity(env.DB,ctx,a))return fail('Document réservé aux participants.',403);
 }
 const object=await env.BUCKET?.get('team/'+d.id);if(!object)return fail('Document temporairement indisponible.',404);
 return new Response(object.body,{headers:{'Content-Type':'application/pdf','Content-Disposition':`inline; filename="document-${d.id}.pdf"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}
export async function handleZikaTeam(request,env,execution){
 const url=new URL(request.url),path=url.pathname;
 if(env.TEAM_AUTH_PROVIDER==='supabase'){
  // The login shell is public. Every data operation remains server-authenticated.
  if((path==='/zikateam'||path==='/zikateam/'||path==='/zikateam/index.html')&&request.method==='GET'){
   const page=new URL('/zikateam',url);
   return env.ASSETS.fetch(new Request(page,request));
  }
  if(path.startsWith('/zikateam/api/auth/'))return handleTeamLogin(request,env);
 }
 const verified=env.TEAM_AUTH_PROVIDER==='supabase'?await getTeamSupabaseIdentity(request,env):null;
 const result=await handleProtectedZikaTeam(request,env,execution,verified);
 if(!verified?.setCookies?.length)return result;
 const response=new Response(result.body,result);
 for(const header of verified.setCookies)response.headers.append('Set-Cookie',header);
 return response;
}
async function handleProtectedZikaTeam(request,env,execution,verified){
 if(!env.DB)return fail('Espace ZikaTeam non configuré.',503);
 try{
  const ctx=await identify(request,env,verified);if(!ctx)return new Response('Accès ZikaTeam refusé. Utilisez votre adresse de bénévole autorisée.',{status:403,headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'}});
  const url=new URL(request.url),path=url.pathname,db=env.DB;
  if(path==='/zikateam'||path==='/zikateam/'||path==='/zikateam/index.html')return env.ASSETS.fetch(new Request(new URL('/zikateam',url),request));
  if(path==='/zikateam/api/me'&&request.method==='GET'){
   if(!ctx.passwordReady)return reply({
    email:ctx.email,admin:ctx.admin,pending:ctx.pending,passwordRequired:true,
    member:ctx.member?{id:ctx.member.id,name:ctx.member.name}:null,
    charterAccepted:false,leadPoles:[],poles:[],activities:[]
   });
   return getMine(db,ctx);
  }
  if(!ctx.passwordReady)return fail('Définis ton mot de passe personnel pour ouvrir ZikaTeam.',403);
  const currentCharter=await charter(db);
  const accepted=Boolean(currentCharter&&ctx.member&&await one(db,'SELECT accepted_at FROM team_charter_acceptances WHERE member_id=? AND version=?',ctx.member.id,currentCharter.version));
  const locked=!accepted;
  const notice=currentCharter?'Charte obligatoire : veuillez la lire et l’accepter pour poursuivre.':'La charte officielle doit être publiée avant l’ouverture de ZikaTeam.';
  if(path.startsWith('/zikateam/chat-icon/')&&request.method==='GET')return locked||ctx.pending?fail(notice,403):getChatIcon(env,ctx,path.split('/').pop());
  if(path.startsWith('/zikateam/chat-media/')&&request.method==='GET')return locked||ctx.pending?fail(notice,403):getChatMedia(env,ctx,path.split('/').pop());
  if(path.startsWith('/zikateam/photo/')&&request.method==='GET')return ctx.pending?fail('Inscription en attente de validation.',403):locked?fail(notice,403):getTeamPhoto(env,ctx,path.split('/').pop());
  if(path.startsWith('/zikateam/document/')&&request.method==='GET'){
   if(ctx.pending&&(!currentCharter||currentCharter.document_id!==path.split('/').pop()))return fail('Inscription en attente de validation.',403);
   if(locked&&(!currentCharter||currentCharter.document_id!==path.split('/').pop()))return fail(notice,403);
   return getDocument(env,ctx,path.split('/').pop());
  }
  if(path==='/zikateam/api/manage'&&request.method==='GET')return locked||ctx.pending?fail(notice,403):getManage(db,ctx);
  if(path==='/zikateam/api/signing'&&request.method==='GET')return locked||ctx.pending?fail(notice,403):getSigning(db,ctx);
  if(path==='/zikateam/api/messages'&&request.method==='GET')return ctx.pending?fail('Inscription en attente de validation : aucune conversation n’est accessible.',403):locked?fail(notice,403):getMessages(db,ctx,url);
  if(path==='/zikateam/api/chat-summary'&&request.method==='GET')return locked||ctx.pending?fail(notice,403):chatSummary(db,ctx);
  if(request.method==='POST'){
   if(request.headers.get('origin')!==url.origin)return fail('Origine non autorisée.',403);
   if(path==='/zikateam/api/chat-icon')return locked||ctx.pending?fail(notice,403):uploadChatIcon(request,env,ctx,url);
   if(path==='/zikateam/api/chat-media')return locked||ctx.pending?fail(notice,403):uploadChatMedia(request,env,ctx,url);
   if(path==='/zikateam/api/photo')return ctx.pending?fail('Inscription en attente de validation.',403):locked?fail(notice,403):uploadTeamPhoto(request,env,ctx,url);
   if(path==='/zikateam/api/upload'){
    if(ctx.pending)return fail('Inscription en attente de validation.',403);
    if(locked&&!(ctx.admin&&!currentCharter&&url.searchParams.get('kind')==='charter'))return fail(notice,403);
    return upload(request,env,ctx,url);
   }
   if(path==='/zikateam/api/command'){
    if(!request.headers.get('content-type')?.startsWith('application/json'))return fail('Contenu non autorisé.',415);
    if(Number(request.headers.get('content-length')||0)>35000)return fail('Requête trop longue.',413);
    const raw=await request.text();if(raw.length>35000)return fail('Requête trop longue.',413);
    let data;try{data=JSON.parse(raw)}catch{return fail('Requête JSON invalide.');}
    if(!data||typeof data.op!=='string')return fail('Action manquante.');
    const ownProfile=ctx.admin&&data.op==='member.save'&&(!data.id||data.id===ctx.member?.id)&&clean(data.email,254).toLowerCase()===ctx.email&&data.active!==false;
    const firstCharter=ctx.admin&&!currentCharter&&data.op==='charter.save';
    if(locked&&!['charter.accept'].includes(data.op)&&!ownProfile&&!firstCharter)return fail(notice,403);
    if(ctx.pending&&!['charter.accept','consents.save'].includes(data.op))return fail('Ton inscription attend l’accord de l’administration.',403);
    let result;
    if(['charter.accept','activity.rsvp','shift.signup','push.link','message.send','task.status','consents.save','contact.self','notice.read','notification.settings','notification.chat.mute'].includes(data.op))result=await memberAction(db,ctx,data);
    else result=await adminAction(db,ctx,data);
    if(data.op==='activity.save'&&result.status===200&&execution?.waitUntil){execution.waitUntil(drainTeamPush(env).catch(()=>{}));}
    if(data.op==='message.send'&&result.status===200&&execution?.waitUntil){execution.waitUntil(notifyTeamChat(env,ctx,{id:'',channel:data.channel,channelId:data.channelId||null}).catch(error=>{console.error('ZikaTeam chat push',error?.message);}));}
    return result;
   }
  }
  return fail('Page ou action introuvable.',404);
 }catch(error){console.error('ZikaTeam',error?.message);return fail('Erreur de service ZikaTeam.',500)}
}