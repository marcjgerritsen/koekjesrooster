/********************
 * CONFIG
 ********************/
// vul deze twee aan:
 const API_URL   = 'https://script.google.com/macros/s/AKfycbzII8AfOcVzCAPzgBoimUAn8kIo1A5vR7H5OPM2VKI1nZMIofWx8b1QuUA8PHiNOhaJfw/exec';
 const SHEET_URL = 'https://docs.google.com/spreadsheets/d/1gd4RDGMyfbN7GSEkyMJDSeAiP65w6ohnC86UVvXlm6g/edit?gid=0#gid=0';

/********************
 * HELPERS
 ********************/
const $  = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const DEBUG = new URLSearchParams(location.search).has('debug');

// avatar fallback
function photoUrl(person, sheetUrl) {
  return sheetUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(person||'Koekjes')}&background=e2e8f0`;
}

// JSONP fallback (voor CORS)
function jsonp(url) {
  return new Promise((resolve, reject) => {
    const cb = 'cb_' + Math.random().toString(36).slice(2);
    const s = document.createElement('script');
    const sep = url.includes('?') ? '&' : '?';
    s.src = url + sep + 'callback=' + cb + '&_=' + Date.now();
    window[cb] = (data) => { resolve(data); cleanup(); };
    s.onerror = () => { reject(new Error('JSONP failed')); cleanup(); };
    document.head.appendChild(s);
    function cleanup(){ delete window[cb]; s.remove(); }
    setTimeout(() => { reject(new Error('JSONP timeout')); cleanup(); }, 10000);
  });
}

async function smartGet(params) {
  let url = API_URL;
  if (params) url += (url.includes('?') ? '&' : '?') + params;
  try {
    const res = await fetch(url + (url.includes('?') ? '&' : '?') + '_=' + Date.now(), { mode: 'cors' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } catch {
    return await jsonp(url);
  }
}

// normaliseer API-items (oude/nieuwe vormen)
function normalizeItem(x = {}) {
  const o = { ...x };

  // online/absent → arrays
  const toArr = (v) => {
    if (Array.isArray(v)) return v;
    if (typeof v === 'string') {
      const s = v.trim().toLowerCase();
      if (!s || s === 'no' || s === 'nee') return [];
      return v.split(',').map(s => s.trim()).filter(Boolean);
    }
    return [];
  };
  o.online = toArr(o.online);
  o.absent = toArr(o.absent);

  // date (ISO) herstellen als lange string
  if (o.date && /^\w{3}\s/.test(String(o.date))) {
    const t = Date.parse(o.date);
    if (!isNaN(t)) o.date = new Date(t).toISOString().slice(0,10);
  }

  // mooi datumlabel (voorkeur API-veld)
  o.date_text = o.date_nl || o.nl_date || (o.date
    ? new Date(o.date + 'T00:00:00').toLocaleDateString('nl-NL', { weekday:'long', year:'numeric', month:'long', day:'numeric' })
    : '');

  return o;
}

function toList(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') return v.split(',').map(s => s.trim()).filter(Boolean);
  return [];
}

function showSection(name) {
  $('#homeSection').classList.toggle('hidden', name !== 'home');
  $('#searchSection').classList.toggle('hidden', name !== 'search');
  // button state
  const on  = 'btn btn--primary';
  const off = 'btn';
  $('#navHome').className   = name === 'home'   ? on : off;
  $('#navSearch').className = name === 'search' ? on : off;
}

/********************
 * DATA
 ********************/
let ALL = [];
let PEOPLE = [];

async function fetchAll() {
  const json = await smartGet('');
  ALL = Array.isArray(json.all) ? json.all.map(normalizeItem) : [];
  PEOPLE = Array.isArray(json.people) ? json.people : [];
  return { ALL, PEOPLE };
}

async function fetchNext() {
  const json = await smartGet('q=next');
  if (Array.isArray(json.people)) PEOPLE = json.people;
  return json.next ? normalizeItem(json.next) : null;
}

/********************
 * RENDER: HOME
 ********************/
async function renderHome() {
  const next = await fetchNext();
  if (DEBUG) debugPanelNext(next);

  const title  = $('#nextTitle');
  const photo  = $('#nextPhoto');
  const badges = $('#nextBadges');
  const lists  = $('#nextLists');

  if (!next) {
    title.textContent = 'Nog geen komende datum ingepland';
    photo.src = photoUrl('Koekjes');
    badges.innerHTML = '';
    lists.textContent = '';
    return;
  }

  // titel
  title.textContent = `${next.person} neemt koekjes mee op ${next.date_text}`;

  // badges (alle styling in CSS-klassen)
  badges.innerHTML = '';
  if (next.extra === 'yes') {
    const span = document.createElement('span');
    span.className = 'badge badge--amber';
    span.textContent = 'LET OP! Neem extra koekjes voor de visite!';
    badges.appendChild(span);
  }
  if (next.sprintreview === 'yes') {
    const span = document.createElement('span');
    span.className = 'badge badge--green';
    span.textContent = 'LET OP! Er is Sprintreview!';
    badges.appendChild(span);
  }

  // lijstjes (alleen tekst)
  const absentList = toList(next.absent).join(', ') || '—';
  const onlineList = toList(next.online).join(', ') || '—';
  lists.innerHTML = '';
  const line1 = document.createElement('div');
  line1.innerHTML = `Afwezig: <b>${absentList}</b>`;
  const line2 = document.createElement('div');
  line2.innerHTML = `Online: <b>${onlineList}</b>`;
  lists.append(line1, line2);

  // foto
  photo.src = photoUrl(next.person, next.photo);
  photo.onerror = () => { photo.src = photoUrl('Koekjes'); };
}

/********************
 * RENDER: ZOEKEN
 ********************/
function fillPeople() {
  const sel = $('#qPerson');
  sel.innerHTML = '';
  const optAny = document.createElement('option');
  optAny.value = '';
  optAny.textContent = '– iedereen –';
  sel.appendChild(optAny);
  (PEOPLE || []).forEach(p => {
    const o = document.createElement('option');
    o.value = p; o.textContent = p;
    sel.appendChild(o);
  });
}

function renderSearchList(items) {
  const wrap = $('#searchResults');
  wrap.innerHTML = '';
  if (!items.length) {
    const p = document.createElement('p');
    p.className = 'muted';
    p.textContent = 'Geen resultaten.';
    wrap.appendChild(p);
    return;
  }

  items.sort((a,b) => a.date.localeCompare(b.date)).forEach(x => {
    const row = document.createElement('div');
    row.className = 'cardrow';

    const left = document.createElement('div');
    const title = document.createElement('div');
    title.className = 'bold';
    title.textContent = `${x.person} – ${x.date_text}`;
    const meta = document.createElement('div');
    meta.className = 'muted small';
    const absentText = toList(x.absent).join(', ') || '—';
    const onlineText = toList(x.online).join(', ') || '—';
    meta.textContent = `Afwezig: ${absentText} · Online: ${onlineText} · Extra: ${x.extra || 'no'} · Sprintreview: ${x.sprintreview || 'no'}`;
    left.append(title, meta);

    const img = document.createElement('img');
    img.src = photoUrl(x.person, x.photo);
    img.className = 'avatar';
    img.style.width = '32px';
    img.style.height = '32px';
    img.onerror = () => { img.src = photoUrl(x.person); };

    row.append(left, img);
    wrap.appendChild(row);
  });
}

/********************
 * INIT & EVENTS
 ********************/
function showDebugPanel() {
  $('#debugPanel').classList.remove('hidden');
}
function debugPanelAll() {
  showDebugPanel();
  $('#debugAll').textContent = JSON.stringify({ all: ALL, people: PEOPLE }, null, 2);
}
function debugPanelNext(next) {
  showDebugPanel();
  $('#debugNext').textContent = JSON.stringify(next, null, 2);
}
function handleSearchSubmit(e) {
  e.preventDefault();
  const d = document.getElementById('qDate').value || null;
  const p = document.getElementById('qPerson').value || null;

  let arr = ALL.slice();
  if (d) arr = arr.filter(x => x.date === d);   // ISO match
  if (p) arr = arr.filter(x => x.person === p);

  renderSearchList(arr);
}

async function init() {
  showSection('home');
  $('#manageLink').href = SHEET_URL;

  try {
    await fetchAll();
    fillPeople();
    if (DEBUG) debugPanelAll();
  } catch (err) {
    console.error('[init] fetchAll/fillPeople failed:', err);
  }

  try {
    await renderHome();
  } catch (err) {
    console.error('[init] renderHome failed:', err);
    const title = $('#nextTitle');
    if (title) title.textContent = 'Kan data niet laden (check API_URL / toegang).';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  // bestaande bindings
  document.getElementById('navHome').addEventListener('click', () => showSection('home'));
  document.getElementById('navSearch').addEventListener('click', () => showSection('search'));
  document.getElementById('btnRefresh').addEventListener('click', () => init());

  // ⬇️ zoekformulier submit
  const form = document.getElementById('searchForm');
  if (form) form.addEventListener('submit', handleSearchSubmit);

  // (optioneel) direct filteren bij wijzigen
  ['qDate','qPerson'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', () =>
      handleSearchSubmit(new Event('submit', { cancelable: true }))
    );
  });

  init();
});

