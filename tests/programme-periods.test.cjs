const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const html=fs.readFileSync(require('path').join(__dirname,'../index.html'),'utf8');vm.runInThisContext(html.slice(html.indexOf('function matchesProgrammePeriod('),html.indexOf('function filtered(){')));
const market={startsAt:'2026-11-28T10:00',endsAt:'2026-11-28T18:00',day:'samedi',both:true};
assert(matchesProgrammePeriod(market,'before'));assert(!matchesProgrammePeriod(market,'samedi'));assert(!matchesProgrammePeriod(market,'dimanche'));
const exhibition={startsAt:'2027-04-05T00:00',endsAt:'2027-05-10T23:59'};for(const p of ['before','samedi','dimanche'])assert(matchesProgrammePeriod(exhibition,p));
const saturday={startsAt:'2027-04-24T09:00',endsAt:'2027-04-24T12:30'};assert(!matchesProgrammePeriod(saturday,'before'));assert(matchesProgrammePeriod(saturday,'samedi'));assert(!matchesProgrammePeriod(saturday,'dimanche'));
for(const p of ['all','before','samedi','dimanche'])assert(matchesProgrammePeriod({alwaysAvailable:true},p));
assert(!matchesProgrammePeriod({day:'samedi'},'before'));console.log('Périodes : marché hors saison, exposition en cours, samedi et accès permanent vérifiés.');
