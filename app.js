/* Rec. — carnet de vocaux musicaux (nom technique : fredon) */
(() => {
const { LocalStore, CloudStore, loadConfig, saveConfig } = window.FredonStore;

const TAG_PRESETS = ['mélodie', 'rythme', 'paroles', 'accords', 'couplet', 'refrain', 'pont', 'intro', 'beat'];

const PALETTE = ['#01bc8d', '#3b9dff', '#8b6cf6', '#f0518c', '#f97316', '#eab308', '#14b8c4', '#8a94a6'];
const WAVE_N = 48;

const S = {
  store: null,
  ideas: [],
  takes: [],
  groups: [],
  members: [],
  scope: 'me', // 'me' = mes idées, sinon l'identifiant d'un groupe
  filter: { q: '', tags: new Set(), star: false },
  playing: null,
  queue: [],
};

/* ---------------- Utilitaires ---------------- */
const $ = sel => document.querySelector(sel);
const uid = () => (crypto.randomUUID ? crypto.randomUUID() :
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16);
  }));
const nowIso = () => new Date().toISOString();
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const fmtDur = s => { s = Math.max(0, Math.round(s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const fmtDay = iso => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
const fmtDayTime = iso => new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
function ago(iso) {
  const d = (Date.now() - new Date(iso)) / 1000;
  if (d < 60) return "à l'instant";
  if (d < 3600) return `il y a ${Math.floor(d / 60)} min`;
  if (d < 86400) return `il y a ${Math.floor(d / 3600)} h`;
  if (d < 86400 * 30) return `il y a ${Math.floor(d / 86400)} j`;
  return fmtDay(iso);
}
const plural = (n, w) => `${n} ${w}${n > 1 ? 's' : ''}`;

const ICONS = {
  play: '<svg viewBox="0 0 24 24"><path d="M7 4.5v15l13-7.5z" fill="currentColor"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><path d="M6 4h4v16H6zM14 4h4v16h-4z" fill="currentColor"/></svg>',
  star: '<svg viewBox="0 0 24 24"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  starFull: '<svg viewBox="0 0 24 24"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" fill="currentColor"/></svg>',
  more: '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.8" fill="currentColor"/><circle cx="12" cy="12" r="1.8" fill="currentColor"/><circle cx="19" cy="12" r="1.8" fill="currentColor"/></svg>',
  playAll: '<svg viewBox="0 0 24 24"><path d="M4 6h10M4 12h10M4 18h6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M16 13v8l6-4z" fill="currentColor"/></svg>',
  grip: '<svg viewBox="0 0 14 24"><g fill="currentColor"><circle cx="4" cy="7" r="1.5"/><circle cx="10" cy="7" r="1.5"/><circle cx="4" cy="12" r="1.5"/><circle cx="10" cy="12" r="1.5"/><circle cx="4" cy="17" r="1.5"/><circle cx="10" cy="17" r="1.5"/></g></svg>',
};

// Instruments : une petite icône au trait sur chaque prise.
const ico = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const INSTRUMENTS = [
  { id: 'voix', label: 'Voix', icon: ico('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0013 0M12 17.5V21M9 21h6"/>') },
  { id: 'guitare', label: 'Guitare', icon: ico('<circle cx="8.5" cy="15.5" r="5"/><circle cx="8.5" cy="15.5" r="1.3"/><path d="M12 12l7.5-7.5M17.5 3l3.5 3.5"/>') },
  { id: 'basse', label: 'Basse', icon: ico('<path d="M5 8.5a4.5 4.5 0 119 0C14 14 10 17.5 5 20"/><circle cx="5.6" cy="8.5" r=".9" fill="currentColor"/><circle cx="18.5" cy="6.5" r=".9" fill="currentColor"/><circle cx="18.5" cy="11" r=".9" fill="currentColor"/>') },
  { id: 'clavier', label: 'Clavier', icon: ico('<rect x="3" y="6" width="18" height="12"/><path d="M7.5 6v12M12 6v12M16.5 6v12M9.75 6v6.5M14.25 6v6.5"/>') },
  { id: 'batterie', label: 'Batterie', icon: ico('<ellipse cx="12" cy="9" rx="8" ry="3"/><path d="M4 9v7c0 1.7 3.6 3 8 3s8-1.3 8-3V9M9 3l3 6M15 3l-3 6"/>') },
  { id: 'autre', label: 'Autre', icon: ico('<path d="M9 18V5.5l10-2V16"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>') },
];
const instrumentOf = id => INSTRUMENTS.find(i => i.id === id);
const lastInstrument = () => { try { return localStorage.getItem('fredon.instrument') || 'voix'; } catch { return 'voix'; } };
const rememberInstrument = id => { try { localStorage.setItem('fredon.instrument', id); } catch {} };
const lastName = () => { try { return localStorage.getItem('fredon.name') || ''; } catch { return ''; } };

// Qui suis-je, et qu'ai-je le droit de faire ? (Le serveur revérifie tout.)
const me = () => (S.store && S.store.user ? S.store.user.id : null);
const isCloud = () => !!(S.store && S.store.kind === 'cloud' && S.store.user);
const groupById = id => S.groups.find(g => g.id === id);
const membersOf = gid => S.members.filter(m => m.group_id === gid);
const myMember = gid => S.members.find(m => m.group_id === gid && m.user_id === me());
const isAdmin = gid => !!gid && myMember(gid)?.role === 'admin';
const isMine = row => !row.user_id || row.user_id === me();
const inScope = idea => (S.scope === 'me' ? !idea.group_id : idea.group_id === S.scope);
const visibleIdeas = () => S.ideas.filter(inScope);
const canDeleteIdea = idea => isMine(idea) || isAdmin(idea.group_id);

const ideaById = id => S.ideas.find(i => i.id === id);
const canDeleteTake = take => isMine(take) || isAdmin(ideaById(take.idea_id)?.group_id);
const takeById = id => S.takes.find(t => t.id === id);
const takesOf = ideaId => S.takes.filter(t => t.idea_id === ideaId).sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at));
const inboxTakes = () => (S.scope !== 'me' ? [] : S.takes.filter(t => (!t.idea_id || !ideaById(t.idea_id)) && isMine(t)).sort((a, b) => b.created_at.localeCompare(a.created_at)));
const ideaTitle = idea => idea.title || `Idée du ${fmtDay(idea.created_at)}`;
const allTags = () => [...new Set(visibleIdeas().flatMap(i => i.tags || []))].sort((a, b) => a.localeCompare(b, 'fr'));
const recentIdeas = () => visibleIdeas().sort((a, b) => b.updated_at.localeCompare(a.updated_at));
function hashOf(str) { let h = 7; for (const ch of String(str)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; }
const ideaColor = idea => (idea && idea.color) || PALETTE[hashOf(idea ? idea.id : '') % PALETTE.length];
const fmtLong = sec => (sec < 60 ? `${Math.round(sec)} s` : sec < 3600 ? `${Math.round(sec / 60)} min` : `${Math.floor(sec / 3600)} h ${String(Math.round(sec % 3600 / 60)).padStart(2, '0')}`);

// Forme d'onde : vraies crêtes si on les a, sinon un motif stable tiré de l'identifiant.
function wavePeaks(t) {
  if (Array.isArray(t.peaks) && t.peaks.length) return t.peaks;
  let h = hashOf(t.id);
  const out = [];
  for (let i = 0; i < WAVE_N; i++) {
    h = (h * 1664525 + 1013904223) >>> 0;
    const env = Math.sin(Math.PI * (i + .5) / WAVE_N);
    out.push(Math.round(14 + env * (22 + (h >>> 8) % 60)));
  }
  return out;
}
function waveSvg(t, cls) {
  const p = wavePeaks(t);
  return `<svg class="${cls}" viewBox="0 0 ${p.length * 4} 26" preserveAspectRatio="none" aria-hidden="true">${p.map((v, i) => {
    const h = Math.max(2, Math.min(100, v) / 100 * 26);
    return `<rect x="${i * 4 + .8}" y="${((26 - h) / 2).toFixed(1)}" width="2.4" height="${h.toFixed(1)}" rx="1.2" fill="currentColor"/>`;
  }).join('')}</svg>`;
}
async function computePeaks(blob) {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = new AC();
    const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
    ctx.close();
    const d = buf.getChannelData(0);
    const step = Math.max(1, Math.floor(d.length / WAVE_N));
    const stride = Math.max(1, Math.floor(step / 400));
    const raw = [];
    let max = 0;
    for (let i = 0; i < WAVE_N; i++) {
      let m = 0;
      for (let j = i * step; j < Math.min(d.length, (i + 1) * step); j += stride) { const v = Math.abs(d[j]); if (v > m) m = v; }
      raw.push(m);
      if (m > max) max = m;
    }
    return { peaks: raw.map(v => Math.round(v / (max || 1) * 100)), duration: buf.duration };
  } catch { return null; }
}

function nextPos(ideaId) {
  const list = takesOf(ideaId);
  return list.length ? list[list.length - 1].position + 1 : 0;
}

function toast(msg, action) {
  const t = $('#toast');
  t.innerHTML = `<span>${esc(msg)}</span>`;
  if (action) {
    const b = document.createElement('button');
    b.textContent = action.label;
    b.onclick = () => { t.hidden = true; action.fn(); };
    t.append(b);
  }
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { t.hidden = true; }, action ? 6000 : 3000);
}
function setStatus(msg) {
  const el = $('#status');
  el.hidden = !msg;
  el.textContent = msg || '';
}
function fail(e, what) {
  console.error(e);
  toast(`${what} : ${e?.message || e}`);
}

/* ---------------- Rendu ---------------- */
function matchesIdea(idea) {
  const f = S.filter;
  if (f.star && !idea.starred) return false;
  for (const t of f.tags) if (!(idea.tags || []).includes(t)) return false;
  if (f.q) {
    const q = norm(f.q);
    const hay = [idea.title, ideaTitle(idea), idea.notes, ...(idea.tags || []),
      ...takesOf(idea.id).flatMap(t => [t.title, t.notes])].map(norm).join(' ');
    if (!hay.includes(q)) return false;
  }
  return true;
}

function renderFilters() {
  const nav = $('#filters');
  const tags = allTags();
  const f = S.filter;
  nav.innerHTML =
    `<button class="chip star ${f.star ? 'on' : ''}" data-filter-star>favoris</button>` +
    tags.map(t => `<button class="chip ${f.tags.has(t) ? 'on' : ''}" data-filter-tag="${esc(t)}">${esc(t)}</button>`).join('');
  nav.hidden = !tags.length && !visibleIdeas().some(i => i.starred);
}

