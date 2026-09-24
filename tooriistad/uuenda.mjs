// Kogub avalikud üritused ja kultuurikohad → data/*.json
// Allikad: kultuurikava.ee (üritused + kohtade koordinaadid), fienta.com (üritused, asukoht asula järgi),
// OpenStreetMap / Overpass (rahvamajad, kultuurimajad, teatrid, kinod + asulate nimekiri geokodeerimiseks).
// Käivita: node tooriistad/uuenda.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const JUUR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(JUUR, 'data');
const VAHEMALU = path.join(JUUR, 'vahemalu');
fs.mkdirSync(DATA, { recursive: true });
fs.mkdirSync(VAHEMALU, { recursive: true });

const KK = 'https://www.kultuurikava.ee/api/';
const KK_TOKEN = '1499ddfb3cb59057a9f201a4e6faf6fe68bde294'; // kultuurikava.ee avaliku veebi token
const UA = { 'User-Agent': 'KusMisToimub/1.0 (avalik yrituste kaart)' };
const PAEVI_ETTE = 60;
const nyyd = Math.floor(Date.now() / 1000);
const piir = nyyd + PAEVI_ETTE * 86400;

// Eesti aeg: suveaeg (EEST, +03) märtsi viimasest pühapäevast oktoobri viimaseni, muidu +02
function tlnNihe(y, m, d) {
  const viimanePyhap = kuu => { const t = new Date(Date.UTC(y, kuu, 0)); return t.getUTCDate() - t.getUTCDay(); };
  const n = m * 100 + d;
  return n > 300 + viimanePyhap(3) && n < 1000 + viimanePyhap(10) ? '+03:00' : n === 300 + viimanePyhap(3) ? '+03:00' : '+02:00';
}
const tallinnaAeg = s => { if (/(Z|[+-]dd:?dd)$/.test(s)) return Math.floor(Date.parse(s) / 1000); const [y, m, d] = s.slice(0, 10).split('-').map(Number); return Math.floor(Date.parse(s.slice(0, 19) + tlnNihe(y, m, d)) / 1000); };
const paevaAlgusTln = kp => tallinnaAeg(`${kp}T00:00:00`);
const oota = ms => new Promise(r => setTimeout(r, ms));
async function json(url, opt = {}, katseid = 3) {
  for (let k = 1; ; k++) {
    try {
      const r = await fetch(url, { ...opt, headers: { ...UA, ...(opt.headers || {}) } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      if (k >= katseid) throw new Error(`${url.slice(0, 120)}: ${e.message}`);
      await oota(1500 * k);
    }
  }
}
const loe = (f, vaikimisi) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return vaikimisi; } };
const kirjuta = (f, d) => fs.writeFileSync(f, JSON.stringify(d));
const puhasta = s => (s || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/\s+/g, ' ').trim();
const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

// ---------- 1. Kultuurikava kategooriad ----------
// Kultuurikava blokeerib välismaised serverid (ka GitHubi) → kui API-t ei saa, loe viimane toorfail,
// mille kasutaja arvuti saadab harusse „kultuurikava" (tooriistad/saada-kultuurikava.mjs)
const katNimi = {}, katUlem = {};
let kkAPI = true;
try {
  const kat = await json(`${KK}?do=categories&token=${KK_TOKEN}&lang=nat&format=json`, {}, 2);
  for (const c of kat.data.categories) { katNimi[c.id] = c.slug; katUlem[c.id] = c.parent_id; }
} catch (e) { kkAPI = false; console.warn(`Kultuurikava API ei vasta (${e.message.slice(-40)}) → kasutan vahemalu/kk-toores.json`); }
const PEAKAT = { teater: 'teater', muusika: 'muusika', kino: 'kino', 'pidu-klubi': 'pidu', sport: 'sport', 'pere-ja-lapsed': 'pere', naitus: 'naitus', 'mess-ja-laat': 'laat', kirjandus: 'kirjandus', kirik: 'kirik', huvialad: 'huvi', varia: 'muu' };
function kategooria(ids) {
  for (const id of ids || []) {
    let x = id; while (katUlem[x]) x = katUlem[x];
    if (PEAKAT[katNimi[x]]) return PEAKAT[katNimi[x]];
  }
  return 'muu';
}
// allikatele, kus kategooriat pole: märksõnad pealkirjast/kirjeldusest
const MARKSONAD = [
  ['moto', /ralli|rally|rallikross|autokross|motokross|motocross|enduro|offroad|off-road|4x4|drift|kart(ing|isõit)|kardi|ringrada|ringraja|supermoto|mootorsport|motosport|autosport|jääralli|võidusõit|slaalom|trial|mootorratta|tsiklite|autoshow|autonäitus/i],
  ['kino', /\bkino|film|linastus|filmiõhtu/i],
  ['teater', /teater|etendus|lavastus|komöödia|draama|tragöödia|monoetendus|improv|stand-?up|ooper|ballett|muusikal/i],
  ['pere', /lastele|laste |lapsed|pere|perepäev|nuku|muinasjut|mängutuba/i],
  ['muusika', /kontsert|muusika|festival|laulu|koor|orkester|bänd|dj|jazz|džäss|rock|folk|klaver|ansambel|live/i],
  ['pidu', /pidu|disko|tantsuõhtu|simman|klubi|party/i],
  ['sport', /jooks|matk|sport|võistlus|turniir|kross|rattasõit|jalgpall|korvpall|võrkpall|ujumi|suusa|orienteeru|jõusaal|jooga/i],
  ['naitus', /näitus|galerii|kunst|ekspositsioon|muuseum/i],
  ['laat', /laat|turg|mess|kirbuturg|taluturg/i],
  ['kirjandus', /raamat|luule|kirjandus|kirjanik|ettelugemine/i],
  ['kirik', /jumalateenistus|missa|kirik|palvus/i],
  ['huvi', /töötuba|koolitus|loeng|kursus|õpituba|seminar|workshop|vestlusring|klubi/i],
];
const arvaKategooria = t => (MARKSONAD.find(([, re]) => re.test(t)) || ['muu'])[0];

