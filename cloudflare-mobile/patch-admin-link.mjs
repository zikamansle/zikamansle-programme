// Applies one targeted menu addition to the public ZikaMansle mobile frontend.
// No backend/auth change: /admin-notifications performs its existing server-side authorization.
import { readFileSync, writeFileSync } from 'node:fs';
const file = process.argv[2];
if (!file) throw new Error('Usage: node patch-admin-link.mjs <mobile.js>');
const src = readFileSync(file, 'utf8');
const needle = "menuLink('#page/partenaires','Devenir partenaire / exposant','Rejoindre l’aventure','users')";
const addition = "+menuLink('/admin-notifications','Administration','Espace organisateurs · connexion sécurisée','info')";
if (src.includes("menuLink('/admin-notifications','Administration'")) {
  console.log('Administration link already present; no change');
  process.exit(0);
}
if (src.split(needle).length !== 2) throw new Error('Unexpected live mobile.js layout; refusing unsafe replacement');
const revised = src.replace(needle, needle + addition);
writeFileSync(file, revised);
console.log('Added admin link to Plus menu; existing functions preserved');