function takeHtml(t, index, inInbox) {
  const title = t.title || (inInbox ? `Vocal du ${fmtDayTime(t.created_at)}` : `Prise ${index + 1}`);
  const shared = !inInbox && ideaById(t.idea_id)?.group_id;
  const who = shared && t.author ? `${t.author} · ` : '';
  const meta = inInbox ? fmtDur(t.duration) : `${who}${fmtDay(t.created_at)} · ${fmtDur(t.duration)}`;
  const inst = instrumentOf(t.instrument);
  return `<li class="take" data-id="${t.id}">
    <button class="play" data-action="play" data-id="${t.id}" aria-label="Écouter"><span class="num">${String(index + 1).padStart(2, '0')}</span><span class="pi">${ICONS.play}</span></button>
    <div class="take-main">
      <div class="take-line">${inst ? `<span class="inst" data-inst="${inst.id}" title="${esc(inst.label)}">${inst.icon}</span>` : ''}<span class="take-title">${esc(title)}</span><span class="take-meta">${esc(meta)}</span></div>
      ${t.notes ? `<div class="take-note">${esc(t.notes)}</div>` : ''}
      <div class="wave" data-action="seek" data-id="${t.id}">${waveSvg(t, 'w-base')}${waveSvg(t, 'w-fill')}<i class="w-loop"></i></div>
      <div class="loopbar">
        <button class="txt-btn" data-action="loop" data-id="${t.id}">boucle</button>
        <button class="txt-btn" data-action="loop-a" data-id="${t.id}">début</button>
        <button class="txt-btn" data-action="loop-b" data-id="${t.id}">fin</button>
      </div>
    </div>
    <button class="mini-btn" data-action="take-menu" data-id="${t.id}" aria-label="Options de la prise">${ICONS.more}</button>
  </li>`;
}

