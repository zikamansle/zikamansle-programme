import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const server=readFileSync(new URL('../server/zikateam.mjs',import.meta.url),'utf8');
const client=readFileSync(new URL('../public/zikateam.js',import.meta.url),'utf8');

test('une inscription en attente ne peut lire aucune conversation par API',()=>{
 assert.ok(server.includes("if(ctx.pending)return fail('Inscription en attente de validation : aucune conversation n’est accessible.',403)"));
 assert.ok(server.includes("if(ctx.pending&&!['charter.accept','consents.save'].includes(data.op))"));
 assert.ok(server.includes('Aucune conversation n’est accessible avant approbation.'));
 assert.ok(client.includes("state.me.pending?[['fiche','Mon accueil']]"));
});

test('les coordonnées consenties ne sont servies qu’aux responsables du pôle',()=>{
 assert.ok(server.includes("const canViewContacts=ctx.admin||ctx.leadPoles.includes(p.id)"));
 assert.ok(server.includes("canViewContacts?1:0,canViewContacts?1:0,p.id"));
 assert.ok(client.includes('Les autres bénévoles ne le verront pas.'));
 assert.ok(client.includes('Les autres bénévoles ne la verront pas.'));
});

test('la première inscription demande identité, code et validation admin',()=>{
 assert.ok(client.includes('name="name" minlength="2" maxlength="110" autocomplete="name" required'));
 assert.ok(client.includes("await api('auth/verify',{email:state.loginEmail,name:state.loginName,code:code.trim()})"));
 assert.ok(server.includes('ctx.pending'));
});

test('les signatures d’émargement sont enregistrées et imprimables',()=>{
 assert.ok(server.includes("if(d.op==='signing.sign')"));
 assert.ok(server.includes('signature_points=?,signed_at=?,signed_by_operator=?'));
 assert.ok(client.includes('teamSigningCanvas'));
 assert.ok(client.includes('function printSigningSession()'));
});

// Ces tests protègent le staging ZikaTeam sans ouvrir l'application publique.
