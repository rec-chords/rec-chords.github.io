/* Rec. — carnet de vocaux musicaux (nom technique : fredon) */
(() => {
const { LocalStore, CloudStore, loadConfig, saveConfig, isNetErr } = window.FredonStore;

const TAG_PRESETS = ['mélodie', 'rythme', 'paroles', 'accords', 'couplet', 'refrain', 'pont', 'intro', 'beat'];

const PALETTE = ['#01bc8d', '#3b9dff', '#8b6cf6', '#f0518c', '#f97316', '#eab308', '#14b8c4', '#8a94a6'];
const WAVE_N = 48;

const S = {
  store: null,
  ideas: [],
  takes: [],
  groups: [],
  setlists: [],
  members: [],
  comments: [],
  albums: [],
  openIdea: null, // morceau déplié dans la vue par albums
  scope: 'me', // 'me' = mes idées, sinon l'identifiant d'un groupe
  filter: { q: '', tags: new Set(), star: false },
  playing: null,
  queue: [],
  offline: false,
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
  { id: 'groupe', label: 'Groupe', icon: ico('<circle cx="12" cy="8" r="3"/><path d="M6.5 20v-1.5a5.5 5.5 0 0111 0V20"/><circle cx="4.8" cy="10.5" r="2"/><circle cx="19.2" cy="10.5" r="2"/><path d="M1.5 19v-.5A3.5 3.5 0 014.2 15M22.5 19v-.5a3.5 3.5 0 00-2.7-3.5"/>') },
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
// Une piste « par-dessus » est une prise enregistrée en écoutant une autre prise de la même idée.
const baseOf = t => { const b = t && t.layer_of ? takeById(t.layer_of) : null; return b && b.idea_id && b.idea_id === t.idea_id && !b.layer_of ? b : null; };
const layersOf = b => S.takes.filter(t => t.layer_of === b.id && baseOf(t) === b).sort((x, y) => x.position - y.position || x.created_at.localeCompare(y.created_at));
const fmtMs = ms => `${ms > 0 ? '+' : ms < 0 ? '−' : ''}${Math.abs(Math.round(ms))} ms`;
// Coupe : rien n'est effacé, on retient où la prise commence et finit (en ms dans le fichier).
const cutIn = t => Math.max(0, (t.trim_a || 0) / 1000);
const cutOut = (t, full = t.duration || 0) => (t.trim_b != null && t.trim_b / 1000 < full ? t.trim_b / 1000 : full);
const lenOf = t => Math.max(0, cutOut(t) - cutIn(t));
const isCut = t => !!(t.trim_a || t.trim_b != null);
// Discussion et nouveautés. « Vu » est retenu sur l'appareil, idée par idée.
const commentsOf = ideaId => S.comments.filter(c => c.idea_id === ideaId).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
const SEEN = (() => { try { return JSON.parse(localStorage.getItem('fredon.seen') || '{}'); } catch { return {}; } })();
const saveSeen = () => { try { localStorage.setItem('fredon.seen', JSON.stringify(SEEN)); } catch {} };
if (!SEEN._0) { SEEN._0 = new Date().toISOString(); saveSeen(); } // avant cette date, rien n'est « nouveau »
const markSeen = idea => { SEEN[idea.id] = new Date().toISOString(); saveSeen(); };
const NO_NEWS = { takes: [], talk: [], idea: false, any: false };
function newsOf(idea) {
  if (!idea || !idea.group_id) return NO_NEWS;
  const since = new Date(SEEN[idea.id] || SEEN._0);
  const takes = S.takes.filter(t => t.idea_id === idea.id && !isMine(t) && new Date(t.created_at) > since);
  const talk = S.comments.filter(c => c.idea_id === idea.id && c.user_id !== me() && new Date(c.created_at) > since);
  const fresh = !SEEN[idea.id] && !isMine(idea) && new Date(idea.updated_at) > since; // idée arrivée dans le groupe
  return { takes, talk, idea: fresh, any: fresh || takes.length > 0 || talk.length > 0 };
}
// Hors connexion : ce qui attend d'être envoyé, et la dernière copie des données gardée sur l'appareil.
const waiting = id => !!(S.store && S.store.pending && S.store.pending.has(id));
const waitCount = () => (S.store && S.store.pending ? S.store.pending.size : 0);
const saveSnap = data => { try { localStorage.setItem('fredon.snapshot', JSON.stringify(data)); } catch {} };
const loadSnap = () => { try { return JSON.parse(localStorage.getItem('fredon.snapshot')); } catch { return null; } };
const ideaTitle = idea => idea.title || `Idée du ${fmtDay(idea.created_at)}`;
const allTags = () => [...new Set(visibleIdeas().flatMap(i => i.tags || []))].sort((a, b) => a.localeCompare(b, 'fr'));
const recentIdeas = () => visibleIdeas().sort((a, b) => b.updated_at.localeCompare(a.updated_at));
/* Albums : un morceau est rangé dans un seul album de son espace (perso ou groupe), ou dans aucun. */
const scopeGroup = () => (S.scope === 'me' ? null : S.scope);
const albumById = id => S.albums.find(a => a.id === id);
const scopeAlbums = () => S.albums.filter(a => (a.group_id || null) === scopeGroup())
  .sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at));
const albumOf = idea => { const a = idea.album_id ? albumById(idea.album_id) : null; return a && (a.group_id || null) === (idea.group_id || null) ? a : null; };
const tracksOf = albumId => visibleIdeas().filter(i => (albumOf(i)?.id || null) === albumId)
  .sort(albumId ? (a, b) => (a.track || 0) - (b.track || 0) || a.created_at.localeCompare(b.created_at) : (a, b) => b.updated_at.localeCompare(a.updated_at));
const nextTrack = albumId => tracksOf(albumId).reduce((m, i) => Math.max(m, i.track || 0), 0) + 1;
const albumView = () => isCloud() && scopeAlbums().length > 0;
const ALB_OPEN = (() => { try { return new Set(JSON.parse(localStorage.getItem('fredon.albumsOpen') || '[]')); } catch { return new Set(); } })();
const saveAlbOpen = () => { try { localStorage.setItem('fredon.albumsOpen', JSON.stringify([...ALB_OPEN])); } catch {} };
const morceaux = n => `${n} ${n > 1 ? 'morceaux' : 'morceau'}`;
function hashOf(str) { let h = 7; for (const ch of String(str)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; }
const ideaColor = idea => (idea && idea.color) || PALETTE[hashOf(idea ? idea.id : '') % PALETTE.length];
const fmtLong = sec => (sec < 60 ? `${Math.round(sec)} s` : sec < 3600 ? `${Math.round(sec / 60)} min` : `${Math.floor(sec / 3600)} h ${String(Math.round(sec % 3600 / 60)).padStart(2, '0')}`);

// Forme d'onde : vraies crêtes si on les a, sinon un motif stable tiré de l'identifiant.
function wavePeaks(t) {
  const p = rawPeaks(t);
  if (!isCut(t) || !t.duration) return p;
  const a = cutIn(t) / t.duration, b = cutOut(t) / t.duration; // seule la partie gardée est dessinée
  return p.map((_, i) => p[Math.min(p.length - 1, Math.floor((a + (b - a) * (i + .5) / p.length) * p.length))]);
}
function rawPeaks(t) {
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
  const layer = !inInbox && baseOf(t);
  const layers = !inInbox && !layer ? layersOf(t) : [];
  const title = t.title || (inInbox ? `Vocal du ${fmtDayTime(t.created_at)}` : layer ? `Piste ${instrumentOf(t.instrument)?.label.toLowerCase() || 'ajoutée'}` : `Prise ${index + 1}`);
  const shared = !inInbox && ideaById(t.idea_id)?.group_id;
  const who = shared && t.author ? `${t.author} · ` : '';
  const meta = (inInbox ? fmtDur(lenOf(t)) : `${who}${fmtDay(t.created_at)} · ${fmtDur(lenOf(t))}`) + (waiting(t.id) ? " · en attente d'envoi" : '');
  const inst = instrumentOf(t.instrument);
  const isNew = shared && newsOf(ideaById(t.idea_id)).takes.includes(t);
  return `<li class="take ${layer ? 'layer' : ''}" data-id="${t.id}">
    <button class="play" data-action="play" data-id="${t.id}" aria-label="Écouter"><span class="num">${layer ? '+' : String(index + 1).padStart(2, '0')}</span><span class="pi">${ICONS.play}</span></button>
    <div class="take-main">
      <div class="take-line">${inst ? `<span class="inst" data-inst="${inst.id}" title="${esc(inst.label)}">${inst.icon}</span>` : ''}<span class="take-title">${esc(title)}</span>${isNew ? '<span class="news">nouveau</span>' : ''}<span class="take-meta">${esc(meta)}</span></div>
      ${t.notes ? `<div class="take-note">${esc(t.notes)}</div>` : ''}
      <div class="wave" data-action="seek" data-id="${t.id}">${waveSvg(t, 'w-base')}${waveSvg(t, 'w-fill')}<i class="w-loop"></i></div>
      ${layers.length ? `<button class="txt-btn mix-btn" data-action="mix" data-id="${t.id}">écouter ensemble · ${layers.length + 1} pistes</button>` : ''}
      <div class="loopbar">
        <button class="txt-btn" data-action="loop" data-id="${t.id}">boucle</button>
        <button class="txt-btn" data-action="loop-a" data-id="${t.id}">début</button>
        <button class="txt-btn" data-action="loop-b" data-id="${t.id}">fin</button>
      </div>
    </div>
    <button class="mini-btn" data-action="take-menu" data-id="${t.id}" aria-label="Options de la prise">${ICONS.more}</button>
  </li>`;
}

const UNFOLDED = new Set(); // idées dont le texte est déplié
function blockHtml(idea, list, full = false) {
  if (!idea) {
    return `<section class="block inbox" data-drop="inbox">
      <div class="block-head"><h3 class="block-title">À trier<span class="count">${list.length}</span></h3></div>
      <p class="block-sub">Glisser vers une idée. Au doigt : appui long.</p>
      <ol class="takes">${list.map((t, i) => takeHtml(t, i, true)).join('')}</ol>
    </section>`;
  }
  const tags = idea.tags || [];
  const total = list.reduce((sum, t) => sum + lenOf(t), 0);
  const sub = [list.length ? `${plural(list.length, 'prise')} · ${fmtDur(total)}` : 'vide', ago(idea.updated_at)].join(' · ');
  const news = newsOf(idea);
  const talk = idea.group_id ? commentsOf(idea.id).length : 0;
  const music = [idea.bpm ? `${idea.bpm} bpm` : '', idea.tona || ''].filter(Boolean).join(' · ');
  // Paroles et accords repliés par défaut : « tout lire » les déplie, idée par idée.
  const long = (idea.notes || '').split('\n').length > 2 || (idea.notes || '').length > 90 || (idea.chords || '').split('\n').length > 2;
  const open = full || (long && UNFOLDED.has(idea.id));
  return `<section class="block ${full ? 'in-album' : ''}" data-drop="${idea.id}">
    <div class="block-head">
      <h3 class="block-title ${idea.title ? '' : 'placeholder'}" data-action="rename" data-idea="${idea.id}">${esc(ideaTitle(idea))}</h3>
      <button class="star ${idea.starred ? 'on' : ''}" data-action="star" data-idea="${idea.id}" aria-label="Favori">${idea.starred ? '★' : '☆'}</button>
      ${list.filter(t => !baseOf(t)).length > 1 ? `<button class="txt-btn" data-action="play-all" data-idea="${idea.id}">écouter</button>` : ''}
      <button class="mini-btn" data-action="idea-menu" data-idea="${idea.id}" aria-label="Options de l'idée">${ICONS.more}</button>
    </div>
    <p class="block-sub">${news.any ? '<span class="news">nouveau</span>' : ''}<span>${esc(sub)}</span>${tags.map(t => `<span class="tag">#${esc(t)}</span>`).join('')}</p>
    ${music ? `<button class="tempo-chip" data-action="tempo" data-idea="${idea.id}" title="Modifier">${esc(music)}</button>` : ''}
    ${idea.chords ? `<div class="chords ${open ? 'open' : ''}" data-action="tempo" data-idea="${idea.id}" title="Modifier">${esc(idea.chords)}</div>` : ''}
    ${idea.notes ? `<div class="lyrics ${open ? 'open' : ''}" data-action="text" data-idea="${idea.id}" title="Modifier le texte">${esc(idea.notes)}</div>` : ''}
    ${long && !full ? `<button class="txt-btn fold" data-action="fold" data-idea="${idea.id}">${open ? 'replier' : 'tout lire'}</button>` : ''}
    <ol class="takes">${(() => { let n = 0; return list.map(t => takeHtml(t, baseOf(t) ? n - 1 : n++, false)).join(''); })()}</ol>
    <div class="block-foot">
      <button class="add-take" data-action="record-into" data-idea="${idea.id}">${list.length ? '+ enregistrer une suite' : '+ enregistrer'}</button>
      ${list.length ? '' : `<button class="add-take second" data-action="import-into" data-idea="${idea.id}">+ importer</button>`}
      ${idea.notes ? '' : `<button class="add-take second" data-action="text" data-idea="${idea.id}">+ écrire un texte</button>`}
      ${music || idea.chords ? '' : `<button class="add-take second" data-action="tempo" data-idea="${idea.id}">+ tempo et tonalité</button>`}
      ${idea.group_id ? `<button class="add-take second ${news.talk.length ? 'hot' : ''}" data-action="talk" data-idea="${idea.id}">${talk ? `discussion · ${talk}` : '+ discuter'}${news.talk.length ? ` · ${news.talk.length} ${news.talk.length > 1 ? 'nouveaux' : 'nouveau'}` : ''}</button>` : ''}
    </div>
  </section>`;
}

function songHtml(idea, label) {
  const open = S.openIdea === idea.id;
  const takes = takesOf(idea.id);
  const meta = [idea.bpm ? `${idea.bpm} bpm` : '', idea.tona || '', takes.length ? plural(takes.length, 'prise') : ''].filter(Boolean).join(' · ');
  return `<li class="song ${open ? 'open' : ''}" data-song="${idea.id}">
    <div class="song-row" data-action="song-toggle" data-idea="${idea.id}">
      <span class="num">${label || '–'}</span>
      <span class="song-title">${esc(ideaTitle(idea))}</span>${newsOf(idea).any ? '<span class="news">nouveau</span>' : ''}
      <span class="song-meta">${esc(meta)}</span>
    </div>
    ${open ? blockHtml(idea, takes, true) : ''}
  </li>`;
}
// Comme sur un disque : face A, puis face B dès que l'album est assez long.
function sidesHtml(list) {
  const half = list.length >= 6 ? Math.ceil(list.length / 2) : list.length;
  const side = (name, songs) => (songs.length ? `<li class="side"><span>Face ${name}</span><i>${morceaux(songs.length)}</i></li>` + songs.map((i, n) => songHtml(i, name + (n + 1))).join('') : '');
  return side('A', list.slice(0, half)) + side('B', list.slice(half));
}
function albumsHtml() {
  const f = S.filter;
  const filtering = !!(f.q || f.star || f.tags.size);
  return [...scopeAlbums(), null].map(a => {
    const all = tracksOf(a ? a.id : null);
    const list = all.filter(matchesIdea);
    if ((!a && !all.length) || (filtering && !list.length)) return '';
    const key = a ? a.id : 'none';
    const open = filtering || ALB_OPEN.has(key) || list.some(i => i.id === S.openIdea);
    const dur = list.reduce((sum, i) => sum + takesOf(i.id).filter(t => !baseOf(t)).reduce((x, t) => x + lenOf(t), 0), 0);
    const meta = [morceaux(list.length), dur ? fmtLong(dur) : ''].filter(Boolean).join(' · ');
    return `<section class="album ${open ? 'open' : ''}" data-album="${key}">
      <div class="album-head ${a ? 'has-cover' : ''}" data-action="album-toggle" data-album-id="${key}">
        ${a ? `<span class="sleeve"><i class="disc"></i>${isCover(a.cover) ? `<img class="album-cover" src="${a.cover}" alt="">` : `<span class="album-cover blank">${esc((a.name.trim()[0] || '?').toUpperCase())}</span>`}</span>` : ''}
        <span class="album-kind">${a ? esc(a.kind) : 'En vrac'}</span>
        <h2 class="album-name">${a ? esc(a.name) : 'Sans album'}</h2>
        ${a ? `<button class="mini-btn" data-action="album-menu" data-album-id="${key}" aria-label="Options de l'album">${ICONS.more}</button>` : ''}
        <p class="album-meta">${list.some(i => newsOf(i).any) ? '<span class="news">nouveau</span>' : ''}${esc(meta)}<i class="album-chev">${open ? 'replier' : 'ouvrir'}</i></p>
      </div>
      ${open ? `<ol class="songs">${a ? sidesHtml(list) : list.map(i => songHtml(i, '')).join('')}</ol>
        ${a ? `<div class="album-foot"><button class="add-take" data-action="album-add" data-album-id="${key}">+ ajouter des morceaux</button><button class="add-take" data-action="album-song" data-album-id="${key}">+ nouvelle chanson</button></div>` : ''}` : ''}
    </section>`;
  }).join('');
}

function renderHero() {
  const hero = $('#hero');
  const ideas = visibleIdeas();
  const ids = new Set(ideas.map(i => i.id));
  const takes = S.takes.filter(t => ids.has(t.idea_id)).concat(inboxTakes());
  const n = ideas.length;
  const t = takes.length;
  const total = takes.reduce((sum, x) => sum + lenOf(x), 0);
  const g = isCloud() ? groupById(S.scope) : null;
  const card = g ? bandHtml(g) : '';
  hero.innerHTML = card + (n || t ? `<p><b>${n}</b> ${n > 1 ? 'idées' : 'idée'} · <b>${t}</b> ${t > 1 ? 'prises' : 'prise'} · <b>${fmtLong(total)}</b></p>` : '') +
    '<button class="txt-btn new-song" id="newSong">+ nouvelle chanson</button>' +
    (isCloud() ? '<button class="txt-btn new-song" id="newAlbum">+ nouvel album</button>' : '') +
    (isCloud() && SETLISTS ? '<button class="txt-btn new-song" id="newSet">+ nouvelle setlist</button>' : '') +
    (g && !card ? '<button class="txt-btn new-song" id="bandNew">+ présenter le groupe</button>' : '');
}

// Fiche du groupe : une image et un mémo, en tête de la page du groupe.
const BAND_OPEN = new Set();
const linkify = text => esc(text).replace(/https?:\/\/[^\s<]+[^\s<.,;:!?)]/g, u => `<a href="${u}" target="_blank" rel="noopener noreferrer">${u.replace(/^https?:\/\/(www\.)?/, '')}</a>`);
const profOf = g => (g.profile && typeof g.profile === 'object' && !Array.isArray(g.profile) ? g.profile : {});
const lineupOf = g => (Array.isArray(profOf(g).lineup) ? profOf(g).lineup : []).filter(m => m && (m.name || m.inst));
const STAGE_KEYS = ['set', 'brings', 'needs', 'notes'];
function bandHtml(g) {
  const p = profOf(g);
  const memo = (g.memo || '').trim();
  const pic = isCover(g.cover);
  const lineup = lineupOf(g);
  const tag = [p.style, p.city].filter(Boolean).join(' · ');
  const contact = [p.contact, p.phone, p.mail].filter(Boolean).join(' · ');
  const more = lineup.length || contact || p.links;
  if (!memo && !pic && !tag && !more && !STAGE_KEYS.some(k => p[k])) return '';
  const long = memo.split('\n').length > 3 || memo.length > 170 || more;
  const open = long && BAND_OPEN.has(g.id);
  return `<div class="band ${open ? 'open' : ''}">
    <div class="band-top">
      ${pic ? `<img class="band-cover" src="${g.cover}" alt="">` : ''}
      <div class="band-text">
        ${tag ? `<p class="band-tag">${esc(tag)}</p>` : ''}
        ${memo ? `<div class="band-memo">${linkify(memo)}</div>` : ''}
        ${long ? `<button class="txt-btn band-fold" data-band="fold">${open ? 'replier' : 'voir toute la fiche'}</button>` : ''}
      </div>
      <p class="band-acts"><button class="txt-btn" data-band="edit">modifier la fiche</button><button class="txt-btn accent" data-band="rider">fiche technique</button></p>
    </div>
    ${open && more ? `<div class="band-more">
      ${lineup.length ? `<section><h4>Line-up</h4><ul class="band-lineup">${lineup.map(m => `<li><b>${esc(m.name || '?')}</b><span>${esc(m.inst || '')}</span></li>`).join('')}</ul></section>` : ''}
      ${contact ? `<section><h4>Contact</h4>${p.contact ? `<p><b>${esc(p.contact)}</b></p>` : ''}${p.phone ? `<p>${esc(p.phone)}</p>` : ''}${p.mail ? `<p>${esc(p.mail)}</p>` : ''}</section>` : ''}
      ${p.links ? `<section><h4>Liens</h4><p class="band-links">${linkify(p.links)}</p></section>` : ''}
    </div>` : ''}
  </div>`;
}
async function editBand(g) {
  const p = profOf(g);
  let cover = isCover(g.cover) ? g.cover : '';
  // Le line-up part des membres inscrits, mais reste libre : un musicien n'a pas besoin d'avoir un compte.
  const rows = lineupOf(g).length ? lineupOf(g) : membersOf(g.id).map(m => ({ name: m.name || '', inst: '', needs: '' }));
  const rowHtml = m => `<div class="lu-row">
      <input class="field" data-lu="name" maxlength="60" autocomplete="off" placeholder="Prénom" value="${esc(m.name || '')}">
      <input class="field" data-lu="inst" maxlength="80" autocomplete="off" placeholder="Chant, guitare…" value="${esc(m.inst || '')}">
      <input class="field" data-lu="needs" maxlength="160" autocomplete="off" placeholder="Sur scène : 1 micro chant, 1 DI…" value="${esc(m.needs || '')}">
      <button class="txt-btn danger" data-lu-del aria-label="Retirer ce musicien">retirer</button>
    </div>`;
  const inp = (id, label, ph, max = 80) => `<label class="label" for="${id}">${label}</label><input class="field" id="${id}" maxlength="${max}" autocomplete="off" placeholder="${esc(ph)}" value="${esc(p[id.slice(2)] || '')}">`;
  const area = (id, label, ph, value) => `<label class="label" for="${id}">${label}</label><textarea class="field small" id="${id}" maxlength="1000" placeholder="${esc(ph)}">${esc(value || '')}</textarea>`;
  const v = await openSheet(`<h2>Fiche de « ${esc(g.name)} »</h2>
    <p class="sub">Remplis ce que tu veux, le reste peut attendre. Visible et modifiable par les membres.</p>

    <h3 class="part">1 · Le groupe</h3>
    <label class="label">Image</label>
    <div class="cover-row"><span class="cover-box" id="bCover"></span>
      <button class="txt-btn accent" data-cover>choisir une image</button><button class="txt-btn danger" data-nocover>retirer</button>
      <input type="file" id="bFile" accept="image/*" hidden></div>
    ${inp('b_style', 'Style', 'Ex : rock indé, dream pop')}
    ${inp('b_city', 'Ville', 'Ex : Lyon')}
    <label class="label" for="bMemo">Description</label>
    <textarea class="field small" id="bMemo" maxlength="4000" placeholder="Deux ou trois phrases : qui vous êtes, ce que vous jouez, depuis quand.">${esc(g.memo || '')}</textarea>

    <h3 class="part">2 · Qui joue quoi</h3>
    <p class="hint">Un musicien par ligne. La troisième case dit ce qu'il lui faut sur scène.</p>
    <div id="bLineup">${rows.map(rowHtml).join('')}</div>
    <button class="add-take" data-lu-add>+ ajouter un musicien</button>

    <h3 class="part">3 · Sur scène</h3>
    <p class="hint">Sert à sortir la fiche technique pour une salle.</p>
    ${inp('b_set', 'Durée du set', 'Ex : 45 min')}
    ${area('b_brings', 'Vous apportez', 'Ex : guitares, basse, amplis, cymbales, caisse claire', p.brings)}
    ${area('b_needs', 'À fournir par la salle', 'Ex : batterie, sono, 3 retours, 2 DI, 3 pieds de micro', p.needs)}
    ${area('b_notes', 'Remarques', "Ex : placement sur scène, temps d'installation, besoins particuliers", p.notes)}

    <h3 class="part">4 · Contact</h3>
    ${inp('b_contact', 'Nom', 'La personne à appeler')}
    ${inp('b_phone', 'Téléphone', '06…', 40)}
    ${inp('b_mail', 'E-mail', 'groupe@exemple.fr', 120)}
    ${area('b_links', 'Liens', 'Un lien par ligne : Bandcamp, Insta, YouTube…', p.links)}
    <div class="row"><button class="btn" data-x>Annuler</button><button class="btn primary" data-ok>Enregistrer</button></div>`,
  (sh, close) => {
    const file = sh.querySelector('#bFile');
    const show = () => {
      sh.querySelector('#bCover').innerHTML = cover ? `<img src="${cover}" alt="">` : '';
      sh.querySelector('[data-cover]').textContent = cover ? 'changer' : 'choisir une image';
      sh.querySelector('[data-nocover]').hidden = !cover;
    };
    sh.querySelector('[data-cover]').onclick = sh.querySelector('#bCover').onclick = () => file.click();
    sh.querySelector('[data-nocover]').onclick = () => { cover = ''; show(); };
    file.onchange = async () => {
      const f = file.files[0];
      file.value = '';
      if (!f) return;
      try { cover = await coverFrom(f); show(); } catch (e) { toast("Cette image n'a pas pu être lue"); }
    };
    show();
    const box = sh.querySelector('#bLineup');
    sh.querySelector('[data-lu-add]').onclick = () => { box.insertAdjacentHTML('beforeend', rowHtml({})); box.lastElementChild.querySelector('input').focus(); };
    box.onclick = e => { if (e.target.closest('[data-lu-del]')) e.target.closest('.lu-row').remove(); };
    const val = id => (sh.querySelector('#' + id).value || '').replace(/\r\n?/g, '\n').trim();
    sh.querySelector('[data-x]').onclick = () => close(null);
    sh.querySelector('[data-ok]').onclick = () => {
      const profile = {};
      for (const k of ['style', 'city', 'set', 'brings', 'needs', 'notes', 'contact', 'phone', 'mail', 'links']) { const x = val('b_' + k); if (x) profile[k] = x; }
      const lineup = [...box.querySelectorAll('.lu-row')].map(r => Object.fromEntries([...r.querySelectorAll('[data-lu]')].map(i => [i.dataset.lu, i.value.trim()]))).filter(m => m.name || m.inst);
      if (lineup.length) profile.lineup = lineup.slice(0, 20);
      close({ memo: val('bMemo'), cover, profile });
    };
  });
  if (!v) return;
  const before = { memo: g.memo, cover: g.cover, profile: g.profile };
  Object.assign(g, v);
  render();
  try { await S.store.saveGroupProfile(g.id, v.memo, v.cover, v.profile); }
  catch (e) { Object.assign(g, before); render(); fail(e, isNetErr(e) ? 'Il faut du réseau pour modifier la fiche du groupe' : 'Enregistrement impossible'); }
}

/* ----- Fiche technique : une page propre à imprimer ou à envoyer ----- */
let RIDER_ON = false;
function riderText(g) {
  const p = profOf(g);
  const part = (title, body) => (body ? [`${title.toUpperCase()}`, body, ''] : []);
  return [`${g.name} : fiche technique`, [p.style, p.city, p.set ? `set de ${p.set}` : ''].filter(Boolean).join(' · '), '',
    ...part('Line-up', lineupOf(g).map(m => `- ${m.name || '?'}${m.inst ? ` : ${m.inst}` : ''}${m.needs ? ` (${m.needs})` : ''}`).join('\n')),
    ...part('Le groupe apporte', p.brings), ...part('À fournir par la salle', p.needs), ...part('Remarques', p.notes),
    ...part('Contact', [[p.contact, p.phone, p.mail].filter(Boolean).join(' · '), p.links].filter(Boolean).join('\n')),
  ].join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
function closeRider() {
  RIDER_ON = false;
  const el = $('#rider');
  if (el) { el.hidden = true; el.innerHTML = ''; }
  document.body.classList.remove('riding');
}
function openRider(g) {
  const p = profOf(g);
  const lineup = lineupOf(g);
  let el = $('#rider');
  if (!el) {
    el = document.createElement('div');
    el.id = 'rider';
    el.className = 'rider';
    document.body.append(el);
    document.addEventListener('keydown', e => { if (RIDER_ON && !sheetClose && e.key === 'Escape') closeRider(); });
  }
  const part = (title, body) => (body ? `<h2>${title}</h2><p class="rider-text">${esc(body)}</p>` : '');
  const contact = [p.contact, p.phone, p.mail].filter(Boolean).join(' · ');
  const thin = !lineup.some(m => m.needs) && !p.needs && !p.brings;
  el.innerHTML = `<div class="rider-bar">
      <button class="txt-btn accent" data-print>imprimer ou PDF</button>
      <button class="txt-btn" data-copy>copier le texte</button>
      <button class="txt-btn" data-light>fond clair</button>
      <button class="txt-btn" data-edit>modifier</button>
      <button class="txt-btn" data-close>fermer</button>
    </div>
    ${thin ? '<p class="rider-tip">Cette fiche est encore légère : remplis « Qui joue quoi » et « Sur scène » dans la fiche du groupe pour qu\'une salle ait ce qu\'il lui faut.</p>' : ''}
    <article class="rider-page">
      <header class="rider-head">
        <div class="rider-id"><p class="rider-kind">Fiche technique</p>
          <h1>${esc(g.name)}</h1>
          ${p.style || p.city ? `<p class="rider-tag">${esc([p.style, p.city].filter(Boolean).join(' · '))}</p>` : ''}</div>
        ${isCover(g.cover) ? `<img src="${g.cover}" alt="">` : ''}
      </header>
      ${p.set || lineup.length ? `<p class="rider-facts">${[p.set ? `<span><b>${esc(p.set)}</b> de set</span>` : '', lineup.length ? `<span><b>${lineup.length}</b> sur scène</span>` : ''].join('')}</p>` : ''}
      ${lineup.length ? `<h2>Line-up</h2><ol class="rider-lineup">
        ${lineup.map((m, n) => `<li><span class="n">${String(n + 1).padStart(2, '0')}</span><b>${esc(m.name || '')}</b><span class="plays">${esc(m.inst || '')}</span><span class="needs">${esc(m.needs || '')}</span></li>`).join('')}</ol>` : ''}
      ${p.brings || p.needs ? `<div class="rider-cols">${p.brings ? `<section>${part('Le groupe apporte', p.brings)}</section>` : ''}${p.needs ? `<section>${part('À fournir par la salle', p.needs)}</section>` : ''}</div>` : ''}
      ${part('Remarques', p.notes)}
      ${contact || p.links ? `<footer class="rider-contact"><h2>Contact</h2>
        ${p.contact ? `<p class="who">${esc(p.contact)}</p>` : ''}
        ${p.phone || p.mail ? `<p class="rider-text">${esc([p.phone, p.mail].filter(Boolean).join(' · '))}</p>` : ''}
        ${p.links ? `<p class="rider-text links">${esc(p.links)}</p>` : ''}</footer>` : ''}
      <p class="rider-foot">Fiche du ${new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
    </article>`;
  const paintLight = () => {
    let light = false;
    try { light = localStorage.getItem('fredon.riderLight') === '1'; } catch {}
    el.classList.toggle('light', light);
    el.querySelector('[data-light]').textContent = light ? 'fond sombre' : 'fond clair';
  };
  paintLight();
  el.onclick = async e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.hasAttribute('data-close')) closeRider();
    if (b.hasAttribute('data-print')) window.print();
    if (b.hasAttribute('data-light')) { try { localStorage.setItem('fredon.riderLight', el.classList.contains('light') ? '0' : '1'); } catch {} paintLight(); }
    if (b.hasAttribute('data-edit')) { closeRider(); editBand(g); }
    if (b.hasAttribute('data-copy')) {
      try { await navigator.clipboard.writeText(riderText(g)); toast('Fiche copiée'); }
      catch { await promptText('Copie ce texte', riderText(g), { multiline: true }); }
    }
  };
  RIDER_ON = true;
  el.hidden = false;
  el.scrollTop = 0;
  document.body.classList.add('riding');
}

// Barre de choix : mes idées, ou celles d'un groupe.
function renderScopes() {
  const nav = $('#scopes');
  nav.hidden = !isCloud();
  if (nav.hidden) return;
  nav.innerHTML =
    `<button class="scope ${S.scope === 'me' ? 'on' : ''}" data-scope="me">Mes idées</button>` +
    S.groups.map(g => `<button class="scope ${S.scope === g.id ? 'on' : ''}" data-scope="${g.id}">${esc(g.name)}${S.ideas.some(i => i.group_id === g.id && newsOf(i).any) ? '<i class="dot" title="Du nouveau"></i>' : ''}</button>`).join('') +
    '<button class="scope add" data-scope-add>+ groupe</button>' +
    (S.scope !== 'me' ? '<button class="txt-btn" data-scope-manage>membres</button>' : '');
}
function setScope(id) {
  S.scope = id === 'me' || groupById(id) ? id : 'me';
  S.openIdea = null;
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
  if (SETLISTS && isCloud() && !f.q && !f.star && !f.tags.size) html += setlistsHtml();
  const byAlbum = albumView();
  board.classList.toggle('albums-view', byAlbum);
  if (byAlbum) html += albumsHtml();
  else html += recentIdeas().filter(matchesIdea).map(i => blockHtml(i, takesOf(i.id))).join('');
  board.innerHTML = html;
  $('#empty').hidden = visibleIdeas().length > 0 || inboxTakes().length > 0;
  updatePlayUI();
}

/* ---------------- Lecture ---------------- */
const audio = new Audio();
audio.preload = 'auto';

/* ---------------- Écoute superposée ---------------- */
// Toutes les pistes partent ensemble dans le même moteur audio : elles restent calées au millième.
const MIX = { ctx: null, id: null, sources: [], t0: 0, dur: 0, raf: 0, buffers: new Map() };
function sharedCtx() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!MIX.ctx) MIX.ctx = new AC();
  if (MIX.ctx.state === 'suspended') MIX.ctx.resume();
  return MIX.ctx;
}
async function bufferOf(take) {
  if (MIX.buffers.has(take.id)) return MIX.buffers.get(take.id);
  const blob = await S.store.getBlob(take);
  const data = await blob.arrayBuffer();
  const ctx = sharedCtx();
  const buf = await new Promise((res, rej) => ctx.decodeAudioData(data, res, rej));
  MIX.buffers.set(take.id, buf);
  return buf;
}
// Programme la lecture d'un groupe de pistes à l'instant t0 ; renvoie la durée totale.
function scheduleMix(ctx, items, t0) {
  let dur = 0;
  for (const { buf, pos, skip, len } of items) {
    const lead = Math.max(0, -pos); // ce qui tomberait avant le départ n'est pas joué
    if (len - lead < .01) continue;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start(t0 + Math.max(0, pos), skip + lead, len - lead);
    dur = Math.max(dur, pos + len);
    MIX.sources.push(src);
  }
  return dur;
}
async function mixItems(baseTake, skipId = null) {
  const takes = [baseTake, ...layersOf(baseTake)].filter(t => t.id !== skipId);
  const bufs = await Promise.all(takes.map(bufferOf));
  // Le décalage d'une piste est mesuré entre les deux fichiers entiers : couper l'un ou l'autre ne la décale pas.
  const b0 = cutIn(baseTake);
  return takes.map((t, i) => {
    const skip = Math.min(cutIn(t), bufs[i].duration);
    const len = Math.max(0, cutOut(t, bufs[i].duration) - skip);
    return { take: t, buf: bufs[i], skip, len, pos: t === baseTake ? 0 : (t.offset_ms || 0) / 1000 + skip - b0 };
  });
}
function stopMix() {
  for (const src of MIX.sources) { try { src.stop(); } catch {} }
  MIX.sources = [];
  cancelAnimationFrame(MIX.raf);
  const was = MIX.id;
  MIX.id = null;
  if (was) updateMixUI();
}
async function playMix(baseId) {
  if (MIX.id === baseId) { stopMix(); return; }
  const baseTake = takeById(baseId);
  if (!baseTake) return;
  stopMix();
  audio.pause();
  S.playing = null;
  updatePlayUI();
  try {
    setStatus('Préparation des pistes…');
    const items = await mixItems(baseTake);
    setStatus('');
    const ctx = sharedCtx();
    MIX.t0 = ctx.currentTime + .12;
    MIX.dur = scheduleMix(ctx, items, MIX.t0);
    MIX.id = baseId;
    MIX.items = items;
    const tick = () => {
      if (MIX.id !== baseId) return;
      if (ctx.currentTime > MIX.t0 + MIX.dur + .05) { stopMix(); return; }
      updateMixUI();
      MIX.raf = requestAnimationFrame(tick);
    };
    tick();
  } catch (e) { setStatus(''); stopMix(); fail(e, 'Lecture impossible'); }
}
function updateMixUI() {
  document.querySelectorAll('.mix-btn').forEach(b => {
    const on = MIX.id === b.dataset.id;
    b.classList.toggle('on', on);
    const n = b.textContent.match(/\d+ pistes/);
    b.textContent = `${on ? 'arrêter' : 'écouter ensemble'}${n ? ' · ' + n[0] : ''}`;
  });
  const now = MIX.id ? MIX.ctx.currentTime - MIX.t0 : 0;
  for (const it of MIX.items || []) {
    const fill = document.querySelector(`.take[data-id="${it.take.id}"] .w-fill`);
    if (!fill) continue;
    if (!MIX.id) { fill.style.clipPath = ''; continue; }
    const pct = Math.max(0, Math.min(100, (now - it.pos) / (it.len || 1) * 100));
    fill.style.clipPath = `inset(0 ${100 - pct}% 0 0)`;
  }
}

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
    const a = same && LOOP.a != null ? LOOP.a : cutIn(takeById(id));
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
    const take = takeById(row.dataset.id);
    const total = take ? totalOf(take) : 0;
    const c0 = take ? cutIn(take) : 0, c1 = take ? cutOut(take, total) : 0;
    bA.textContent = mine && LOOP.a != null ? `début ${fmtDur(LOOP.a - c0)}` : 'début';
    bB.classList.toggle('on', mine && LOOP.b != null);
    bB.textContent = mine && LOOP.b != null ? `fin ${fmtDur(LOOP.b - c0)}` : 'fin';
    const zone = row.querySelector('.w-loop');
    if (zone) {
      const show = mine && c1 > c0 && (LOOP.a != null || LOOP.b != null);
      zone.style.display = show ? 'block' : 'none';
      if (show) {
        const a = Math.max(0, ((LOOP.a != null ? LOOP.a : c0) - c0) / (c1 - c0) * 100);
        const b = Math.min(100, ((LOOP.b != null ? LOOP.b : c1) - c0) / (c1 - c0) * 100);
        zone.style.left = `${a}%`;
        zone.style.width = `${Math.max(.5, b - a)}%`;
      }
    }
  });
}
setInterval(() => {
  const take = takeById(S.playing);
  if (!take || audio.paused) return;
  if (LOOP.on && LOOP.id === S.playing && LOOP.b != null && audio.currentTime >= LOOP.b) {
    try { audio.currentTime = LOOP.a != null ? LOOP.a : cutIn(take); } catch {}
    return;
  }
  // Prise coupée : on s'arrête à la fin gardée, comme si le fichier finissait là.
  if (take.trim_b != null && audio.currentTime >= cutOut(take, totalOf(take))) onTakeEnd();
}, 40);

async function play(id, queue = []) {
  if (S.playing === id) {
    if (audio.paused) audio.play(); else audio.pause();
    return;
  }
  const take = takeById(id);
  if (!take) return;
  resetLoop();
  stopMix();
  try {
    S.playing = id;
    S.queue = queue;
    audio.src = await S.store.audioUrl(take);
    if (cutIn(take)) { try { audio.currentTime = cutIn(take); } catch {} }
    await audio.play();
  } catch (e) {
    S.playing = null;
    if (isNetErr(e)) toast("Pas de réseau : cette prise n'est pas sur l'appareil."); else fail(e, 'Lecture impossible');
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
  if (total) { const a = cutIn(take); try { audio.currentTime = a + ratio * (cutOut(take, total) - a); } catch {} }
}
audio.addEventListener('play', updatePlayUI);
audio.addEventListener('pause', updatePlayUI);
audio.addEventListener('timeupdate', () => {
  const take = takeById(S.playing);
  if (!take) return;
  const total = totalOf(take);
  if (!total) return;
  const a = cutIn(take), b = cutOut(take, total);
  const pct = Math.max(0, Math.min(100, (audio.currentTime - a) / ((b - a) || 1) * 100));
  document.querySelectorAll(`.take[data-id="${S.playing}"] .w-fill`).forEach(f => { f.style.clipPath = `inset(0 ${100 - pct}% 0 0)`; });
});
function onTakeEnd() {
  const take = takeById(S.playing);
  if (take && LOOP.on && LOOP.id === S.playing) { // en boucle : on repart du début du passage
    try { audio.currentTime = LOOP.a != null ? LOOP.a : cutIn(take); } catch {}
    audio.play();
    return;
  }
  const next = S.queue.shift();
  S.playing = null;
  audio.pause();
  if (next) play(next, S.queue); else updatePlayUI();
}
audio.addEventListener('ended', onTakeEnd);

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
// Une chanson sans enregistrement : on la nomme, on écrit, les prises viendront après.
async function createSong(albumId = null) {
  const name = await promptText('Nom de la chanson', '', { placeholder: 'Ex : balade en La mineur' });
  if (!name) return;
  const idea = newIdea({ title: name });
  if (albumId && albumById(albumId)) { idea.album_id = albumId; idea.track = nextTrack(albumId); S.openIdea = idea.id; }
  try { await saveIdea(idea); }
  catch (e) { S.ideas = S.ideas.filter(x => x !== idea); render(); return fail(e, 'Création impossible'); }
  render();
  editText(idea);
}
/* ---------------- Albums ---------------- */
const KINDS = ['Album', 'EP', 'Maquette', 'Single'];
// Réduit l'image choisie à une vignette carrée, assez légère pour voyager avec l'album.
async function coverFrom(file) {
  const img = await new Promise((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('Image illisible'));
    el.src = URL.createObjectURL(file);
  });
  const side = Math.min(img.naturalWidth, img.naturalHeight);
  const c = document.createElement('canvas');
  c.width = c.height = Math.min(360, side);
  c.getContext('2d').drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, c.width, c.height);
  URL.revokeObjectURL(img.src);
  return c.toDataURL('image/jpeg', 0.8);
}
const isCover = v => /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(v || '');
function albumSheet(album) {
  let kind = album ? album.kind : 'Album';
  let cover = album && isCover(album.cover) ? album.cover : '';
  return openSheet(`<h2>${album ? "Modifier l'album" : 'Nouvel album'}</h2>
    <label class="label" for="aName">Nom</label>
    <input class="field" id="aName" maxlength="80" autocomplete="off" placeholder="Ex : Premier EP" value="${esc(album ? album.name : '')}">
    <label class="label">Type</label>
    <div class="kinds">${KINDS.map(k => `<button class="kind" data-kind="${k}">${k}</button>`).join('')}</div>
    <input class="field" id="aKind" maxlength="24" autocomplete="off" placeholder="Ou un autre mot : live, répète, démo…" style="margin-top:10px">
    <label class="label">Image</label>
    <div class="cover-row"><span class="cover-box" id="aCover"></span>
      <button class="txt-btn accent" data-cover>choisir une image</button><button class="txt-btn danger" data-nocover>retirer</button>
      <input type="file" id="aFile" accept="image/*" hidden></div>
    <div class="row"><button class="btn" data-x>Annuler</button><button class="btn primary" data-ok>${album ? 'Enregistrer' : 'Créer'}</button></div>`,
  (sh, close) => {
    const name = sh.querySelector('#aName');
    const other = sh.querySelector('#aKind');
    const paint = () => sh.querySelectorAll('[data-kind]').forEach(b => b.classList.toggle('on', b.dataset.kind === kind));
    if (!KINDS.includes(kind)) other.value = kind;
    const file = sh.querySelector('#aFile');
    const showCover = () => {
      sh.querySelector('#aCover').innerHTML = cover ? `<img src="${cover}" alt="">` : '';
      sh.querySelector('[data-cover]').textContent = cover ? 'changer' : 'choisir une image';
      sh.querySelector('[data-nocover]').hidden = !cover;
    };
    sh.querySelector('[data-cover]').onclick = () => file.click();
    sh.querySelector('#aCover').onclick = () => file.click();
    sh.querySelector('[data-nocover]').onclick = () => { cover = ''; showCover(); };
    file.onchange = async () => {
      const f = file.files[0];
      file.value = '';
      if (!f) return;
      try { cover = await coverFrom(f); showCover(); } catch (e) { toast("Cette image n'a pas pu être lue"); }
    };
    showCover();
    paint();
    sh.querySelectorAll('[data-kind]').forEach(b => { b.onclick = () => { kind = b.dataset.kind; other.value = ''; paint(); }; });
    other.oninput = () => { kind = other.value.trim() || 'Album'; paint(); };
    setTimeout(() => name.focus(), 60);
    const ok = () => { if (!name.value.trim()) { toast("Donne un nom à l'album"); return; } close({ name: name.value.trim(), kind, cover }); };
    name.onkeydown = e => { if (e.key === 'Enter') ok(); };
    sh.querySelector('[data-x]').onclick = () => close(null);
    sh.querySelector('[data-ok]').onclick = ok;
  });
}
async function createAlbum() {
  const v = await albumSheet(null);
  if (!v) return;
  try {
    const list = scopeAlbums();
    const row = await S.store.addAlbum({ name: v.name, kind: v.kind, cover: v.cover, group_id: scopeGroup(), position: list.length ? list[list.length - 1].position + 1 : 0 });
    S.albums.push(row);
    ALB_OPEN.add(row.id); saveAlbOpen();
    render();
    if (tracksOf(null).length) fillAlbum(row);
  } catch (e) { fail(e, isNetErr(e) ? 'Il faut du réseau pour créer un album' : 'Création impossible'); }
}
// Cocher les morceaux à ranger dans l'album.
async function fillAlbum(album) {
  const list = visibleIdeas().filter(i => albumOf(i) !== album)
    .sort((a, b) => (albumOf(a) ? 1 : 0) - (albumOf(b) ? 1 : 0) || ideaTitle(a).localeCompare(ideaTitle(b), 'fr'));
  if (!list.length) { toast('Tous les morceaux sont déjà dans cet album'); return; }
  const sel = new Set();
  const ok = await openSheet(`<h2>Ajouter à « ${esc(album.name)} »</h2>
    <p class="sub">Touche les morceaux à ranger dans cet album.</p>
    <div class="choices picks">${list.map(i => `<button class="choice pick" data-pick="${i.id}"><span class="ico"></span><span>${esc(ideaTitle(i))}<small>${esc(albumOf(i)?.name || '')}</small></span></button>`).join('')}</div>
    <div class="row"><button class="btn" data-x>Annuler</button><button class="btn primary" data-ok>Ajouter</button></div>`,
  (sh, close) => {
    const btn = sh.querySelector('[data-ok]');
    sh.querySelectorAll('[data-pick]').forEach(b => { b.onclick = () => {
      if (!sel.delete(b.dataset.pick)) sel.add(b.dataset.pick);
      b.classList.toggle('on', sel.has(b.dataset.pick));
      btn.textContent = sel.size ? `Ajouter ${morceaux(sel.size)}` : 'Ajouter';
    }; });
    sh.querySelector('[data-x]').onclick = () => close(false);
    btn.onclick = () => close(true);
  });
  if (!ok || !sel.size) return;
  try {
    let track = nextTrack(album.id);
    for (const i of list.filter(x => sel.has(x.id))) { i.album_id = album.id; i.track = track++; await S.store.saveIdea(i); }
    ALB_OPEN.add(album.id); saveAlbOpen();
    render();
    toast(`${morceaux(sel.size)} dans « ${album.name} »`);
  } catch (e) { fail(e, 'Rangement impossible'); await reload(); }
}
async function albumMenu(album) {
  const list = scopeAlbums();
  const at = list.indexOf(album);
  const v = await actionSheet(album.name, [
    { label: 'Ajouter des morceaux', value: 'fill' },
    { label: 'Nom, type et image', value: 'edit', sub: album.kind },
    at > 0 && { label: 'Monter', value: 'up' },
    at < list.length - 1 && { label: 'Descendre', value: 'down' },
    (isMine(album) || isAdmin(album.group_id)) && { label: "Supprimer l'album", value: 'delete', cls: 'danger', sub: 'Ses morceaux sont gardés' },
  ].filter(Boolean));
  try {
    if (v === 'fill') return fillAlbum(album);
    if (v === 'edit') {
      const e = await albumSheet(album);
      if (!e) return;
      const before = { name: album.name, kind: album.kind, cover: album.cover };
      Object.assign(album, e);
      render();
      try { await S.store.saveAlbum(album, true); } catch (err) { Object.assign(album, before); render(); throw err; }
    }
    if (v === 'up' || v === 'down') {
      const to = at + (v === 'up' ? -1 : 1);
      [list[at], list[to]] = [list[to], list[at]];
      const changed = list.filter((a, i) => a.position !== i);
      list.forEach((a, i) => { a.position = i; });
      render();
      for (const a of changed) await S.store.saveAlbum(a);
    }
    if (v === 'delete') {
      const n = tracksOf(album.id).length;
      if (!(await confirmBox(`Supprimer « ${album.name} » ?`, n ? `Ses ${morceaux(n)} ne sont pas supprimés : ils passent dans « Sans album ».` : 'Il est vide.', 'Supprimer'))) return;
      await S.store.deleteAlbum(album.id);
      S.albums = S.albums.filter(a => a !== album);
      for (const i of S.ideas) if (i.album_id === album.id) i.album_id = null;
      ALB_OPEN.delete(album.id); saveAlbOpen();
      render();
    }
  } catch (e) { fail(e, 'Action impossible'); await reload(); }
}
// Ranger un morceau depuis son menu.
async function fileIdea(idea) {
  const cur = albumOf(idea);
  const v = await actionSheet(`Ranger « ${ideaTitle(idea)} »`, [
    ...scopeAlbums().filter(a => a !== cur).map(a => ({ label: a.name, value: a.id, sub: a.kind })),
    { label: 'Nouvel album…', value: 'new', cls: 'primary' },
    cur && { label: `Sortir de « ${cur.name} »`, value: 'none' },
  ].filter(Boolean));
  if (!v) return;
  if (v === 'new') return createAlbum();
  const album = v === 'none' ? null : albumById(v);
  idea.album_id = album ? album.id : null;
  idea.track = album ? nextTrack(album.id) : 0;
  if (album) { ALB_OPEN.add(album.id); saveAlbOpen(); }
  render();
  try { await S.store.saveIdea(idea); toast(album ? `Rangé dans « ${album.name} »` : 'Sorti de l\'album'); }
  catch (e) { fail(e, 'Rangement impossible'); await reload(); }
}
// Glisser un morceau : sur un autre album, ou entre deux morceaux pour changer l'ordre des pistes.
async function moveSong(id, target) {
  const idea = ideaById(id);
  if (!idea) return;
  const albumId = target.album === 'none' ? null : target.album;
  if (albumId && !albumById(albumId)) return;
  const from = albumOf(idea)?.id || null;
  const sibs = tracksOf(albumId).filter(i => i !== idea);
  const ref = target.refId ? sibs.findIndex(i => i.id === target.refId) : -1;
  if (from === albumId && ref < 0) return;
  let track = 0;
  if (albumId) {
    if (ref >= 0) {
      const r = sibs[ref].track || 0;
      if (target.before) { const p = sibs[ref - 1]; track = p ? ((p.track || 0) + r) / 2 : r - 1; }
      else { const n = sibs[ref + 1]; track = n ? (r + (n.track || 0)) / 2 : r + 1; }
    } else track = sibs.length ? (sibs[sibs.length - 1].track || 0) + 1 : 1;
  }
  idea.album_id = albumId;
  idea.track = track;
  render();
  try {
    await S.store.saveIdea(idea);
    toast(from === albumId ? 'Ordre modifié' : albumId ? `Rangé dans « ${albumById(albumId).name} »` : 'Sorti de l\'album');
  } catch (e) { fail(e, 'Déplacement impossible'); await reload(); }
}

/* ---------------- Setlists ---------------- */
const SETLISTS = false; // rangées pour l'instant : remettre true pour les réafficher
const setById = id => S.setlists.find(x => x.id === id);
const scopeSets = () => S.setlists.filter(x => (x.group_id || null) === scopeGroup()).sort((a, b) => b.created_at.localeCompare(a.created_at));
const setSongs = set => (Array.isArray(set.items) ? set.items : []).map(ideaById).filter(i => i && (i.group_id || null) === (set.group_id || null));
// La prise qui représente un morceau : la plus longue, en général le filage complet.
const mainTake = idea => takesOf(idea.id).filter(t => !baseOf(t)).reduce((best, t) => (!best || lenOf(t) > lenOf(best) ? t : best), null);
const setLength = songs => songs.reduce((sum, i) => { const t = mainTake(i); return sum + (t ? lenOf(t) : 0); }, 0);
const songLine = i => { const t = mainTake(i); return [i.bpm ? `${i.bpm} bpm` : '', i.tona || '', t ? fmtDur(lenOf(t)) : ''].filter(Boolean).join(' · '); };

function setlistsHtml() {
  return scopeSets().map(set => {
    const songs = setSongs(set);
    const open = ALB_OPEN.has(`set:${set.id}`);
    const dur = setLength(songs);
    const meta = [set.note, morceaux(songs.length), dur ? `≈ ${fmtLong(dur)}` : ''].filter(Boolean).join(' · ');
    return `<section class="album setlist ${open ? 'open' : ''}" data-setlist="${set.id}">
      <div class="album-head" data-action="set-toggle" data-set="${set.id}">
        <span class="album-kind">Setlist</span>
        <h2 class="album-name">${esc(set.name)}</h2>
        <button class="mini-btn" data-action="set-menu" data-set="${set.id}" aria-label="Options de la setlist">${ICONS.more}</button>
        <p class="album-meta">${esc(meta)}<i class="album-chev">${open ? 'replier' : 'ouvrir'}</i></p>
      </div>
      ${open ? `<ol class="songs">${songs.map((i, n) => `<li class="song set-song" data-set-song="${i.id}">
          <div class="song-row set-row" data-action="set-open" data-set="${set.id}" data-set-idea="${i.id}">
            <span class="num">${String(n + 1).padStart(2, '0')}</span>
            <span class="song-title">${esc(ideaTitle(i))}</span>
            <span class="song-meta">${esc(songLine(i))}</span>
            <button class="mini-btn" data-action="set-song-menu" data-set="${set.id}" data-set-idea="${i.id}" aria-label="Options du morceau">${ICONS.more}</button>
          </div></li>`).join('')}</ol>
        <div class="album-foot"><button class="add-take" data-action="set-add" data-set="${set.id}">+ ajouter des morceaux</button>
          ${songs.length ? `<button class="add-take" data-action="set-stage" data-set="${set.id}">mode scène</button>` : ''}
          ${songs.some(mainTake) ? `<button class="add-take" data-action="set-play" data-set="${set.id}">écouter à la suite</button>` : ''}</div>` : ''}
    </section>`;
  }).join('');
}

function setSheet(set) {
  return openSheet(`<h2>${set ? 'Modifier la setlist' : 'Nouvelle setlist'}</h2>
    <label class="label" for="sName">Nom</label>
    <input class="field" id="sName" maxlength="80" autocomplete="off" placeholder="Ex : Concert de décembre" value="${esc(set ? set.name : '')}">
    <label class="label" for="sNote">Date, lieu (facultatif)</label>
    <input class="field" id="sNote" maxlength="200" autocomplete="off" placeholder="Ex : 14 déc., 21 h" value="${esc(set ? set.note || '' : '')}">
    <div class="row"><button class="btn" data-x>Annuler</button><button class="btn primary" data-ok>${set ? 'Enregistrer' : 'Créer'}</button></div>`,
  (sh, close) => {
    const name = sh.querySelector('#sName');
    const note = sh.querySelector('#sNote');
    setTimeout(() => name.focus(), 60);
    const ok = () => { if (!name.value.trim()) { toast('Donne un nom à la setlist'); return; } close({ name: name.value.trim(), note: note.value.trim() }); };
    name.onkeydown = note.onkeydown = e => { if (e.key === 'Enter') ok(); };
    sh.querySelector('[data-x]').onclick = () => close(null);
    sh.querySelector('[data-ok]').onclick = ok;
  });
}
const setFail = async (e, what) => { fail(e, isNetErr(e) ? 'Il faut du réseau pour modifier une setlist' : what); await reload(); };
async function createSet(items = [], from = null) {
  const v = from || await setSheet(null);
  if (!v) return;
  try {
    const row = await S.store.addSetlist({ name: v.name, note: v.note || '', group_id: scopeGroup(), items });
    S.setlists.push(row);
    ALB_OPEN.add(`set:${row.id}`); saveAlbOpen();
    render();
    if (!items.length && visibleIdeas().length) fillSet(row);
  } catch (e) { fail(e, isNetErr(e) ? 'Il faut du réseau pour créer une setlist' : 'Création impossible'); }
}
// Cocher les morceaux : ils s'ajoutent dans l'ordre où on les touche.
async function fillSet(set) {
  const inSet = new Set(setSongs(set).map(i => i.id));
  const rank = i => { const a = albumOf(i); return a ? [scopeAlbums().indexOf(a), i.track || 0] : [1e9, 0]; };
  const list = visibleIdeas().filter(i => !inSet.has(i.id)).sort((a, b) => rank(a)[0] - rank(b)[0] || rank(a)[1] - rank(b)[1] || ideaTitle(a).localeCompare(ideaTitle(b), 'fr'));
  if (!list.length) { toast(inSet.size ? 'Tous les morceaux sont déjà dans la setlist' : "Il n'y a pas encore de morceau ici"); return; }
  const sel = new Set();
  const ok = await openSheet(`<h2>Ajouter à « ${esc(set.name)} »</h2>
    <p class="sub">Touche les morceaux dans l'ordre où vous les jouez.</p>
    <div class="choices picks">${list.map(i => `<button class="choice pick" data-pick="${i.id}"><span class="ico"></span><span>${esc(ideaTitle(i))}<small>${esc([albumOf(i)?.name, songLine(i)].filter(Boolean).join(' · '))}</small></span></button>`).join('')}</div>
    <div class="row"><button class="btn" data-x>Annuler</button><button class="btn primary" data-ok>Ajouter</button></div>`,
  (sh, close) => {
    const btn = sh.querySelector('[data-ok]');
    const paint = () => sh.querySelectorAll('[data-pick]').forEach(b => {
      const at = [...sel].indexOf(b.dataset.pick);
      b.classList.toggle('on', at >= 0);
      b.querySelector('.ico').textContent = at >= 0 ? at + 1 : '';
    });
    sh.querySelectorAll('[data-pick]').forEach(b => { b.onclick = () => {
      if (!sel.delete(b.dataset.pick)) sel.add(b.dataset.pick);
      paint();
      btn.textContent = sel.size ? `Ajouter ${morceaux(sel.size)}` : 'Ajouter';
    }; });
    sh.querySelector('[data-x]').onclick = () => close(false);
    btn.onclick = () => close(true);
  });
  if (!ok || !sel.size) return;
  set.items = [...setSongs(set).map(i => i.id), ...sel];
  ALB_OPEN.add(`set:${set.id}`); saveAlbOpen();
  render();
  try { await S.store.saveSetlist(set); toast(`${morceaux(sel.size)} dans « ${set.name} »`); } catch (e) { await setFail(e, 'Ajout impossible'); }
}
async function moveSetSong(setId, ideaId, target) {
  const set = setById(setId);
  if (!set) return;
  const ids = setSongs(set).map(i => i.id);
  const from = ids.indexOf(ideaId);
  if (from < 0) return;
  ids.splice(from, 1);
  let to = typeof target === 'number' ? from + target : ids.indexOf(target.refId) + (target.before ? 0 : 1);
  if (typeof target !== 'number' && ids.indexOf(target.refId) < 0) return;
  to = Math.max(0, Math.min(ids.length, to));
  if (to === from) return;
  ids.splice(to, 0, ideaId);
  set.items = ids;
  render();
  try { await S.store.saveSetlist(set); } catch (e) { await setFail(e, 'Déplacement impossible'); }
}
async function setSongMenu(set, idea) {
  const ids = setSongs(set).map(i => i.id);
  const at = ids.indexOf(idea.id);
  const v = await actionSheet(ideaTitle(idea), [
    { label: 'Ouvrir en mode scène', value: 'stage' },
    at > 0 && { label: 'Monter', value: 'up' },
    at < ids.length - 1 && { label: 'Descendre', value: 'down' },
    { label: 'Retirer de la setlist', value: 'out', cls: 'danger', sub: 'Le morceau est gardé' },
  ].filter(Boolean));
  if (v === 'stage') openStage(set, idea.id);
  if (v === 'up') moveSetSong(set.id, idea.id, -1);
  if (v === 'down') moveSetSong(set.id, idea.id, 1);
  if (v === 'out') {
    set.items = ids.filter(id => id !== idea.id);
    render();
    try { await S.store.saveSetlist(set); } catch (e) { await setFail(e, 'Action impossible'); }
  }
}
const setText = set => [set.name + (set.note ? ` (${set.note})` : ''), '', ...setSongs(set).map((i, n) => `${n + 1}. ${ideaTitle(i)}${[i.tona, i.bpm ? `${i.bpm} bpm` : ''].filter(Boolean).length ? ' : ' + [i.tona, i.bpm ? `${i.bpm} bpm` : ''].filter(Boolean).join(', ') : ''}`)].join('\n');
async function setMenu(set) {
  const songs = setSongs(set);
  const v = await actionSheet(set.name, [
    { label: 'Ajouter des morceaux', value: 'fill' },
    songs.length && { label: 'Mode scène', value: 'stage', sub: 'Paroles et accords en grand' },
    { label: 'Nom, date et lieu', value: 'edit', sub: set.note || '' },
    songs.length && { label: 'Copier la liste en texte', value: 'copy', sub: 'Pour un message ou une impression' },
    { label: 'Dupliquer', value: 'dup', sub: 'Pour partir de celle-ci' },
    (isMine(set) || isAdmin(set.group_id)) && { label: 'Supprimer la setlist', value: 'delete', cls: 'danger', sub: 'Les morceaux sont gardés' },
  ].filter(Boolean));
  try {
    if (v === 'fill') return fillSet(set);
    if (v === 'stage') return openStage(set);
    if (v === 'edit') {
      const e = await setSheet(set);
      if (!e) return;
      Object.assign(set, e);
      render();
      await S.store.saveSetlist(set);
    }
    if (v === 'copy') {
      try { await navigator.clipboard.writeText(setText(set)); toast('Liste copiée'); }
      catch { await promptText('Copie ce texte', setText(set), { multiline: true }); }
    }
    if (v === 'dup') return createSet(songs.map(i => i.id), { name: `${set.name} (copie)`.slice(0, 80), note: set.note || '' });
    if (v === 'delete') {
      if (!(await confirmBox(`Supprimer « ${set.name} » ?`, 'Les morceaux et leurs enregistrements ne sont pas touchés.', 'Supprimer'))) return;
      await S.store.deleteSetlist(set.id);
      S.setlists = S.setlists.filter(x => x !== set);
      ALB_OPEN.delete(`set:${set.id}`); saveAlbOpen();
      render();
    }
  } catch (e) { await setFail(e, 'Action impossible'); }
}
function playSet(set) {
  const ids = setSongs(set).map(mainTake).filter(Boolean).map(t => t.id);
  if (!ids.length) return;
  if (S.playing && ids.includes(S.playing) && !audio.paused) audio.pause(); else play(ids[0], ids.slice(1));
}

/* ----- Mode scène : un morceau à la fois, en grand ----- */
const STAGE = { on: false, ids: [], at: 0, name: '', lock: null };
const stageSize = () => { try { return Math.max(.7, Math.min(2, Number(localStorage.getItem('fredon.stageSize')) || 1)); } catch { return 1; } };
async function keepAwake(on) {
  try {
    if (on && !STAGE.lock && navigator.wakeLock) {
      STAGE.lock = await navigator.wakeLock.request('screen');
      STAGE.lock.addEventListener('release', () => { STAGE.lock = null; });
    } else if (!on && STAGE.lock) { const l = STAGE.lock; STAGE.lock = null; await l.release(); }
  } catch {}
}
function stageListenLabel() {
  const b = document.querySelector('#stage [data-listen]');
  if (b) b.textContent = S.playing === b.dataset.listen && !audio.paused ? 'pause' : 'écouter';
}
function paintStage() {
  const el = $('#stage');
  const songs = STAGE.ids.map(ideaById).filter(Boolean);
  if (!songs.length) return closeStage();
  STAGE.at = Math.max(0, Math.min(songs.length - 1, STAGE.at));
  const i = songs[STAGE.at];
  const prev = songs[STAGE.at - 1];
  const next = songs[STAGE.at + 1];
  const take = mainTake(i);
  const music = [i.bpm ? `${i.bpm} bpm` : '', i.tona || ''].filter(Boolean).join(' · ');
  el.style.setProperty('--fs', stageSize());
  el.innerHTML = `<header class="stage-top">
      <span class="stage-pos">${String(STAGE.at + 1).padStart(2, '0')} / ${String(songs.length).padStart(2, '0')}</span>
      <span class="stage-set">${esc(STAGE.name)}</span>
      ${take ? `<button class="txt-btn" data-listen="${take.id}">écouter</button>` : ''}
      <button class="txt-btn" data-size="-1" aria-label="Texte plus petit">A−</button>
      <button class="txt-btn" data-size="1" aria-label="Texte plus grand">A+</button>
      <button class="txt-btn" data-close>fermer</button>
    </header>
    <div class="stage-body">
      <h1 class="stage-title">${esc(ideaTitle(i))}</h1>
      ${music ? `<p class="stage-music">${esc(music)}</p>` : ''}
      ${i.chords ? `<div class="stage-chords">${esc(i.chords)}</div>` : ''}
      ${i.notes ? `<div class="stage-lyrics">${esc(i.notes)}</div>` : ''}
      ${i.chords || i.notes ? '' : '<p class="stage-none">Pas encore de paroles ni d\'accords pour ce morceau.</p>'}
    </div>
    <footer class="stage-nav">
      <button data-go="-1" ${prev ? '' : 'disabled'}><small>précédent</small>${prev ? esc(ideaTitle(prev)) : '–'}</button>
      <button data-go="1" ${next ? '' : 'disabled'}><small>suivant</small>${next ? esc(ideaTitle(next)) : 'fin'}</button>
    </footer>`;
  stageListenLabel();
}
function stageGo(d) {
  const to = STAGE.at + d;
  if (to < 0 || to >= STAGE.ids.length) return;
  if (S.playing && !audio.paused) audio.pause();
  STAGE.at = to;
  paintStage();
}
function closeStage() {
  STAGE.on = false;
  const el = $('#stage');
  if (el) { el.hidden = true; el.innerHTML = ''; }
  document.body.classList.remove('staging');
  if (S.playing && !audio.paused) audio.pause();
  keepAwake(false);
}
function openStage(set, ideaId = null) {
  const songs = setSongs(set);
  if (!songs.length) { toast('Cette setlist est vide'); return; }
  let el = $('#stage');
  if (!el) {
    el = document.createElement('div');
    el.id = 'stage';
    el.className = 'stage';
    document.body.append(el);
    el.onclick = e => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.hasAttribute('data-close')) closeStage();
      if (b.dataset.go) stageGo(+b.dataset.go);
      if (b.dataset.listen) play(b.dataset.listen);
      if (b.dataset.size) { try { localStorage.setItem('fredon.stageSize', (stageSize() + .15 * +b.dataset.size).toFixed(2)); } catch {} el.style.setProperty('--fs', stageSize()); }
    };
    // Glisser le doigt vers la gauche ou la droite change de morceau.
    let sx = 0, sy = 0;
    el.addEventListener('touchstart', e => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
    el.addEventListener('touchend', e => {
      const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
      if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 2 && !e.target.closest('.stage-chords')) stageGo(dx < 0 ? 1 : -1);
    }, { passive: true });
    document.addEventListener('keydown', e => {
      if (!STAGE.on || sheetClose) return;
      if (e.key === 'Escape') closeStage();
      if (['ArrowRight', 'PageDown'].includes(e.key)) { e.preventDefault(); stageGo(1); }
      if (['ArrowLeft', 'PageUp'].includes(e.key)) { e.preventDefault(); stageGo(-1); }
    });
    document.addEventListener('visibilitychange', () => { if (STAGE.on && document.visibilityState === 'visible') keepAwake(true); });
    audio.addEventListener('play', stageListenLabel);
    audio.addEventListener('pause', stageListenLabel);
  }
  Object.assign(STAGE, { on: true, ids: songs.map(i => i.id), at: Math.max(0, songs.findIndex(i => i.id === ideaId)), name: set.name });
  el.hidden = false;
  document.body.classList.add('staging');
  paintStage();
  keepAwake(true);
}

let importDest = null; // idée qui recevra les fichiers choisis (rien = « À trier »)
function pickImport(ideaId = null) { importDest = ideaId; $('#importInput').click(); }
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
  const over = rec.over && idea ? takeById(rec.over.id) : null;
  if (over && over.idea_id === idea.id) {
    take.layer_of = over.id;
    take.offset_ms = rec.over.offset_ms;
    // Rangée juste sous sa prise, après les pistes déjà posées dessus.
    const sibs = takesOf(idea.id);
    const group = [over, ...layersOf(over)];
    const last = group.reduce((m, t) => Math.max(m, t.position), over.position);
    const after = sibs.find(t => t.position > last);
    take.position = after ? (last + after.position) / 2 : last + 1;
  }
  if (!rec.info) rec.info = await computePeaks(rec.blob);
  take.peaks = rec.info ? rec.info.peaks : [];
  await S.store.saveTake(take, rec.blob);
  S.takes.push(take);
  if (idea && rec.bpm && !idea.bpm) idea.bpm = rec.bpm; // enregistrée au métronome : l'idée garde ce tempo
  if (idea) await touchIdea(idea);
  render();
  syncStatus();
  toast(waiting(take.id) ? "Gardé sur l'appareil, envoi au retour du réseau" : idea ? `Rangé dans « ${ideaTitle(idea)} »` : 'Rangé dans « À trier »');
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
    <textarea class="field chords-field" id="tChords" wrap="off" spellcheck="false" autocapitalize="off" autocomplete="off" maxlength="8000" placeholder="Ex : Am  F  C  G&#10;ou toute la grille, une ligne par phrase">${esc(chords)}</textarea>
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
  idea.chords = chords.replace(/\r\n?/g, '\n').replace(/^(\s*\n)+/, '').replace(/\s+$/, ''); // on garde les espaces qui alignent les accords
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

async function startRecording(targetIdeaId = null, overId = null) {
  if (REC.recorder) return;
  // Par-dessus une prise : on prépare ses pistes avant d'ouvrir le micro, pour partir sans attente.
  const overTake = overId ? takeById(overId) : null;
  let overItems = null;
  if (overTake) {
    stopMix();
    audio.pause();
    try {
      setStatus('Préparation des pistes…');
      overItems = await mixItems(overTake);
      setStatus('');
    } catch (e) { setStatus(''); fail(e, 'Lecture impossible'); return; }
    targetIdeaId = overTake.idea_id;
  }
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
  if (overItems) {
    // Au démarrage réel de l'enregistreur, on lance les pistes et on retient l'écart entre les deux.
    const ctx = sharedCtx();
    recorder.onstart = () => {
      const now = ctx.currentTime;
      const t0 = now + .25;
      scheduleMix(ctx, overItems, t0);
      const latency = (ctx.outputLatency || 0) + (ctx.baseLatency || 0);
      REC.over = { id: overTake.id, offset_ms: Math.round(cutIn(overTake) * 1000) - Math.round((t0 - now + latency) * 1000) };
    };
  }
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
  $('#recTarget').textContent = overTake ? `Par-dessus « ${overTake.title || ideaTitle(idea)} » · au casque` : idea ? `Suite de « ${ideaTitle(idea)} »` : '';
  document.querySelector('.rec-metro').hidden = !!overTake;
  REC.bpm = (idea && idea.bpm) || savedBpm();
  REC.metro = !overTake && savedMetro(); // par-dessus une prise, c'est elle qui donne le tempo
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
  if (REC.over) stopMix();
  REC.stream.getTracks().forEach(t => t.stop());
  try { REC.ctx && REC.ctx.close(); } catch {}
  try { REC.wake && REC.wake.release(); } catch {}
  $('#recOverlay').hidden = true;
  const type = REC.recorder.mimeType || REC.chunks[0]?.type || 'audio/webm';
  const result = { blob: new Blob(REC.chunks, { type }), duration: REC.duration, mime: type.split(';')[0], bpm: REC.metroUsed ? REC.bpm : null, over: REC.over || null };
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

  // Enregistrée par-dessus une prise : on demande seulement l'instrument, ou de la jeter.
  if (rec.over && takeById(rec.over.id)) {
    rec.instrument = rec.instrument || lastInstrument();
    const v = await openSheet(`
      <h2>Piste enregistrée</h2>
      <p class="sub">${fmtDur(rec.duration)} · par-dessus « ${esc(takeById(rec.over.id).title || ideaTitle(ideaById(target)))} »</p>
      <div class="inst-picker">${INSTRUMENTS.map(i =>
        `<button class="inst-btn ${i.id === rec.instrument ? 'on' : ''}" data-inst="${i.id}">${i.icon}<span>${i.label}</span></button>`).join('')}</div>
      <div class="row"><button class="btn" data-x>Supprimer</button><button class="btn primary" data-ok>Garder</button></div>`,
    (sh, close) => {
      sh.querySelectorAll('[data-inst]').forEach(btn => {
        btn.onclick = () => {
          rec.instrument = btn.dataset.inst;
          rememberInstrument(rec.instrument);
          sh.querySelectorAll('[data-inst]').forEach(b => b.classList.toggle('on', b === btn));
        };
      });
      sh.querySelector('[data-x]').onclick = () => close('discard');
      sh.querySelector('[data-ok]').onclick = () => close('ok');
    });
    if (v === 'discard') { toast('Piste supprimée'); return; }
    await save(target);
    return;
  }

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
    { label: 'Tempo et tonalité', ico: '♩', value: 'tempo', sub: [idea.bpm ? `${idea.bpm} bpm` : '', idea.tona || '', (idea.chords || '').split('\n')[0].trim()].filter(Boolean).join(' · ') },
    { label: idea.starred ? 'Retirer des favoris' : 'Ajouter aux favoris', ico: '★', value: 'star' },
    isCloud() && !group && S.groups.length && isMine(idea) && { label: 'Partager avec un groupe', value: 'share', sub: 'Les membres pourront écouter et ajouter' },
    group && isMine(idea) && { label: `Retirer de « ${group.name} »`, value: 'unshare', sub: 'Elle redevient personnelle' },
    isCloud() && { label: 'Ranger dans un album', value: 'album', sub: albumOf(idea)?.name || '' },
    { label: 'Importer des enregistrements', ico: '↑', value: 'import', sub: 'Des fichiers audio de cet appareil' },
    takesOf(idea.id).length && { label: 'Exporter pour Reaper', ico: '↓', value: 'export', sub: 'Un fichier WAV par piste, déjà calés, dans un .zip' },
    { label: 'Fusionner avec une autre idée', ico: '⇄', value: 'merge', sub: 'Déplace toutes ses prises' },
    canDeleteIdea(idea) && { label: "Supprimer l'idée", ico: '✕', value: 'delete', cls: 'danger', sub: group ? 'Chaque prise retourne chez son auteur' : 'Ses prises retournent dans « À trier »' },
  ].filter(Boolean));
  try {
    if (v === 'rename') return renameIdea(idea);
    if (v === 'tempo') return editTempo(idea);
    if (v === 'export') return exportIdea(idea);
    if (v === 'import') return pickImport(idea.id);
    if (v === 'album') return fileIdea(idea);
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
      idea.album_id = null; // les albums ne suivent pas d'un espace à l'autre
      const name = myMember(g.id)?.name || '';
      for (const t of takesOf(idea.id)) if (isMine(t) && !t.author) { t.author = name; await S.store.saveTake(t); }
      await touchIdea(idea);
      render();
      toast(`Partagée avec « ${g.name} »`);
    }
    if (v === 'unshare') {
      idea.group_id = null;
      idea.album_id = null;
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

// Recaler une piste posée par-dessus une prise : plus tôt ou plus tard, par pas de 10 ms.
async function nudgeTake(take) {
  const baseTake = baseOf(take);
  if (!baseTake) return;
  const before = take.offset_ms || 0;
  const zero = Math.round(cutIn(baseTake) * 1000); // on affiche l'écart par rapport au début gardé de la prise
  const v = await openSheet(`
    <h2>Recaler la piste</h2>
    <p class="sub">Si elle arrive en retard sur l'autre, avance-la. Si elle arrive en avance, retarde-la.</p>
    <div class="nudge">
      <button class="btn" data-d="-50">−50</button><button class="btn" data-d="-10">−10</button>
      <b id="nudgeVal">${fmtMs(before - zero)}</b>
      <button class="btn" data-d="10">+10</button><button class="btn" data-d="50">+50</button>
    </div>
    <p class="hint">Moins = plus tôt. Plus = plus tard.</p>
    <button class="btn" data-listen style="width:100%">Écouter ensemble</button>
    <div class="row"><button class="btn" data-x>Annuler</button><button class="btn primary" data-ok>Enregistrer</button></div>`,
  (sh, close) => {
    const listen = sh.querySelector('[data-listen]');
    const restart = async () => { stopMix(); await playMix(baseTake.id); listen.textContent = MIX.id ? 'Arrêter' : 'Écouter ensemble'; };
    sh.querySelectorAll('[data-d]').forEach(b => {
      b.onclick = () => {
        take.offset_ms = Math.max(before - 2000, Math.min(before + 2000, (take.offset_ms || 0) + Number(b.dataset.d)));
        sh.querySelector('#nudgeVal').textContent = fmtMs(take.offset_ms - zero);
        if (MIX.id) restart();
      };
    });
    listen.onclick = () => { if (MIX.id) { stopMix(); listen.textContent = 'Écouter ensemble'; } else restart(); };
    sh.querySelector('[data-x]').onclick = () => close('cancel');
    sh.querySelector('[data-ok]').onclick = () => close('ok');
  });
  stopMix();
  if (v !== 'ok') { take.offset_ms = before; return; }
  if (take.offset_ms === before) return;
  try { await S.store.saveTake(take); render(); toast('Piste recalée'); }
  catch (e) { take.offset_ms = before; fail(e, 'Non enregistré'); }
}

async function takeMenu(take) {
  const v = await actionSheet(take.title || 'Prise', [
    { label: 'Renommer', ico: '✎', value: 'rename' },
    { label: 'Instrument', value: 'instrument', sub: instrumentOf(take.instrument)?.label || 'Non précisé' },
    { label: 'Note', ico: '¶', value: 'note' },
    take.idea_id && ideaById(take.idea_id) && { label: 'Enregistrer par-dessus', ico: '+', value: 'over', sub: 'Tu joues en écoutant cette prise, au casque' },
    baseOf(take) && { label: 'Recaler la piste', ico: '↔', value: 'nudge', sub: `Décalage : ${fmtMs((take.offset_ms || 0) - Math.round(cutIn(baseOf(take)) * 1000))}` },
    { label: 'Couper le début et la fin', ico: '✂', value: 'cut', sub: isCut(take) ? `Garde ${fmtDur(lenOf(take))} sur ${fmtDur(take.duration)}` : '' },
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
    if (v === 'over') return startRecording(take.idea_id, (baseOf(take) || take).id);
    if (v === 'nudge') return nudgeTake(take);
    if (v === 'cut') return cutTake(take);
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

/* ---------------- Coupe et export ---------------- */
const fmtT = s => { s = Math.max(0, s); return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`; };

// Couper le début et la fin d'une prise. Le fichier n'est pas touché : on retient deux repères.
async function cutTake(take) {
  const full = take.duration || 0;
  if (full < 1) { toast('Prise trop courte pour être coupée.'); return; }
  const before = { a: take.trim_a || 0, b: take.trim_b ?? null };
  let a = cutIn(take), b = cutOut(take);
  const stopListen = () => { if (S.playing === take.id) { audio.pause(); S.playing = null; updatePlayUI(); } };
  audio.pause(); S.playing = null; stopMix(); updatePlayUI();
  const v = await openSheet(`
    <h2>Couper le début et la fin</h2>
    <p class="sub">Fais glisser les deux poignées. Rien n'est effacé : tu peux revenir en arrière quand tu veux.</p>
    <div class="cut">${waveSvg({ ...take, trim_a: 0, trim_b: null }, 'w-base')}<i class="cut-off l"></i><i class="cut-off r"></i><i class="cut-pos"></i>
      <button class="cut-h" data-h="a" aria-label="Début"></button><button class="cut-h" data-h="b" aria-label="Fin"></button></div>
    <div class="cut-rows">
      <div><span>Début</span><button class="btn" data-n="a" data-d="-0.1">−</button><b id="cutA"></b><button class="btn" data-n="a" data-d="0.1">+</button></div>
      <div><span>Fin</span><button class="btn" data-n="b" data-d="-0.1">−</button><b id="cutB"></b><button class="btn" data-n="b" data-d="0.1">+</button></div>
    </div>
    <p class="hint"><span id="cutLen"></span> · <button class="txt-btn" data-all>tout garder</button></p>
    <button class="btn" data-listen style="width:100%">Écouter le résultat</button>
    <div class="row"><button class="btn" data-x>Annuler</button><button class="btn primary" data-ok>Enregistrer</button></div>`,
  (sh, close) => {
    const box = sh.querySelector('.cut');
    const listen = sh.querySelector('[data-listen]');
    const playing = () => S.playing === take.id && !audio.paused;
    const start = () => { audio.pause(); S.playing = null; play(take.id); };
    const apply = () => {
      a = Math.max(0, Math.min(a, full - .3));
      b = Math.max(a + .3, Math.min(b, full));
      take.trim_a = a < .05 ? 0 : Math.round(a * 1000);
      take.trim_b = b > full - .05 ? null : Math.round(b * 1000);
      sh.querySelector('.cut-off.l').style.width = `${a / full * 100}%`;
      sh.querySelector('.cut-off.r').style.width = `${(1 - b / full) * 100}%`;
      sh.querySelector('[data-h="a"]').style.left = `${a / full * 100}%`;
      sh.querySelector('[data-h="b"]').style.left = `${b / full * 100}%`;
      sh.querySelector('#cutA').textContent = fmtT(a);
      sh.querySelector('#cutB').textContent = fmtT(b);
      sh.querySelector('#cutLen').textContent = `Il reste ${fmtT(b - a)} sur ${fmtT(full)}`;
    };
    apply();
    sh.querySelectorAll('.cut-h').forEach(h => {
      let was = false;
      h.onpointerdown = e => { e.preventDefault(); h.setPointerCapture(e.pointerId); was = playing(); stopListen(); h.dataset.drag = '1'; };
      h.onpointermove = e => {
        if (!h.dataset.drag) return;
        const r = box.getBoundingClientRect();
        const t = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * full;
        if (h.dataset.h === 'a') a = Math.min(t, b - .3); else b = Math.max(t, a + .3);
        apply();
      };
      h.onpointerup = h.onpointercancel = () => { if (!h.dataset.drag) return; delete h.dataset.drag; if (was) start(); };
    });
    sh.querySelectorAll('[data-n]').forEach(btn => {
      btn.onclick = () => {
        const d = Number(btn.dataset.d);
        if (btn.dataset.n === 'a') a = Math.min(a + d, b - .3); else b = Math.max(b + d, a + .3);
        const was = playing();
        apply();
        if (was) start();
      };
    });
    sh.querySelector('[data-all]').onclick = () => { stopListen(); a = 0; b = full; apply(); };
    listen.onclick = () => { if (playing()) stopListen(); else start(); };
    const pos = sh.querySelector('.cut-pos');
    const tick = () => {
      if (!sh.isConnected) return;
      const on = S.playing === take.id;
      listen.textContent = on && !audio.paused ? 'Arrêter' : 'Écouter le résultat';
      pos.style.display = on ? 'block' : 'none';
      if (on) pos.style.left = `${Math.min(100, audio.currentTime / full * 100)}%`;
      requestAnimationFrame(tick);
    };
    tick();
    sh.querySelector('[data-x]').onclick = () => close('cancel');
    sh.querySelector('[data-ok]').onclick = () => close('ok');
  });
  stopListen();
  const restore = () => { take.trim_a = before.a; take.trim_b = before.b; };
  if (v !== 'ok') { restore(); return; }
  if ((take.trim_a || 0) === before.a && (take.trim_b ?? null) === before.b) return;
  try { await S.store.saveTake(take); render(); toast(isCut(take) ? 'Prise coupée' : 'Prise entière rétablie'); }
  catch (e) { restore(); render(); fail(e, 'Non enregistré'); }
}

/*<pur>*/
// Fichier WAV 16 bits à partir de canaux en nombres flottants.
function wavBytes(chans, rate) {
  const n = chans[0].length, c = chans.length;
  const out = new DataView(new ArrayBuffer(44 + n * c * 2));
  const str = (o, s) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); out.setUint32(4, 36 + n * c * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
  out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, c, true);
  out.setUint32(24, rate, true); out.setUint32(28, rate * c * 2, true); out.setUint16(32, c * 2, true); out.setUint16(34, 16, true);
  str(36, 'data'); out.setUint32(40, n * c * 2, true);
  let o = 44;
  for (let i = 0; i < n; i++) for (let k = 0; k < c; k++) {
    const v = Math.max(-1, Math.min(1, chans[k][i]));
    out.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true);
    o += 2;
  }
  return new Uint8Array(out.buffer);
}
let crcTable = null;
function crc32(u8) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c >>> 0; }
  }
  let c = 0xffffffff;
  for (let i = 0; i < u8.length; i++) c = crcTable[(c ^ u8[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
// Archive .zip sans compression (le son ne se compresse presque pas) : une liste de morceaux à assembler.
function zipParts(files, date = new Date()) {
  const enc = new TextEncoder();
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  const parts = [], central = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const data = typeof f.data === 'string' ? enc.encode(f.data) : f.data;
    const crc = crc32(data);
    const head = new DataView(new ArrayBuffer(30));
    head.setUint32(0, 0x04034b50, true); head.setUint16(4, 20, true); head.setUint16(6, 0x0800, true); head.setUint16(8, 0, true);
    head.setUint16(10, time, true); head.setUint16(12, day, true); head.setUint32(14, crc, true);
    head.setUint32(18, data.length, true); head.setUint32(22, data.length, true); head.setUint16(26, name.length, true);
    parts.push(new Uint8Array(head.buffer), name, data);
    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true); cd.setUint16(4, 20, true); cd.setUint16(6, 20, true); cd.setUint16(8, 0x0800, true);
    cd.setUint16(12, time, true); cd.setUint16(14, day, true); cd.setUint32(16, crc, true);
    cd.setUint32(20, data.length, true); cd.setUint32(24, data.length, true); cd.setUint16(28, name.length, true);
    cd.setUint32(42, offset, true);
    central.push(new Uint8Array(cd.buffer), name);
    offset += 30 + name.length + data.length;
  }
  const cdSize = central.reduce((s, p) => s + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
  return [...parts, ...central, new Uint8Array(end.buffer)];
}
// Projet Reaper minimal : une piste par fichier, chaque fichier posé à sa place.
function rppText(tracks, bpm) {
  const q = s => `"${String(s).replace(/"/g, "'")}"`;
  const L = ['<REAPER_PROJECT 0.1 "6.0"'];
  if (bpm) L.push(`  TEMPO ${bpm} 4 4`);
  for (const t of tracks) {
    L.push('  <TRACK', `    NAME ${q(t.name)}`, '    <ITEM', `      POSITION ${t.pos.toFixed(6)}`, `      LENGTH ${t.len.toFixed(6)}`,
      `      NAME ${q(t.name)}`, '      <SOURCE WAVE', `        FILE ${q(t.file)}`, '      >', '    >', '  >');
  }
  L.push('>');
  return L.join('\r\n') + '\r\n';
}
/*</pur>*/

// Exporter une idée : un WAV par piste. Les pistes d'un même groupe commencent toutes au même instant.
async function exportIdea(idea) {
  const bases = takesOf(idea.id).filter(t => !baseOf(t));
  if (!bases.length) { toast('Cette idée est vide.'); return; }
  const clean = s => String(s).replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim();
  try {
    const files = [], tracks = [];
    let at = 0;
    for (const [n, base] of bases.entries()) {
      setStatus(`Préparation de l'export… ${n + 1}/${bases.length}`);
      const items = await mixItems(base);
      const num = String(n + 1).padStart(2, '0');
      let span = 0, k = 0;
      for (const it of items) {
        const lead = Math.max(0, -it.pos), pad = Math.max(0, it.pos);
        const rate = it.buf.sampleRate;
        const from = Math.round((it.skip + lead) * rate);
        const count = Math.min(it.buf.length - from, Math.round((it.len - lead) * rate));
        if (count < rate * .01) continue;
        const lag = Math.round(pad * rate);
        const chans = [];
        for (let c = 0; c < it.buf.numberOfChannels; c++) {
          const out = new Float32Array(lag + count);
          out.set(it.buf.getChannelData(c).subarray(from, from + count), lag);
          chans.push(out);
        }
        const isBase = it.take === base;
        const inst = instrumentOf(it.take.instrument)?.label;
        const label = [it.take.title || (isBase ? `Prise ${n + 1}` : 'Piste'), inst, it.take.author].filter(Boolean).join(' - ');
        const file = clean(`${num}${isBase ? '' : '.' + (++k)} ${label}`) + '.wav';
        files.push({ name: file, data: wavBytes(chans, rate) });
        tracks.push({ name: clean(`${num}${isBase ? '' : '.' + k} ${label}`), file, pos: at, len: (lag + count) / rate });
        span = Math.max(span, (lag + count) / rate);
      }
      at = Math.ceil(at + span + 1);
    }
    if (!files.length) { setStatus(''); toast('Rien à exporter.'); return; }
    const title = clean(ideaTitle(idea)) || 'idee';
    const infos = [ideaTitle(idea), '',
      idea.bpm ? `Tempo : ${idea.bpm} bpm` : '', idea.tona ? `Tonalité : ${idea.tona}` : '', idea.chords ? (idea.chords.includes('\n') ? `Accords :\n${idea.chords}` : `Accords : ${idea.chords}`) : '',
      idea.notes ? `\n${idea.notes}\n` : '',
      'Dans Reaper : ouvre le fichier .rpp, tout est déjà en place.',
      'Sinon, glisse les .wav dans ton logiciel. Les fichiers qui portent le même numéro (01, 01.1, 01.2…) vont ensemble :',
      'aligne-les tous sur le même point de départ et ils sont calés.',
      '', ...tracks.map(t => `${t.file}   départ ${fmtT(t.pos)}   durée ${fmtT(t.len)}`), ''].filter(l => l !== '').join('\r\n');
    files.push({ name: `${title}.rpp`, data: rppText(tracks, idea.bpm) });
    files.push({ name: 'infos.txt', data: infos });
    const blob = new Blob(zipParts(files), { type: 'application/zip' });
    setStatus('');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${title} - Rec.zip`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 10000);
    toast(`Export prêt : ${plural(files.length - 2, 'piste')}`);
  } catch (e) { setStatus(''); fail(e, 'Export impossible'); }
}

/* ---------------- Discussion d'une idée de groupe ---------------- */
async function talkSheet(idea) {
  const fresh = new Set(newsOf(idea).talk.map(c => c.id));
  let open = true;
  await openSheet(`
    <h2>Discussion</h2>
    <p class="sub">${esc(ideaTitle(idea))}</p>
    <div class="talk"></div>
    <div class="talk-form"><textarea class="field" rows="2" maxlength="2000" placeholder="Écrire au groupe…"></textarea><button class="btn primary" data-send>Envoyer</button></div>`,
  sh => {
    const box = sh.querySelector('.talk'), area = sh.querySelector('textarea'), send = sh.querySelector('[data-send]');
    const draw = (down = true) => {
      const list = commentsOf(idea.id);
      box.innerHTML = list.length ? list.map(c => `<div class="msg">
        <div class="msg-head"><b>${esc(c.author || 'Sans nom')}</b><span>${esc(ago(c.created_at))}</span>${fresh.has(c.id) ? '<span class="news">nouveau</span>' : ''}
          ${c.user_id === me() || isAdmin(idea.group_id) ? `<button class="txt-btn" data-del="${c.id}">effacer</button>` : ''}</div>
        <p>${esc(c.body)}</p></div>`).join('')
        : '<p class="hint">Personne n\'a encore écrit. Une remarque sur une prise, une idée de structure, la date de la prochaine répète…</p>';
      if (down) box.scrollTop = box.scrollHeight;
    };
    box.onclick = async e => {
      const b = e.target.closest('[data-del]');
      if (!b) return;
      try { await S.store.deleteComment(b.dataset.del); S.comments = S.comments.filter(c => c.id !== b.dataset.del); draw(false); }
      catch (err) { fail(err, 'Message non effacé'); }
    };
    const post = async () => {
      const body = area.value.trim();
      if (!body || send.disabled) return;
      send.disabled = true;
      try {
        const c = await S.store.addComment({ idea_id: idea.id, author: myMember(idea.group_id)?.name || lastName(), body });
        S.comments.push(c);
        area.value = '';
        draw();
      } catch (err) { fail(err, 'Message non envoyé'); }
      send.disabled = false;
    };
    send.onclick = post;
    // Sur PC, Entrée envoie (Maj+Entrée pour aller à la ligne). Au doigt, on passe par le bouton.
    area.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey && !matchMedia('(pointer: coarse)').matches) { e.preventDefault(); post(); } };
    draw();
    // Tant que la discussion est ouverte, on regarde de temps en temps si quelqu'un a répondu.
    const poll = setInterval(async () => {
      if (!open) { clearInterval(poll); return; }
      try {
        const all = await S.store.listComments();
        if (open && all.length !== S.comments.length) { S.comments = all; draw(); }
      } catch {}
    }, 10000);
  });
  open = false;
  markSeen(idea);
  render();
}

// Lien d'invitation : l'adresse de l'appli suivie de ?rejoindre=CODE&de=Prénom.
const inviteLink = (code, from = '') => `${location.origin}${location.pathname}?rejoindre=${encodeURIComponent(code)}${from ? '&de=' + encodeURIComponent(from) : ''}`;
// L'invitation en attente est gardée sur l'appareil : elle survit à la création du compte et à l'e-mail de confirmation.
const pendingInvite = () => { try { const v = JSON.parse(localStorage.getItem('fredon.invite')); return v && v.code ? v : null; } catch { return null; } };
const keepInvite = inv => { try { localStorage.setItem('fredon.invite', JSON.stringify(inv)); } catch {} };
const dropInvite = () => { try { localStorage.removeItem('fredon.invite'); } catch {} };
function catchInvite() {
  const q = new URLSearchParams(location.search);
  const code = (q.get('rejoindre') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
  if (!code) return;
  keepInvite({ code, from: (q.get('de') || '').slice(0, 30), name: (q.get('moi') || '').slice(0, 30) });
  history.replaceState(null, '', location.pathname);
}
async function joinInvite() {
  const inv = pendingInvite();
  dropInvite();
  if (!inv || !isCloud()) return;
  try {
    const gid = await S.store.joinGroup(inv.code, inv.name || lastName());
    await reload();
    setScope(gid);
    toast(`Bienvenue dans « ${groupById(gid)?.name || 'le groupe'} »`);
  } catch (e) { fail(e, 'Impossible de rejoindre le groupe'); }
}
// Page d'accueil d'une invitation : qui invite, dans quel groupe, et le strict nécessaire pour entrer.
async function inviteWelcome() {
  const inv = pendingInvite();
  if (!inv || sheetClose) return;
  let cloud = S.store && S.store.kind === 'cloud' ? S.store : null;
  try { if (!cloud) { cloud = new CloudStore(loadConfig()); await cloud.init(); } }
  catch (e) { fail(e, 'Invitation illisible pour le moment'); return; }
  if (isCloud()) {
    const mine = S.groups.find(g => g.code === inv.code);
    if (mine) { dropInvite(); setScope(mine.id); toast(`Tu es déjà dans « ${mine.name} »`); return; }
    if (inv.name) return joinInvite(); // prénom déjà donné avant l'e-mail de confirmation : on entre directement
  }
  let info = null;
  try { info = await cloud.inviteInfo(inv.code); } catch {}
  if (!info) {
    dropInvite();
    await openSheet(`<div class="invite"><p class="invite-brand">Rec<i>.</i></p>
      <h2>Cette invitation n'est plus valable</h2>
      <p class="sub">Le groupe a peut-être été supprimé, ou le lien est incomplet. Demande un nouveau lien à tes musiciens.</p>
      <button class="btn primary wide" data-ok>D'accord</button></div>`,
    (sh, close) => { sh.querySelector('[data-ok]').onclick = () => close(); });
    if (!isCloud()) openSettings();
    return;
  }
  const from = inv.from || info.admin || '';
  let mode = cloud.user ? 'join' : 'signup';
  let waiting = false;
  const v = await openSheet('<div class="invite"></div>', (sh, close) => {
    const root = sh.querySelector('.invite');
    const draw = () => {
      const who = root.querySelector('#iWho')?.value ?? lastName();
      const mail = root.querySelector('#iEmail')?.value ?? '';
      root.innerHTML = `
        <p class="invite-brand">Rec<i>.</i></p>
        <h2>${from ? `<em>${esc(from)}</em> t'invite à rejoindre` : 'Tu es invité à rejoindre'} <em>${esc(info.name)}</em></h2>
        <p class="sub">Rec. est le carnet d'idées du groupe : chacun enregistre ses idées au téléphone, tout le monde les écoute et ajoute les siennes.</p>
        <label class="label" for="iWho">Ton prénom</label>
        <input class="field" id="iWho" value="${esc(who)}" placeholder="Ex : Léo" autocomplete="given-name" maxlength="30">
        ${mode === 'join' ? '' : `
        <label class="label" for="iEmail">Ton e-mail</label>
        <input class="field" id="iEmail" type="email" value="${esc(mail)}" autocomplete="username" inputmode="email">
        <label class="label" for="iPass">${mode === 'signup' ? 'Choisis un mot de passe' : 'Ton mot de passe'}</label>
        <input class="field" id="iPass" type="password" autocomplete="${mode === 'signup' ? 'new-password' : 'current-password'}">
        ${mode === 'signup' ? '<p class="hint">8 caractères ou plus.</p>' : ''}`}
        <button class="btn primary wide" data-go>${mode === 'signup' ? "S'inscrire et rejoindre le groupe" : mode === 'login' ? 'Me connecter et rejoindre le groupe' : 'Rejoindre le groupe'}</button>
        <div class="invite-foot">
          ${mode === 'join' ? '' : `<button class="txt-btn accent" data-swap>${mode === 'signup' ? "J'ai déjà un compte" : 'Je n\'ai pas encore de compte'}</button>`}
          <button class="txt-btn" data-later>plus tard</button>
        </div>`;
      const swap = root.querySelector('[data-swap]');
      if (swap) swap.onclick = () => { mode = mode === 'signup' ? 'login' : 'signup'; draw(); };
      root.querySelector('[data-later]').onclick = () => close('later');
      const go = root.querySelector('[data-go]');
      go.onclick = async () => {
        const name = root.querySelector('#iWho').value.trim();
        if (!name) { toast('Il manque ton prénom'); return; }
        keepInvite({ ...inv, name });
        try { localStorage.setItem('fredon.name', name); } catch {}
        if (mode === 'join') { close('go'); return; }
        const email = root.querySelector('#iEmail').value.trim();
        const pass = root.querySelector('#iPass').value;
        if (!email || !pass) { toast('Il manque ton e-mail ou ton mot de passe'); return; }
        if (mode === 'signup' && pass.length < 8) { toast('Choisis un mot de passe de 8 caractères ou plus'); return; }
        const label = go.textContent;
        go.disabled = true;
        go.textContent = mode === 'signup' ? 'Création du compte…' : 'Connexion…';
        try {
          if (mode === 'signup') {
            const open = await cloud.signUp(email, pass, inviteLink(inv.code, from) + '&moi=' + encodeURIComponent(name));
            if (!open) {
              waiting = true;
              root.innerHTML = `
                <p class="invite-brand">Rec<i>.</i></p>
                <h2>Plus qu'une étape</h2>
                <p class="sub">On vient d'envoyer un e-mail à <strong>${esc(email)}</strong>. Ouvre-le et touche le lien de confirmation : tu arriveras directement dans <em>${esc(info.name)}</em>.</p>
                <p class="hint">Rien reçu au bout d'une minute ? Regarde dans les indésirables.</p>
                <button class="btn wide" data-ok>D'accord</button>`;
              root.querySelector('[data-ok]').onclick = () => close('wait');
              return;
            }
          } else await cloud.signIn(email, pass);
          close('go');
        } catch (e) {
          go.disabled = false;
          go.textContent = label;
          fail(e, mode === 'signup' ? 'Inscription impossible' : 'Connexion impossible');
        }
      };
    };
    draw();
  });
  if (v === 'go') {
    try {
      saveConfig({ ...loadConfig(), mode: 'cloud' });
      await useStore(cloud, true);
      setStatus('');
      await joinInvite();
    } catch (e) { fail(e, 'Impossible de rejoindre le groupe'); }
    return;
  }
  if (!waiting) dropInvite(); // « plus tard » : on n'insiste pas, le lien pourra être rouvert
  if (!isCloud()) setStatus(waiting ? 'Confirme ton adresse depuis l\'e-mail reçu, puis reviens ici.' : 'Connecte-toi dans les réglages pour retrouver tes vocaux.');
}
const checkInvite = inviteWelcome;