function blockHtml(idea, list) {
  if (!idea) {
    return `<section class="block inbox" data-drop="inbox">
      <div class="block-head"><h3 class="block-title">À trier<span class="count">${list.length}</span></h3></div>
      <p class="block-sub">Glisser vers une idée. Au doigt : appui long.</p>
      <ol class="takes">${list.map((t, i) => takeHtml(t, i, true)).join('')}</ol>
    </section>`;
  }
  const tags = idea.tags || [];
  const total = list.reduce((sum, t) => sum + (t.duration || 0), 0);
  const sub = [list.length ? `${plural(list.length, 'prise')} · ${fmtDur(total)}` : 'vide', ago(idea.updated_at)].join(' · ');
  const music = [idea.bpm ? `${idea.bpm} bpm` : '', idea.tona || ''].filter(Boolean).join(' · ');
  return `<section class="block" data-drop="${idea.id}">
    <div class="block-head">
      <h3 class="block-title ${idea.title ? '' : 'placeholder'}" data-action="rename" data-idea="${idea.id}">${esc(ideaTitle(idea))}</h3>
      <button class="star ${idea.starred ? 'on' : ''}" data-action="star" data-idea="${idea.id}" aria-label="Favori">${idea.starred ? '★' : '☆'}</button>
      ${list.length > 1 ? `<button class="txt-btn" data-action="play-all" data-idea="${idea.id}">écouter</button>` : ''}
      <button class="mini-btn" data-action="idea-menu" data-idea="${idea.id}" aria-label="Options de l'idée">${ICONS.more}</button>
    </div>
    <p class="block-sub"><span>${esc(sub)}</span>${tags.map(t => `<span class="tag">#${esc(t)}</span>`).join('')}</p>
    ${music ? `<button class="tempo-chip" data-action="tempo" data-idea="${idea.id}" title="Modifier">${esc(music)}</button>` : ''}
    ${idea.chords ? `<div class="chords" data-action="tempo" data-idea="${idea.id}" title="Modifier">${esc(idea.chords)}</div>` : ''}
    ${idea.notes ? `<div class="lyrics" data-action="text" data-idea="${idea.id}" title="Modifier le texte">${esc(idea.notes)}</div>` : ''}
    <ol class="takes">${list.map((t, i) => takeHtml(t, i, false)).join('')}</ol>
    <div class="block-foot">
      <button class="add-take" data-action="record-into" data-idea="${idea.id}">+ enregistrer une suite</button>
      ${idea.notes ? '' : `<button class="add-take second" data-action="text" data-idea="${idea.id}">+ écrire un texte</button>`}
      ${music || idea.chords ? '' : `<button class="add-take second" data-action="tempo" data-idea="${idea.id}">+ tempo et tonalité</button>`}
    </div>
  </section>`;
}

function renderHero() {
  const hero = $('#hero');
  const ideas = visibleIdeas();
  const ids = new Set(ideas.map(i => i.id));
  const takes = S.takes.filter(t => ids.has(t.idea_id)).concat(inboxTakes());
  hero.hidden = !ideas.length && !takes.length;
  if (hero.hidden) return;
  const n = ideas.length;
  const t = takes.length;
  const total = takes.reduce((sum, x) => sum + (x.duration || 0), 0);
  hero.innerHTML = `<p><b>${n}</b> ${n > 1 ? 'idées' : 'idée'} · <b>${t}</b> ${t > 1 ? 'prises' : 'prise'} · <b>${fmtLong(total)}</b></p>`;
}

// Barre de choix : mes idées, ou celles d'un groupe.
function renderScopes() {
  const nav = $('#scopes');
  nav.hidden = !isCloud();
  if (nav.hidden) return;
  nav.innerHTML =
    `<button class="scope ${S.scope === 'me' ? 'on' : ''}" data-scope="me">Mes idées</button>` +
    S.groups.map(g => `<button class="scope ${S.scope === g.id ? 'on' : ''}" data-scope="${g.id}">${esc(g.name)}</button>`).join('') +
    '<button class="scope add" data-scope-add>+ groupe</button>' +
    (S.scope !== 'me' ? '<button class="txt-btn" data-scope-manage>membres</button>' : '');
}
function setScope(id) {
  S.scope = id === 'me' || groupById(id) ? id : 'me';
  try { localStorage.setItem('fredon.scope', S.scope); } catch {}
  S.filter.tags.clear();
  S.filter.star = false;
  render();
}

function render() {
  renderScopes();
  renderFilters();
  renderHero();
  const board = $('#board');
  const f = S.filter;
  let html = '';
  let inbox = inboxTakes();
  if (f.q) inbox = inbox.filter(t => norm(t.title || fmtDayTime(t.created_at)).includes(norm(f.q)));
  if (inbox.length && !f.star && !f.tags.size) html += blockHtml(null, inbox);
  const ideas = recentIdeas().filter(matchesIdea);
  html += ideas.map(i => blockHtml(i, takesOf(i.id))).join('');
  board.innerHTML = html;
  $('#empty').hidden = visibleIdeas().length > 0 || inboxTakes().length > 0;
  updatePlayUI();
}

/* ---------------- Lecture ---------------- */
const audio = new Audio();
audio.preload = 'auto';

// Boucle sur la prise en cours : toute la prise, ou un passage entre « début » et « fin ».
const LOOP = { id: null, on: false, a: null, b: null };
function resetLoop() { Object.assign(LOOP, { id: null, on: false, a: null, b: null }); }
function loopAction(action, id) {
  if (S.playing !== id) return;
  const now = audio.currentTime;
  const same = LOOP.id === id;
  if (action === 'loop') {
    if (same && LOOP.on) resetLoop();
    else Object.assign(LOOP, { id, on: true, a: null, b: null });
  } else if (action === 'loop-a') {
    Object.assign(LOOP, { id, on: true, a: now, b: same && LOOP.b != null && LOOP.b > now + .3 ? LOOP.b : null });
  } else if (action === 'loop-b') {
    const a = same && LOOP.a != null ? LOOP.a : 0;
    if (now - a < .3) { toast('Passage trop court : laisse jouer un peu avant de marquer la fin.'); return; }
    Object.assign(LOOP, { id, on: true, a, b: now });
    try { audio.currentTime = a; } catch {}
  }
  if (audio.paused && LOOP.on) audio.play();
  updateLoopUI();
}
function updateLoopUI() {
  document.querySelectorAll('.take').forEach(row => {
    const mine = LOOP.on && LOOP.id === row.dataset.id;
    const [bLoop, bA, bB] = row.querySelectorAll('.loopbar button');
    if (!bLoop) return;
    bLoop.classList.toggle('on', mine);
    bLoop.textContent = mine ? 'boucle ✓' : 'boucle';
    bA.classList.toggle('on', mine && LOOP.a != null);
    bA.textContent = mine && LOOP.a != null ? `début ${fmtDur(LOOP.a)}` : 'début';
    bB.classList.toggle('on', mine && LOOP.b != null);
    bB.textContent = mine && LOOP.b != null ? `fin ${fmtDur(LOOP.b)}` : 'fin';
    const zone = row.querySelector('.w-loop');
    const take = takeById(row.dataset.id);
    const total = take ? totalOf(take) : 0;
    if (zone) {
      const show = mine && total && (LOOP.a != null || LOOP.b != null);
      zone.style.display = show ? 'block' : 'none';
      if (show) {
        const a = (LOOP.a || 0) / total * 100;
        const b = (LOOP.b != null ? LOOP.b : total) / total * 100;
        zone.style.left = `${a}%`;
        zone.style.width = `${Math.max(.5, b - a)}%`;
      }
    }
  });
}
setInterval(() => {
  if (LOOP.on && LOOP.id === S.playing && LOOP.b != null && !audio.paused && audio.currentTime >= LOOP.b) {
    try { audio.currentTime = LOOP.a || 0; } catch {}
  }
}, 40);

async function play(id, queue = []) {
  if (S.playing === id) {
    if (audio.paused) audio.play(); else audio.pause();
    return;
  }
  const take = takeById(id);
  if (!take) return;
  resetLoop();
  try {
    S.playing = id;
    S.queue = queue;
    audio.src = await S.store.audioUrl(take);
    await audio.play();
  } catch (e) {
    S.playing = null;
    fail(e, 'Lecture impossible');
  }
  updatePlayUI();
}
function updatePlayUI() {
  document.querySelectorAll('.take').forEach(row => {
    const current = row.dataset.id === S.playing;
    const on = current && !audio.paused;
    row.classList.toggle('is-playing', on);
    row.classList.toggle('is-current', current);
    const pi = row.querySelector('.pi');
    if (pi) pi.innerHTML = on ? ICONS.pause : ICONS.play;
    if (!current) { const f = row.querySelector('.w-fill'); if (f) f.style.clipPath = ''; }
  });
  updateLoopUI();
}
function totalOf(take) {
  return isFinite(audio.duration) && audio.duration > 0 ? audio.duration : take.duration;
}
async function seek(id, ratio) {
  const take = takeById(id);
  if (!take) return;
  if (S.playing !== id) await play(id);
  else if (audio.paused) audio.play();
  const total = totalOf(take);
  if (total) { try { audio.currentTime = ratio * total; } catch {} }
}
audio.addEventListener('play', updatePlayUI);
audio.addEventListener('pause', updatePlayUI);
audio.addEventListener('timeupdate', () => {
  const take = takeById(S.playing);
  if (!take) return;
  const total = totalOf(take);
  if (!total) return;
  const pct = Math.min(100, audio.currentTime / total * 100);
  document.querySelectorAll(`.take[data-id="${S.playing}"] .w-fill`).forEach(f => { f.style.clipPath = `inset(0 ${100 - pct}% 0 0)`; });
});
audio.addEventListener('ended', () => {
  if (LOOP.on && LOOP.id === S.playing) { // en boucle : on repart du début du passage
    try { audio.currentTime = LOOP.a || 0; } catch {}
    audio.play();
    return;
  }
  const next = S.queue.shift();
  S.playing = null;
  if (next) play(next, S.queue); else updatePlayUI();
});

/* ---------------- Feuilles (menus, formulaires) ---------------- */
let sheetClose = null;
function openSheet(html, mount) {
  const bd = $('#sheetBackdrop');
  const sh = $('#sheet');
  sh.innerHTML = html;
  bd.hidden = false;
  return new Promise(resolve => {
    let done = false;
    const close = value => {
      if (done) return;
      done = true;
      bd.hidden = true;
      sh.innerHTML = '';
      sheetClose = null;
      resolve(value);
    };
    sheetClose = close;
    bd.onclick = e => { if (e.target === bd) close(undefined); };
    mount && mount(sh, close);
  });
}
document.addEventListener('keydown', e => { if (e.key === 'Escape' && sheetClose) sheetClose(undefined); });

function promptText(title, value = '', { multiline = false, placeholder = '' } = {}) {
  const field = multiline
    ? `<textarea class="field" id="pt" placeholder="${esc(placeholder)}">${esc(value)}</textarea>`
    : `<input class="field" id="pt" value="${esc(value)}" placeholder="${esc(placeholder)}" autocomplete="off">`;
  return openSheet(`<h2>${esc(title)}</h2>${field}
    <div class="row"><button class="btn" data-x>Annuler</button><button class="btn primary" data-ok>OK</button></div>`,
  (sh, close) => {
    const f = sh.querySelector('#pt');
    setTimeout(() => { f.focus(); if (!multiline) f.select(); }, 50);
    sh.querySelector('[data-x]').onclick = () => close(null);
    sh.querySelector('[data-ok]').onclick = () => close(f.value.trim());
    if (!multiline) f.onkeydown = e => { if (e.key === 'Enter') close(f.value.trim()); };
  });
}

function confirmBox(title, text, okLabel = 'Confirmer') {
  return openSheet(`<h2>${esc(title)}</h2><p class="sub">${esc(text)}</p>
    <div class="row"><button class="btn" data-x>Annuler</button><button class="btn primary" data-ok>${esc(okLabel)}</button></div>`,
  (sh, close) => {
    sh.querySelector('[data-x]').onclick = () => close(false);
    sh.querySelector('[data-ok]').onclick = () => close(true);
  });
}

function actionSheet(title, items) {
  return openSheet(`<h2>${esc(title)}</h2><div class="choices">${items.map((it, i) =>
    `<button class="choice ${it.cls || ''}" data-i="${i}"><span class="ico">${it.ico || '•'}</span><span>${esc(it.label)}${it.sub ? `<small>${esc(it.sub)}</small>` : ''}</span></button>`).join('')}</div>`,
  (sh, close) => sh.querySelectorAll('[data-i]').forEach(b => { b.onclick = () => close(items[+b.dataset.i].value); }));
}

function pickIdea(title, { exclude = null, allowNew = true, allowInbox = false } = {}) {
  const list = recentIdeas().filter(i => i.id !== exclude);
  const listHtml = () => list.map(i =>
    `<button class="choice" style="--c:${ideaColor(i)}" data-pick="${i.id}" data-q="${esc(norm(ideaTitle(i) + ' ' + (i.tags || []).join(' ')))}"><span class="ico">↳</span><span>${esc(ideaTitle(i))}<small>${plural(takesOf(i.id).length, 'prise')} · ${ago(i.updated_at)}</small></span></button>`).join('');
  return openSheet(`<h2>${esc(title)}</h2>
    ${list.length > 6 ? '<input class="field" id="pq" placeholder="Filtrer…" autocomplete="off" style="margin-bottom:8px">' : ''}
    <div class="choices">
      ${allowNew ? '<button class="choice primary" data-pick="new"><span class="ico">+</span><span>Nouvelle idée</span></button>' : ''}
      ${allowInbox ? '<button class="choice" data-pick="inbox"><span class="ico">⏱</span><span>À trier</span></button>' : ''}
      ${listHtml()}
    </div>`,
  (sh, close) => {
    sh.querySelectorAll('[data-pick]').forEach(b => { b.onclick = () => close(b.dataset.pick); });
    const pq = sh.querySelector('#pq');
    if (pq) pq.oninput = () => {
      const q = norm(pq.value);
      sh.querySelectorAll('[data-q]').forEach(b => { b.hidden = !b.dataset.q.includes(q); });
    };
  });
}

function tagChipsHtml(selected) {
  const tags = [...new Set([...TAG_PRESETS, ...allTags(), ...selected])];
  return tags.map(t => `<button class="chip ${selected.includes(t) ? 'on' : ''}" data-tag="${esc(t)}">${esc(t)}</button>`).join('') +
    '<button class="chip" data-tag-new>+ autre</button>';
}
function wireTagPicker(root, selected) {
  const box = root.querySelector('.tag-picker');
  const redraw = () => { box.innerHTML = tagChipsHtml(selected); };
  box.onclick = async e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.hasAttribute('data-tag-new')) {
      const name = prompt('Nouvelle étiquette :');
      if (name && name.trim()) { const v = name.trim().toLowerCase(); if (!selected.includes(v)) selected.push(v); redraw(); }
      return;
    }
    const t = b.dataset.tag;
    const i = selected.indexOf(t);
    if (i >= 0) selected.splice(i, 1); else selected.push(t);
    b.classList.toggle('on');
  };
  redraw();
}

/* ---------------- Données : opérations ---------------- */
function newIdea(fields = {}) {
  const t = nowIso();
  const idea = { id: uid(), title: '', tags: [], starred: false, notes: '', color: '', created_at: t, updated_at: t, ...fields };
  if (isCloud()) idea.group_id = S.scope === 'me' ? null : S.scope; // créée dans le groupe affiché
  return idea;
}
async function saveIdea(idea) {
  if (!S.ideas.includes(idea)) S.ideas.push(idea);
  await S.store.saveIdea(idea);
}
async function touchIdea(idea) {
  if (!idea) return;
  idea.updated_at = nowIso();
  await S.store.saveIdea(idea);
}

async function moveTake(id, target) {
  const take = takeById(id);
  if (!take) return;
  const before = { idea_id: take.idea_id, position: take.position };
  let createdIdea = null;
  let ideaId;
  try {
    if (target.drop === 'new') {
      createdIdea = newIdea();
      await saveIdea(createdIdea);
      ideaId = createdIdea.id;
    } else ideaId = target.drop === 'inbox' ? null : target.drop;

    const sibs = takesOf(ideaId).filter(t => t.id !== id);
    let pos;
    const ref = target.refId ? sibs.findIndex(t => t.id === target.refId) : -1;
    if (ref >= 0) {
      const r = sibs[ref];
      if (target.before) { const p = sibs[ref - 1]; pos = p ? (p.position + r.position) / 2 : r.position - 1; }
      else { const n = sibs[ref + 1]; pos = n ? (r.position + n.position) / 2 : r.position + 1; }
    } else pos = sibs.length ? sibs[sibs.length - 1].position + 1 : 0;

    if (ideaId === take.idea_id && ref < 0 && target.drop !== 'new') return; // lâché dans son propre bloc sans position précise
    take.idea_id = ideaId;
    take.position = pos;
    render();
    await S.store.saveTake(take);
    await touchIdea(ideaById(ideaId));
    render();
    const dest = ideaId ? `« ${ideaTitle(ideaById(ideaId))} »` : 'À trier';
    toast(before.idea_id === ideaId ? 'Ordre modifié' : `Déplacé vers ${dest}`, {
      label: 'Annuler',
      fn: async () => {
        take.idea_id = before.idea_id;
        take.position = before.position;
        await S.store.saveTake(take);
        if (createdIdea) { S.ideas = S.ideas.filter(i => i !== createdIdea); await S.store.deleteIdea(createdIdea.id); }
        render();
      },
    });
    if (createdIdea) {
      const name = await promptText('Nom de la nouvelle idée', '', { placeholder: 'Ex : balade en La mineur' });
      if (name) { createdIdea.title = name; await S.store.saveIdea(createdIdea); render(); }
    }
  } catch (e) {
    fail(e, 'Déplacement impossible');
    await reload();
  }
}

async function commitTake(rec, dest, name, tags) {
  let idea = null;
  if (dest === 'new') {
    idea = newIdea({ title: name, tags: [...tags] });
    await saveIdea(idea);
  } else if (dest && dest !== 'inbox') {
    idea = ideaById(dest);
    if (idea && tags.length) idea.tags = [...new Set([...(idea.tags || []), ...tags])];
  }
  const take = {
    id: uid(),
    idea_id: idea ? idea.id : null,
    title: dest === 'new' ? '' : name,
    notes: '',
    duration: rec.duration,
    mime: rec.mime,
    path: '',
    position: idea ? nextPos(idea.id) : 0,
    created_at: nowIso(),
    instrument: rec.instrument || lastInstrument(),
  };
  if (isCloud()) take.author = idea && idea.group_id ? (myMember(idea.group_id)?.name || '') : '';
  if (!rec.info) rec.info = await computePeaks(rec.blob);
  take.peaks = rec.info ? rec.info.peaks : [];
  await S.store.saveTake(take, rec.blob);
  S.takes.push(take);
  if (idea && rec.bpm && !idea.bpm) idea.bpm = rec.bpm; // enregistrée au métronome : l'idée garde ce tempo
  if (idea) await touchIdea(idea);
  render();
  toast(idea ? `Rangé dans « ${ideaTitle(idea)} »` : 'Rangé dans « À trier »');
}

/* ---------------- Métronome ---------------- */
const METRO = { ctx: null, timer: null, bpm: 90, beat: 0, next: 0 };
const clampBpm = v => Math.max(30, Math.min(300, Math.round(Number(v) || 0)));
const savedBpm = () => { try { return clampBpm(localStorage.getItem('fredon.bpm') || 90); } catch { return 90; } };
const savedMetro = () => { try { return localStorage.getItem('fredon.metro') === '1'; } catch { return false; } };
function metroClick(ctx, t, accent) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.frequency.value = accent ? 1600 : 1000;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(accent ? .6 : .4, t + .002);
  g.gain.exponentialRampToValueAtTime(0.0001, t + .05);
  o.connect(g).connect(ctx.destination);
  o.start(t);
  o.stop(t + .06);
}
function startMetro(bpm) {
  stopMetro();
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  if (!METRO.ctx) METRO.ctx = new AC();
  const ctx = METRO.ctx;
  if (ctx.state === 'suspended') ctx.resume();
  METRO.bpm = clampBpm(bpm);
  METRO.beat = 0;
  METRO.next = ctx.currentTime + .08;
  // On programme les clics un peu en avance : le rythme reste régulier même si la page rame.
  METRO.timer = setInterval(() => {
    while (METRO.next < ctx.currentTime + .12) {
      metroClick(ctx, METRO.next, METRO.beat % 4 === 0);
      METRO.next += 60 / METRO.bpm;
      METRO.beat++;
    }
  }, 25);
}
function stopMetro() { clearInterval(METRO.timer); METRO.timer = null; }
// « Taper le tempo » : la moyenne des derniers écarts entre deux appuis.
function makeTapper() {
  let taps = [];
  return () => {
    const now = performance.now();
    if (taps.length && now - taps[taps.length - 1] > 2000) taps = [];
    taps.push(now);
    if (taps.length > 7) taps.shift();
    if (taps.length < 2) return null;
    return clampBpm(60000 / ((taps[taps.length - 1] - taps[0]) / (taps.length - 1)));
  };
}

function syncMetroUI() {
  $('#metroToggle').textContent = REC.metro ? 'métronome ✓' : 'métronome';
  $('#metroToggle').classList.toggle('on', !!REC.metro);
  $('#metroBpm').textContent = `${REC.bpm} bpm`;
  $('#metroHint').hidden = !REC.metro;
}
function setRecBpm(bpm) {
  REC.bpm = clampBpm(bpm);
  try { localStorage.setItem('fredon.bpm', REC.bpm); } catch {}
  if (REC.metro) METRO.bpm = REC.bpm;
  syncMetroUI();
}
function toggleRecMetro() {
  if (!REC.recorder) return;
  REC.metro = !REC.metro;
  try { localStorage.setItem('fredon.metro', REC.metro ? '1' : '0'); } catch {}
  if (REC.metro) { REC.metroUsed = true; startMetro(REC.bpm); } else stopMetro();
  syncMetroUI();
}

// Tempo, tonalité et accords d'une idée.
async function editTempo(idea) {
  let bpm = idea.bpm || '';
  let tona = idea.tona || '';
  let chords = idea.chords || '';
  const v = await openSheet(`
    <h2>Tempo et tonalité</h2>
    <p class="sub">${esc(ideaTitle(idea))}</p>
    <label class="label" for="tBpm">Tempo (bpm)</label>
    <div class="tempo-row">
      <input class="field" id="tBpm" type="number" inputmode="numeric" min="30" max="300" placeholder="Ex : 92" value="${esc(bpm)}">
      <button class="btn" data-tap>Taper</button>
      <button class="btn" data-click>Clic</button>
    </div>
    <p class="hint">« Taper » : appuie en rythme pour trouver le tempo. « Clic » fait entendre le métronome.</p>
    <label class="label" for="tKey">Tonalité</label>
    <input class="field" id="tKey" placeholder="Ex : La mineur" autocomplete="off" maxlength="30" value="${esc(tona)}">
    <label class="label" for="tChords">Accords</label>
    <input class="field" id="tChords" placeholder="Ex : Am  F  C  G" autocomplete="off" maxlength="120" value="${esc(chords)}">
    <div class="row"><button class="btn" data-x>Annuler</button><button class="btn primary" data-ok>Enregistrer</button></div>`,
  (sh, close) => {
    const iBpm = sh.querySelector('#tBpm');
    const bClick = sh.querySelector('[data-click]');
    const tap = makeTapper();
    iBpm.oninput = () => { bpm = iBpm.value; if (METRO.timer && clampBpm(bpm) >= 30) METRO.bpm = clampBpm(bpm); };
    sh.querySelector('#tKey').oninput = e => { tona = e.target.value; };
    sh.querySelector('#tChords').oninput = e => { chords = e.target.value; };
    sh.querySelector('[data-tap]').onclick = () => {
      const t = tap();
      if (t) { bpm = t; iBpm.value = t; if (METRO.timer) METRO.bpm = t; }
    };
    bClick.onclick = () => {
      if (METRO.timer) { stopMetro(); bClick.textContent = 'Clic'; return; }
      if (!Number(bpm)) { toast("Indique d'abord un tempo."); return; }
      startMetro(bpm);
      bClick.textContent = 'Stop';
    };
    sh.querySelector('[data-x]').onclick = () => close('cancel');
    sh.querySelector('[data-ok]').onclick = () => close('ok');
  });
  stopMetro();
  if (v !== 'ok') return;
  const before = { bpm: idea.bpm, tona: idea.tona, chords: idea.chords };
  idea.bpm = Number(bpm) ? clampBpm(bpm) : null;
  idea.tona = tona.trim();
  idea.chords = chords.trim();
  render();
  try { await touchIdea(idea); render(); toast('Enregistré'); }
  catch (e) { Object.assign(idea, before); render(); fail(e, 'Non enregistré'); }
}

/* ---------------- Enregistrement ---------------- */
const REC = {};

function pickMime() {
  if (!window.MediaRecorder) return null;
  const c = ['audio/webm;codecs=opus', 'audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus'];
  return c.find(m => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)) || '';
}

async function startRecording(targetIdeaId = null) {
  if (REC.recorder) return;
  const mime = pickMime();
  if (mime === null || !navigator.mediaDevices?.getUserMedia) {
    toast("Ce navigateur ne permet pas d'enregistrer (il faut une page en https).");
    return;
  }
  let stream;
  try {
    // Pas de réduction de bruit ni d'annulation d'écho : on garde le son de la voix tel quel.
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true },
    });
  } catch (e) {
    toast('Micro inaccessible : autorise le micro pour cette page.');
    return;
  }
  const recorder = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 96000 } : undefined);
  Object.assign(REC, { recorder, stream, chunks: [], start: Date.now(), target: targetIdeaId, cancelled: false, levels: [] });
  recorder.ondataavailable = e => { if (e.data && e.data.size) REC.chunks.push(e.data); };
  recorder.onstop = onRecordingStopped;
  recorder.start(1000);

  try { REC.wake = await navigator.wakeLock?.request('screen'); } catch {}

  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    REC.ctx = new AC();
    const src = REC.ctx.createMediaStreamSource(stream);
    REC.analyser = REC.ctx.createAnalyser();
    REC.analyser.fftSize = 1024;
    src.connect(REC.analyser);
  } catch {}

  const idea = ideaById(targetIdeaId);
  $('#recTarget').textContent = idea ? `Suite de « ${ideaTitle(idea)} »` : '';
  REC.bpm = (idea && idea.bpm) || savedBpm();
  REC.metro = savedMetro();
  REC.metroUsed = REC.metro;
  syncMetroUI();
  if (REC.metro) startMetro(REC.bpm);
  $('#recOverlay').hidden = false;
  tickRecording();
}

function tickRecording() {
  if (!REC.recorder) return;
  const sec = (Date.now() - REC.start) / 1000;
  $('#recTime').textContent = fmtDur(Math.floor(sec));
  const cv = $('#levels');
  const g = cv.getContext('2d');
  let level = 0;
  if (REC.analyser) {
    const buf = new Uint8Array(REC.analyser.fftSize);
    REC.analyser.getByteTimeDomainData(buf);
    let sum = 0;
    for (const v of buf) { const x = (v - 128) / 128; sum += x * x; }
    level = Math.min(1, Math.sqrt(sum / buf.length) * 4);
  }
  REC.peak = Math.max(REC.peak || 0, level);
  if (!REC.lastTick || Date.now() - REC.lastTick >= 50) { REC.levels.push(REC.peak); REC.peak = 0; REC.lastTick = Date.now(); }
  const n = 180;
  if (REC.levels.length > n) REC.levels.shift();
  g.clearRect(0, 0, cv.width, cv.height);
  g.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#7c6cff';
  const bw = cv.width / n;
  const off = (n - REC.levels.length) * bw;
  REC.levels.forEach((l, i) => {
    const h = Math.max(2, l * cv.height * .92);
    g.fillRect(Math.round(off + i * bw), (cv.height - h) / 2, 3, h);
  });
  REC.raf = requestAnimationFrame(tickRecording);
}

function stopRecording(cancel = false) {
  if (!REC.recorder) return;
  REC.cancelled = cancel;
  REC.duration = (Date.now() - REC.start) / 1000;
  if (REC.recorder.state !== 'inactive') REC.recorder.stop();
}

function onRecordingStopped() {
  cancelAnimationFrame(REC.raf);
  stopMetro();
  REC.stream.getTracks().forEach(t => t.stop());
  try { REC.ctx && REC.ctx.close(); } catch {}
  try { REC.wake && REC.wake.release(); } catch {}
  $('#recOverlay').hidden = true;
  const type = REC.recorder.mimeType || REC.chunks[0]?.type || 'audio/webm';
  const result = { blob: new Blob(REC.chunks, { type }), duration: REC.duration, mime: type.split(';')[0], bpm: REC.metroUsed ? REC.bpm : null };
  const { cancelled, target } = REC;
  for (const k of Object.keys(REC)) delete REC[k];
  if (cancelled) return;
  if (result.duration < 0.6 || !result.blob.size) { toast('Prise trop courte, ignorée.'); return; }
  openSaveSheet(result, target);
}

// Rangement d'une prise qui vient d'être enregistrée.
// Une seule question par écran : 1) nouvelle idée ou suite ? 2) son nom, ou laquelle.
async function openSaveSheet(rec, target) {
  const save = async (dest, name = '', tags = []) => {
    toast('Envoi…');
    try { await commitTake(rec, dest, name, tags); return true; }
    catch (e) { fail(e, 'Enregistrement impossible, réessaie'); return false; }
  };

  // Enregistrée depuis « + enregistrer une suite » : on sait déjà où elle va.
  if (ideaById(target) && await save(target)) return;

  const url = URL.createObjectURL(rec.blob);
  const preview = new Audio(url);
  const done = () => { preview.pause(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
  const hasIdeas = visibleIdeas().length > 0;
  rec.instrument = rec.instrument || lastInstrument();
  let step = 'ask';

  for (;;) {
    if (step === 'ask') {
      const v = await openSheet(`
        <h2>Prise enregistrée</h2>
        <p class="sub">${fmtDur(rec.duration)} · <button class="txt-btn accent" data-replay>réécouter</button></p>
        <div class="inst-picker">${INSTRUMENTS.map(i =>
          `<button class="inst-btn ${i.id === rec.instrument ? 'on' : ''}" data-inst="${i.id}">${i.icon}<span>${i.label}</span></button>`).join('')}</div>
        <p class="ask">Cette prise, c'est…</p>
        <button class="big-choice" data-go="new"><b>Une nouvelle idée</b><span>Le début de quelque chose de nouveau.</span></button>
        ${hasIdeas ? '<button class="big-choice" data-go="suite"><b>La suite d\'une idée</b><span>Elle s’ajoute à une idée que tu as déjà.</span></button>' : ''}
        <div class="sheet-foot">
          <button class="txt-btn" data-go="later">je décide plus tard</button>
          <button class="txt-btn danger" data-go="discard">supprimer</button>
        </div>`,
      (sh, close) => {
        const replay = sh.querySelector('[data-replay]');
        replay.onclick = () => { if (preview.paused) { preview.currentTime = 0; preview.play(); } else preview.pause(); };
        preview.onplay = () => { replay.textContent = 'pause'; };
        preview.onpause = preview.onended = () => { replay.textContent = 'réécouter'; };
        sh.querySelectorAll('[data-go]').forEach(btn => { btn.onclick = () => close(btn.dataset.go); });
        sh.querySelectorAll('[data-inst]').forEach(btn => {
          btn.onclick = () => {
            rec.instrument = btn.dataset.inst;
            rememberInstrument(rec.instrument);
            sh.querySelectorAll('[data-inst]').forEach(x => x.classList.toggle('on', x === btn));
          };
        });
      });
      preview.pause();
      if (v === 'new' || v === 'suite') { step = v; continue; }
      if (v === 'discard') {
        if (await confirmBox('Supprimer cette prise ?', 'Elle ne sera pas gardée.', 'Supprimer')) { done(); return; }
        continue;
      }
      // « plus tard », ou panneau fermé : la prise n'est jamais perdue, elle va dans « À trier ».
      if (await save('inbox')) { done(); return; }
      continue;
    }

    if (step === 'new') {
      const tags = [];
      const v = await openSheet(`
        <h2>Nouvelle idée</h2>
        <label class="label" for="ideaName">Son nom</label>
        <input class="field" id="ideaName" placeholder="Ex : balade en La mineur" autocomplete="off">
        <p class="hint">Tu peux le laisser vide et la nommer plus tard.</p>
        <label class="label">Étiquettes (facultatif)</label>
        <div class="tag-picker"></div>
        <div class="row"><button class="btn" data-back>Retour</button><button class="btn primary" data-ok>Enregistrer</button></div>`,
      (sh, close) => {
        wireTagPicker(sh, tags);
        const f = sh.querySelector('#ideaName');
        const ok = () => close({ name: f.value.trim() });
        sh.querySelector('[data-ok]').onclick = ok;
        sh.querySelector('[data-back]').onclick = () => close('back');
        f.onkeydown = e => { if (e.key === 'Enter') ok(); };
      });
      if (v && typeof v === 'object') {
        if (await save('new', v.name, tags)) { done(); return; }
        continue;
      }
      step = 'ask';
      continue;
    }

    if (step === 'suite') {
      const list = recentIdeas();
      const v = await openSheet(`
        <h2>La suite de quelle idée ?</h2>
        <p class="sub">Touche l'idée : la prise s'ajoute à la fin.</p>
        ${list.length > 6 ? '<input class="field" id="pq" placeholder="Filtrer" autocomplete="off" style="margin-top:14px">' : ''}
        <div class="choices">${list.map(i =>
          `<button class="choice" data-pick="${i.id}" data-q="${esc(norm(ideaTitle(i) + ' ' + (i.tags || []).join(' ')))}"><span>${esc(ideaTitle(i))}<small>${plural(takesOf(i.id).length, 'prise')} · ${ago(i.updated_at)}</small></span></button>`).join('')}</div>
        <div class="sheet-foot"><button class="txt-btn" data-back>retour</button></div>`,
      (sh, close) => {
        sh.querySelectorAll('[data-pick]').forEach(btn => { btn.onclick = () => close(btn.dataset.pick); });
        sh.querySelector('[data-back]').onclick = () => close('back');
        const pq = sh.querySelector('#pq');
        if (pq) pq.oninput = () => {
          const q = norm(pq.value);
          sh.querySelectorAll('[data-q]').forEach(btn => { btn.hidden = !btn.dataset.q.includes(q); });
        };
      });
      if (v && v !== 'back' && ideaById(v)) {
        if (await save(v)) { done(); return; }
        continue;
      }
      step = 'ask';
      continue;
    }
  }
}

/* ---------------- Menus ---------------- */
async function ideaMenu(idea) {
  const group = groupById(idea.group_id);
  const v = await actionSheet(ideaTitle(idea), [
    { label: 'Renommer', ico: '✎', value: 'rename' },
    { label: 'Étiquettes', ico: '#', value: 'tags', sub: (idea.tags || []).join(', ') },
    { label: idea.notes ? 'Modifier le texte' : 'Écrire un texte', ico: '¶', value: 'notes', sub: 'Paroles, accords, notes' },
    { label: 'Tempo et tonalité', ico: '♩', value: 'tempo', sub: [idea.bpm ? `${idea.bpm} bpm` : '', idea.tona || '', idea.chords || ''].filter(Boolean).join(' · ') },
    { label: idea.starred ? 'Retirer des favoris' : 'Ajouter aux favoris', ico: '★', value: 'star' },
    isCloud() && !group && S.groups.length && isMine(idea) && { label: 'Partager avec un groupe', value: 'share', sub: 'Les membres pourront écouter et ajouter' },
    group && isMine(idea) && { label: `Retirer de « ${group.name} »`, value: 'unshare', sub: 'Elle redevient personnelle' },
    { label: 'Fusionner avec une autre idée', ico: '⇄', value: 'merge', sub: 'Déplace toutes ses prises' },
    canDeleteIdea(idea) && { label: "Supprimer l'idée", ico: '✕', value: 'delete', cls: 'danger', sub: group ? 'Chaque prise retourne chez son auteur' : 'Ses prises retournent dans « À trier »' },
  ].filter(Boolean));
  try {
    if (v === 'rename') return renameIdea(idea);
    if (v === 'tempo') return editTempo(idea);
    if (v === 'star') { idea.starred = !idea.starred; render(); return S.store.saveIdea(idea); }
    if (v === 'color') {
      const cur = ideaColor(idea);
      const c = await openSheet(`<h2>Couleur de l'idée</h2><div class="swatches">${PALETTE.map(col =>
        `<button class="swatch ${col === cur ? 'on' : ''}" style="--c:${col}" data-col="${col}" aria-label="Couleur ${col}"></button>`).join('')}</div>`,
      (sh, close) => sh.querySelectorAll('[data-col]').forEach(b => { b.onclick = () => close(b.dataset.col); }));
      if (c) { idea.color = c; render(); await S.store.saveIdea(idea); }
    }
    if (v === 'notes') return editText(idea);
    if (v === 'share') {
      const gid = S.groups.length === 1 ? S.groups[0].id : await actionSheet('Partager avec…', S.groups.map(g => ({ label: g.name, value: g.id })));
      const g = groupById(gid);
      if (!g) return;
      if (!(await confirmBox(`Partager avec « ${g.name} » ?`, 'Tous les membres pourront écouter cette idée, y ajouter des prises et modifier son texte.', 'Partager'))) return;
      idea.group_id = g.id;
      const name = myMember(g.id)?.name || '';
      for (const t of takesOf(idea.id)) if (isMine(t) && !t.author) { t.author = name; await S.store.saveTake(t); }
      await touchIdea(idea);
      render();
      toast(`Partagée avec « ${g.name} »`);
    }
    if (v === 'unshare') {
      idea.group_id = null;
      await S.store.saveIdea(idea);
      await reload();
      toast('Idée redevenue personnelle');
    }
    if (v === 'tags') {
      const sel = [...(idea.tags || [])];
      const ok = await openSheet(`<h2>Étiquettes</h2><div class="tag-picker"></div>
        <div class="row"><button class="btn" data-x>Annuler</button><button class="btn primary" data-ok>OK</button></div>`,
      (sh, close) => {
        wireTagPicker(sh, sel);
        sh.querySelector('[data-x]').onclick = () => close(false);
        sh.querySelector('[data-ok]').onclick = () => close(true);
      });
      if (ok) { idea.tags = sel; await S.store.saveIdea(idea); render(); }
    }
    if (v === 'merge') {
      const dest = await pickIdea(`Fusionner « ${ideaTitle(idea)} » dans…`, { exclude: idea.id, allowNew: false });
      if (!dest) return;
      const target = ideaById(dest);
      let pos = nextPos(dest);
      for (const t of takesOf(idea.id)) { t.idea_id = dest; t.position = pos++; await S.store.saveTake(t); }
      target.tags = [...new Set([...(target.tags || []), ...(idea.tags || [])])];
      if (idea.notes) target.notes = [target.notes, idea.notes].filter(Boolean).join('\n\n');
      await touchIdea(target);
      S.ideas = S.ideas.filter(i => i !== idea);
      await S.store.deleteIdea(idea.id);
      render();
      toast(`Fusionné dans « ${ideaTitle(target)} »`);
    }
    if (v === 'delete') {
      const n = takesOf(idea.id).length;
      const where = idea.group_id ? 'chez leurs auteurs, dans « À trier »' : 'dans « À trier »';
      if (!(await confirmBox("Supprimer l'idée ?", n ? `Ses ${plural(n, 'prise')} retourneront ${where}.` : 'Elle est vide.', 'Supprimer'))) return;
      // Dans un groupe, le serveur détache lui-même les prises des autres membres.
      if (!idea.group_id) for (const t of takesOf(idea.id)) { t.idea_id = null; await S.store.saveTake(t); }
      S.ideas = S.ideas.filter(i => i !== idea);
      await S.store.deleteIdea(idea.id);
      if (idea.group_id) await reload(); else render();
    }
  } catch (e) { fail(e, 'Action impossible'); await reload(); }
}

// Texte attaché à une idée (paroles, accords, notes). Il n'est jamais perdu :
// fermer le panneau autrement que par « Annuler » l'enregistre.
async function editText(idea) {
  const ids = takesOf(idea.id).map(t => t.id);
  let draft = idea.notes || '';
  const v = await openSheet(`
    <div class="editor-head">
      <button class="txt-btn" data-x>annuler</button>
      ${ids.length ? '<button class="txt-btn accent" data-listen>écouter</button>' : ''}
      <button class="btn primary" data-ok>Enregistrer</button>
    </div>
    <h2>Texte</h2>
    <p class="sub">${esc(ideaTitle(idea))}</p>
    <textarea class="field editor" placeholder="Paroles, accords, idées…">${esc(draft)}</textarea>`,
  (sh, close) => {
    const area = sh.querySelector('.editor');
    area.oninput = () => { draft = area.value; };
    if (!draft) setTimeout(() => area.focus(), 80);
    sh.querySelector('[data-x]').onclick = () => close('cancel');
    sh.querySelector('[data-ok]').onclick = () => close('ok');
    const listen = sh.querySelector('[data-listen]');
    if (listen) {
      const sync = () => { listen.textContent = ids.includes(S.playing) && !audio.paused ? 'pause' : 'écouter'; };
      listen.onclick = () => {
        if (ids.includes(S.playing)) { if (audio.paused) audio.play(); else audio.pause(); }
        else play(ids[0], ids.slice(1));
        setTimeout(sync, 300);
      };
      sync();
    }
  });
  if (v === 'cancel') return;
  const text = draft.replace(/\s+$/, '');
  if (text === (idea.notes || '')) return;
  idea.notes = text;
  render();
  try { await touchIdea(idea); render(); toast('Texte enregistré'); }
  catch (e) { fail(e, 'Texte non enregistré'); }
}

async function renameIdea(idea) {
  const name = await promptText("Nom de l'idée", idea.title, { placeholder: 'Ex : balade en La mineur' });
  if (name === null || name === undefined) return;
  idea.title = name;
  render();
  try { await S.store.saveIdea(idea); } catch (e) { fail(e, 'Renommage impossible'); }
}

async function takeMenu(take) {
  const v = await actionSheet(take.title || 'Prise', [
    { label: 'Renommer', ico: '✎', value: 'rename' },
    { label: 'Instrument', value: 'instrument', sub: instrumentOf(take.instrument)?.label || 'Non précisé' },
    { label: 'Note', ico: '¶', value: 'note' },
    { label: 'Déplacer vers…', ico: '↳', value: 'move' },
    { label: 'Télécharger', ico: '↓', value: 'download' },
    canDeleteTake(take) && { label: 'Supprimer', ico: '✕', value: 'delete', cls: 'danger' },
  ].filter(Boolean));
  try {
    if (v === 'rename') {
      const n = await promptText('Nom de la prise', take.title);
      if (n !== null && n !== undefined) { take.title = n; await S.store.saveTake(take); render(); }
    }
    if (v === 'instrument') {
      const picked = await openSheet(`<h2>Instrument</h2>
        <div class="inst-picker">${INSTRUMENTS.map(i =>
          `<button class="inst-btn ${i.id === take.instrument ? 'on' : ''}" data-inst="${i.id}">${i.icon}<span>${i.label}</span></button>`).join('')}</div>`,
      (sh, close) => sh.querySelectorAll('[data-inst]').forEach(b => { b.onclick = () => close(b.dataset.inst); }));
      if (picked) { take.instrument = picked; rememberInstrument(picked); render(); await S.store.saveTake(take); }
    }
    if (v === 'note') {
      const n = await promptText('Note', take.notes, { multiline: true });
      if (n !== null && n !== undefined) { take.notes = n; await S.store.saveTake(take); render(); }
    }
    if (v === 'move') {
      const dest = await pickIdea('Déplacer vers…', { exclude: take.idea_id, allowInbox: !!take.idea_id });
      if (dest) await moveTake(take.id, { drop: dest });
    }
    if (v === 'download') {
      const blob = await S.store.getBlob(take);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      const idea = ideaById(take.idea_id);
      a.download = `${(idea ? ideaTitle(idea) + ' - ' : '') + (take.title || fmtDayTime(take.created_at))}.${window.FredonStore.extFor(take.mime)}`.replace(/[\\/:*?"<>|]/g, '-');
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    }
    if (v === 'delete') {
      if (!(await confirmBox('Supprimer cette prise ?', "L'enregistrement sera effacé définitivement.", 'Supprimer'))) return;
      if (S.playing === take.id) { audio.pause(); S.playing = null; }
      await S.store.deleteTake(take);
      S.takes = S.takes.filter(t => t !== take);
      render();
    }
  } catch (e) { fail(e, 'Action impossible'); await reload(); }
}

/* ---------------- Groupes ---------------- */
function nameField(value) {
  return `<label class="label" for="gWho">Ton prénom dans le groupe</label>
    <input class="field" id="gWho" value="${esc(value)}" placeholder="Ex : Léo" autocomplete="off" maxlength="30">
    <p class="hint">Il s'affiche à côté des prises que tu enregistres.</p>`;
}

