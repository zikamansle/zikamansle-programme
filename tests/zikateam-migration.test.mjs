import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readdirSync,readFileSync} from 'node:fs';

test('la migration ZikaTeam préserve et reprend les anciens membres, messages et réunions',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  db.exec('PRAGMA foreign_keys=ON');
  const files=readdirSync('drizzle').filter(x=>x.endsWith('.sql')).sort();
  for(const f of files.filter(x=>x.startsWith('000'))){
   db.exec(readFileSync('drizzle/'+f,'utf8'));
  }
  const moment=Date.parse('2026-11-01T12:00:00Z');
  const id='bb121212-2222-4222-8222-bbbbbbbbbbbb';
  db.prepare("INSERT INTO team_members(email,display_name,role,active,created_at) VALUES(?,?,?,?,?)").run('ancienne@example.org','Ancienne bénévole','lead',1,moment);
  db.prepare("INSERT INTO team_memberships(email,channel_id) VALUES(?,?)").run('ancienne@example.org','logistique');
  db.prepare("INSERT INTO team_messages(id,channel_id,author_email,body,created_at) VALUES(?,?,?,?,?)").run('aa121212-2222-4222-8222-aaaaaaaaaaaa','logistique','ancienne@example.org','Préparation matériel',moment);
  db.prepare("INSERT INTO team_meetings(id,channel_id,title,starts_at,ends_at,place,agenda,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?)").run(id,'logistique','Réunion de préparation',Date.parse('2027-04-22T12:00:00Z'),Date.parse('2027-04-22T13:00:00Z'),'Salle','Point logistique','ancienne@example.org',moment);
  db.prepare("INSERT INTO team_attendance(meeting_id,email,response,updated_at) VALUES(?,?,?,?)").run(id,'ancienne@example.org','yes',moment);
  for(const f of files.filter(x=>x.startsWith('010')))db.exec(readFileSync('drizzle/'+f,'utf8'));
  assert.equal(db.prepare("SELECT display_name FROM team_members_legacy WHERE email='ancienne@example.org'").get().display_name,'Ancienne bénévole');
  assert.equal(db.prepare("SELECT COUNT(*) n FROM team_messages_legacy").get().n,1);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM team_meetings").get().n,1);
  const member=db.prepare("SELECT id,name FROM team_members WHERE email='ancienne@example.org'").get();
  assert(member);assert.equal(member.name,'Ancienne bénévole');assert.match(member.id,/^[a-f0-9-]{36}$/);
  const pole=db.prepare("SELECT id FROM team_poles WHERE name='Logistique'").get();assert(pole);
  assert.equal(db.prepare("SELECT role FROM team_memberships WHERE member_id=? AND pole_id=?").get(member.id,pole.id).role,'lead');
  const meeting=db.prepare("SELECT title,starts_at,agenda,audience FROM team_activities WHERE id=?").get(id);
  assert.equal(meeting.title,'Réunion de préparation');
  assert.match(meeting.starts_at,/^2027-04-22T12:00:00\.000Z$/);
  assert.equal(meeting.agenda,'Point logistique');assert.equal(meeting.audience,'poles');
  assert.equal(db.prepare("SELECT pole_id FROM team_activity_poles WHERE activity_id=?").get(id).pole_id,pole.id);
  assert.equal(db.prepare("SELECT answer FROM team_activity_rsvps WHERE activity_id=? AND member_id=?").get(id,member.id).answer,'yes');
  assert.equal(db.prepare("SELECT channel,channel_id FROM team_messages WHERE author_id=?").get(member.id).channel,'pole');
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{db.close()}
});

test('migration ZikaTeam : tables historiques facultatives absentes, sans perte',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  db.exec('PRAGMA foreign_keys=ON');
  const files=readdirSync('drizzle').filter(x=>x.endsWith('.sql')).sort();
  for(const f of files.filter(x=>x.startsWith('000')))db.exec(readFileSync('drizzle/'+f,'utf8'));
  db.exec('DROP TABLE team_messages; DROP TABLE team_memberships');
  const moment=Date.parse('2026-11-10T09:00:00Z');
  const meeting='cd121212-2222-4222-8222-cccccccccccc';
  db.prepare('INSERT INTO team_members(email,display_name,role,active,created_at) VALUES(?,?,?,?,?)').run('test@example.org','Bénévole déjà inscrit','volunteer',1,moment);
  db.prepare('INSERT INTO team_meetings(id,channel_id,title,starts_at,ends_at,place,agenda,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?)').run(meeting,'general','Ancienne réunion',Date.parse('2027-04-24T10:00:00Z'),Date.parse('2027-04-24T11:00:00Z'),'Mairie','Répartition','test@example.org',moment);
  for(const f of files.filter(x=>x.startsWith('010')))db.exec(readFileSync('drizzle/'+f,'utf8'));
  assert.equal(db.prepare("SELECT display_name FROM team_members_legacy WHERE email='test@example.org'").get().display_name,'Bénévole déjà inscrit');
  assert.equal(db.prepare("SELECT name FROM team_members WHERE email='test@example.org'").get().name,'Bénévole déjà inscrit');
  assert.equal(db.prepare("SELECT title FROM team_activities WHERE id=?").get(meeting).title,'Ancienne réunion');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM team_messages_legacy').get().n,0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM team_memberships_legacy').get().n,0);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{db.close()}
});