// ---------- 2. Kultuurikava üritused ----------
let kkYritused = [];
const kohaVahemalu = loe(path.join(VAHEMALU, 'kk-kohad.json'), {});
if (kkAPI) {
  let algus = 0, kokku = Infinity;
  while (algus < kokku) {
    const d = await json(`${KK}?do=events&token=${KK_TOKEN}&lang=nat&order=starta&start=${algus}&limit=500&format=json&showall=false&alltimes=true&ignoremuuseums=true`);
    kokku = d.events.total;
    const r = d.events.results || [];
    if (!r.length) break;
    kkYritused.push(...r);
    algus += 500;
    process.stdout.write(`Kultuurikava: ${Math.min(algus, kokku)}/${kokku}`);
  }
  // kohad (koordinaadid, vahemälus)
  const vajaKohti = new Set();
  for (const e of kkYritused) for (const t of e.times?.length ? e.times : [e]) if (t.place_url) vajaKohti.add(t.place_url.split('/places/')[1]);
  const puudu = [...vajaKohti].filter(u => u && !(u in kohaVahemalu));
  console.log(`\nKultuurikava: ${kkYritused.length} kirjet, kohti ${vajaKohti.size}, uusi pärida ${puudu.length}`);
  for (let i = 0; i < puudu.length; i += 6) {
    await Promise.all(puudu.slice(i, i + 6).map(async u => {
      try {
        const d = await json(`${KK}?do=getbyurl&token=${KK_TOKEN}&lang=nat&url=${encodeURIComponent(u)}&format=json&type=place`);
        const c = d.data?.content;
        kohaVahemalu[u] = c && c.lat ? { n: c.name_nat, a: c.address_nat || '', lat: +c.lat, lng: +c.lng, linn: c.city?.name_nat || '', www: c.homepage_nat || '' } : null;
      } catch (e) { console.warn('  koht', u, e.message); }
    }));
    kirjuta(path.join(VAHEMALU, 'kk-kohad.json'), kohaVahemalu);
  }
  // kärbitud toorfail (kategooria juba arvutatud), et GitHub saaks ilma API-ta hakkama
  kkYritused = kkYritused.map(e => ({
    id: e.id, url: e.url, name: e.name, k: kategooria(e.categories), excerpt: puhasta(e.excerpt).slice(0, 180), ...(e.times?.length && !e.times.some(t => (t.end_time || t.start_time) >= nyyd && t.start_time <= piir) ? { vana: 1 } : {}), isfree: e.isfree, hasimage: e.hasimage,
    ticketurl: e.ticketurl?.[0]?.ticketurl ? [{ ticketurl: e.ticketurl[0].ticketurl }] : [],
    start_time: e.start_time, end_time: e.end_time, place_url: e.place_url,
    times: (e.times || []).filter(t => (t.end_time || t.start_time) >= nyyd && t.start_time <= piir).map(t => ({ start_time: t.start_time, end_time: t.end_time, place_url: t.place_url })),
  })).filter(e => !e.vana);
  kirjuta(path.join(VAHEMALU, 'kk-toores.json'), { aeg: nyyd, yritused: kkYritused });
  if (process.env.AINULT_KULTUURIKAVA) { console.log('VALMIS (ainult Kultuurikava)'); process.exit(0); }
} else {
  const t = loe(path.join(VAHEMALU, 'kk-toores.json'), { yritused: [] });
  kkYritused = t.yritused;
  console.log(`Kultuurikava toorfailist: ${kkYritused.length} kirjet, ${t.aeg ? Math.round((nyyd - t.aeg) / 3600) + ' h vana' : 'puudub'}`);
}

// ---------- 4. OSM: kultuurikohad + asulad ----------
const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
async function overpass(q) {
  let viga;
  for (const u of OVERPASS) {
    try { return await json(u, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }, 2); }
    catch (e) { viga = e; }
  }
  throw viga;
}
const ALA = 'area["ISO3166-1"="EE"][admin_level=2]->.ee;';
let osmKohad = loe(path.join(VAHEMALU, 'osm-kohad.json'), null);
let asulad = loe(path.join(VAHEMALU, 'osm-asulad.json'), null);
const osmVana = fs.existsSync(path.join(VAHEMALU, 'osm-kohad.json')) && (Date.now() - fs.statSync(path.join(VAHEMALU, 'osm-kohad.json')).mtimeMs) > 7 * 86400e3;
if (!osmKohad || osmVana) {
  const d = await overpass(`[out:json][timeout:120];${ALA}(
    nwr["amenity"~"^(community_centre|arts_centre|theatre|cinema|music_venue|events_venue|concert_hall)$"](area.ee);
    nwr["name"~"rahvamaja|kultuurimaja|seltsimaja|külamaja|kultuurikeskus|noortekeskus|kontserdimaja",i](area.ee);
  );out center tags;`);
  osmKohad = d.elements.map(el => {
    const t = el.tags || {}; const lat = el.lat ?? el.center?.lat, lng = el.lon ?? el.center?.lon;
    if (!lat || !t.name) return null;
    const nimi = t.name.toLowerCase();
    let tyyp = 'kultuurimaja';
    if (/rahvamaja/.test(nimi)) tyyp = 'rahvamaja';
    else if (/seltsimaja|külamaja|küla maja|kogukonna/.test(nimi)) tyyp = 'seltsimaja';
    else if (/noortekeskus|noorte/.test(nimi)) tyyp = 'noortekeskus';
    else if (t.amenity === 'theatre') tyyp = 'teater';
    else if (t.amenity === 'cinema') tyyp = 'kino';
    else if (/music_venue|concert_hall/.test(t.amenity || '') || /kontserdi/.test(nimi)) tyyp = 'kontserdisaal';
    else if (t.amenity === 'community_centre') tyyp = 'seltsimaja';
    const aadress = [t['addr:street'] && `${t['addr:street']} ${t['addr:housenumber'] || ''}`.trim(), t['addr:place'], t['addr:city'] || t['addr:village']].filter(Boolean).join(', ');
    return { n: t.name, t: tyyp, lat: +lat.toFixed(5), lng: +lng.toFixed(5), a: aadress, www: t.website || t['contact:website'] || '', tel: t.phone || t['contact:phone'] || '' };
  }).filter(Boolean);
  // sama nimi 60 m piires = üks koht (node + building)
  const alles = [];
  for (const k of osmKohad) if (!alles.some(a => a.n === k.n && Math.abs(a.lat - k.lat) < 6e-4 && Math.abs(a.lng - k.lng) < 1e-3)) alles.push(k);
  osmKohad = alles;
  kirjuta(path.join(VAHEMALU, 'osm-kohad.json'), osmKohad);
}
if (!asulad || asulad.length < 3000) {
  const d = await overpass(`[out:json][timeout:180];${ALA}nwr["place"~"^(city|town|village|borough|suburb|quarter|hamlet)$"](area.ee);out center;`);
  for (const e of d.elements) if (e.lat == null && e.center) { e.lat = e.center.lat; e.lon = e.center.lon; }
  const aste = { city: 5, town: 4, borough: 3, suburb: 2, quarter: 1, village: 1 };
  asulad = d.elements.filter(e => e.tags?.name).map(e => ({ n: e.tags.name, lat: +e.lat.toFixed(5), lng: +e.lon.toFixed(5), r: aste[e.tags.place] || 0 }));
  kirjuta(path.join(VAHEMALU, 'osm-asulad.json'), asulad);
}
console.log(`OSM: ${osmKohad.length} kultuurikohta, ${asulad.length} asulat`);

// ---------- 5. Ühine kohtade register ----------
const kohad = []; const kohaIdx = new Map();
function kohaId(voti, k) {
  if (kohaIdx.has(voti)) return kohaIdx.get(voti);
  const i = kohad.length;
  kohad.push({ n: k.n, a: k.a || '', lat: +(+k.lat).toFixed(5), lng: +(+k.lng).toFixed(5), linn: k.linn || '', ...(k.www ? { www: k.www } : {}), ...(k.ligikaudne ? { ligi: 1 } : {}) });
  kohaIdx.set(voti, i);
  return i;
}

// ---------- 6. Üritused (etendused lahti, järgmised PAEVI_ETTE päeva) ----------
const yritused = [];
const nahtud = new Set();
for (const e of kkYritused) {
  const k = e.k || kategooria(e.categories);
  const ajad = e.times?.length ? e.times : [e];
  for (const t of ajad) {
    const lopp = t.end_time || t.start_time;
    if (lopp < nyyd || t.start_time > piir) continue;
    const u = (t.place_url || '').split('/places/')[1];
    const koht = kohaVahemalu[u];
    if (!koht) continue;
    const kestev = lopp - t.start_time > 86400 * 1.5;
    const voti = `${e.id}|${t.start_time}|${u}`;
    if (nahtud.has(voti)) continue; nahtud.add(voti);
    yritused.push({
      id: `k${e.id}`, n: puhasta(e.name), k, s: t.start_time, e: lopp, p: kohaId('kk:' + u, koht),
      u: e.url, ...(e.hasimage ? { img: 1 } : {}), ...(e.isfree ? { tasuta: 1 } : {}), ...(kestev ? { kestev: 1 } : {}),
      ...(e.excerpt ? { x: puhasta(e.excerpt).slice(0, 180) } : {}),
      ...(e.ticketurl?.[0]?.ticketurl ? { pilet: e.ticketurl[0].ticketurl } : {}), src: 'kk',
    });
  }
}
const kkArv = yritused.length;