async function addGroup() {
  const how = await openSheet(`
    <h2>Groupe</h2>
    <p class="sub">Un espace partagé avec tes musiciens.</p>
    <button class="big-choice" data-go="create"><b>Créer un groupe</b><span>Tu en seras l'admin et tu inviteras les autres.</span></button>
    <button class="big-choice" data-go="join"><b>Rejoindre un groupe</b><span>Avec le code que l'admin t'a donné.</span></button>`,
  (sh, close) => sh.querySelectorAll('[data-go]').forEach(b => { b.onclick = () => close(b.dataset.go); }));
  if (!how) return;
  const create = how === 'create';
  const v = await openSheet(`
    <h2>${create ? 'Créer un groupe' : 'Rejoindre un groupe'}</h2>
    <label class="label" for="gMain">${create ? 'Nom du groupe' : "Code d'invitation"}</label>
    <input class="field ${create ? '' : 'code-input'}" id="gMain" placeholder="${create ? 'Ex : Les Nocturnes' : 'Ex : K7M2PQ9X'}" autocomplete="off" maxlength="${create ? 40 : 12}">
    ${nameField(lastName())}
    <div class="row"><button class="btn" data-x>Annuler</button><button class="btn primary" data-ok>${create ? 'Créer' : 'Rejoindre'}</button></div>`,
  (sh, close) => {
    const main = sh.querySelector('#gMain');
    const who = sh.querySelector('#gWho');
    setTimeout(() => main.focus(), 60);
    sh.querySelector('[data-x]').onclick = () => close(null);
    sh.querySelector('[data-ok]').onclick = () => {
      if (!main.value.trim() || !who.value.trim()) { toast('Remplis les deux champs'); return; }
      close({ main: main.value.trim(), who: who.value.trim() });
    };
  });
  if (!v) return;
  try { localStorage.setItem('fredon.name', v.who); } catch {}
  try {
    const res = create ? await S.store.createGroup(v.main, v.who) : await S.store.joinGroup(v.main, v.who);
    const gid = create ? res.id : res;
    await reload();
    setScope(gid);
    if (create) manageGroup(gid); else toast(`Bienvenue dans « ${groupById(gid)?.name || 'le groupe'} »`);
  } catch (e) { fail(e, create ? 'Création impossible' : 'Impossible de rejoindre'); }
}

