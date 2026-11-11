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
const validAudience=a=>['all','leaders','poles'].includes(a);
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
 const member=await one(env.DB,'SELECT * FROM team_members WHERE email=? AND active=1',email);
 if(!admin&&!member)return null;
 const memberships=await roles(env.DB,member?.id);
 const secretariat=Boolean(member&&await one(env.DB,"SELECT member_id FROM team_staff_roles WHERE member_id=? AND role='secretariat'",member.id));
 return {email,admin,member,secretariat,memberships,leadPoles:memberships.filter(m=>m.role==='lead').map(m=>m.pole_id)};
}
async function selectedPoles(db,activityId){return (await all(db,'SELECT pole_id FROM team_activity_poles WHERE activity_id=?',activityId)).map(x=>x.pole_id)}
async function audienceMembers(db,activity){
 if(activity.audience==='all')return (await all(db,'SELECT id FROM team_members WHERE active=1')).map(x=>x.id);
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
const charterAccepted=(c,versions)=>!c||versions.some(v=>v.version===c.version);
async function requireCharter(db,ctx){
 const c=await charter(db);
 if(!c)return true;
 if(!ctx.member)return false;
 return Boolean(await one(db,'SELECT accepted_at FROM team_charter_acceptances WHERE member_id=? AND version=?',ctx.member.id,c.version));
}
async function enrichActivities(db,activities,memberId=null){
 for(const a of activities){
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
 const poles=ctx.member?await all(db,"SELECT p.id,p.name,p.description,tm.role,(SELECT group_concat(m.name,', ') FROM team_memberships l JOIN team_members m ON m.id=l.member_id WHERE l.pole_id=p.id AND l.role='lead' AND m.active=1) AS leaders FROM team_poles p JOIN team_memberships tm ON tm.pole_id=p.id WHERE tm.member_id=? AND p.archived=0 ORDER BY p.name",ctx.member.id):[];
 const activities=await all(db,"SELECT * FROM team_activities WHERE status!='draft' AND ends_at>=? ORDER BY starts_at LIMIT 140",new Date(now()-86400000).toISOString());
 const mine=[];for(const a of activities)if(await visibleActivity(db,ctx,a))mine.push(a);
 await enrichActivities(db,mine,ctx.member?.id);
 return reply({email:ctx.email,admin:ctx.admin,secretariat:ctx.secretariat,member:ctx.member?{id:ctx.member.id,name:ctx.member.name,email:ctx.member.email}:null,leadPoles:ctx.leadPoles,poles,charter:c?{version:c.version,title:c.title,content:c.content,document_id:c.document_id,published_at:c.published_at}:null,charterAccepted:charterAccepted(c,versions),charterAcceptedAt:versions.find(v=>v.version===c?.version)?.accepted_at||null,activities:mine});
}
async function getManage(db,ctx){
 if(!ctx.admin&&!ctx.leadPoles.length&&!ctx.secretariat)return fail('Droits de gestion requis.',403);
 const poles=ctx.admin?await all(db,'SELECT * FROM team_poles ORDER BY archived,name'):
  ctx.leadPoles.length?(await all(db,'SELECT * FROM team_poles WHERE archived=0 ORDER BY name')).filter(p=>ctx.leadPoles.includes(p.id)):
  await all(db,'SELECT id,name,archived FROM team_poles WHERE archived=0 ORDER BY name');
 const members=ctx.admin?await all(db,'SELECT id,name,email,active FROM team_members ORDER BY name'):
  ctx.leadPoles.length?await all(db,"SELECT DISTINCT m.id,m.name,m.email,m.active FROM team_members m JOIN team_memberships tm ON tm.member_id=m.id WHERE tm.pole_id IN (SELECT pole_id FROM team_memberships WHERE member_id=? AND role='lead') ORDER BY m.name",ctx.member.id):
  await all(db,'SELECT id,name,active FROM team_members WHERE active=1 ORDER BY name');
 const memberships=ctx.admin?await all(db,'SELECT member_id,pole_id,role FROM team_memberships'):
  ctx.leadPoles.length?await all(db,"SELECT member_id,pole_id,role FROM team_memberships WHERE pole_id IN (SELECT pole_id FROM team_memberships WHERE member_id=? AND role='lead')",ctx.member.id):[];
 const allActivities=await all(db,"SELECT * FROM team_activities ORDER BY starts_at DESC LIMIT 160"),activities=[];
 for(const item of allActivities){
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
 return reply({poles,members,memberships,activities,audit:logs,secretariatIds});
}
async function enqueue(db,a,reason){
 const memberIds=await audienceMembers(db,a);
 for(const memberId of memberIds){
  const links=await all(db,'SELECT subscription_id FROM team_push_links WHERE member_id=?',memberId);
  for(const l of links){await db.prepare("INSERT INTO team_push_jobs(id,activity_id,member_id,subscription_id,reason,status,created_at) VALUES (?,?,?,?,?,'pending',?) ON CONFLICT(activity_id,subscription_id,reason) DO UPDATE SET status='pending',code=NULL,created_at=excluded.created_at")
   .bind(uuid(),a.id,memberId,l.subscription_id,reason,now()).run();}
 }
 return memberIds.length;
}
export async function drainTeamPush(env,maximum=40){
 // Never send in staging or when explicitly disabled; jobs stay in the queue.
 if(env.TEAM_PUSH_ENABLED!=='true'||!env.VAPID_PRIVATE_JWK||!env.VAPID_PUBLIC_KEY||!env.DB)return {sent:0,disabled:true};
 const db=env.DB,jobs=await all(db,"SELECT * FROM team_push_jobs WHERE status='pending' ORDER BY created_at LIMIT ?",maximum);
 let sent=0;
 for(const job of jobs){
  const claimed=await db.prepare("UPDATE team_push_jobs SET status='processing' WHERE id=? AND status='pending'").bind(job.id).run();if(!claimed.meta.changes)continue;
  const a=await one(db,'SELECT * FROM team_activities WHERE id=?',job.activity_id),m=await one(db,'SELECT active FROM team_members WHERE id=?',job.member_id);
  const stillLinked=await one(db,'SELECT member_id FROM team_push_links WHERE member_id=? AND subscription_id=?',job.member_id,job.subscription_id);
  const intended=a&&m?.active&&stillLinked&&(await audienceMembers(db,a)).includes(job.member_id);
  const allowedState=(a?.status==='published'&&job.reason!=='cancelled')||(a?.status==='cancelled'&&job.reason==='cancelled');
  if(!intended||!allowedState){await db.prepare("UPDATE team_push_jobs SET status='failed',code=0 WHERE id=?").bind(job.id).run();continue;}
  const sub=await one(db,'SELECT endpoint,p256dh,auth FROM push_subscriptions WHERE id=?',job.subscription_id);
  if(!sub){await db.prepare("UPDATE team_push_jobs SET status='failed',code=0 WHERE id=?").bind(job.id).run();continue;}
  const prefix=job.reason==='created'?'Nouvelle activité':job.reason==='cancelled'?'Activité annulée':'Activité modifiée';
  const payload={id:job.id,title:'ZikaTeam · '+prefix,body:a.title+' · '+new Date(a.starts_at).toLocaleString('fr-FR',{timeZone:'Europe/Paris'}),url:'/zikateam#activites'};
  let code=0;try{code=await sendPush({endpoint:sub.endpoint,keys:{p256dh:sub.p256dh,auth:sub.auth}},payload,env)}catch{}
  const ok=code>=200&&code<300;
  await db.prepare('UPDATE team_push_jobs SET status=?,code=?,sent_at=? WHERE id=?').bind(ok?'sent':'failed',code,now(),job.id).run();if(ok)sent++;
 }
 return {sent,disabled:false};
}
// Rappels horaires, exclusivement pour les destinataires encore autorisés.
export async function scheduleTeamReminders(env,maximum=40){
 if(env.TEAM_PUSH_ENABLED!=='true'||!env.TEAM_ACCESS_AUD||!env.DB||!env.VAPID_PRIVATE_JWK||!env.VAPID_PUBLIC_KEY)return {sent:0,disabled:true};
 const db=env.DB,clock=now();
 for(const [kind,hours] of [['24h',24],['2h',2]]){
  const from=new Date(clock+hours*3600000-30*60000).toISOString();
  const until=new Date(clock+hours*3600000+30*60000).toISOString();
  const activities=await all(db,"SELECT * FROM team_activities WHERE status='published' AND starts_at>=? AND starts_at<? ORDER BY starts_at LIMIT 35",from,until);
  for(const activity of activities){
   const members=await audienceMembers(db,activity);
   for(const memberId of members){
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
  const linked=await one(db,"SELECT l.member_id FROM team_push_links l JOIN team_members m ON m.id=l.member_id WHERE l.member_id=? AND l.subscription_id=? AND m.active=1",job.member_id,job.subscription_id);
  const audience=a?.status==='published'&&(await audienceMembers(db,a)).includes(job.member_id);
  const r=await one(db,'SELECT answer FROM team_activity_rsvps WHERE activity_id=? AND member_id=?',job.activity_id,job.member_id);
  const sub=await one(db,'SELECT endpoint,p256dh,auth FROM push_subscriptions WHERE id=?',job.subscription_id);
  let code=0;
  if(linked&&audience&&r?.answer!=='no'&&sub){
   const data={title:'ZikaTeam · Rappel '+(job.kind==='24h'?'demain':'dans 2 h'),body:a.title+' · '+new Date(a.starts_at).toLocaleString('fr-FR',{timeZone:'Europe/Paris'}),url:'/zikateam#activites'};
   try{code=await sendPush({endpoint:sub.endpoint,keys:{p256dh:sub.p256dh,auth:sub.auth}},data,env)}catch{}
  }
  const ok=code>=200&&code<300;
  await db.prepare('UPDATE team_reminder_jobs SET status=?,code=?,sent_at=? WHERE activity_id=? AND subscription_id=? AND kind=?').bind(ok?'sent':'failed',code,now(),job.activity_id,job.subscription_id,job.kind).run();
  if(ok)sent++;
 }
 return {sent,disabled:false};
}
async function saveMember(db,ctx,d){
 if(!ctx.admin)return fail('Réservé à l’administration.',403);
 const name=clean(d.name,110),email=clean(d.email,254).toLowerCase();
 if(!name||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return fail('Nom ou adresse e-mail invalide.');
 if(d.id&& !idok(d.id))return fail('Identifiant invalide.');
 const id=d.id||uuid(),previous=d.id?await one(db,'SELECT * FROM team_members WHERE id=?',id):null;
 if(d.id&&!previous)return fail('Bénévole introuvable.',404);
 if(previous&&previous.email===ctx.email&&d.active===false)return fail('Impossible de désactiver votre propre fiche.');
 const active=d.active!==false?1:0;
 try{await db.prepare('INSERT INTO team_members(id,name,email,active,created_at,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,email=excluded.email,active=excluded.active,updated_at=excluded.updated_at').bind(id,name,email,active,previous?.created_at||now(),now()).run()}
 catch{return fail('Cette adresse e-mail est déjà utilisée.');}
 await audit(db,ctx.email,'member.save',id,name);return reply({ok:true,id});
}
async function savePole(db,ctx,d){
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
 if(!idok(d.memberId)||!idok(d.poleId))return fail('Identifiants incorrects.');
 if(!ctx.admin&&!ctx.leadPoles.includes(d.poleId))return fail('Pôle non autorisé.',403);
 const member=await one(db,'SELECT id,active FROM team_members WHERE id=?',d.memberId),pole=await one(db,'SELECT id,archived FROM team_poles WHERE id=?',d.poleId);
 if(!member||!pole||pole.archived)return fail('Bénévole ou pôle introuvable.',404);
 const role=d.role==='lead'?'lead':'member';
 if(!ctx.admin&&role==='lead')return fail('Seul l’administrateur désigne les responsables.',403);
 const prior=await one(db,'SELECT role FROM team_memberships WHERE member_id=? AND pole_id=?',d.memberId,d.poleId);
 if(!ctx.admin&&prior?.role==='lead')return fail('Seul l’administrateur modifie les responsables.',403);
 if(d.remove===true){await db.prepare('DELETE FROM team_memberships WHERE member_id=? AND pole_id=?').bind(d.memberId,d.poleId).run();}
 else await db.prepare("INSERT INTO team_memberships(member_id,pole_id,role,created_at) VALUES(?,?,?,?) ON CONFLICT(member_id,pole_id) DO UPDATE SET role=excluded.role").bind(d.memberId,d.poleId,role,now()).run();
 await audit(db,ctx.email,d.remove?'membership.remove':'membership.save',d.poleId,d.memberId);return reply({ok:true});
}
async function saveActivity(db,ctx,d){
 if(!ctx.admin&&!ctx.leadPoles.length)return fail('Réservé aux responsables.',403);
 if(!validKind(d.kind)||!validAudience(d.audience)||!clean(d.title,120)||!dateok(d.starts_at)||!dateok(d.ends_at)||Date.parse(d.ends_at)<=Date.parse(d.starts_at)||Date.parse(d.ends_at)-Date.parse(d.starts_at)>90*86400000)return fail('Titre, type, public ou dates invalides.');
 const selected=[...new Set(Array.isArray(d.poles)?d.poles:[])];
 if(d.audience==='poles'&&!selected.length)return fail('Sélectionnez au moins un pôle.');
 for(const p of selected){if(!idok(p)||!(await one(db,'SELECT id FROM team_poles WHERE id=? AND archived=0',p)))return fail('Un pôle est inconnu ou archivé.');}
 if(!ctx.admin&&(d.audience!=='poles'||selected.some(p=>!ctx.leadPoles.includes(p))))return fail('Un responsable ne peut convoquer que ses pôles.',403);
 const id=d.id||uuid(),previous=d.id?await one(db,'SELECT * FROM team_activities WHERE id=?',id):null;
 if(d.id&&!previous)return fail('Activité introuvable.',404);
 if(previous&&!await allowedActivity(db,ctx,previous))return fail('Gestion de cette activité refusée.',403);
 const status=['draft','published','cancelled'].includes(d.status)?d.status:'draft';
 const documentId=d.agenda_document_id||null;
 if(documentId){const doc=await one(db,'SELECT * FROM team_documents WHERE id=? AND kind IN (\'agenda\',\'instructions\')',documentId);if(!doc||doc.activity_id!==id)return fail('Ce document ne concerne pas cette activité.');}
 await db.prepare('INSERT INTO team_activities(id,kind,title,starts_at,ends_at,place,details,agenda,agenda_document_id,audience,status,created_by,updated_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET kind=excluded.kind,title=excluded.title,starts_at=excluded.starts_at,ends_at=excluded.ends_at,place=excluded.place,details=excluded.details,agenda=excluded.agenda,agenda_document_id=excluded.agenda_document_id,audience=excluded.audience,status=excluded.status,updated_by=excluded.updated_by,updated_at=excluded.updated_at').bind(id,d.kind,clean(d.title,120),d.starts_at,d.ends_at,clean(d.place,190),clean(d.details,3000),clean(d.agenda,8000),documentId,d.audience,status,previous?.created_by||ctx.email,ctx.email,previous?.created_at||now(),now()).run();
 await db.prepare('DELETE FROM team_activity_poles WHERE activity_id=?').bind(id).run();
 if(d.audience==='poles')for(const pole of selected)await db.prepare('INSERT INTO team_activity_poles(activity_id,pole_id) VALUES (?,?)').bind(id,pole).run();
 const result=await one(db,'SELECT * FROM team_activities WHERE id=?',id);
 let invites=0;
 if(status==='published'&&previous?.status!=='published')invites=await enqueue(db,result,'created');
 else if(previous?.status==='published'&&status==='cancelled')invites=await enqueue(db,result,'cancelled');
 else if(previous?.status==='published'&&status==='published'&&[previous.title,previous.starts_at,previous.ends_at,previous.place,previous.audience].join('|')!==[result.title,result.starts_at,result.ends_at,result.place,result.audience].join('|'))invites=await enqueue(db,result,'updated');
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
 const memberId=ctx.member.id;
 if(d.op==='charter.accept'){
  const c=await charter(db);if(!c)return fail('La charte officielle n’a pas encore été publiée.',409);
  if(d.version!==c.version)return fail('La charte a été actualisée, relisez sa nouvelle version.',409);
  await db.prepare('INSERT OR IGNORE INTO team_charter_acceptances(member_id,version,accepted_at) VALUES(?,?,?)').bind(memberId,c.version,now()).run();
  await audit(db,ctx.email,'charter.accept',memberId,c.version);return reply({ok:true});
 }
 if(!await requireCharter(db,ctx))return fail('Veuillez accepter la charte avant de répondre ou de discuter.',409);
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
  if(!message||!['general','pole','activity'].includes(channel))return fail('Message invalide.');
  if(channel==='general'&&channelId)return fail('Canal invalide.');
  if(channel==='pole'&&(!idok(channelId)||!ctx.memberships.some(m=>m.pole_id===channelId)))return fail('Pôle non autorisé.',403);
  if(channel==='activity'){const a=idok(channelId)?await one(db,'SELECT * FROM team_activities WHERE id=?',channelId):null;if(!a||(!ctx.admin&&a.status==='draft')||!await visibleActivity(db,ctx,a))return fail('Discussion non autorisée.',403);}
  const id=uuid();await db.prepare('INSERT INTO team_messages(id,author_id,channel,channel_id,body,created_at) VALUES(?,?,?,?,?,?)').bind(id,memberId,channel,channelId,message,now()).run();return reply({ok:true,id});
 }
 return fail('Action non reconnue.',404);
}
async function adminAction(db,ctx,d){
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
 if(d.op==='member.save')return saveMember(db,ctx,d);
 if(d.op==='pole.save')return savePole(db,ctx,d);
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
  const old=await charter(db);if(old&&old.version===version&&(old.title!==title||old.content!==content||old.document_id!==(d.documentId||null)))return fail('Modifiez le numéro de version pour publier une charte modifiée.',409);
  const doc=d.documentId||null;if(doc&&!(await one(db,"SELECT id FROM team_documents WHERE id=? AND kind='charter'",doc)))return fail('Document inconnu.');
  await db.prepare('INSERT INTO team_charter(id,version,title,content,document_id,published_at) VALUES(1,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET version=excluded.version,title=excluded.title,content=excluded.content,document_id=excluded.document_id,published_at=excluded.published_at').bind(version,title,content,doc,now()).run();
  await audit(db,ctx.email,'charter.save',version);return reply({ok:true});
 }
 return fail('Action non reconnue.',404);
}
async function getMessages(db,ctx,url){
 if(!ctx.admin&&(!ctx.member||!await requireCharter(db,ctx)))return fail('Charte à accepter avant les discussions.',403);
 const channel=url.searchParams.get('channel')||'general',channelId=url.searchParams.get('id')||null;
 if(!['general','pole','activity'].includes(channel))return fail('Canal invalide.');
 if(!ctx.admin&&channel==='pole'&&(!idok(channelId)||!ctx.memberships.some(p=>p.pole_id===channelId)))return fail('Accès à ce pôle refusé.',403);
 if(channel==='activity'){const a=idok(channelId)?await one(db,'SELECT * FROM team_activities WHERE id=?',channelId):null;if(!a||a.status==='draft'||!await visibleActivity(db,ctx,a))return fail('Accès à la discussion refusé.',403)}
 const messages=await all(db,'SELECT t.id,t.body,t.created_at,m.name AS author FROM team_messages t JOIN team_members m ON m.id=t.author_id WHERE t.channel=? AND t.channel_id IS ? AND t.deleted_at IS NULL ORDER BY t.created_at DESC LIMIT 80',channel,channelId);
 return reply({messages:messages.reverse()});
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
   const page=new URL('/zikateam.html',url);
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
  if(path.startsWith('/zikateam/document/')&&request.method==='GET')return getDocument(env,ctx,path.split('/').pop());
  if(path==='/zikateam'||path==='/zikateam/'||path==='/zikateam/index.html')return env.ASSETS.fetch(new Request(new URL('/zikateam.html',url),request));
  if(path==='/zikateam/api/me'&&request.method==='GET')return getMine(db,ctx);
  if(path==='/zikateam/api/manage'&&request.method==='GET')return getManage(db,ctx);
  if(path==='/zikateam/api/messages'&&request.method==='GET')return getMessages(db,ctx,url);
  if(request.method==='POST'){
   if(request.headers.get('origin')!==url.origin)return fail('Origine non autorisée.',403);
   if(path==='/zikateam/api/upload')return upload(request,env,ctx,url);
   if(path==='/zikateam/api/command'){
    if(!request.headers.get('content-type')?.startsWith('application/json'))return fail('Contenu non autorisé.',415);
    if(Number(request.headers.get('content-length')||0)>35000)return fail('Requête trop longue.',413);
    const raw=await request.text();if(raw.length>35000)return fail('Requête trop longue.',413);
    let data;try{data=JSON.parse(raw)}catch{return fail('Requête JSON invalide.');}
    if(!data||typeof data.op!=='string')return fail('Action manquante.');
    let result;
    if(['charter.accept','activity.rsvp','shift.signup','push.link','message.send','task.status'].includes(data.op))result=await memberAction(db,ctx,data);
    else result=await adminAction(db,ctx,data);
    if(data.op==='activity.save'&&result.status===200&&execution?.waitUntil){execution.waitUntil(drainTeamPush(env).catch(()=>{}));}
    return result;
   }
  }
  return fail('Page ou action introuvable.',404);
 }catch(error){console.error('ZikaTeam',error?.message);return fail('Erreur de service ZikaTeam.',500)}
}