// Fienta: asukoht kohanime (Kultuurikava) või asula järgi
const fi = await json('https://fienta.com/api/v1/public/events?country=EE');
const kkKohadNorm = Object.values(kohaVahemalu).filter(Boolean).map(k => ({ k, n: norm(k.n.split(',')[0]) })).filter(x => x.n.length > 4);
const asulaNorm = new Map();
for (const a of asulad.sort((x, y) => y.r - x.r)) { const n = norm(a.n); if (n.length > 2 && !asulaNorm.has(n)) asulaNorm.set(n, a); }
// Maa-ameti In-ADS aadressiotsing (vahemälus): täpne hoone koordinaat
const geoVahemalu = loe(path.join(VAHEMALU, 'geokood.json'), {});
async function inAds(aadress) {
  const v = norm(aadress);
  if (v in geoVahemalu) return geoVahemalu[v];
  let t = null;
  try {
    const d = await json(`https://inaadress.maaamet.ee/inaadress/gazetteer?address=${encodeURIComponent(aadress)}&results=1`, {}, 2);
    const a = d.addresses?.[0];
    if (a?.viitepunkt_b) t = { lat: +(+a.viitepunkt_b).toFixed(5), lng: +(+a.viitepunkt_l).toFixed(5), linn: (a.asustusyksus || '').replace(/ (linn|alev|alevik|küla)$/, ''), maja: /EHITIS|AADRESS/.test(a.liikVal || '') && !!a.aadress_nr };
  } catch {}
  geoVahemalu[v] = t;
  return t;
}
const osmNorm = osmKohad.map(k => ({ k, n: norm(k.n) })).filter(x => x.n.length > 5).sort((a, b) => b.n.length - a.n.length);
function asula(tekst) {
  const sonad = norm(tekst).split(' ');
  let parim = null;
  for (let l = 3; l >= 1; l--) for (let i = 0; i + l <= sonad.length; i++) {
    const a = asulaNorm.get(sonad.slice(i, i + l).join(' '));
    if (a && (!parim || a.r > parim.r)) parim = a;
  }
  return parim;
}
// üldine: koha nimi + aadress + linn → koht (täpsus: KK koht > aadress > asula keskpunkt)
async function geokodeeri({ venue = '', address = '', city = '' }, eesliide) {
  venue = puhasta(venue); address = puhasta(address); city = puhasta(city);
  const koos = norm(`${venue} ${address}`);
  const vaste = kkKohadNorm.find(x => koos.includes(x.n));
  if (vaste) return { voti: 'kkn:' + vaste.k.n, koht: vaste.k };
  const nv = norm(venue);
  const osm = nv.length > 5 && osmNorm.find(x => nv === x.n || (x.n.includes(' ') && nv.includes(x.n)) || (x.n.includes(nv) && nv.includes(' ')));
  if (osm) return { voti: `osm:${osm.k.n}|${osm.k.lat}`, koht: { n: osm.k.n, a: osm.k.a, lat: osm.k.lat, lng: osm.k.lng, linn: city, www: osm.k.www } };
  if (/\d/.test(address)) {
    const g = await inAds(city && !norm(address).includes(norm(city)) ? `${address}, ${city}` : address);
    if (g?.maja) { const nimi = venue || address; return { voti: `g:${norm(nimi)}|${g.lat.toFixed(3)}`, koht: { n: nimi, a: address, lat: g.lat, lng: g.lng, linn: city || g.linn } }; }
  }
  const a = asula(`${city} ${address} ${venue}`);
  if (!a) return null;
  const nimi = venue || a.n;
  return { voti: `${eesliide}:${norm(nimi)}|${a.n}`, koht: { n: nimi, a: address, lat: a.lat, lng: a.lng, linn: a.n, ligikaudne: true } };
}
const FI_KAT = { concert: 'muusika', music: 'muusika', festival: 'muusika', theatre: 'teater', film: 'kino', cinema: 'kino', party: 'pidu', nightlife: 'pidu', sports: 'sport', sport: 'sport', family: 'pere', children: 'pere', kids: 'pere', exhibition: 'naitus', art: 'naitus', fair: 'laat', market: 'laat', literature: 'kirjandus', workshop: 'huvi', education: 'huvi', training: 'huvi', conference: 'huvi', food: 'muu' };
let fiGeoPuudu = 0;
for (const ev of fi.events || []) {
  if (ev.attendance_mode === 'online' || /online|veebis|zoom/i.test(ev.venue || '')) continue;
  if (/kinkekaart|gift ?card|annetus|donation|пожертвован|sarjapilet|hooajapilet|season ticket/i.test(ev.title)) continue;
  const s = tallinnaAeg(ev.starts_at.replace(' ', 'T'));
  const lopp = tallinnaAeg(ev.ends_at.replace(' ', 'T'));
  if (lopp < nyyd || s > piir) continue;
  const g = await geokodeeri(ev, 'fi');
  if (!g) { fiGeoPuudu++; continue; }
  yritused.push({
    id: `f${ev.id}`, n: puhasta(ev.title), k: (ev.categories || []).map(c => FI_KAT[c]).find(Boolean) || arvaKategooria(ev.title), s, e: lopp, p: kohaId(g.voti, g.koht),
    u: ev.url, ...(ev.image_small_url ? { imgUrl: ev.image_small_url } : {}), ...(lopp - s > 86400 * 1.5 ? { kestev: 1 } : {}),
    ...(ev.price_from_string ? { hind: ev.price_from_string } : {}), ...(/free|tasuta/i.test(ev.price_from_string || '') && !/\d/.test(ev.price_from_string) ? { tasuta: 1 } : {}),
    ...(ev.description ? { x: puhasta(ev.description).slice(0, 180) } : {}), src: 'fi',
  });
}
const fiArv = yritused.length - kkArv;
const ARVUD = {};
const RAMPS = /kinkekaart|gift ?card|annetus|donation|пожертвован|sarjapilet|hooajapilet|season ticket|abonement|kinkepilet/i;
async function kaitse(nimi, f) { // üks allikas ei tohi kogu uuendust kukutada
  const enne = yritused.length;
  try { await f(); } catch (e) { console.warn(`\n! ${nimi} ebaõnnestus: ${e.message}`); }
  ARVUD[nimi] = yritused.length - enne;
  console.log(`${nimi}: ${ARVUD[nimi]}`);
}
function lisa(y) {
  if (!y.n || RAMPS.test(y.n) || y.e < nyyd || y.s > piir || !(y.e >= y.s)) return;
  if (y.e - y.s > 86400 * 1.5) y.kestev = 1;
  yritused.push(y);
}