async function manageGroup(gid) {
  const g = groupById(gid);
  if (!g) return;
  const admin = isAdmin(gid);
  const list = membersOf(gid).sort((a, b) => (a.role === 'admin' ? -1 : 1) - (b.role === 'admin' ? -1 : 1) || a.name.localeCompare(b.name, 'fr'));
  const v = await openSheet(`
    <h2>${esc(g.name)}</h2>
    <p class="sub">${plural(list.length, 'membre')} · tu es ${admin ? 'admin' : 'membre'}</p>
    <label class="label">Code d'invitation</label>
    <div class="code-row"><span class="code">${esc(g.code)}</span><button class="txt-btn accent" data-copy>copier</button></div>
    <p class="hint">Tes musiciens ouvrent Rec., touchent « + groupe », puis « Rejoindre un groupe ».</p>
    <label class="label">Membres</label>
    <div class="choices">${list.map(m => `
      <div class="member"><span class="member-name">${esc(m.name || 'Sans nom')}${m.user_id === me() ? ' (toi)' : ''}</span>
        <span class="member-role">${m.role === 'admin' ? 'admin' : 'membre'}</span>
        ${admin && m.user_id !== me() ? `<button class="txt-btn danger" data-kick="${m.user_id}">retirer</button>` : ''}</div>`).join('')}</div>
    <p class="hint">${admin
      ? "En tant qu'admin, tu peux retirer un membre et supprimer n'importe quelle prise ou idée du groupe."
      : "En tant que membre, tu peux écouter, enregistrer, modifier les textes et supprimer tes propres prises."}</p>
    <div class="sheet-foot">${admin
      ? '<button class="txt-btn" data-do="rename">renommer</button><button class="txt-btn danger" data-do="delete">supprimer le groupe</button>'
      : '<button class="txt-btn danger" data-do="leave">quitter le groupe</button>'}</div>`,
  (sh, close) => {
    sh.querySelector('[data-copy]').onclick = async e => {
      try { await navigator.clipboard.writeText(g.code); e.target.textContent = 'copié'; } catch { toast(`Code : ${g.code}`); }
    };
    sh.querySelectorAll('[data-kick]').forEach(b => { b.onclick = () => close({ kick: b.dataset.kick }); });
    sh.querySelectorAll('[data-do]').forEach(b => { b.onclick = () => close({ act: b.dataset.do }); });
  });
  if (!v) return;
  try {
    if (v.kick) {
      const m = list.find(x => x.user_id === v.kick);
      if (!(await confirmBox(`Retirer ${m?.name || 'ce membre'} ?`, 'Il ne verra plus les idées du groupe. Ses prises déjà enregistrées restent.', 'Retirer'))) return manageGroup(gid);
      await S.store.removeMember(gid, v.kick);
      await reload();
      return manageGroup(gid);
    }
    if (v.act === 'rename') {
      const name = await promptText('Nom du groupe', g.name);
      if (name) { await S.store.renameGroup(gid, name); await reload(); }
    }
    if (v.act === 'leave') {
      if (!(await confirmBox(`Quitter « ${g.name} » ?`, 'Tu ne verras plus ses idées. Les prises que tu y as enregistrées restent dans le groupe.', 'Quitter'))) return;
      await S.store.removeMember(gid, me());
      setScope('me');
      await reload();
    }
    if (v.act === 'delete') {
      if (!(await confirmBox(`Supprimer « ${g.name} » ?`, 'Le groupe disparaît pour tous les membres. Chaque idée redevient personnelle, chez la personne qui l\'a créée.', 'Supprimer'))) return;
      await S.store.deleteGroup(gid);
      setScope('me');
      await reload();
    }
  } catch (e) { fail(e, 'Action impossible'); await reload(); }
}

