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

// Helper to set hero background using the avatar
function setHeroBackground(url) {
  const hero = document.getElementById('hero');
  if (!hero) return;
  const bg = url || '';
  hero.style.backgroundImage =
    `linear-gradient(180deg, rgba(0,0,0,.15), rgba(0,0,0,.45)),
     url("${bg}")`;
}

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

// ==== Donderdag helpers ====

/** Format any date-like input to "YYYY-MM-DD" (local zone safe). */
function toISO(d) {
  // If it's already ISO
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d;

  const dt = (d instanceof Date) ? new Date(d.getTime()) : new Date(d);
  if (isNaN(+dt)) return '';
  // Normalize to local midnight, then stringify in UTC to avoid TZ drift
  dt.setHours(0, 0, 0, 0);
  dt.setMinutes(dt.getMinutes() - dt.getTimezoneOffset());
  return dt.toISOString().slice(0, 10);
}

/** Is the given ISO date (YYYY-MM-DD) a Thursday? */
function isThursday(iso) {
  const dt = (typeof iso === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(iso))
    ? new Date(iso + 'T00:00:00')
    : new Date(iso);
  if (isNaN(+dt)) return false;
  return dt.getDay() === 4; // 0=Sun ... 4=Thu
}

/** First Thursday strictly in the future from the given date/time. */
function upcomingThursdayISO(from = new Date()) {
  const dt = new Date(from);
  dt.setHours(0, 0, 0, 0);
  const day = dt.getDay();
  let add = (4 - day + 7) % 7;
  if (add === 0) add = 7; // if today is Thu, jump to next week
  dt.setDate(dt.getDate() + add);
  return toISO(dt);
}

/** Nearest Thursday to the given date (ties resolve to the next Thursday). */
function nearestThursdayISO(iso) {
  const base = (typeof iso === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(iso))
    ? new Date(iso + 'T00:00:00')
    : new Date(iso);
  if (isNaN(+base)) return '';
  base.setHours(0, 0, 0, 0);

  const day = base.getDay();
  const deltaNext = (4 - day + 7) % 7;           // days to next Thu
  const deltaPrev = (day - 4 + 7) % 7;           // days since last Thu

  const next = new Date(base); next.setDate(base.getDate() + deltaNext);
  const prev = new Date(base); prev.setDate(base.getDate() - deltaPrev);

  const choose = (Math.abs(next - base) < Math.abs(base - prev)) ? next : prev;
  return toISO(choose);
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

 // Titel
title.textContent = `${next.person} neemt koekjes mee op ${next.date_text}`;

// Badges
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

// Lijstjes
const absentList = toList(next.absent).join(', ') || '—';
const onlineList = toList(next.online).join(', ') || '—';
lists.innerHTML = `
  <div>Afwezig: <b>${absentList}</b></div>
  <div>Online: <b>${onlineList}</b></div>
`;

// Foto + hero background
const pic = photoUrl(next.person, next.photo);
photo.src = pic;
photo.onerror = () => { photo.src = photoUrl('Koekjes'); };
setHeroBackground(pic);
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
function runSearch(kind) {
  const dateEl   = document.getElementById('qDate');
  const personEl = document.getElementById('qPerson');

  // Maak de andere filter leeg op basis van wat er aangepast is
  if (kind === 'date' && personEl.value)  personEl.value = '';
  if (kind === 'person' && dateEl.value)  dateEl.value   = '';

  const d = dateEl.value || null;
  const p = personEl.value || null;

  let arr = ALL.slice();
  if (d) {
    // Alleen datum filteren
    arr = arr.filter(x => x.date === d);
  } else if (p) {
    // Alleen persoon filteren
    arr = arr.filter(x => x.person === p);
  }
  renderSearchList(arr);
}

// vervang je huidige handleSearchSubmit door deze
function handleSearchSubmit(e) {
  if (e) e.preventDefault();
  const hasDate   = !!document.getElementById('qDate').value;
  const hasPerson = !!document.getElementById('qPerson').value;
  runSearch(hasDate ? 'date' : (hasPerson ? 'person' : ''));
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
  // --- navigatie & refresh ---
  const homeBtn   = document.getElementById('navHome');
  const searchBtn = document.getElementById('navSearch');
  const refresh   = document.getElementById('btnRefresh');
  const manage    = document.getElementById('manageLink');

  if (homeBtn)   homeBtn.addEventListener('click', () => showSection('home'));
  if (searchBtn) searchBtn.addEventListener('click', () => showSection('search'));
  if (refresh)   refresh.addEventListener('click', () => init());
  if (manage && typeof SHEET_URL === 'string') manage.href = SHEET_URL;

  // --- zoekformulier ---
  const form     = document.getElementById('searchForm');
  const dateEl   = document.getElementById('qDate');
  const personEl = document.getElementById('qPerson');

  // 1) submit (blijft bestaan voor Enter/knop)
  if (form) form.addEventListener('submit', handleSearchSubmit);

  // 2) OF-logica live:
  //    - wijzigen van persoon => runSearch('person') en datum leeg
  if (personEl) {
    personEl.addEventListener('change', () => runSearch('person'));
  }

  //    - wijzigen van datum => runSearch('date') en persoon leeg
  if (dateEl) {
    // Alleen donderdagen: basis-instellingen
    const baseThu = upcomingThursdayISO(new Date()); // eerstvolgende donderdag
    dateEl.setAttribute('min', baseThu);
    dateEl.setAttribute('step', '7'); // 7-daagse stappen vanaf min

    // helper voor visuele hint
    const syncDateStyles = () => {
      dateEl.classList.toggle('is-thursday', isThursday(dateEl.value));
      dateEl.classList.toggle('is-invalid', !!dateEl.value && !isThursday(dateEl.value));
    };
    syncDateStyles();

    dateEl.addEventListener('change', () => {
      // corrigeer naar dichtstbijzijnde donderdag indien nodig
      if (dateEl.value && !isThursday(dateEl.value)) {
        dateEl.value = nearestThursdayISO(dateEl.value);
      }
      dateEl.setCustomValidity('');
      syncDateStyles();
      runSearch('date'); // triggert OF-logica en wist persoon
    });

    // optioneel: pijltjes ↑/↓ springen een week
    dateEl.addEventListener('keydown', (e) => {
      if (!dateEl.value) return;
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        const dt = new Date(dateEl.value + 'T00:00:00');
        dt.setDate(dt.getDate() + (e.key === 'ArrowUp' ? 7 : -7));
        dateEl.value = toISO(dt);
        syncDateStyles();
        runSearch('date');
      }
    });
  }

  // --- global error guard ---
  window.addEventListener('unhandledrejection', (e) => {
    console.error('[global] Unhandled promise rejection:', e.reason);
  });

  // --- init view+data ---
  showSection('home');
  init();
});