// Piletilevi: nimekiri ilma koordinaatideta, koha koordinaadid ürituse detailist (vahemälus koha nime järgi)
const PL_KAT = { motorsport: 'moto', rally: 'moto', theatre: 'teater', comedy: 'teater', drama: 'teater', summerplay: 'teater', crime_comedy: 'teater', performance: 'teater', puppet_theater: 'pere', opera_and_operetta: 'teater', musical: 'teater', show: 'teater', monoplay: 'teater', circus: 'pere', film: 'kino', cinema: 'kino', exhibition: 'naitus', museums: 'naitus', muuseum: 'naitus', sports: 'sport', football: 'sport', boxing: 'sport', martial_arts: 'sport', lecture: 'huvi' };
await kaitse('Piletilevi', async () => {
  const plKohad = loe(path.join(VAHEMALU, 'pl-kohad.json'), {});
  const koik = [];
  for (let lk = 1, lehti = 1; lk <= lehti; lk++) {
    const d = await json(`https://www.piletilevi.ee/api/v1/events?language=et&pageSize=100&page=${lk}`);
    lehti = d.totalPages || 1; koik.push(...(d.items || []));
  }
  for (const e of koik) {
    if (e.status === 'CANCELLED' || e.venue?.country && e.venue.country !== 'EE') continue;
    const voti = norm(e.venue?.name || '');
    if (!voti || voti in plKohad) continue;
    try {
      const d = await json(`https://www.piletilevi.ee/api/v1/events/${e.id}?language=et`);
      const v = (d.item || d).venue || {};
      plKohad[voti] = v.latitude ? { n: v.nameOverride || v.name, a: v.address || '', lat: +v.latitude, lng: +v.longitude, linn: v.city || '' } : null;
    } catch { plKohad[voti] = null; }
  }
  kirjuta(path.join(VAHEMALU, 'pl-kohad.json'), plKohad);
  for (const e of koik) {
    if (e.status === 'CANCELLED') continue;
    let k = plKohad[norm(e.venue?.name || '')];
    let voti = k && `pl:${norm(k.n)}`;
    if (!k && e.venue?.name) { const g = await geokodeeri({ venue: e.venue.name, city: e.venue.city }, 'pl'); if (g) { k = g.koht; voti = g.voti; } }
    if (!k) continue;
    const kat = e.categories?.find(c => c.attachedAs === 'MAIN')?.key;
    const s = Date.parse(e.eventStartAt) / 1000;
    lisa({
      id: `p${e.id}`, n: puhasta(e.name), k: PL_KAT[kat] || (kat === 'music' || kat === 'festival' ? 'muusika' : arvaKategooria(e.name)),
      s, e: e.eventEndAt ? Date.parse(e.eventEndAt) / 1000 : s + 7200, p: kohaId(voti, k),
      u: `https://www.piletilevi.ee/piletid/${e.id}/${e.sluggedName}`,
      ...(e.imageData?.[0]?.imageId ? { imgUrl: `https://www.piletilevi.ee/i/height=252/images/${e.imageData[0].imageId}` } : {}), src: 'pl',
    });
  }
});

// Visit Estonia (puhkaeestis.ee): koordinaadid kaasas; ajad on kuupäevad (terve päev)
await kaitse('Visit Estonia', async () => {
  const nahtudVE = new Set();
  const VE_KAT = { yldine_uritus_muusika: 'muusika', yldine_uritus_fest: 'muusika', yldine_uritus_spord: 'sport' };
  for (const keel of ['ET', 'EN']) {
    const d = await json(`https://visitestonia.com/api/v1/search?lang=${keel}&category=URITUS&objectType=OBJECT&page=0&rows=1000`);
    const docs = d.response?.docs || d.docs || d.results || d.items || [];
    for (const o of docs) {
      if (nahtudVE.has(o.id)) continue; nahtudVE.add(o.id);
      const m = (o.points?.[0] || '').match(/Point\(([\d.]+) ([\d.]+)\)/);
      if (!m || !o.startDate) continue;
      const aad = (o.addresses || []).join(', ');
      const linn = (o.addresses?.[0] || '').split(',').pop().trim();
      const s = paevaAlgusTln(o.startDate.slice(0, 10)), e = paevaAlgusTln((o.endDate || o.startDate).slice(0, 10)) + 86399;
      lisa({
        id: `v${o.id.replace(/\D/g, '')}`, n: puhasta(o.title), k: VE_KAT[o.typeCode] || arvaKategooria(`${o.title} ${o.introduction || ''}`), s, e, paev: 1,
        p: kohaId(`ve:${m[1]}|${m[2]}`, { n: linn || puhasta(o.title), a: aad, lat: +m[1], lng: +m[2], linn }),
        u: o.latestUrl ? `https://visitestonia.com/${keel.toLowerCase()}/${o.latestUrl.replace(/^\//, '')}` : (o.homepage || 'https://visitestonia.com'),
        ...(o.thumbnail ? { imgUrl: o.thumbnail } : {}), ...(o.introduction ? { x: puhasta(o.introduction).slice(0, 180) } : {}), src: 've',
      });
    }
  }
});

// Piletikeskus: aadress kaasas, koordinaat Maa-ameti aadressiotsingust
await kaitse('Piletikeskus', async () => {
  const PK_KAT = { kino: 'kino', teater: 'teater', kontsert: 'muusika', muusika: 'muusika', festival: 'muusika', sport: 'sport', lastele: 'pere', pere: 'pere', naitus: 'naitus', koolitus: 'huvi', pidu: 'pidu', meelelahutus: 'muu' };
  const nahtudPK = new Set();
  for (let lk = 1; lk < 200; lk++) {
    const d = await json(`https://www.piletikeskus.ee/api/events?page=${lk}`);
    for (const e of d.events || []) {
      if (nahtudPK.has(e.id) || /cancel/i.test(e.status || '')) continue; nahtudPK.add(e.id);
      const g = await geokodeeri({ venue: e.venue, address: e.address, city: e.city }, 'pk');
      if (!g) continue;
      const s = Date.parse(e.startDate) / 1000;
      lisa({
        id: `c${e.id}`, n: puhasta(e.title), k: (e.eventCategories || []).map(c => PK_KAT[norm(c)]).find(Boolean) || arvaKategooria(e.title),
        s, e: e.endDate ? Date.parse(e.endDate) / 1000 : s + 7200, p: kohaId(g.voti, g.koht), u: `https://www.piletikeskus.ee/et/e/${e.id}`,
        ...(e.thumb || e.cover?.img ? { imgUrl: e.thumb || e.cover.img } : {}), ...(e.priceFrom === 0 ? { tasuta: 1 } : {}), src: 'pc',
      });
    }
    if (!d.pagination?.hasMore) break;
  }
});