/* ---------------- Glisser-déposer (souris + appui long au doigt) ---------------- */
const DRAG = { active: false, pending: null };

function ensureDragZones() {
  const board = $('#board');
  if (!board.querySelector('[data-drop="inbox"]')) board.insertAdjacentHTML('afterbegin', blockHtml(null, []));
  if (!board.querySelector('[data-drop="new"]')) board.insertAdjacentHTML('beforeend', '<section class="block new-zone" data-drop="new">déposer ici pour une nouvelle idée</section>');
}

function beginDrag(p, x, y) {
  DRAG.active = true;
  DRAG.id = p.id;
  DRAG.el = p.el;
  const r = p.el.getBoundingClientRect();
  DRAG.offX = x - r.left;
  DRAG.offY = y - r.top;
  const g = p.el.cloneNode(true);
  g.classList.add('ghost-drag');
  g.style.width = `${r.width}px`;
  g.style.setProperty('--c', getComputedStyle(p.el).getPropertyValue('--c'));
  document.body.append(g);
  DRAG.ghost = g;
  p.el.classList.add('lifting');
  document.body.classList.add('dragging');
  ensureDragZones();
  DRAG.scroll = setInterval(() => {
    if (DRAG.y < 90) window.scrollBy(0, -14);
    else if (DRAG.y > innerHeight - 90) window.scrollBy(0, 14);
  }, 16);
  moveDrag(x, y);
}

function clearDropMarks() {
  document.querySelectorAll('.drop-hover,.drop-before,.drop-after').forEach(e => e.classList.remove('drop-hover', 'drop-before', 'drop-after'));
}

function moveDrag(x, y) {
  DRAG.y = y;
  DRAG.ghost.style.transform = `translate(${x - DRAG.offX}px, ${y - DRAG.offY}px) rotate(-2deg)`;
  clearDropMarks();
  DRAG.target = null;
  const under = document.elementFromPoint(x, y);
  const block = under && under.closest('[data-drop]');
  if (!block) return;
  block.classList.add('drop-hover');
  const target = { drop: block.dataset.drop };
  const row = under.closest('.take');
  if (row && row.dataset.id !== DRAG.id && block.dataset.drop !== 'inbox') {
    const r = row.getBoundingClientRect();
    target.refId = row.dataset.id;
    target.before = y < r.top + r.height / 2;
    row.classList.add(target.before ? 'drop-before' : 'drop-after');
  }
  DRAG.target = target;
}

function endDrag(cancel = false) {
  clearInterval(DRAG.scroll);
  DRAG.ghost && DRAG.ghost.remove();
  document.body.classList.remove('dragging');
  clearDropMarks();
  const { id, target } = DRAG;
  Object.assign(DRAG, { active: false, pending: null, ghost: null, el: null, target: null });
  DRAG.justDropped = Date.now();
  render();
  if (!cancel && target) moveTake(id, target);
}

