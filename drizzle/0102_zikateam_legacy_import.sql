-- Import non destructif des bénévoles/équipes/réunions ZikaTeam historiques.
-- Source : 0004_zikateam_secure.sql, tables *_legacy conservées par 0100.
INSERT OR IGNORE INTO team_members(id,name,email,active,created_at,updated_at)
SELECT lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-'||hex(randomblob(2))||'-'||hex(randomblob(2))||'-'||hex(randomblob(6))),
       display_name,lower(trim(email)),active,created_at,created_at
FROM team_members_legacy WHERE email IS NOT NULL AND trim(email) <> '';

INSERT INTO team_poles(id,name,description,archived,created_at,updated_at)
SELECT lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-'||hex(randomblob(2))||'-'||hex(randomblob(2))||'-'||hex(randomblob(6))),
       name,'',0,CAST(strftime('%s','now') AS INTEGER)*1000,CAST(strftime('%s','now') AS INTEGER)*1000
FROM team_channels WHERE is_general=0;

INSERT OR IGNORE INTO team_memberships(member_id,pole_id,role,created_at)
SELECT m.id,p.id,CASE WHEN lm.role IN ('admin','lead') THEN 'lead' ELSE 'member' END,lm.created_at
FROM team_memberships_legacy old
JOIN team_members_legacy lm ON lm.email=old.email
JOIN team_members m ON m.email=lower(trim(lm.email))
JOIN team_channels c ON c.id=old.channel_id AND c.is_general=0
JOIN team_poles p ON p.name=c.name;

INSERT OR IGNORE INTO team_activities(id,kind,title,starts_at,ends_at,place,details,agenda,agenda_document_id,audience,status,created_by,updated_by,created_at,updated_at)
SELECT x.id,'meeting',x.title,
 strftime('%Y-%m-%dT%H:%M:%fZ',CASE WHEN x.starts_at>100000000000 THEN x.starts_at/1000.0 ELSE x.starts_at END,'unixepoch'),
 strftime('%Y-%m-%dT%H:%M:%fZ',CASE WHEN x.ends_at>100000000000 THEN x.ends_at/1000.0 ELSE x.ends_at END,'unixepoch'),
 x.place,'',x.agenda,NULL,
 CASE WHEN c.is_general=1 THEN 'all' ELSE 'poles' END,
 'published',x.created_by,x.created_by,x.created_at,x.created_at
FROM team_meetings x
JOIN team_channels c ON c.id=x.channel_id
WHERE x.ends_at>x.starts_at;

INSERT OR IGNORE INTO team_activity_poles(activity_id,pole_id)
SELECT a.id,p.id
FROM team_meetings m
JOIN team_activities a ON a.id=m.id
JOIN team_channels c ON c.id=m.channel_id AND c.is_general=0
JOIN team_poles p ON p.name=c.name;

INSERT OR IGNORE INTO team_activity_rsvps(activity_id,member_id,answer,updated_at)
SELECT a.id,m.id,h.response,h.updated_at
FROM team_attendance h
JOIN team_activities a ON a.id=h.meeting_id
JOIN team_members m ON m.email=lower(trim(h.email))
WHERE h.response IN ('yes','no','maybe');

INSERT OR IGNORE INTO team_messages(id,author_id,channel,channel_id,body,created_at,deleted_at)
SELECT x.id,m.id,CASE WHEN c.is_general=1 THEN 'general' ELSE 'pole' END,
 CASE WHEN c.is_general=1 THEN NULL ELSE p.id END,x.body,x.created_at,NULL
FROM team_messages_legacy x
JOIN team_members m ON m.email=lower(trim(x.author_email))
JOIN team_channels c ON c.id=x.channel_id
LEFT JOIN team_poles p ON p.name=c.name AND c.is_general=0
WHERE c.is_general=1 OR p.id IS NOT NULL;