// Eesti Kontsert (concert.ee): WordPressi AJAX-i HTML
await kaitse('Eesti Kontsert', async () => {
  const kuup = t => new Date(t * 1000).toISOString().slice(0, 10);
  const r = await fetch('https://concert.ee/wp-admin/admin-ajax.php', { method: 'POST', headers: { ...UA, 'Content-Type': 'application/x-www-form-urlencoded' }, body: `action=ek_list_display&ek_ajax_start[]=${kuup(nyyd)}&ek_ajax_end[]=${kuup(piir)}` });
  const h = await r.text();
  const read = h.split(/<div class="row[ "]/).slice(1);
  for (const rida of read) {
    const v = re => (rida.match(re) || [])[1] || '';
    const url = v(/<h2[^>]*>\s*<a[^>]*href="([^"]+)"/), nimi = puhasta(v(/<h2[^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>/));
    const kp = (puhasta(v(/event-date[^>]*>([\s\S]*?)<\/div>/)).match(/(\d{1,2})\.(\d{1,2})\s*\.\s*(\d{4})/) || []).slice(1, 4).join('.');
    const kell = v(/event-time[^>]*>\s*([\d:]+)/) || '19:00';
    const linn = puhasta(v(/event-location[^>]*>([\s\S]*?)<\//)).replace(/,$/, ''), koht = puhasta(v(/event-venue[^>]*>([\s\S]*?)<\//));
    if (!url || !kp) continue;
    const [p, k, a] = kp.split('.');
    const s = tallinnaAeg(`${a}-${k.padStart(2, '0')}-${p.padStart(2, '0')}T${kell.padStart(5, '0')}:00`);
    const g = await geokodeeri({ venue: koht, city: linn }, 'ek');
    if (!g) continue;
    lisa({ id: `e${v(/ek_id=(\d+)/) || url}`, n: nimi, k: 'muusika', s, e: s + 7200, p: kohaId(g.voti, g.koht), u: url.replace(/&amp;/g, '&'), ...(v(/background-image:\s*url\(['"]?([^'")]+)/) ? { imgUrl: v(/background-image:\s*url\(['"]?([^'")]+)/) } : {}), src: 'ek' });
  }
});

// Elva valla kultuur (elvakultuur.ee): WordPress + ACF, koht on sildina (nt „Rõngu rahvamaja")
await kaitse('Elva kultuur', async () => {
  const B = 'https://elvakultuur.ee/wp-json/wp/v2';
  const sildid = {};
  for (let lk = 1; lk < 10; lk++) {
    const r = await fetch(`${B}/tags?per_page=100&page=${lk}`, { headers: UA }); if (!r.ok) break;
    const d = await r.json(); if (!d.length) break;
    for (const t of d) sildid[t.id] = puhasta(t.name);
  }
  for (let lk = 1; lk <= 8; lk++) {
    const r = await fetch(`${B}/sundmused?per_page=100&page=${lk}&_fields=id,link,title,tags,class_list,acf,excerpt`, { headers: UA }); if (!r.ok) break;
    const d = await r.json(); if (!d.length) break;
    for (const e of d) {
      const a = e.acf || {}; const m = (a.event_date_start || '').match(/(\d\d)\/(\d\d)\/(\d{4})/); if (!m) continue;
      const kp = `${m[3]}-${m[2]}-${m[1]}`;
      const me = (a.event_date_end || '').match(/(\d\d)\/(\d\d)\/(\d{4})/);
      const kell = (a.event_time || '').match(/(\d{1,2})[:.](\d\d)/);
      const s = kell ? tallinnaAeg(`${kp}T${kell[1].padStart(2, '0')}:${kell[2]}:00`) : paevaAlgusTln(kp);
      const lopp = me ? paevaAlgusTln(`${me[3]}-${me[2]}-${me[1]}`) + 86399 : kell ? s + 7200 : s + 86399;
      const kohanimi = (e.tags || []).map(t => sildid[t]).find(n => n && !/maakond|^http|^elva vald$/i.test(n)) || 'Elva';
      const g = await geokodeeri({ venue: kohanimi, city: /elva/i.test(kohanimi) ? 'Elva' : '' }, 'ev');
      if (!g) continue;
      const kl = (e.class_list || []).join(' ');
      lisa({
        id: `l${e.id}`, n: puhasta(e.title?.rendered), k: arvaKategooria(`${e.title?.rendered} ${kl}`), s, e: lopp, ...(kell ? {} : { paev: 1 }),
        p: kohaId(g.voti, g.koht), u: e.link, ...(/tasuta|prii|^0/i.test(a.event_ticket_price || '') ? { tasuta: 1 } : {}),
        ...(a.event_ticket_price ? { hind: puhasta(a.event_ticket_price) } : {}), ...(e.excerpt?.rendered ? { x: puhasta(e.excerpt.rendered).slice(0, 180) } : {}), src: 'ev',
      });
    }
  }
});

// Visit Tallinn: koordinaadid kaasas
await kaitse('Visit Tallinn', async () => {
  const d = await json('https://visittallinn.ee/api/v1/event?lang=est&limit=2000');
  for (const e of d) {
    const lat = +e.g_coord_x, lng = +e.g_coord_y; if (!lat || !lng) continue;
    const koht = { n: puhasta(e.place_name) || 'Tallinn', a: puhasta(e.address), lat, lng, linn: e.city || 'Tallinn' };
    for (const t of e.times?.length ? e.times : [e]) {
      const s = Date.parse(t.begin_date) / 1000; let lopp = Date.parse(t.end_date || t.begin_date) / 1000;
      const kell = (t.time || '').match(/(\d{1,2})[:.](\d\d)/);
      const paev = !kell;
      const algus = kell ? tallinnaAeg(`${t.begin_date.slice(0, 10)}T${kell[1].padStart(2, '0')}:${kell[2]}:00`) : paevaAlgusTln(t.begin_date.slice(0, 10));
      lopp = kell && lopp - s < 86400 ? algus + 7200 : paevaAlgusTln(t.end_date.slice(0, 10)) + 86399;
      lisa({
        id: `t${e.id}_${t.id || ''}`, n: puhasta(e.name), k: arvaKategooria(`${e.name} ${(e.categories || []).map(c => c.name).join(' ')}`), s: algus, e: lopp, ...(paev ? { paev: 1 } : {}),
        p: kohaId(`vt:${e.place_id || norm(koht.n)}`, koht), u: e.webpage || e.piletilevi_url || 'https://visittallinn.ee/est/kulastaja/tee/uritused',
        ...(e.image?.original ? { imgUrl: `https://visittallinn.ee${e.image.original}` } : {}), ...(e.free ? { tasuta: 1 } : {}), src: 'vt',
      });
    }
  }
});

// Valdade kodulehed OVP-platvormil: keskne otsinguteenus, Origin peab olema valla leht; istungid välja
const OVP = { alutagusevald: 'https://www.alutagusevald.ee', haademeeste: 'https://www.haademeeste.ee', haljala: 'https://www.haljala.ee', kambja: 'https://www.kambja.ee', kanepi: 'https://www.kanepi.ee', laaneharju: 'https://www.laaneharju.ee', laanenigula: 'https://www.laanenigula.ee', maardu: 'https://www.maardu.ee', narva: 'https://www.narva.ee', nvv: 'https://www.nvv.ee', parnu: 'https://www.parnu.ee', peipsivald: 'https://peipsivald.ee', 'pohja-sakala': 'https://www.pohja-sakala.ee', pparnumaa: 'https://www.pparnumaa.ee', saarde: 'https://www.saarde.ee', saaremaavald: 'https://www.saaremaavald.ee', sauevald: 'https://sauevald.ee', viljandivald: 'https://www.viljandivald.ee', 'viru-nigula': 'https://www.viru-nigula.ee', viimsi: 'https://viimsi.ee', elva: 'https://www.elva.ee', kiilivald: 'https://kiilivald.ee', harku: 'https://www.harku.ee', joelahtme: 'https://www.joelahtme.ee', jogeva: 'https://xn--jgeva-dua.ee', kuusalu: 'https://www.kuusalu.ee', marjamaa: 'https://www.marjamaa.ee', otepaa: 'https://www.otepaa.ee', poltsamaa: 'https://www.poltsamaa.ee', raasiku: 'https://www.raasiku.ee', rae: 'https://www.rae.ee', rakvere: 'https://www.rakvere.ee', sillamae: 'https://www.sillamae.ee', tapa: 'https://www.tapa.ee', tartuvald: 'https://www.tartuvald.ee', tyri: 'https://www.tyri.ee', voru: 'https://www.voru.ee', voruvald: 'https://www.voruvald.ee' };
const AMETLIK = /istung|koosolek|volikogu|arutelu|komisjon|nõupidamine|vastuvõtuaeg|vastuvõtt|detailplaneering|planeeringu|valitsus|avalik väljapanek|hange|kohtumine vallavanemaga/i;
await kaitse('Valdade kalendrid', async () => {
  for (const [slug, origin] of Object.entries(OVP)) {
    let d;
    try { d = await json(`https://search.service.eu-live.vportal.ee/v1/events/${slug}?langcode=et&filters[date_relative]=upcoming&limit=1000`, { headers: { Origin: origin, Referer: origin + '/' } }, 2); } catch { continue; }
    const vallaNimi = { pparnumaa: 'Pärnu-Jaagupi', nvv: 'Narva-Jõesuu', 'pohja-sakala': 'Suure-Jaani', laaneharju: 'Paldiski', laanenigula: 'Taebla', viljandivald: 'Viljandi', voruvald: 'Võru', jogeva: 'Jõgeva', tyri: 'Türi', joelahtme: 'Jõelähtme', otepaa: 'Otepää', poltsamaa: 'Põltsamaa', sillamae: 'Sillamäe', haademeeste: 'Häädemeeste', alutagusevald: 'Iisaku', saaremaavald: 'Kuressaare', peipsivald: 'Kallaste', sauevald: 'Saue', kiilivald: 'Kiili', tartuvald: 'Kõrveküla', 'viru-nigula': 'Kunda' }[slug] || slug[0].toUpperCase() + slug.slice(1);
    for (const e of (d?.response || d)?.docs || []) {
      if (AMETLIK.test(e.title || '')) continue;
      const loc = puhasta(e.event_location || '');
      const sulgudes = (loc.match(/\(([^)]*\d[^)]*)\)/) || [])[1] || '';
      const g = await geokodeeri({ venue: loc.replace(/\([^)]*\)/, '').trim() || vallaNimi, address: sulgudes || (/\d/.test(loc) ? loc : ''), city: '' }, 'ovp')
        || await geokodeeri({ venue: vallaNimi }, 'ovp');
      if (!g) continue;
      const s = Date.parse(e.ds_start_date) / 1000;
      lisa({
        id: `o${e.ss_search_api_id || e.id}`.replace(/[^a-zA-Z0-9_:-]/g, '').slice(0, 80), n: puhasta(e.title), k: arvaKategooria(`${e.title} ${e.lead_text || ''}`), s, e: Date.parse(e.ds_end_date || e.ds_start_date) / 1000,
        p: kohaId(g.voti, g.koht), u: origin + (e.uri || '/sundmused'), ...(e.lead_text ? { x: puhasta(e.lead_text).slice(0, 180) } : {}),
        ...(e.image_uri ? { imgUrl: origin + e.image_uri } : {}), src: 'ovp',
      });
    }
  }
});

// Valdade/linnade WordPressid „The Events Calendar" pistikprogrammiga
const TRIBE = ['https://hiiumaa.ee', 'https://www.paide.ee', 'https://visit.keila.ee', 'https://lyganuse.ee', 'https://vinnivald.ee', 'https://kihnu.ee', 'https://www.johvi.ee', 'https://loksalinn.ee', 'https://kohtla-jarve.ee', 'https://narva-joesuu.ee', 'https://ruhnu.ee', 'https://kultuur.audru.ee'];
await kaitse('Valdade WordPressid', async () => {
  for (const host of TRIBE) {
    let url = `${host}/wp-json/tribe/events/v1/events?per_page=50&start_date=now`, lehti = 0;
    while (url && lehti++ < 20) {
      let d; try { d = await json(url, {}, 2); } catch { break; }
      for (const e of d.events || []) {
        const v = e.venue || {};
        const g = await geokodeeri({ venue: v.venue || '', address: v.address || '', city: v.city || '' }, 'wp')
          || await geokodeeri({ venue: host.replace(/https?:\/\/(www\.|visit\.|kultuur\.)?/, '').split('.')[0] }, 'wp');
        if (!g) continue;
        const s = tallinnaAeg(e.start_date.replace(' ', 'T'));
        lisa({
          id: `w${host.length}${e.id}`, n: puhasta(e.title), k: arvaKategooria(`${e.title} ${(e.categories || []).map(c => c.name).join(' ')}`), s, e: tallinnaAeg((e.end_date || e.start_date).replace(' ', 'T')),
          ...(e.all_day ? { paev: 1 } : {}), p: kohaId(g.voti, g.koht), u: e.url, ...(e.image?.url ? { imgUrl: e.image.url } : {}),
          ...(/tasuta|free|^0/i.test(e.cost || '') ? { tasuta: 1 } : {}), ...(e.excerpt ? { x: puhasta(e.excerpt).slice(0, 180) } : {}), src: 'wp',
        });
      }
      url = d.next_rest_url || null;
    }
  }
});
// Elva valla leht (PDF, kord kuus): viimasel lehel „Elva valla sündmuste kalender" tabelina
// veerud: KUUPÄEV | SÜNDMUS | ASUKOHT | PILETI HIND. Rea algus = rida, kus sündmus, koht ja hind on samal kõrgusel.
const KUUD = [['jaan', 1], ['veeb', 2], ['märts', 3], ['marts', 3], ['apr', 4], ['mai', 5], ['juuni', 6], ['juuli', 7], ['aug', 8], ['sept', 9], ['okt', 10], ['nov', 11], ['dets', 12]];
function kuupaevad(tekst, aasta, lehtKuu) {
  const kp = [...tekst.toLowerCase().matchAll(/(\d{1,2})\.\s*([a-zõäöü]+)/g)].map(m => {
    const kuu = (KUUD.find(([k]) => m[2].startsWith(k)) || [])[1]; if (!kuu) return null;
    const a = kuu < lehtKuu - 2 ? aasta + 1 : aasta;
    return `${a}-${String(kuu).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }).filter(Boolean);
  const kell = tekst.match(/kell\s*(\d{1,2})(?:[.:](\d\d))?/i) || tekst.match(/(?:^|\s)(\d{1,2})[.:](\d\d)(?:\s|$|–)/) || tekst.match(/(?:^|\s)(\d{1,2})\s*[–-]\s*\d{1,2}(?:\s|$)/);
  return { kp, kell: kell ? `${kell[1].padStart(2, '0')}:${kell[2] || '00'}` : null, kuni: /kuni/i.test(tekst) };
}
async function loeElvaLeht(pdfUrl, aasta, lehtKuu, lehtKp) {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const baidid = new Uint8Array(await (await fetch(pdfUrl, { headers: UA })).arrayBuffer());
  const doc = await getDocument({ data: baidid, verbosity: 0 }).promise;
  for (let lk = doc.numPages; lk >= Math.max(1, doc.numPages - 3); lk--) {
    const tc = await (await doc.getPage(lk)).getTextContent();
    const w = tc.items.filter(i => i.str.trim()).map(i => ({ x: i.transform[4], y: i.transform[5], t: i.str.trim() }));
    const pais = w.find(i => /^SÜNDMUS$/.test(i.t)), koht = w.find(i => /^ASUKOHT$/.test(i.t)), hind = w.find(i => /^PILETI/.test(i.t)), kuup = w.find(i => /^KUUP/.test(i.t));
    if (!pais || !koht || !hind || !kuup) continue;
    const lopp = w.find(i => /^LISAINFO/.test(i.t))?.y ?? 0;
    const paremServ = Math.min(...w.filter(i => i.x > hind.x + 60 && Math.abs(i.y - kuup.y) < 25).map(i => i.x - 5), hind.x + 95);
    const veerg = i => i.x < kuup.x + 68 ? 'kp' : i.x < koht.x - 15 ? 'sy' : i.x < hind.x - 5 ? 'koht' : i.x < paremServ ? 'hind' : null;
    const tabel = w.filter(i => i.y < kuup.y - 3 && i.y > lopp + 3 && veerg(i)).map(i => ({ ...i, v: veerg(i) }));
    const algused = [...new Set(tabel.filter(i => i.v === 'sy' && tabel.some(j => j.v === 'koht' && Math.abs(j.y - i.y) < 1.5) && tabel.some(j => j.v === 'hind' && Math.abs(j.y - i.y) < 1.5)).map(i => Math.round(i.y * 2) / 2))].sort((a, b) => b - a);
    const read = [];
    for (let r = 0; r < algused.length; r++) {
      const yl = algused[r] + 1.5, ya = (algused[r + 1] ?? lopp) + 1.5;
      const osa = v => tabel.filter(i => i.v === v && i.y <= yl && i.y > ya).sort((a, b) => b.y - a.y || a.x - b.x).map(i => i.t).join(' ').replace(/-\s+(?=\p{Ll})/gu, '').replace(/\s+/g, ' ').trim();
      // kuupäevaveerg võib alata rea kohal („kuni" on ülemisel real)
      const kpTekst = tabel.filter(i => i.v === 'kp' && i.y <= yl + 2 && i.y > ya).sort((a, b) => b.y - a.y || a.x - b.x).map(i => i.t).join(' ');
      read.push({ kp: kpTekst, sy: osa('sy'), koht: osa('koht'), hind: osa('hind') });
    }
    return read.map(r => ({ ...r, ...kuupaevad(r.kp, aasta, lehtKuu), lehtKp }));
  }
  return [];
}
await kaitse('Elva valla leht', async () => {
  const h = await tekst('https://www.elva.ee/infoleht');
  const lehed = [...new Set([...h.matchAll(/href="([^"]*leht%20nr%20(\d+)[^"]*?(\d\d)\.(\d\d)\.(\d{4})[^"]*\.pdf)"/g)].map(m => JSON.stringify({ u: m[1], nr: +m[2], kp: `${m[5]}-${m[4]}-${m[3]}` })))].map(JSON.parse).sort((a, b) => b.nr - a.nr).slice(0, 2);
  const nahtudEL = new Set();
  for (const l of lehed) {
    const read = await loeElvaLeht(new URL(l.u, 'https://www.elva.ee').href, +l.kp.slice(0, 4), +l.kp.slice(5, 7), l.kp);
    console.log(`  Elva valla leht nr ${l.nr}: ${read.length} rida`);
    for (const r of read) {
      if (!r.kp.length || !r.sy) continue;
      const alg = r.kuni && r.kp.length === 1 ? l.kp : r.kp[0];
      const lopuKp = r.kp.length > 1 || r.kuni ? r.kp[r.kp.length - 1] : alg;
      const s = r.kell && !r.kuni ? tallinnaAeg(`${alg}T${r.kell}:00`) : paevaAlgusTln(alg);
      const e = lopuKp !== alg ? paevaAlgusTln(lopuKp) + 86399 : r.kell ? s + 7200 : s + 86399;
      const v = `${norm(r.sy)}|${lopuKp}`; if (nahtudEL.has(v)) continue; nahtudEL.add(v);
      const kohaNimi = r.koht || 'Elva';
      const g = await geokodeeri({ venue: kohaNimi, address: /\d/.test(kohaNimi) ? `${kohaNimi}, Elva` : '' }, 'el') || await geokodeeri({ venue: 'Elva' }, 'el');
      if (!g) continue;
      lisa({
        id: `el${norm(r.sy).replace(/ /g, '').slice(0, 30)}${alg.replace(/-/g, '')}`, n: r.sy, k: arvaKategooria(r.sy), s, e, ...(r.kell ? {} : { paev: 1 }),
        p: kohaId(g.voti, g.koht), u: 'https://elvakultuur.ee/sundmused/', ...(/tasuta/i.test(r.hind) && !/\d/.test(r.hind) ? { tasuta: 1 } : {}),
        ...(r.hind ? { hind: r.hind } : {}), x: `Elva valla leht, ${lyhikeKp(l.kp)}`, src: 'el',
      });
    }
  }
});
function lyhikeKp(k) { const [a, m, p] = k.split('-'); return `${+p}.${+m}.${a}`; }

// Mootorsport: Autospordi Liit + Mootorrattaspordi Föderatsioon (MEC RSS, max 10 kirjet voos → iga ala eraldi)
const RADAD = [
  [/porsche ?ring|audru ?ring|papsaare/i, 'Porsche Ring', 58.4019, 24.4544], [/laitse/i, 'LaitseRallyPark', 59.1733, 24.3622],
  [/aravete/i, 'Aravete kardirada', 59.1246, 25.7466], [/kuningam[äa]e/i, 'Kuningamäe kardikeskus', 58.6534, 25.9465],
  [/rapla karti|rapla kardi/i, 'Rapla kardirada', 59.0224, 24.8428], [/raassilla/i, 'Raassilla rallikrossirada', 58.2489, 25.7485],
  [/holstre/i, 'Holstre-Nõmme krossirada', 58.317, 25.6727], [/kose (kestvus)?kross|kose krossi/i, 'Kose krossirada', 59.1581, 25.175],
  [/maardu/i, 'Maardu krossirada', 59.453, 24.9904], [/mudest|alutaguse puhke/i, 'Alutaguse Puhke- ja Spordikeskus', 59.2896, 27.559],
  [/kiviõli/i, 'Kiviõli Seikluskeskus', 59.3659, 26.9522], [/misso/i, 'Misso', 57.602, 27.2286], [/paikuse/i, 'Paikuse', 58.3697, 24.6195],
  [/tankodroom|saku/i, 'Saku', 59.3016, 24.6542], [/müüriku/i, 'Müüriku', 59.1325, 26.2821], [/sõreste/i, 'Sõreste', 57.9837, 26.9176],
  [/saaremaa ralli/i, 'Kuressaare', 58.2528, 22.4849], [/kulbilohu/i, 'Kulbilohu krossirada', 58.1447, 26.3697],
];
await kaitse('Mootorsport', async () => {
  const vood = [];
  for (const [base, tee] of [['https://autosport.ee', 'mec-category'], ['https://msport.ee', 'mec-ala']]) {
    let slugid = [];
    try { slugid = (await json(`${base}/wp-json/wp/v2/mec_category?per_page=100`)).map(c => c.slug); } catch {}
    for (const s of slugid) vood.push(`${base}/${tee}/${s}/feed/`);
  }
  const nahtudM = new Set();
  for (const u of vood) {
    let x; try { x = await tekst(u); } catch { continue; }
    for (const it of x.split('<item>').slice(1)) {
      const v = t => puhasta(((it.match(new RegExp(`<${t}>([\\s\\S]*?)</${t}>`)) || [])[1] || '').replace(/<!\[CDATA\[|\]\]>/g, ''));
      const link = v('link'); if (!link || nahtudM.has(link)) continue; nahtudM.add(link);
      const n = v('title'), kirj = v('description'), kat = v('mec:category');
      if (/e-autosport|sim|online|riia|riga|bikernieki|läti|latvia|leedu|lithuania|rukla|soome|finland/i.test(`${n} ${kat} ${kirj.slice(0, 300)}`)) continue;
      const alg = v('mec:startDate'), lopp = v('mec:endDate') || alg; if (!alg) continue;
      const kell = v('mec:startHour').match(/(\d{1,2}):(\d\d)\s*(am|pm)?/i);
      let h = kell ? +kell[1] : 0; if (kell?.[3]?.toLowerCase() === 'pm' && h < 12) h += 12;
      const s = kell ? tallinnaAeg(`${alg}T${String(h).padStart(2, '0')}:${kell[2]}:00`) : paevaAlgusTln(alg);
      const rada = RADAD.find(([re]) => re.test(n)) || RADAD.find(([re]) => re.test(kirj));
      let g = rada ? { voti: `rada:${rada[1]}`, koht: { n: rada[1], lat: rada[2], lng: rada[3] } } : null;
      if (!g) { const a = asula(n) || asula(kirj.slice(0, 200)); if (a) g = { voti: `rada:${a.n}`, koht: { n: a.n, lat: a.lat, lng: a.lng, linn: a.n, ligikaudne: true } }; }
      if (!g) continue;
      lisa({ id: `m${norm(link).replace(/ /g, '').slice(-40)}`, n, k: 'moto', s, e: paevaAlgusTln(lopp) + 86399, ...(kell ? {} : { paev: 1 }), p: kohaId(g.voti, g.koht), u: link, ...(kirj ? { x: kirj.slice(0, 180) } : {}), src: 'moto' });
    }
  }
  try {
    const d = await json('https://laitserallypark.ee/wp-json/wp/v2/pec-events?per_page=100');
    for (const e of d) {
      if (!e.pec_date) continue;
      const s = tallinnaAeg(e.pec_date.replace(' ', 'T'));
      lisa({ id: `lr${e.id}`, n: puhasta(e.title?.rendered), k: 'moto', s, e: e.pec_end_date ? tallinnaAeg(e.pec_end_date.replace(' ', 'T')) : s + 6 * 3600, p: kohaId('rada:LaitseRallyPark', { n: 'LaitseRallyPark', lat: 59.1733, lng: 24.3622, linn: 'Hingu' }), u: e.link, src: 'moto' });
    }
  } catch {}
});
kirjuta(path.join(VAHEMALU, 'geokood.json'), geoVahemalu);

// Kultuuriaken (Tartu ja Lõuna-Eesti): nimekiri ühelt lehelt, koordinaadid + ajad ürituse lehelt (vahemälus 3 päeva)
const KA = 'https://kultuuriaken.tartu.ee';
async function tekst(url) {
  for (let k = 1; ; k++) {
    try { const r = await fetch(url, { headers: UA }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return await r.text(); }
    catch (e) { if (k >= 3) throw e; await oota(1500 * k); }
  }
}
const kaVahemalu = loe(path.join(VAHEMALU, 'ka-yritused.json'), {});
const kaNimekiri = [...new Set([...(await tekst(`${KA}/et/syndmused?starting_time=5`)).matchAll(/href="(\/et\/syndmus\/[^"]+)"/g)].map(m => m[1].replace(/&amp;/g, '&')))];
const kaPuudu = kaNimekiri.filter(u => !kaVahemalu[u] || nyyd - kaVahemalu[u].t > 3 * 86400);
console.log(`Kultuuriaken: ${kaNimekiri.length} üritust, pärida ${kaPuudu.length}`);
for (let i = 0; i < kaPuudu.length; i += 6) {
  await Promise.all(kaPuudu.slice(i, i + 6).map(async u => {
    try {
      const h = await tekst(KA + u);
      const ld = JSON.parse(h.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
      const ev = (ld['@graph'] || [ld]).find(x => x['@type'] === 'Event');
      const ks = h.match(/"kultuuriaken":\{"latitude":(-?[\d.]+),"longitude":(-?[\d.]+),"address":"((?:[^"\\]|\\.)*)","location":"((?:[^"\\]|\\.)*)"/);
      const img = ev?.image?.url || '';
      kaVahemalu[u] = ev && ks ? {
        t: nyyd, n: puhasta(ev.name), s: ev.startDate, e: ev.endDate || ev.startDate, x: puhasta(ev.description).slice(0, 180),
        lat: +ks[1], lng: +ks[2], a: JSON.parse(`"${ks[3]}"`), koht: JSON.parse(`"${ks[4]}"`), img,
        korr: ev.organizer?.name || '',
      } : { t: nyyd, puudu: 1 };
    } catch (e) { kaVahemalu[u] = { t: nyyd, puudu: 1 }; }
  }));
  process.stdout.write(`\r  kultuuriaken ${Math.min(i + 6, kaPuudu.length)}/${kaPuudu.length}`);
  if (i % 120 === 0) kirjuta(path.join(VAHEMALU, 'ka-yritused.json'), kaVahemalu);
}
kirjuta(path.join(VAHEMALU, 'ka-yritused.json'), kaVahemalu);
console.log('');
let kaArv = 0;
for (const u of kaNimekiri) {
  const d = kaVahemalu[u];
  if (!d || d.puudu || !d.lat || d.lat < 57 || d.lat > 60.5) continue;
  const s = tallinnaAeg(d.s), lopp = tallinnaAeg(d.e);
  if (lopp < nyyd || s > piir) continue;
  const linn = (d.a.split(',').map(x => x.trim()).filter(x => !/maakond|Eesti|^\d/.test(x)).slice(-1)[0]) || '';
  const koht = { n: d.koht || linn, a: d.a.replace(/, Eesti$/, ''), lat: d.lat, lng: d.lng, linn };
  yritused.push({
    id: `a${(u.match(/event=(\d+)/) || [])[1] || u}`, n: d.n, k: arvaKategooria(`${d.n} ${d.x} ${d.korr}`), s, e: lopp,
    p: kohaId(`ka:${norm(koht.n)}|${d.lat.toFixed(4)}`, koht), u: KA + u,
    ...(d.img ? { imgUrl: d.img } : {}), ...(lopp - s > 86400 * 1.5 ? { kestev: 1 } : {}),
    ...(/tasuta|prii/i.test(d.x) ? { tasuta: 1 } : {}), ...(d.x ? { x: d.x } : {}), src: 'ka',
  });
  kaArv++;
}

// topeltkirjed eri allikatest: sama nimi, sama algus ±30 min, kohad < 1 km
function kaugus(a, b) { const dx = (a.lng - b.lng) * 111 * Math.cos(a.lat * Math.PI / 180), dy = (a.lat - b.lat) * 111; return Math.hypot(dx, dy); }
yritused.sort((a, b) => a.s - b.s);
const eemalda = new Set();
for (let i = 0; i < yritused.length; i++) {
  const a = yritused[i]; const an = norm(a.n).slice(0, 25);
  for (let j = i + 1; j < yritused.length && yritused[j].s - a.s <= 1800; j++) {
    const b = yritused[j];
    if (a.src === b.src || eemalda.has(j)) continue;
    if (norm(b.n).slice(0, 25) === an && kaugus(kohad[a.p], kohad[b.p]) < 1) eemalda.add(kohad[a.p].ligi ? i : j);
  }
}
const samad = new Set();
for (let i = 0; i < yritused.length; i++) { const y = yritused[i]; const v = `${norm(y.n)}|${y.s}|${y.p}`; if (samad.has(v)) eemalda.add(i); else samad.add(v); }
const lopp = yritused.filter((_, i) => !eemalda.has(i));
yritused.length = 0; yritused.push(...lopp);

const MOTO = MARKSONAD[0][1];
for (const y of yritused) if (['sport', 'muu', 'huvi', 'naitus'].includes(y.k) && MOTO.test(y.n)) y.k = 'moto';
kirjuta(path.join(DATA, 'yritused.json'), { uuendatud: nyyd, kohad, yritused });
kirjuta(path.join(DATA, 'kultuurikohad.json'), { uuendatud: nyyd, kohad: osmKohad });
console.log(`VALMIS: ${yritused.length} toimumist (Kultuurikava ${kkArv}, Fienta ${fiArv}, Kultuuriaken ${kaArv}, ${Object.entries(ARVUD).map(([k, v]) => `${k} ${v}`).join(', ')}, topelt eemaldatud ${eemalda.size}, Fienta ilma asukohata ${fiGeoPuudu}), ${kohad.length} kohta, ${osmKohad.length} kultuurikohta`);
if (yritused.length < 200) { console.error('LIIGA VÄHE ÜRITUSI — allikas muutunud?'); process.exit(1); }