function wireDrag() {
  const board = $('#board');
  // Souris / stylet
  board.addEventListener('pointerdown', e => {
    if (e.pointerType === 'touch' || e.button !== 0) return;
    const t = e.target.closest('.take');
    if (!t || e.target.closest('button')) return;
    DRAG.pending = { id: t.dataset.id, el: t, x: e.clientX, y: e.clientY };
  });
  document.addEventListener('pointermove', e => {
    if (e.pointerType === 'touch') return;
    if (DRAG.active) { moveDrag(e.clientX, e.clientY); return; }
    const p = DRAG.pending;
    if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 6) beginDrag(p, e.clientX, e.clientY);
  });
  document.addEventListener('pointerup', e => {
    if (e.pointerType === 'touch') return;
    if (DRAG.active) endDrag();
    DRAG.pending = null;
  });

  // Doigt : appui long pour attraper, puis glisser
  board.addEventListener('touchstart', e => {
    const t = e.target.closest('.take');
    if (!t || e.target.closest('button') || e.touches.length > 1) return;
    const pt = e.touches[0];
    DRAG.pending = { id: t.dataset.id, el: t, x: pt.clientX, y: pt.clientY };
    clearTimeout(DRAG.timer);
    DRAG.timer = setTimeout(() => {
      const p = DRAG.pending;
      if (!p) return;
      try { navigator.vibrate && navigator.vibrate(18); } catch {}
      beginDrag(p, p.x, p.y);
    }, 380);
  }, { passive: true });
  document.addEventListener('touchmove', e => {
    const pt = e.touches[0];
    if (DRAG.active) { e.preventDefault(); moveDrag(pt.clientX, pt.clientY); return; }
    const p = DRAG.pending;
    if (p && Math.hypot(pt.clientX - p.x, pt.clientY - p.y) > 10) { clearTimeout(DRAG.timer); DRAG.pending = null; }
  }, { passive: false });
  const touchEnd = cancel => () => {
    clearTimeout(DRAG.timer);
    if (DRAG.active) endDrag(cancel);
    DRAG.pending = null;
  };
  document.addEventListener('touchend', touchEnd(false));
  document.addEventListener('touchcancel', touchEnd(true));
  board.addEventListener('contextmenu', e => { if (e.target.closest('.take')) e.preventDefault(); });
}

/* ---------------- Import de vocaux existants ---------------- */
function probeDuration(file) {
  return new Promise(resolve => {
    const a = new Audio();
    const url = URL.createObjectURL(file);
    const done = d => { URL.revokeObjectURL(url); resolve(isFinite(d) ? d : 0); };
    a.preload = 'metadata';
    a.onloadedmetadata = () => done(a.duration);
    a.onerror = () => done(0);
    setTimeout(() => done(0), 5000);
    a.src = url;
  });
}
const isAudioFile = f => /^(audio|video)\//.test(f.type) || /\.(m4a|mp3|wav|ogg|oga|opus|webm|aac|flac|mp4|3gp|amr|aiff?|caf|wma)$/i.test(f.name);

// dest : rien = « À trier », 'new' = nouvelle idée, sinon l'identifiant d'une idée.
async function importFiles(files, dest) {
  const list = [...files].filter(isAudioFile);
  if (!list.length) { toast('Aucun fichier audio'); return; }
  let idea = null;
  let created = false;
  let ok = 0;
  try {
    if (dest === 'new') {
      idea = newIdea({ title: list.length === 1 ? list[0].name.replace(/\.[^.]+$/, '') : '' });
      await saveIdea(idea);
      created = true;
    } else if (dest && dest !== 'inbox') idea = ideaById(dest);
  } catch (e) { fail(e, 'Import impossible'); return; }

  for (const [i, f] of list.entries()) {
    setStatus(`Import ${i + 1}/${list.length} : ${f.name}`);
    try {
      const info = await computePeaks(f);
      const take = {
        id: uid(), idea_id: idea ? idea.id : null, title: f.name.replace(/\.[^.]+$/, ''), notes: '',
        duration: info ? info.duration : await probeDuration(f), peaks: info ? info.peaks : [],
        mime: f.type || 'audio/mp4', path: '', position: idea ? nextPos(idea.id) : 0,
        created_at: new Date(f.lastModified || Date.now()).toISOString(),
      };
      if (isCloud()) take.author = idea && idea.group_id ? (myMember(idea.group_id)?.name || '') : '';
      await S.store.saveTake(take, f);
      S.takes.push(take);
      ok++;
    } catch (e) { console.error(e); }
  }
  setStatus('');
  if (created && !ok) { // rien n'est passé : on ne laisse pas une idée vide
    S.ideas = S.ideas.filter(x => x !== idea);
    try { await S.store.deleteIdea(idea.id); } catch {}
  } else if (idea && ok) { try { await touchIdea(idea); } catch {} }
  render();
  if (!ok) { toast('Import impossible'); return; }
  const where = idea ? `« ${ideaTitle(idea)} »` : '« À trier »';
  toast(`${ok} ${ok > 1 ? 'vocaux importés' : 'vocal importé'} dans ${where}`);
  if (created && list.length > 1) {
    const name = await promptText('Nom de la nouvelle idée', '', { placeholder: 'Ex : balade en La mineur' });
    if (name) { idea.title = name; await S.store.saveIdea(idea); render(); }
  }
}

// Fichiers glissés depuis l'ordinateur : on les lâche sur une idée, sur « À trier »
// ou sur la zone « nouvelle idée ». Lâchés ailleurs, ils vont dans « À trier ».
function wireFileDrop() {
  const hasFiles = e => e.dataTransfer && [...e.dataTransfer.types].includes('Files');
  let depth = 0;
  const stop = () => {
    depth = 0;
    if (!document.body.classList.contains('file-drag')) return;
    document.body.classList.remove('file-drag');
    clearDropMarks();
    render();
  };
  window.addEventListener('dragenter', e => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    depth++;
    if (document.body.classList.contains('file-drag')) return;
    document.body.classList.add('file-drag');
    $('#empty').hidden = true;
    ensureDragZones();
  });
  window.addEventListener('dragover', e => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    clearDropMarks();
    const block = e.target.closest && e.target.closest('[data-drop]');
    if (block) block.classList.add('drop-hover');
    if (e.clientY < 90) window.scrollBy(0, -14);
    else if (e.clientY > innerHeight - 90) window.scrollBy(0, 14);
  });
  window.addEventListener('dragleave', e => { if (hasFiles(e) && --depth <= 0) stop(); });
  window.addEventListener('drop', e => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    const block = e.target.closest && e.target.closest('[data-drop]');
    const dest = block ? block.dataset.drop : 'inbox';
    const files = [...e.dataTransfer.files];
    stop();
    if (files.length) importFiles(files, dest);
  });
}