/* ---------------- Groupes ---------------- */
function nameField(value) {
  return `<label class="label" for="gWho">Ton prénom dans le groupe</label>
    <input class="field" id="gWho" value="${esc(value)}" placeholder="Ex : Léo" autocomplete="off" maxlength="30">
    <p class="hint">Il s'affiche à côté des prises que tu enregistres.</p>`;
}

async function addGroup(inviteCode = '') {
  const how = inviteCode ? 'join' : await openSheet(`
    <h2>Groupe</h2>
    <p class="sub">Un espace partagé avec tes musiciens.</p>
    <button class="big-choice" data-go="create"><b>Créer un groupe</b><span>Tu en seras l'admin et tu inviteras les autres.</span></button>
    <button class="big-choice" data-go="join"><b>Rejoindre un groupe</b><span>Avec le code que l'admin t'a donné.</span></button>`,
  (sh, close) => sh.querySelectorAll('[data-go]').forEach(b => { b.onclick = () => close(b.dataset.go); }));
  if (!how) return;
  const create = how === 'create';
  const v = await openSheet(`
    <h2>${create ? 'Créer un groupe' : 'Rejoindre un groupe'}</h2>
    ${inviteCode ? '<p class="sub">Tu as reçu une invitation. Il ne manque que ton prénom.</p>' : ''}
    <label class="label" for="gMain">${create ? 'Nom du groupe' : "Code d'invitation"}</label>
    <input class="field ${create ? '' : 'code-input'}" id="gMain" placeholder="${create ? 'Ex : Les Nocturnes' : 'Ex : K7M2PQ9X'}" autocomplete="off" maxlength="${create ? 40 : 12}">
    ${nameField(lastName())}
    <div class="row"><button class="btn" data-x>Annuler</button><button class="btn primary" data-ok>${create ? 'Créer' : 'Rejoindre'}</button></div>`,
  (sh, close) => {
    const main = sh.querySelector('#gMain');
    const who = sh.querySelector('#gWho');
    if (inviteCode) main.value = inviteCode;
    setTimeout(() => (inviteCode ? who : main).focus(), 60);
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
    <label class="label" for="gLink">Lien d'invitation</label>
    <div class="code-row link-row"><input class="link" id="gLink" readonly value="${esc(inviteLink(g.code, myMember(gid)?.name || ''))}"><button class="txt-btn accent" data-copy>copier</button></div>
    ${navigator.share ? '<button class="btn" data-link style="width:100%;margin-top:12px">Envoyer le lien</button>' : ''}
    <p class="hint">Colle ce lien dans un message. Tes musiciens l'ouvrent, créent leur compte ou se connectent, et arrivent dans le groupe. Si le lien ne passe pas : « + groupe », « Rejoindre un groupe », puis le code <b class="code-mini">${esc(g.code)}</b>.</p>
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
      const field = sh.querySelector('#gLink');
      try { await navigator.clipboard.writeText(field.value); e.target.textContent = 'copié'; }
      catch { field.focus(); field.select(); toast('Lien sélectionné : copie-le'); }
    };
    sh.querySelector('#gLink').onfocus = e => e.target.select();
    const send = sh.querySelector('[data-link]');
    if (send) send.onclick = async () => {
      try { await navigator.share({ title: 'Rec.', text: `Rejoins « ${g.name} » sur Rec.`, url: sh.querySelector('#gLink').value }); } catch {}
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
  DRAG.kind = p.kind || 'take';
  DRAG.set = p.set || null;
  const g = p.el.cloneNode(true);
  g.classList.add('ghost-drag');
  g.style.width = `${r.width}px`;
  g.style.setProperty('--c', getComputedStyle(p.el).getPropertyValue('--c'));
  document.body.append(g);
  DRAG.ghost = g;
  p.el.classList.add('lifting');
  document.body.classList.add('dragging');
  if (DRAG.kind === 'take') ensureDragZones();
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
  if (DRAG.kind === 'set') { // l'ordre d'une setlist : on reste dans la même liste
    const row = under && under.closest('.set-song');
    if (!row || row.closest('[data-setlist]')?.dataset.setlist !== DRAG.set || row.dataset.setSong === DRAG.id) return;
    const r = row.getBoundingClientRect();
    DRAG.target = { refId: row.dataset.setSong, before: y < r.top + r.height / 2 };
    row.classList.add(DRAG.target.before ? 'drop-before' : 'drop-after');
    return;
  }
  if (DRAG.kind === 'idea') {
    const sec = under && under.closest('[data-album]');
    if (!sec) return;
    sec.classList.add('drop-hover');
    const target = { album: sec.dataset.album };
    const row = under.closest('.song');
    if (row && row.dataset.song !== DRAG.id && target.album !== 'none') {
      const r = row.querySelector('.song-row').getBoundingClientRect();
      target.refId = row.dataset.song;
      target.before = y < r.top + r.height / 2;
      row.classList.add(target.before ? 'drop-before' : 'drop-after');
    }
    DRAG.target = target;
    return;
  }
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
  const { id, target, kind, set } = DRAG;
  Object.assign(DRAG, { active: false, pending: null, ghost: null, el: null, target: null });
  DRAG.justDropped = Date.now();
  render();
  if (!cancel && target && kind === 'set') moveSetSong(set, id, target);
  else if (!cancel && target) (kind === 'idea' ? moveSong : moveTake)(id, target);
}

const dragOf = (t, x, y) => ({ id: t.dataset.id || t.dataset.idea || t.dataset.setIdea, set: t.dataset.setIdea ? t.dataset.set : null,
  kind: t.dataset.setIdea ? 'set' : t.dataset.idea ? 'idea' : 'take', el: t, x, y });
function wireDrag() {
  const board = $('#board');
  // Souris / stylet
  board.addEventListener('pointerdown', e => {
    if (e.pointerType === 'touch' || e.button !== 0) return;
    const t = e.target.closest('.take, .song-row');
    if (!t || e.target.closest('button')) return;
    DRAG.pending = dragOf(t, e.clientX, e.clientY);
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
    const t = e.target.closest('.take, .song-row');
    if (!t || e.target.closest('button') || e.touches.length > 1) return;
    const pt = e.touches[0];
    DRAG.pending = dragOf(t, pt.clientX, pt.clientY);
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
  board.addEventListener('contextmenu', e => { if (e.target.closest('.take, .song-row')) e.preventDefault(); });
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
        setTimeout(checkInvite, 300);
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

// Bandeau d'état de la synchro : hors connexion, ou des éléments en attente d'envoi.
let syncShown = false;
function syncStatus() {
  const n = waitCount();
  const wait = n ? `${n} ${n > 1 ? 'éléments attendent' : 'élément attend'} d'être ${n > 1 ? 'envoyés' : 'envoyé'}.` : '';
  if (S.offline) setStatus(`Hors connexion. Tu peux enregistrer : tout partira au retour du réseau. ${wait}`.trim());
  else if (n) setStatus(`${wait} Envoi dès que possible…`);
  else if (syncShown) setStatus('');
  syncShown = S.offline || n > 0;
}
let syncing = false;
async function syncOutbox() {
  if (syncing || !isCloud() || !waitCount() || !navigator.onLine) return;
  syncing = true;
  try {
    const r = await S.store.flush();
    if (r.sent) { await reload(true); toast(`${r.sent} ${r.sent > 1 ? 'éléments envoyés' : 'élément envoyé'}`); }
    if (r.errors.length) fail(r.errors[0], 'Envoi refusé, gardé sur cet appareil');
  } catch (e) { console.error(e); }
  syncing = false;
  syncStatus();
}
window.addEventListener('online', () => { if (isCloud()) reload(); });
window.addEventListener('offline', () => { if (isCloud()) { S.offline = true; syncStatus(); } });
setInterval(() => {
  if (!isCloud() || !navigator.onLine || REC.recorder || sheetClose) return;
  if (S.offline) reload(); else if (waitCount()) syncOutbox();
}, 30000);

async function reload(noSync = false) {
  try {
    if (S.store.kind === 'cloud' && !S.store.user) { S.ideas = []; S.takes = []; S.groups = []; S.members = []; S.comments = []; S.albums = []; S.setlists = []; render(); return; }
    const cloud = S.store.kind === 'cloud';
    let ideas, takes, groups, members, comments, albums, setlists;
    try {
      [ideas, takes, groups, members, comments, albums, setlists] = await Promise.all([
        S.store.listIdeas(), S.store.listTakes(),
        cloud ? S.store.listGroups() : [], cloud ? S.store.listMembers() : [],
        cloud ? S.store.listComments().catch(e => { if (isNetErr(e)) throw e; return []; }) : [],
        cloud ? S.store.listAlbums().catch(e => { if (isNetErr(e)) throw e; return []; }) : [],
        cloud && SETLISTS ? S.store.listSetlists().catch(e => { if (isNetErr(e)) throw e; return []; }) : [],
      ]);
      S.offline = false;
      if (cloud) saveSnap({ user: me(), ideas, takes, groups, members, comments, albums, setlists });
    } catch (e) {
      // Pas de réseau : on repart de la dernière copie gardée sur l'appareil.
      const snap = cloud && isNetErr(e) ? loadSnap() : null;
      if (!snap || snap.user !== me()) { if (!cloud || !isNetErr(e)) throw e; }
      ({ ideas = [], takes = [], groups = [], members = [], comments = [], albums = [], setlists = [] } = snap && snap.user === me() ? snap : {});
      S.store.assumeKnown(ideas, takes);
      S.offline = true;
    }
    if (cloud) { // ce qui attend d'être envoyé s'affiche comme le reste
      for (const it of S.store.pending.values()) {
        const list = it.kind === 'idea' ? ideas : takes;
        const i = list.findIndex(r => r.id === it.id);
        if (i >= 0) list[i] = it.row; else list.push(it.row);
      }
    }
    S.comments = comments || [];
    S.albums = albums || [];
    S.setlists = setlists || [];
    S.ideas = ideas || [];
    S.takes = takes || [];
    S.groups = (groups || []).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    S.members = members || [];
    let scope = 'me';
    try { scope = localStorage.getItem('fredon.scope') || 'me'; } catch {}
    S.scope = cloud && groupById(scope) ? scope : 'me';
    render();
    syncStatus();
    if (cloud && !S.offline && !noSync) syncOutbox();
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
  $('#importBtn').onclick = () => pickImport();
  $('#importInput').onchange = e => { const f = e.target.files; if (f && f.length) importFiles(f, ideaById(importDest) ? importDest : undefined); e.target.value = ''; };
  $('#hero').onclick = e => { if (e.target.closest('#newSong')) createSong(); if (e.target.closest('#newAlbum')) createAlbum(); if (e.target.closest('#newSet')) createSet();
    const g = groupById(S.scope);
    const band = e.target.closest('[data-band]');
    if (g && (e.target.closest('#bandNew') || band?.dataset.band === 'edit')) editBand(g);
    if (g && band?.dataset.band === 'rider') openRider(g);
    if (g && band?.dataset.band === 'fold') { if (!BAND_OPEN.delete(g.id)) BAND_OPEN.add(g.id); render(); }
  };
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
    // Toucher une idée, c'est l'avoir vue : ses « nouveau » disparaîtront au prochain affichage.
    const seenIdea = ideaById(e.target.closest('.block')?.dataset.drop);
    if (seenIdea && newsOf(seenIdea).any) markSeen(seenIdea);
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const a = el.dataset.action;
    const idea = ideaById(el.dataset.idea);
    const albumId = el.dataset.albumId;
    if (a === 'album-toggle') { if (!ALB_OPEN.delete(albumId)) ALB_OPEN.add(albumId); else if (tracksOf(albumId === 'none' ? null : albumId).some(i => i.id === S.openIdea)) S.openIdea = null; saveAlbOpen(); render(); }
    const set = setById(el.dataset.set);
    if (set) {
      const song = ideaById(el.dataset.setIdea);
      const key = `set:${set.id}`;
      if (a === 'set-toggle') { if (!ALB_OPEN.delete(key)) ALB_OPEN.add(key); saveAlbOpen(); render(); }
      if (a === 'set-menu') setMenu(set);
      if (a === 'set-add') fillSet(set);
      if (a === 'set-play') playSet(set);
      if (a === 'set-stage') openStage(set);
      if (a === 'set-open' && song) openStage(set, song.id);
      if (a === 'set-song-menu' && song) setSongMenu(set, song);
      return;
    }
    if (a === 'album-menu' && albumById(albumId)) albumMenu(albumById(albumId));
    if (a === 'album-add' && albumById(albumId)) fillAlbum(albumById(albumId));
    if (a === 'album-song' && albumById(albumId)) createSong(albumId);
    if (a === 'song-toggle' && idea) { S.openIdea = S.openIdea === idea.id ? null : idea.id; if (S.openIdea && newsOf(idea).any) markSeen(idea); render(); }
    if (a === 'talk' && idea) talkSheet(idea);
    if (a === 'play') play(el.dataset.id);
    if (a === 'seek') {
      const r = el.getBoundingClientRect();
      seek(el.dataset.id, Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)));
    }
    if (a === 'take-menu') takeMenu(takeById(el.dataset.id));
    if (a === 'loop' || a === 'loop-a' || a === 'loop-b') loopAction(a, el.dataset.id);
    if (a === 'mix') playMix(el.dataset.id);
    if (a === 'tempo' && idea) editTempo(idea);
    if (a === 'rename' && idea) renameIdea(idea);
    if (a === 'text' && idea) editText(idea);
    if (a === 'idea-menu' && idea) ideaMenu(idea);
    if (a === 'record-into' && idea) startRecording(idea.id);
    if (a === 'import-into' && idea) pickImport(idea.id);
    if (a === 'fold' && idea) { if (!UNFOLDED.delete(idea.id)) UNFOLDED.add(idea.id); render(); }
    if (a === 'play-all' && idea) {
      const ids = takesOf(idea.id).filter(t => !baseOf(t)).map(t => t.id); // les pistes superposées ne se lisent pas à la suite
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
    if (e.code !== 'Space' || sheetClose || STAGE.on || RIDER_ON || /INPUT|TEXTAREA/.test(document.activeElement?.tagName)) return;
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
  catchInvite();
  wireUi();
  wireDrag();
  wireFileDrop();
  const cfg = loadConfig();
  if (cfg.mode === 'cloud' && cfg.url && cfg.key) {
    try {
      const cloud = new CloudStore(cfg);
      const logged = await cloud.init();
      S.store = cloud;
      if (!logged) { render(); if (pendingInvite()) { inviteWelcome(); return; } setStatus('Connecte-toi dans les réglages pour retrouver tes vocaux.'); openSettings(); return; }
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
  checkInvite();
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