/* ---------------- Réglages / synchro ---------------- */
const currentTheme = () => (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');
function setTheme(t) {
  if (t === 'light') document.documentElement.dataset.theme = 'light';
  else delete document.documentElement.dataset.theme;
  try { localStorage.setItem('fredon.theme', t); } catch {}
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = t === 'light' ? '#ffffff' : '#0a0a0a';
}

async function openSettings() {
  const cfg = loadConfig();
  let mode = cfg.mode === 'cloud' ? 'cloud' : 'local';
  const loggedIn = S.store?.kind === 'cloud' && S.store.user;
  await openSheet(`
    <h2>Réglages</h2>
    <label class="label">Apparence</label>
    <div class="seg" id="themeSeg"><button data-theme-pick="dark">Sombre</button><button data-theme-pick="light">Clair</button></div>
    <label class="label">Où sont gardés tes vocaux ?</label>
    <div class="seg"><button data-mode="local">Sur cet appareil</button><button data-mode="cloud">Synchronisé</button></div>
    <div id="localPane">
      <p class="small-print">Mode essai : les vocaux restent dans ce navigateur uniquement. Pour les retrouver sur ton téléphone <em>et</em> ton PC, passe en « Synchronisé ».</p>
    </div>
    <div id="cloudPane">
      ${loggedIn ? `
        <p class="small-print">Connecté en tant que <strong>${esc(S.store.user.email)}</strong>.</p>
        <div class="choices">
          <button class="choice" id="migrate"><span class="ico">⇪</span><span>Envoyer les vocaux de cet appareil vers le cloud<small>Pour récupérer ce que tu as enregistré en mode essai</small></span></button>
          <button class="choice danger" id="logout"><span class="ico">⎋</span><span>Se déconnecter</span></button>
        </div>` : `
        <label class="label" for="cfgEmail">Ton e-mail</label>
        <input class="field" id="cfgEmail" type="email" autocomplete="username">
        <label class="label" for="cfgPass">Mot de passe</label>
        <input class="field" id="cfgPass" type="password" autocomplete="current-password">
        <div class="row"><button class="btn" id="signup">Créer un compte</button><button class="btn primary" id="login">Se connecter</button></div>
        <details class="adv"><summary>Réglages avancés</summary>
          <label class="label" for="cfgUrl">Adresse du projet Supabase</label>
          <input class="field" id="cfgUrl" placeholder="https://xxxx.supabase.co" value="${esc(cfg.url || '')}" autocomplete="off">
          <label class="label" for="cfgKey">Clé publique (anon / publishable)</label>
          <input class="field" id="cfgKey" placeholder="eyJ… ou sb_publishable_…" value="${esc(cfg.key || '')}" autocomplete="off">
        </details>`}
    </div>`,
  (sh, close) => {
    const themeBtns = sh.querySelectorAll('[data-theme-pick]');
    const showTheme = () => themeBtns.forEach(b => b.classList.toggle('on', b.dataset.themePick === currentTheme()));
    themeBtns.forEach(b => { b.onclick = () => { setTheme(b.dataset.themePick); showTheme(); }; });
    showTheme();
    const seg = sh.querySelectorAll('[data-mode]');
    const show = () => {
      seg.forEach(b => b.classList.toggle('on', b.dataset.mode === mode));
      sh.querySelector('#localPane').hidden = mode !== 'local';
      sh.querySelector('#cloudPane').hidden = mode !== 'cloud';
    };
    seg.forEach(b => {
      b.onclick = async () => {
        mode = b.dataset.mode;
        show();
        if (mode === 'local' && S.store?.kind !== 'local') {
          saveConfig({ ...loadConfig(), mode: 'local' });
          await useStore(new LocalStore());
          setStatus('Mode essai : les vocaux restent sur cet appareil. La synchro se règle dans « réglages ».');
          toast('Mode « sur cet appareil »');
        }
      };
    });
    show();
    const login = sh.querySelector('#login');
    const signup = sh.querySelector('#signup');
    const auth = async creating => {
      const url = sh.querySelector('#cfgUrl').value.trim().replace(/\/+$/, '');
      const key = sh.querySelector('#cfgKey').value.trim();
      const email = sh.querySelector('#cfgEmail').value.trim();
      const pass = sh.querySelector('#cfgPass').value;
      if (!url || !key || !email || !pass) { toast('Saisis ton e-mail et ton mot de passe'); return; }
      if (creating && pass.length < 8) { toast('Choisis un mot de passe de 8 caractères ou plus'); return; }
      const btn = creating ? signup : login;
      const label = btn.textContent;
      login.disabled = signup.disabled = true;
      btn.textContent = creating ? 'Création…' : 'Connexion…';
      try {
        const cloud = new CloudStore({ url, key });
        await cloud.init();
        if (creating) {
          const open = await cloud.signUp(email, pass);
          if (!open) {
            login.disabled = signup.disabled = false;
            btn.textContent = label;
            toast('Compte créé. Ouvre l\'e-mail de confirmation, puis reviens te connecter.');
            return;
          }
        } else await cloud.signIn(email, pass);
        saveConfig({ mode: 'cloud', url, key });
        await useStore(cloud, true);
        setStatus('');
        close();
        toast(creating ? 'Compte créé, bienvenue' : 'Connecté — tes vocaux sont synchronisés');
        if (!creating) offerMigration();
      } catch (e) {
        login.disabled = signup.disabled = false;
        btn.textContent = label;
        fail(e, creating ? 'Création impossible' : 'Connexion impossible');
      }
    };
    if (login) { login.onclick = () => auth(false); signup.onclick = () => auth(true); }
    const logout = sh.querySelector('#logout');
    if (logout) logout.onclick = async () => {
      await S.store.signOut();
      close();
      S.ideas = []; S.takes = []; S.groups = []; S.members = []; S.scope = 'me';
      render();
      setStatus('Déconnecté. Ouvre les réglages pour te reconnecter.');
    };
    const migrate = sh.querySelector('#migrate');
    if (migrate) migrate.onclick = () => { close(); migrateLocalToCloud(); };
  });
}

async function offerMigration() {
  const local = new LocalStore();
  await local.init();
  const n = (await local.listTakes()).length;
  if (!n) return;
  if (await confirmBox('Envoyer tes vocaux de test ?', `${n} ${n > 1 ? 'vocaux enregistrés' : 'vocal enregistré'} sur cet appareil en mode essai. Les envoyer dans ton espace synchronisé ?`, 'Envoyer')) {
    migrateLocalToCloud();
  }
}

async function migrateLocalToCloud() {
  if (S.store?.kind !== 'cloud') return;
  const local = new LocalStore();
  await local.init();
  const ideas = await local.listIdeas();
  const takes = await local.listTakes();
  if (!ideas.length && !takes.length) { toast("Rien à envoyer depuis cet appareil"); return; }
  let i = 0;
  try {
    for (const idea of ideas) { setStatus(`Envoi des idées ${++i}/${ideas.length}`); await S.store.saveIdea(idea); }
    i = 0;
    for (const t of takes) {
      setStatus(`Envoi des vocaux ${++i}/${takes.length}`);
      const blob = await local.getBlob(t);
      if (blob) await S.store.saveTake({ ...t }, blob);
    }
    setStatus('');
    await reload();
    if (await confirmBox('Envoi terminé', "Tout est dans le cloud. Effacer la copie de test gardée sur cet appareil ?", 'Effacer la copie')) {
      await local.wipe();
    }
  } catch (e) {
    setStatus('');
    fail(e, 'Envoi interrompu');
  }
}

async function useStore(store, alreadyInit = false) {
  if (!alreadyInit) await store.init();
  S.store = store;
  audio.pause();
  S.playing = null;
  await reload();
}

async function reload() {
  try {
    if (S.store.kind === 'cloud' && !S.store.user) { S.ideas = []; S.takes = []; S.groups = []; S.members = []; render(); return; }
    const cloud = S.store.kind === 'cloud';
    const [ideas, takes, groups, members] = await Promise.all([
      S.store.listIdeas(), S.store.listTakes(),
      cloud ? S.store.listGroups() : [], cloud ? S.store.listMembers() : [],
    ]);
    S.ideas = ideas || [];
    S.takes = takes || [];
    S.groups = (groups || []).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    S.members = members || [];
    let scope = 'me';
    try { scope = localStorage.getItem('fredon.scope') || 'me'; } catch {}
    S.scope = cloud && groupById(scope) ? scope : 'me';
    render();
  } catch (e) {
    fail(e, 'Chargement impossible');
  }
}

/* ---------------- Décor en parallaxe ---------------- */
function initParallax() {
  const bg = document.querySelector('.bg');
  const wave = document.getElementById('bgWave');
  if (!bg || !wave) return;

  // Une onde en filets fins, toujours la même (tirage pseudo-aléatoire fixe).
  const n = 72;
  let h = 20261117;
  let d = '';
  for (let i = 0; i < n; i++) {
    h = (h * 1664525 + 1013904223) >>> 0;
    const env = .25 + .75 * Math.abs(Math.sin(i / n * Math.PI * 2.5));
    const len = 6 + env * (h % 1000) / 1000 * 88;
    d += `M${i * 10 + 5} ${(100 - len) / 2}v${len}`;
  }
  wave.setAttribute('viewBox', `0 0 ${n * 10} 100`);
  wave.innerHTML = `<path d="${d}" stroke="currentColor" stroke-width="1.6" fill="none" vector-effect="non-scaling-stroke"/>`;

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const target = { sy: 0, tx: 0, ty: 0 };
  const cur = { sy: 0, tx: 0, ty: 0 };
  let raf = 0;
  const frame = () => {
    raf = 0;
    cur.sy = target.sy;
    cur.tx += (target.tx - cur.tx) * .12; // l'inclinaison est lissée pour éviter les saccades
    cur.ty += (target.ty - cur.ty) * .12;
    bg.style.setProperty('--sy', cur.sy.toFixed(1));
    bg.style.setProperty('--tx', cur.tx.toFixed(3));
    bg.style.setProperty('--ty', cur.ty.toFixed(3));
    if (Math.abs(target.tx - cur.tx) > .002 || Math.abs(target.ty - cur.ty) > .002) ask();
  };
  const ask = () => { if (!raf) raf = requestAnimationFrame(frame); };
  const clamp = v => Math.max(-1, Math.min(1, v));

  window.addEventListener('scroll', () => { target.sy = window.scrollY; ask(); }, { passive: true });
  window.addEventListener('mousemove', e => {
    target.tx = clamp(e.clientX / innerWidth * 2 - 1);
    target.ty = clamp(e.clientY / innerHeight * 2 - 1);
    ask();
  }, { passive: true });

  const onTilt = e => {
    if (e.gamma == null || e.beta == null) return;
    target.tx = clamp(e.gamma / 30);          // gauche / droite
    target.ty = clamp((e.beta - 45) / 30);    // avant / arrière, autour d'une tenue naturelle
    ask();
  };
  const DOE = window.DeviceOrientationEvent;
  if (DOE && typeof DOE.requestPermission === 'function') {
    // iPhone : l'accès aux capteurs se demande après un premier toucher.
    const once = () => {
      DOE.requestPermission().then(r => { if (r === 'granted') window.addEventListener('deviceorientation', onTilt); }).catch(() => {});
    };
    window.addEventListener('touchend', once, { once: true });
  } else if (DOE) {
    window.addEventListener('deviceorientation', onTilt);
  }
}

/* ---------------- Événements ---------------- */
function wireUi() {
  $('#recBtn').onclick = () => startRecording(null);
  $('#recStop').onclick = () => stopRecording(false);
  $('#recCancel').onclick = () => stopRecording(true);
  $('#metroToggle').onclick = toggleRecMetro;
  $('#metroMinus').onclick = () => setRecBpm(REC.bpm - 1);
  $('#metroPlus').onclick = () => setRecBpm(REC.bpm + 1);
  const recTap = makeTapper();
  $('#metroTap').onclick = () => { const t = recTap(); if (t) setRecBpm(t); };
  $('#settingsBtn').onclick = openSettings;
  $('#importBtn').onclick = () => $('#importInput').click();
  $('#importInput').onchange = e => { const f = e.target.files; if (f && f.length) importFiles(f); e.target.value = ''; };
  $('#search').oninput = e => { S.filter.q = e.target.value; render(); };

  $('#scopes').onclick = e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.hasAttribute('data-scope-add')) return addGroup();
    if (b.hasAttribute('data-scope-manage')) return manageGroup(S.scope);
    if (b.dataset.scope === S.scope && S.scope !== 'me') return manageGroup(S.scope);
    setScope(b.dataset.scope);
  };

  $('#filters').onclick = e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.hasAttribute('data-filter-star')) S.filter.star = !S.filter.star;
    else {
      const t = b.dataset.filterTag;
      if (S.filter.tags.has(t)) S.filter.tags.delete(t); else S.filter.tags.add(t);
    }
    render();
  };

  $('#board').onclick = e => {
    if (DRAG.justDropped && Date.now() - DRAG.justDropped < 80) return;
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const a = el.dataset.action;
    const idea = ideaById(el.dataset.idea);
    if (a === 'play') play(el.dataset.id);
    if (a === 'seek') {
      const r = el.getBoundingClientRect();
      seek(el.dataset.id, Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)));
    }
    if (a === 'take-menu') takeMenu(takeById(el.dataset.id));
    if (a === 'loop' || a === 'loop-a' || a === 'loop-b') loopAction(a, el.dataset.id);
    if (a === 'tempo' && idea) editTempo(idea);
    if (a === 'rename' && idea) renameIdea(idea);
    if (a === 'text' && idea) editText(idea);
    if (a === 'idea-menu' && idea) ideaMenu(idea);
    if (a === 'record-into' && idea) startRecording(idea.id);
    if (a === 'play-all' && idea) {
      const ids = takesOf(idea.id).map(t => t.id);
      if (S.playing && ids.includes(S.playing) && !audio.paused) audio.pause(); else play(ids[0], ids.slice(1));
    }
    if (a === 'star' && idea) {
      idea.starred = !idea.starred;
      render();
      S.store.saveIdea(idea).catch(err => fail(err, 'Action impossible'));
    }
  };

  // Barre d'espace = enregistrer / arrêter (sur PC)
  document.addEventListener('keydown', e => {
    if (e.code !== 'Space' || sheetClose || /INPUT|TEXTAREA/.test(document.activeElement?.tagName)) return;
    e.preventDefault();
    if (REC.recorder) stopRecording(false); else startRecording(null);
  });

  // Quand on revient sur l'appli, on récupère ce qui a été fait depuis l'autre appareil.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && S.store?.kind === 'cloud' && !REC.recorder && !DRAG.active && !sheetClose) reload();
  });
}

async function boot() {
  setTheme(currentTheme());
  wireUi();
  wireDrag();
  wireFileDrop();
  const cfg = loadConfig();
  if (cfg.mode === 'cloud' && cfg.url && cfg.key) {
    try {
      const cloud = new CloudStore(cfg);
      const logged = await cloud.init();
      S.store = cloud;
      if (!logged) { setStatus('Connecte-toi dans les réglages pour retrouver tes vocaux.'); render(); openSettings(); return; }
    } catch (e) {
      setStatus(`Synchro indisponible (${e.message}). Mode local en attendant.`);
      S.store = new LocalStore();
      await S.store.init();
    }
  } else {
    S.store = new LocalStore();
    await S.store.init();
  }
  await reload();
  if (S.store.kind === 'local') {
    setStatus('Mode essai : les vocaux restent sur cet appareil. La synchro se règle dans « réglages ».');
  }
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    // Nouvelle version publiée : on recharge tout seul, sauf en plein enregistrement ou panneau ouvert.
    const had = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      const busy = (REC.recorder && REC.recorder.state !== 'inactive') || document.getElementById('sheetBackdrop').offsetParent !== null;
      if (had && !busy) location.reload();
    });
    navigator.serviceWorker.register('sw.js').then(r => r.update()).catch(() => {});
  }
}

boot();
})();
