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
// Une « version » est un nouveau mixage qui reprend une prise et lui ajoute un instrument.
const prevOf = t => { const p = t && t.version_of && !t.layer_of ? takeById(t.version_of) : null; return p && p !== t && p.idea_id && p.idea_id === t.idea_id && !p.layer_of ? p : null; };
const pathOf = t => { const path = [t]; while (prevOf(path[0]) && path.length < 60 && !path.includes(prevOf(path[0]))) path.unshift(prevOf(path[0])); return path; };
const stackOf = root => S.takes.filter(t => t.idea_id === root.idea_id && !t.layer_of && pathOf(t)[0] === root)
  .sort((x, y) => pathOf(y).length - pathOf(x).length || y.created_at.localeCompare(x.created_at));
const superseded = t => S.takes.some(c => prevOf(c) === t);
const VER_OPEN = new Set(); // piles dont les versions précédentes sont dépliées
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
// Le stade d'un morceau : une idée mûrit en compo ; une répète est un enregistrement de séance.
const STAGES = { idea: ['Idée', 'Idées'], compo: ['Compo', 'Compos'], rehearsal: ['Répète', 'Répètes'] };
const stageOf = i => (STAGES[i.stage] ? i.stage : 'idea');
let TAB = null;
const tabNow = () => {
  if (!TAB) { try { TAB = localStorage.getItem('fredon.tab'); } catch {} TAB = TAB || 'idea'; }
  const t = STAGES[TAB] || TAB === 'albums' ? TAB : 'idea';
  return t === 'albums' && !isCloud() ? 'idea' : t;
};
const inTab = (i, tab) => stageOf(i) === tab && !albumOf(i);
const stageReady = () => {
  if (isCloud() && S.ideas.length && !S.ideas.some(i => 'stage' in i)) { toast('Les compos et les répètes ne sont pas encore activées sur le serveur'); return false; }
  return true;
};
function renderTabs() {
  const tab = tabNow();
  const ideas = visibleIdeas();
  const tabs = Object.keys(STAGES).map(k => [k, STAGES[k][1], ideas.filter(i => inTab(i, k)).length]);
  if (isCloud()) tabs.push(['albums', 'Albums', scopeAlbums().length]);
  $('#tabs').innerHTML = tabs.map(([k, label, n]) => `<button class="tab ${k === tab ? 'on' : ''}" data-tab="${k}"><i></i><span>${label}</span><b>${n || ''}</b></button>`).join('');
}
const TAB_EMPTY = {
  idea: 'Aucune idée ici. Enregistre avec la barre du bas.',
  compo: 'Aucune compo pour l\'instant. Une idée devient une compo depuis son menu ⋯.',
  rehearsal: 'Aucune répète pour l\'instant. Importe les fichiers de ton enregistreur avec « + nouvelle répète ».',
  albums: 'Aucun album pour l\'instant.',
};
/* Dossiers : un morceau est dans un seul dossier, ou dans aucun. Un dossier n'existe que par ses morceaux.
   À l'écran c'est une colonne de CD : une tranche par dossier, on en tire une pour voir ce qu'elle contient. */
const folderOf = i => (typeof i.folder === 'string' && i.folder.trim()) || '';
const byName = (a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' });
const foldersIn = tab => [...new Set(visibleIdeas().filter(i => inTab(i, tab)).map(folderOf).filter(Boolean))].sort(byName);
const allFolders = () => [...new Set(visibleIdeas().filter(i => !albumOf(i) && stageOf(i) !== 'rehearsal').map(folderOf).filter(Boolean))].sort(byName);
let FOLDER = ''; // la tranche tirée de la colonne
const folderOn = () => !(isCloud() && S.ideas.length && !S.ideas.some(i => 'folder' in i));
const folderReady = () => { if (!folderOn()) toast('Les dossiers ne sont pas encore activés sur le serveur'); return folderOn(); };
function rackHtml(tab, body) {
  const ideas = visibleIdeas().filter(i => inTab(i, tab));
  const loose = ideas.filter(i => !folderOf(i)).length;
  const count = n => ideas.filter(i => folderOf(i) === n).length;
  const shelf = `<div class="rack"><div class="rack-row">${foldersIn(tab).map(n => `<button class="spine ${n === FOLDER ? 'out' : ''}" data-action="folder-open" data-folder="${esc(n)}" aria-expanded="${n === FOLDER}" title="${esc(n)}"><span>${esc(n)}</span><b>${count(n)}</b><i></i></button>`).join('')}</div></div>`;
  if (!FOLDER) return `${shelf}<p class="rack-now">${loose ? 'Hors dossier' : 'Tout est rangé. Touche un disque pour l\'ouvrir.'}</p>${body}`;
  // Le dossier ouvert : un boîtier posé sous l'étagère, ses morceaux à l'intérieur.
  return `${shelf}<section class="case">
    <header class="case-head"><i></i><h2>${esc(FOLDER)}</h2><span>${morceaux(count(FOLDER))}</span>
      <button class="txt-btn" data-action="folder-open" data-folder="${esc(FOLDER)}">refermer</button>
      <button class="mini-btn" data-action="folder-menu" data-folder="${esc(FOLDER)}" aria-label="Options du dossier">${ICONS.more}</button></header>
    <div class="case-body">${body}</div>
  </section>`;
}
async function setFolder(idea, name) {
  if (!folderReady()) return;
  const was = idea.folder;
  idea.folder = name || null;
  render();
  try { await S.store.saveIdea(idea); toast(name ? `« ${ideaTitle(idea)} » est dans « ${name} »` : `« ${ideaTitle(idea)} » est sortie du dossier`); }
  catch (e) { idea.folder = was; render(); fail(e, 'Rangement impossible'); }
}
// Choisir le dossier d'un morceau depuis son menu.
async function pickFolder(idea) {
  if (!folderReady()) return;
  const cur = folderOf(idea);
  const v = await actionSheet(`Dossier de « ${ideaTitle(idea)} »`, [
    ...allFolders().filter(n => n !== cur).map(n => ({ label: n, value: 'f:' + n })),
    { label: 'Nouveau dossier…', value: 'new', cls: 'primary' },
    cur && { label: `Sortir de « ${cur} »`, value: 'none' },
  ].filter(Boolean));
  if (!v) return;
  if (v === 'none') return setFolder(idea, '');
  let name = v.slice(2);
  if (v === 'new') {
    name = ((await promptText('Nom du dossier', '', { placeholder: 'Ex : jazz, acoustique, live' })) || '').trim().slice(0, 40);
    if (!name) return;
    name = allFolders().find(n => byName(n, name) === 0) || name;
  }
  return setFolder(idea, name);
}
async function folderMenu(name) {
  const list = visibleIdeas().filter(i => folderOf(i) === name);
  const v = await actionSheet(`Dossier « ${name} »`, [
    { label: 'Renommer', value: 'rename' },
    { label: 'Défaire le dossier', value: 'undo', sub: 'Les morceaux sont gardés' },
  ]);
  if (!v || !folderReady()) return;
  let to = null;
  if (v === 'rename') {
    to = ((await promptText('Nom du dossier', name)) || '').trim().slice(0, 40);
    if (!to || to === name) return;
  } else if (!(await confirmBox(`Défaire « ${name} » ?`, `${morceaux(list.length)} : rien n'est supprimé, ils retournent hors dossier.`, 'Défaire'))) return;
  if (FOLDER === name) FOLDER = to || '';
  try { for (const i of list) { i.folder = to; await S.store.saveIdea(i); } }
  catch (e) { fail(e, 'Action impossible'); await reload(); }
  render();
}
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
    const hay = [idea.title, ideaTitle(idea), idea.notes, idea.folder, ...(idea.tags || []),
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
  const path = inInbox || layer ? [t] : pathOf(t);
  const ver = !inInbox && !layer && stackOf(path[0]).length > 1;
  const top = ver && !superseded(t);
  const plus = !inInbox && !layer && (!ver || top) && !!ideaById(t.idea_id);
  const title = t.title || (inInbox ? `Vocal du ${fmtDayTime(t.created_at)}` : ver ? `Version ${path.length}` : layer ? `Piste ${instrumentOf(t.instrument)?.label.toLowerCase() || 'ajoutée'}` : `Prise ${index + 1}`);
  const shared = !inInbox && ideaById(t.idea_id)?.group_id;
  const who = shared && t.author ? `${t.author} · ` : '';
  const meta = (inInbox ? fmtDur(lenOf(t)) : `${who}${fmtDay(t.created_at)} · ${fmtDur(lenOf(t))}`) + (waiting(t.id) ? " · en attente d'envoi" : '');
  const inst = instrumentOf(t.instrument);
  const isNew = shared && newsOf(ideaById(t.idea_id)).takes.includes(t);
  return `<li class="take ${layer ? 'layer' : ''} ${ver ? (top ? 'ver ver-top' : 'ver ver-old') : ''}" data-id="${t.id}">
    <button class="play" data-action="play" data-id="${t.id}" aria-label="Écouter"><span class="num">${layer ? '+' : ver ? 'v' + path.length : String(index + 1).padStart(2, '0')}</span><span class="pi">${ICONS.play}</span></button>
    <div class="take-main">
      <div class="take-line">${inst ? `<span class="inst" data-inst="${inst.id}" title="${esc(inst.label)}">${inst.icon}</span>` : ''}<span class="take-title">${esc(title)}</span>${isNew ? '<span class="news">nouveau</span>' : ''}<span class="take-meta">${esc(meta)}</span></div>
      ${t.notes ? `<div class="take-note">${esc(t.notes)}</div>` : ''}
      ${ver ? `<div class="ver-strip">${(top ? path : path.slice(-1)).map((v, i, l) => { const mine = v === t && path.length > 1; return `<span class="${mine ? 'new' : ''}">${mine ? '+ ' : ''}${esc(instrumentOf(v.instrument)?.label.toLowerCase() || 'piste')}</span>`; }).join('<i>·</i>')}</div>` : ''}
      <div class="wave" data-action="seek" data-id="${t.id}">${waveSvg(t, 'w-base')}${waveSvg(t, 'w-fill')}<i class="w-loop"></i></div>
      ${layers.length ? `<button class="txt-btn mix-btn" data-action="mix" data-id="${t.id}">écouter ensemble · ${layers.length + 1} pistes</button>` : ''}
      <div class="loopbar">
        <button class="txt-btn" data-action="loop" data-id="${t.id}">boucle</button>
        <button class="txt-btn" data-action="loop-a" data-id="${t.id}">début</button>
        <button class="txt-btn" data-action="loop-b" data-id="${t.id}">fin</button>
      </div>
    </div>
    ${plus ? `<span class="take-side"><button class="ver-plus" data-action="ver-add" data-id="${t.id}" title="Poser une version par-dessus" aria-label="Poser une version par-dessus"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 4.5h10.5a1 1 0 011 1V16"/><rect x="4.5" y="8" width="11.5" height="11.5" rx="1"/><path d="M10.25 11v5.5M7.5 13.75H13"/></svg></button><button class="mini-btn" data-action="take-menu" data-id="${t.id}" aria-label="Options de la prise">${ICONS.more}</button></span>`
      : `<button class="mini-btn" data-action="take-menu" data-id="${t.id}" aria-label="Options de la prise">${ICONS.more}</button>`}
  </li>`;
}

const UNFOLDED = new Set(); // idées dont le texte est déplié
function takesHtml(list) {
  const out = [];
  let n = 0;
  const one = (t, idx) => { out.push(takeHtml(t, idx, false)); layersOf(t).forEach(l => out.push(takeHtml(l, idx, false))); };
  for (const t of list) {
    if (baseOf(t) || prevOf(t)) continue; // rangée avec sa prise, ou avec sa pile
    const stack = stackOf(t);
    const idx = n++;
    if (stack.length < 2) { one(t, idx); continue; }
    const olds = stack.filter(superseded);
    stack.filter(v => !superseded(v)).forEach(v => one(v, idx));
    const open = VER_OPEN.has(t.id);
    out.push(`<li class="ver-fold"><button class="txt-btn" data-action="ver-fold" data-id="${t.id}">${olds.length > 1 ? `${olds.length} versions précédentes` : '1 version précédente'} · ${open ? 'masquer' : 'voir'}</button></li>`);
    if (open) olds.forEach(v => one(v, idx));
  }
  return out.join('');
}
// Le médiator : la poignée des modules, sur l'accueil comme sur la page publique d'un groupe.
const PICK = '<svg viewBox="0 0 24 24"><path d="M12 21.5c-1.2 0-2.2-.8-3.2-2.3C6.6 16 4 11.6 4 8.2 4 4.9 7.3 3 12 3s8 1.9 8 5.2c0 3.4-2.6 7.8-4.8 11-1 1.5-2 2.3-3.2 2.3z"/><g class="nubs"><circle cx="8.6" cy="8" r="1.15"/><circle cx="12" cy="8" r="1.15"/><circle cx="15.4" cy="8" r="1.15"/><circle cx="10.3" cy="11.6" r="1.15"/><circle cx="13.7" cy="11.6" r="1.15"/><circle cx="12" cy="15.2" r="1.15"/></g></svg>';
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
      <span class="grip" title="Glisser vers un onglet" aria-hidden="true">${PICK}</span>
      <h3 class="block-title ${idea.title ? '' : 'placeholder'}" data-action="rename" data-idea="${idea.id}">${esc(ideaTitle(idea))}</h3>
      <button class="star ${idea.starred ? 'on' : ''}" data-action="star" data-idea="${idea.id}" aria-label="Favori">${idea.starred ? '★' : '☆'}</button>
      ${list.filter(t => !baseOf(t) && !superseded(t)).length > 1 ? `<button class="txt-btn" data-action="play-all" data-idea="${idea.id}">écouter</button>` : ''}
      <button class="mini-btn" data-action="idea-menu" data-idea="${idea.id}" aria-label="Options de l'idée">${ICONS.more}</button>
    </div>
    <p class="block-sub">${news.any ? '<span class="news">nouveau</span>' : ''}<span>${esc(sub)}</span>${tags.map(t => `<span class="tag">#${esc(t)}</span>`).join('')}</p>
    ${music ? `<button class="tempo-chip" data-action="tempo" data-idea="${idea.id}" title="Modifier">${esc(music)}</button>` : ''}
    ${idea.chords ? `<div class="chords ${open ? 'open' : ''}" data-action="tempo" data-idea="${idea.id}" title="Modifier">${esc(idea.chords)}</div>` : ''}
    ${idea.notes ? `<div class="lyrics ${open ? 'open' : ''}" data-action="text" data-idea="${idea.id}" title="Modifier le texte">${esc(idea.notes)}</div>` : ''}
    ${long && !full ? `<button class="txt-btn fold" data-action="fold" data-idea="${idea.id}">${open ? 'replier' : 'tout lire'}</button>` : ''}
    <ol class="takes">${takesHtml(list)}</ol>
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
  return scopeAlbums().map(a => {
    const all = tracksOf(a ? a.id : null);
    const list = all.filter(matchesIdea);
    if ((!a && !all.length) || (filtering && !list.length)) return '';
    const key = a ? a.id : 'none';
    const open = filtering || ALB_OPEN.has(key) || list.some(i => i.id === S.openIdea);
    const dur = list.reduce((sum, i) => sum + takesOf(i.id).filter(t => !baseOf(t) && !superseded(t)).reduce((x, t) => x + lenOf(t), 0), 0);
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
  hero.innerHTML = card + (n || t ? `<p><b>${n}</b> ${n > 1 ? 'morceaux' : 'morceau'} · <b>${t}</b> ${t > 1 ? 'prises' : 'prise'} · <b>${fmtLong(total)}</b></p>` : '') +
    (tabNow() === 'rehearsal' ? '<button class="txt-btn new-song" id="newRehearsal">+ nouvelle répète</button>'
      : tabNow() === 'albums' ? '<button class="txt-btn new-song" id="newAlbum">+ nouvel album</button>'
      : '<button class="txt-btn new-song" id="newSong">+ nouvelle chanson</button>') +
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
  const open = BAND_OPEN.has(g.id);
  return `<div class="band ${open ? 'open' : ''}">
    <div class="band-top" data-band="fold">
      ${pic ? `<img class="band-cover" src="${g.cover}" alt="">` : ''}
      <div class="band-text">
        <p class="band-kind">Le groupe</p>
        ${tag ? `<p class="band-tag">${esc(tag)}</p>` : ''}
        ${memo ? `<div class="band-memo">${linkify(memo)}</div>` : ''}
      </div>
      <span class="txt-btn band-fold">${open ? 'replier' : 'ouvrir'}</span>
    </div>
    ${open && more ? `<div class="band-more">
      ${lineup.length ? `<section><h4>Line-up</h4><ul class="band-lineup">${lineup.map(m => `<li><b>${esc(m.name || '?')}</b><span>${esc(m.inst || '')}</span></li>`).join('')}</ul></section>` : ''}
      ${contact ? `<section><h4>Contact</h4>${p.contact ? `<p><b>${esc(p.contact)}</b></p>` : ''}${p.phone ? `<p>${esc(p.phone)}</p>` : ''}${p.mail ? `<p>${esc(p.mail)}</p>` : ''}</section>` : ''}
      ${p.links ? `<section><h4>Liens</h4><p class="band-links">${linkify(p.links)}</p></section>` : ''}
    </div>` : ''}
    ${open ? `<p class="band-acts"><button class="txt-btn" data-band="edit">modifier la fiche</button><button class="txt-btn accent" data-band="rider">fiche technique</button><button class="txt-btn" data-band="book">le book</button>${g.public_slug ? '<button class="txt-btn" data-band="page">page publique</button>' : ''}</p>` : ''}
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
    <p class="hint">Le QR code de la fiche technique ouvre la page publique si elle est activée, sinon le premier lien.</p>

    <h3 class="part">5 · Page publique</h3>
    <p class="hint">Une page de présentation visible par tous, sans compte : image, description, line-up, liens, et les morceaux choisis dans le book${(Array.isArray(pageOf(g).tracks) ? pageOf(g).tracks : []).length ? ` (${(pageOf(g).tracks).length} en ce moment, écoutables par tous dès que la page est activée)` : ''}. Jamais le téléphone, l'e-mail, la technique ni les autres enregistrements.</p>
    ${isAdmin(g.id) ? `<label class="check"><input type="checkbox" id="bPub" ${g.public_slug ? 'checked' : ''}><span>Activer la page publique</span></label>
    <div id="bPubBox"><label class="label" for="bSlug">Adresse de la page</label>
      <div class="slug-row"><span>${esc(location.host)}/?groupe=</span><input class="field" id="bSlug" maxlength="40" autocomplete="off" autocapitalize="none" spellcheck="false" value="${esc(g.public_slug || slugify(g.name))}"></div></div>`
    : `<p class="hint"><b>${g.public_slug ? 'La page est activée.' : 'La page n\'est pas activée.'}</b> Seul l'admin du groupe peut l'ouvrir ou la fermer.</p>`}
    <p class="hint">Le contenu et le style de la page se règlent dans « le book », depuis la fiche du groupe.</p>
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
    const pub = sh.querySelector('#bPub');
    const paintPub = () => { if (pub) sh.querySelector('#bPubBox').hidden = !pub.checked; };
    if (pub) { pub.onchange = paintPub; sh.querySelector('#bSlug').onblur = e => { e.target.value = slugify(e.target.value); }; }
    paintPub();
    const box = sh.querySelector('#bLineup');
    sh.querySelector('[data-lu-add]').onclick = () => { box.insertAdjacentHTML('beforeend', rowHtml({})); box.lastElementChild.querySelector('input').focus(); };
    box.onclick = e => { if (e.target.closest('[data-lu-del]')) e.target.closest('.lu-row').remove(); };
    const val = id => (sh.querySelector('#' + id).value || '').replace(/\r\n?/g, '\n').trim();
    sh.querySelector('[data-x]').onclick = () => close(null);
    const read = () => {
      const profile = {};
      for (const k of ['style', 'city', 'set', 'brings', 'needs', 'notes', 'contact', 'phone', 'mail', 'links']) { const x = val('b_' + k); if (x) profile[k] = x; }
      const lineup = [...box.querySelectorAll('.lu-row')].map(r => Object.fromEntries([...r.querySelectorAll('[data-lu]')].map(i => [i.dataset.lu, i.value.trim()]))).filter(m => m.name || m.inst);
      if (lineup.length) profile.lineup = lineup.slice(0, 20);
      if (Object.keys(pageOf(g)).length) profile.page = pageOf(g); // le book se règle ailleurs : on n'y touche pas
      return { memo: val('bMemo'), cover, profile };
    };
    sh.querySelector('[data-ok]').onclick = () => {
      if (pub && pub.checked && slugify(sh.querySelector('#bSlug').value).length < 3) { toast('L\'adresse de la page doit faire au moins 3 caractères'); sh.querySelector('#bSlug').focus(); return; }
      close({ ...read(), pub: pub ? (pub.checked ? slugify(sh.querySelector('#bSlug').value) : '') : undefined });
    };
  });
  if (!v) return;
  const before = { memo: g.memo, cover: g.cover, profile: g.profile };
  const pub = v.pub;
  delete v.pub;
  Object.assign(g, v);
  render();
  try { await S.store.saveGroupProfile(g.id, v.memo, v.cover, v.profile); }
  catch (e) { Object.assign(g, before); render(); return fail(e, isNetErr(e) ? 'Il faut du réseau pour modifier la fiche du groupe' : 'Enregistrement impossible'); }
  if (pub === undefined || pub === (g.public_slug || '')) return;
  try {
    g.public_slug = (await S.store.setGroupPublic(g.id, pub)) || null;
    BAND_OPEN.add(g.id);
    render();
    if (g.public_slug) sharePage(g); else toast('La page publique est fermée');
  } catch (e) { fail(e, 'Page publique'); }
}

/* ---------------- QR code ---------------- */
// Petit encodeur sans dépendance : octets, versions 1 à 6 (jusqu'à 134 caractères), correction M si ça tient, sinon L.
const QR = (() => {
  const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
  for (let i = 0, x = 1; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 256) x ^= 0x11d; }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  const mul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);
  const rs = (data, n) => {
    let gen = [1];
    for (let i = 0; i < n; i++) { const next = new Array(gen.length + 1).fill(0); gen.forEach((c, j) => { next[j] ^= c; next[j + 1] ^= mul(c, EXP[i]); }); gen = next; }
    const rem = new Array(n).fill(0);
    for (const d of data) { const f = d ^ rem.shift(); rem.push(0); for (let j = 0; j < n; j++) rem[j] ^= mul(gen[j + 1], f); }
    return rem;
  };
  // [octets de données, octets de correction par bloc, nombre de blocs] pour les versions 1 à 6
  const TABLE = { M: [[16, 10, 1], [28, 16, 1], [44, 26, 1], [64, 18, 2], [86, 24, 2], [108, 16, 4]], L: [[19, 7, 1], [34, 10, 1], [55, 15, 1], [80, 20, 1], [108, 26, 1], [136, 18, 2]] };
  const MASKS = [(r, c) => (r + c) % 2 === 0, r => r % 2 === 0, (r, c) => c % 3 === 0, (r, c) => (r + c) % 3 === 0,
    (r, c) => ((r >> 1) + Math.floor(c / 3)) % 2 === 0, (r, c) => (r * c) % 2 + (r * c) % 3 === 0,
    (r, c) => ((r * c) % 2 + (r * c) % 3) % 2 === 0, (r, c) => ((r + c) % 2 + (r * c) % 3) % 2 === 0];
  const formatBits = (level, mask) => {
    const data = ((level === 'L' ? 1 : 0) << 3) | mask;
    let rem = data << 10;
    for (let i = 14; i >= 10; i--) if ((rem >> i) & 1) rem ^= 0x537 << (i - 10);
    return ((data << 10) | rem) ^ 0x5412;
  };
  const penalty = m => {
    const n = m.length;
    let p = 0, dark = 0;
    const line = get => {
      for (let a = 0; a < n; a++) {
        let run = 1;
        for (let b = 1; b <= n; b++) {
          if (b < n && get(a, b) === get(a, b - 1)) run++;
          else { if (run >= 5) p += run - 2; run = 1; }
        }
        for (let b = 0; b + 10 < n; b++) {
          const s = [];
          for (let k = 0; k < 11; k++) s.push(get(a, b + k) ? 1 : 0);
          const t = s.join('');
          if (t === '10111010000' || t === '00001011101') p += 40;
        }
      }
    };
    line((a, b) => m[a][b]);
    line((a, b) => m[b][a]);
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      if (m[r][c]) dark++;
      if (r + 1 < n && c + 1 < n && m[r][c] === m[r][c + 1] && m[r][c] === m[r + 1][c] && m[r][c] === m[r + 1][c + 1]) p += 3;
    }
    return p + Math.floor(Math.abs(dark * 100 / (n * n) - 50) / 5) * 10;
  };
  function matrix(text) {
    const bytes = [...new TextEncoder().encode(text)];
    let level = null, v = 0;
    for (const l of ['M', 'L']) { v = TABLE[l].findIndex(t => bytes.length <= t[0] - 2) + 1; if (v) { level = l; break; } }
    if (!level) return null;
    const [dataLen, ecLen, blocks] = TABLE[level][v - 1];
    const bits = [];
    const put = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1); };
    put(4, 4); put(bytes.length, 8); bytes.forEach(b => put(b, 8));
    put(0, Math.min(4, dataLen * 8 - bits.length));
    while (bits.length % 8) bits.push(0);
    const data = [];
    for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
    for (let pad = 0xec; data.length < dataLen; pad ^= 0xec ^ 0x11) data.push(pad);
    const per = dataLen / blocks;
    const parts = Array.from({ length: blocks }, (_, i) => data.slice(i * per, (i + 1) * per));
    const ecs = parts.map(d => rs(d, ecLen));
    const cw = [];
    for (let i = 0; i < per; i++) parts.forEach(d => cw.push(d[i]));
    for (let i = 0; i < ecLen; i++) ecs.forEach(e => cw.push(e[i]));

    const n = 17 + 4 * v;
    const m = Array.from({ length: n }, () => new Array(n).fill(false));
    const res = Array.from({ length: n }, () => new Array(n).fill(false));
    const set = (r, c, on) => { if (r >= 0 && r < n && c >= 0 && c < n) { m[r][c] = !!on; res[r][c] = true; } };
    const finder = (r0, c0) => {
      for (let dr = -1; dr <= 7; dr++) for (let dc = -1; dc <= 7; dc++) {
        const inside = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6;
        set(r0 + dr, c0 + dc, inside && (dr === 0 || dr === 6 || dc === 0 || dc === 6 || (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4)));
      }
    };
    finder(0, 0); finder(0, n - 7); finder(n - 7, 0);
    if (v >= 2) for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) set(n - 7 + dr, n - 7 + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
    for (let i = 8; i < n - 8; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
    const format = f => {
      const bit = i => (f >> i) & 1;
      for (let i = 0; i <= 5; i++) set(i, 8, bit(i));
      set(7, 8, bit(6)); set(8, 8, bit(7)); set(8, 7, bit(8));
      for (let i = 9; i < 15; i++) set(8, 14 - i, bit(i));
      for (let i = 0; i < 8; i++) set(8, n - 1 - i, bit(i));
      for (let i = 8; i < 15; i++) set(n - 15 + i, 8, bit(i));
      set(n - 8, 8, true);
    };
    format(0); // réserve la place avant de poser les données
    let k = 0, up = true;
    for (let c = n - 1; c > 0; c -= 2) {
      if (c === 6) c--;
      for (let j = 0; j < n; j++) {
        const r = up ? n - 1 - j : j;
        for (const cc of [c, c - 1]) if (!res[r][cc]) { m[r][cc] = k < cw.length * 8 && ((cw[k >> 3] >> (7 - (k & 7))) & 1) === 1; k++; }
      }
      up = !up;
    }
    let best = null;
    for (let mask = 0; mask < 8; mask++) {
      const t = m.map((row, r) => row.map((x, c) => (res[r][c] ? x : x !== MASKS[mask](r, c))));
      const keep = m.map(row => row.slice());
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) m[r][c] = t[r][c];
      format(formatBits(level, mask));
      const out = m.map(row => row.slice());
      const score = penalty(out);
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) m[r][c] = keep[r][c];
      if (!best || score < best.score) best = { score, out };
    }
    return best.out;
  }
  // Toujours noir sur blanc, avec sa marge : c'est ce que les téléphones lisent le mieux.
  function svg(text) {
    const m = matrix(text);
    if (!m) return '';
    const n = m.length;
    let d = '';
    m.forEach((row, r) => row.forEach((on, c) => { if (on) d += `M${c + 4} ${r + 4}h1v1h-1z`; }));
    return `<svg class="qr" viewBox="0 0 ${n + 8} ${n + 8}" shape-rendering="crispEdges" role="img" aria-label="QR code"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
  }
  return { matrix, svg };
})();
/* ----- Page publique du groupe : une présentation visible sans compte, à l'adresse ?groupe=nom ----- */
const slugify = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '');
const pageLink = slug => `${location.origin}${location.pathname}?groupe=${slug}`;
const pageOf = g => { const x = profOf(g).page; return x && typeof x === 'object' && !Array.isArray(x) ? x : {}; };
const NETWORKS = [['instagram', 'Instagram'], ['youtube', 'YouTube'], ['youtu.be', 'YouTube'], ['bandcamp', 'Bandcamp'], ['spotify', 'Spotify'], ['soundcloud', 'SoundCloud'],
  ['facebook', 'Facebook'], ['tiktok', 'TikTok'], ['deezer', 'Deezer'], ['music.apple', 'Apple Music'], ['linktr.ee', 'Linktree'], ['twitch', 'Twitch'], ['x.com', 'X'], ['twitter', 'X']];
const urlIn = w => (/^https?:\/\/\S+\.\S+/i.test(w) ? w : /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(w) && !w.includes('@') ? 'https://' + w : '');
// Chaque ligne de « Liens » devient un bouton : « Insta : instagram.com/x » ou juste l'adresse.
const linkRows = text => String(text || '').split('\n').map(line => {
  const words = line.trim().split(/\s+/);
  const at = words.findIndex(w => urlIn(w));
  if (at < 0) return null;
  const url = urlIn(words[at]);
  const said = words.slice(0, at).join(' ').replace(/[\s:–—-]+$/, '');
  const host = url.replace(/^https?:\/\/(www\.)?/i, '').toLowerCase();
  return { url, label: said || (NETWORKS.find(([k]) => host.includes(k)) || [])[1] || host.split('/')[0], sub: url.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '') };
}).filter(Boolean);
// Ce que la page montre : la même forme que ce que le serveur renvoie au public.
const publicView = g => { const p = profOf(g); return { name: g.name, slug: g.public_slug || '', cover: g.cover, memo: g.memo, style: p.style, city: p.city, links: p.links, page: pageOf(g), lineup: lineupOf(g).map(m => ({ name: m.name, inst: m.inst })) }; };
// Les modèles : [clé, nom, fond, texte, accent]. « studio » est le langage de Rec. et vit dans styles.css ;
// les autres redessinent les mêmes pièces (façade, potards, grille, cassette, pads, magnéto) avec le matériel de leur musique, dans book/<clé>.css.
const TEMPLATES = [
  ['studio', 'Studio', '#0b0b0d', '#f1f1f3', '#7c6cf6'],
  ['rock', 'Rock', '#0e0e0e', '#f4f1ea', '#e5383b'],
  ['punk', 'Punk', '#efe9dc', '#111111', '#ff2d6f'],
  ['metal', 'Metal', '#070708', '#e8e9ec', '#e11d2a'],
  ['jazz', 'Jazz', '#0d1320', '#efe6d2', '#c2a46e'],
  ['classique', 'Classique', '#f6f1e6', '#221d17', '#7b1e2b'],
  ['rap', 'Rap', '#0a0a0a', '#ffffff', '#ffd60a'],
  ['pop', 'Pop', '#f5f3ee', '#1d1c1a', '#ff5a36'],
  ['kpop', 'K-pop', '#f5f4f7', '#141318', '#ff4d8d'],
];
const BOOK_V = '66'; // à changer quand une feuille book/*.css change, pour que les visiteurs reçoivent la nouvelle
// Les modèles sont rangés pour l'instant : toutes les pages de groupe parlent le langage de l'accueil de Rec.
// Le choix fait par un groupe reste enregistré. Les feuilles de book/ habillaient l'ancienne mise en page (façade d'ampli, cassette) : à reprendre avant de remettre true.
const MODELES = false;
const tplOf = page => (MODELES && TEMPLATES.find(t => t[0] === (page && page.template))) || TEMPLATES[0];
// La feuille du modèle (et ses polices), chargée à la demande. La promesse se tient quand elle est prête, ou tout de suite pour Studio.
const TPL_READY = new Map();
function tplReady(tpl) {
  if (tpl[0] === 'studio') return Promise.resolve();
  if (!TPL_READY.has(tpl[0])) {
    TPL_READY.set(tpl[0], new Promise(done => {
      const l = document.createElement('link');
      l.id = 'tplcss-' + tpl[0]; l.rel = 'stylesheet';
      l.href = `book/${tpl[0]}.css?v=${BOOK_V}`;
      const fonts = () => (document.fonts && document.fonts.ready ? document.fonts.ready.then(done, done) : done());
      l.addEventListener('load', () => requestAnimationFrame(fonts), { once: true });
      l.addEventListener('error', () => { TPL_READY.delete(tpl[0]); l.remove(); done(); }, { once: true });
      document.head.append(l);
    }));
  }
  return TPL_READY.get(tpl[0]);
}
const youtubeId = u => (String(u || '').match(/(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/|\/live\/)([\w-]{11})/) || [])[1] || '';
const datesOf = page => (Array.isArray(page && page.dates) ? page.dates : []).filter(x => x && /^\d{4}-\d{2}-\d{2}$/.test(x.d || '') && x.where).sort((x, y) => x.d.localeCompare(y.d));
// Le « jour de scène » : un concert ne bascule pas au lendemain à minuit, on décale de cinq heures.
const today = () => { const n = new Date(Date.now() - 5 * 3600e3); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`; };
const paras = text => esc(text).split(/\n{2,}/).map(x => `<p>${x.replace(/\n/g, '<br>')}</p>`).join('');
/* La page publique d'un groupe parle le langage de l'accueil de Rec. : la barre du haut, la fiche du groupe,
   puis des modules à médiator (écouter, les concerts, le groupe, les photos), et le magnéto en bas pour écouter.
   L'essentiel tient au premier écran ; le reste vient en descendant.
   L'état de la page ouverte vit ici, hors du HTML : un nouveau rendu ne coupe ni la musique ni le lecteur. */
const BP = { b: null, o: {}, audio: null, cur: null, idx: -1, deck: null, raf: 0, level: 0, after: false, wait: false, lock: false, swiped: 0, theme0: null, media: false, opener: null, inert: [], loaded: null, back: 0, poster: null };
const BP_DOC = Math.random().toString(36).slice(2); // marque les entrées d'historique posées par ce chargement de la page
// La barre du haut de Rec. : la marque, et partager quand la page a une adresse.
const bandTopHtml = share => `<header class="topbar bp-top"><a class="brand" href="${esc(location.pathname)}">Rec<i>.</i></a>${share ? '<button type="button" class="txt-btn" data-share>partager</button>' : ''}</header>`;
const trackLen = t => Math.max(0, cutOut(t) - cutIn(t));
const trackEnd = (t, a) => cutOut(t, a && isFinite(a.duration) && a.duration > 0 ? a.duration : (t.duration || 1e9));
const canPlay = t => { try { const a = document.createElement('audio'); const m = String(t.mime || ''); return !m || !!a.canPlayType(m) || !!a.canPlayType(m.split(';')[0]); } catch { return true; } };
// Le carnet ouvert au public : sous chaque morceau, d'où vient la prise.
const trackNote = t => { const d = t.date ? new Date(t.date) : null; return d && !isNaN(d) ? `${t.stage === 'rehearsal' ? 'Prise en répète' : 'Prise'} du ${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}` : ''; };
// Ce que la page d'un groupe montre de ses morceaux, côté membre (pour l'aperçu) : la même forme que le serveur.
const tracksView = (g, list) => (Array.isArray(list) ? list : []).map(x => {
  const t = x && takeById(x.take), i = t && ideaById(t.idea_id);
  return t && i && i.group_id === g.id && t.path ? { id: t.id, title: String(x.title || '').trim() || ideaTitle(i), duration: t.duration, peaks: t.peaks, trim_a: t.trim_a, trim_b: t.trim_b, path: t.path, mime: t.mime, date: t.created_at, stage: i.stage } : null;
}).filter(Boolean);
const signMine = t => S.store.audioUrl(takeById(t.id));
// Où en est le groupe dans son calendrier : ce soir, bientôt, hier soir.
function bandMoment(page, forceLive) {
  const dates = datesOf(page);
  let now = today();
  if (forceLive) { const up = dates.find(x => x.d >= now); if (up) now = up.d; } // aperçu « soir de concert »
  const gap = (x, y) => Math.round((new Date(x + 'T12:00:00') - new Date(y + 'T12:00:00')) / 864e5);
  const next = dates.filter(x => x.d >= now);
  const past = dates.filter(x => x.d < now).reverse();
  const wait = next[0] ? gap(next[0].d, now) : -1;
  const soon = wait === 0 ? 'Ce soir' : wait === 1 ? 'Demain' : wait > 1 ? `Dans ${wait} jours` : '';
  const day = x => new Date(x.d + 'T12:00:00');
  const label = next[0] ? `${day(next[0]).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} · ${next[0].where}` : '';
  // Chaque date a sa page, à l'adresse ?groupe=nom&date=2026-11-30 (suivie de -2 quand le groupe joue deux fois le même jour).
  // La première date du jour garde la clé nue : un lien déjà partagé ou un QR déjà imprimé tient quand un 2e concert s'ajoute ce jour-là.
  const keys = new Map();
  dates.forEach(x => { const i = dates.filter(y => y.d === x.d).indexOf(x); keys.set(x, i ? `${x.d}-${i + 1}` : x.d); });
  // Une clé qui n'existe plus (un concert retiré ce jour-là) mène encore au concert du même jour.
  const find = k => { k = String(k || ''); return dates.find(x => keys.get(x) === k) || (/^\d{4}-\d{2}-\d{2}/.test(k) ? dates.find(x => x.d === k.slice(0, 10)) : null) || null; };
  return { next, past: past.slice(0, 6), wait, soon, live: wait === 0, day, label, now,
    key: x => keys.get(x) || x.d, find, until: x => gap(x.d, now) };
}
const hourOf = x => (/^\d{2}:\d{2}$/.test(x.h || '') ? x.h.replace(/^0/, '').replace(':', ' h ').replace(/ 00$/, '') : '');
const mapsUrl = x => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([x.where, x.addr].filter(Boolean).join(', '))}`;
// Le lien de l'évènement (Instagram, Facebook…), nommé d'après son réseau.
const eventOf = x => {
  const url = urlIn(String((x && x.link) || '').trim());
  if (!url) return null;
  const host = url.replace(/^https?:\/\/(www\.)?/i, '').toLowerCase();
  return { url, label: ((NETWORKS.find(([k]) => host.includes(k)) || [])[1] || "l'évènement").toLowerCase() };
};
// L'adresse de la page d'une date : celle du groupe, plus la date. Vide dans un aperçu sans page publique.
const dateHref = k => (BP.o.link && k ? `${BP.o.link}&date=${encodeURIComponent(k)}` : '');
// Ce qu'ouvre le QR code d'une date : la billetterie, sinon le lien de l'évènement, sinon la page de la date.
// Un lien trop long pour un QR code (plus de 134 octets) cède la place au suivant ; la page de la date, courte, tient toujours.
const dateQr = (x, k, old) => {
  const tix = old ? '' : urlIn(String(x.url || '').trim()), ev = eventOf(x), self = old ? '' : dateHref(k); // un concert passé : seulement son lien (les photos, la vidéo)
  for (const q of [tix && { url: tix, what: 'billetterie' }, ev && { url: ev.url, what: ev.label }, self && { url: self, what: 'cette date' }]) {
    const svg = q && QR.svg(q.url);
    if (svg) return { ...q, svg };
  }
  return null;
};
function bandState() {
  const b = BP.b || {}, o = BP.o, page = b.page && typeof b.page === 'object' ? b.page : {};
  const photos = o.photos || [];
  const m = bandMoment(page, o.live);
  return { m, photos, hero: photos[0] || (isCover(o.hero) ? o.hero : ''), tracks: o.tracks || [], link: o.link || '', date: o.date ? m.find(o.date) : null };
}
// Les liens du groupe : ceux qu'il a donnés, la vidéo (hors YouTube, jouée dans la page) et le contact.
function bandLinks(b, page) {
  const video = youtubeId(page.video) ? '' : urlIn(String(page.video || '').trim());
  const mail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(page.booking || '') ? page.booking : '';
  return linkRows(b.links)
    .concat(video ? [{ url: video, label: 'Vidéo', sub: linkLabel(video) }] : [])
    .concat(mail ? [{ url: 'mailto:' + mail, label: 'Contact', sub: mail, mail: true }] : []);
}
// L'ouverture : la fiche du groupe telle qu'elle est sur l'accueil (image, nom, style, description, liens), puis le prochain concert.
function bandHeroHtml(b, st) {
  const page = b.page && typeof b.page === 'object' ? b.page : {};
  const m = st.m, nx = m.next[0];
  const who = [b.style, b.city].filter(Boolean).join(' · ');
  const memo = String(b.memo || '').trim();
  const tix = nx ? urlIn(String(nx.url || '').trim()) : '';
  const when = !nx ? '' : m.live ? 'ce soir' : m.wait === 1 ? 'demain' : m.day(nx).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  const links = bandLinks(b, page);
  return `<section class="hero bp-hero">
      <div class="band open">
        <div class="band-top">
          ${isCover(b.cover) ? `<img class="band-cover" src="${b.cover}" alt="">` : ''}
          <div class="band-text">
            <h1 class="bp-name">${esc(b.name || '')}</h1>
            ${who ? `<p class="band-tag">${esc(who)}</p>` : ''}
          </div>
        </div>
        ${page.tagline ? `<p class="bp-line">${esc(page.tagline)}</p>` : ''}
        ${memo ? `<div class="band-memo">${linkify(memo)}</div>` : ''}
        ${links.length ? `<p class="band-acts">${links.map(l => `<a class="txt-btn" href="${esc(l.url)}"${l.mail ? '' : ' target="_blank" rel="noopener noreferrer"'}>${esc(l.label)}</a>`).join('')}</p>` : ''}
      </div>
      ${nx ? `<p class="bp-next ${m.live ? 'live' : ''}">${m.live ? '<i class="bp-led" aria-hidden="true"></i>' : ''}<span>${m.live ? 'en concert' : 'prochain concert'}</span><a href="${esc(dateHref(m.key(nx)) || '#')}" data-date="${esc(m.key(nx))}"><b>${esc(when)}</b> · ${esc(nx.where)}</a>${tix ? `<a class="txt-btn accent" href="${esc(tix)}" target="_blank" rel="noopener noreferrer">billets</a>` : ''}${m.live ? '<button type="button" class="txt-btn accent" data-glow title="Ton écran à la couleur de la soirée, à lever pendant le concert">allumer mon écran</button>' : ''}</p>` : ''}
    </section>`;
}
// La page d'une date : la fiche du groupe en bref, puis le concert (quand, où, les infos, les billets) et son QR code.
// Imprimée, elle devient la fiche du concert, à donner aux invités ou à poser au bar.
function bandDateHtml(b, x, st) {
  const m = st.m, k = m.key(x), until = m.until(x), old = until < 0, live = until === 0;
  const who = [b.style, b.city].filter(Boolean).join(' · ');
  const d = m.day(x);
  const when = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', ...(d.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) });
  const hour = hourOf(x);
  const soon = old ? 'déjà joué' : live ? 'ce soir' : until === 1 ? 'demain' : `dans ${until} jours`;
  const tix = old ? '' : urlIn(String(x.url || '').trim()), ev = eventOf(x), qr = dateQr(x, k, old);
  const out = ' target="_blank" rel="noopener noreferrer"';
  const acts = [
    tix ? `<a class="txt-btn accent" href="${esc(tix)}"${out}>billets</a>` : '',
    old ? '' : `<button type="button" class="txt-btn" data-ics="${esc(k)}">agenda</button>`,
    old ? '' : `<a class="txt-btn" href="${esc(mapsUrl(x))}"${out}>itinéraire</a>`,
    ev ? `<a class="txt-btn" href="${esc(ev.url)}"${out}>${esc(ev.label)}</a>` : '',
    live ? '<button type="button" class="txt-btn accent" data-glow title="Ton écran à la couleur de la soirée, à lever pendant le concert">allumer mon écran</button>' : '',
    old ? '' : '<button type="button" class="txt-btn" data-poster title="L\'affiche du concert, avec la photo du groupe : à enregistrer, partager ou imprimer">affiche</button>',
  ].join('');
  return `<section class="hero bp-hero">
      <div class="band open">
        <div class="band-top">
          ${isCover(b.cover) ? `<img class="band-cover" src="${b.cover}" alt="">` : ''}
          <div class="band-text">
            <h1 class="bp-name">${esc(b.name || '')}</h1>
            ${who ? `<p class="band-tag">${esc(who)}</p>` : ''}
            <a class="txt-btn bp-home" href="${esc(st.link || '#')}" data-home>toute la page du groupe</a>
          </div>
        </div>
      </div>
      <div class="bp-gig ${old ? 'old' : ''}">
        <div class="bp-gig-main">
          <h2 class="bp-gig-when"><time datetime="${x.d}">${esc(when.charAt(0).toUpperCase() + when.slice(1))}</time>${hour ? ` <span>· ${esc(hour)}</span>` : ''}</h2>
          <p class="bp-gig-soon">${live ? '<i class="bp-led" aria-hidden="true"></i>' : ''}${esc(soon)}</p>
          <p class="bp-gig-where"><b>${esc(x.where)}</b>${x.addr ? `<span>${esc(x.addr)}</span>` : ''}</p>
          ${x.info ? `<p class="bp-gig-info">${esc(x.info)}</p>` : ''}
          <p class="bp-acts">${acts}</p>
        </div>
        ${qr ? `<button type="button" class="bp-qr" data-qr aria-label="Agrandir le QR code">${qr.svg}<span>${esc(qr.what)}</span><small>${esc(linkLabel(qr.url))}</small></button>` : ''}
      </div>
    </section>`;
}
// Le QR code en grand, pour le montrer à quelqu'un qui le scanne avec son téléphone.
function bandQrZoom(el) {
  const st = bandState(), x = st.date;
  const qr = x && dateQr(x, st.m.key(x), st.m.until(x) < 0);
  if (!qr) return;
  const z = document.createElement('div');
  z.className = 'bp-zoom bp-qrzoom';
  z.innerHTML = `<div>${qr.svg}<b>${esc(qr.what)}</b><span>${esc(linkLabel(qr.url))}</span></div>`;
  el.append(z);
}
/* ----- L'affiche d'une date : une image à enregistrer, à partager ou à imprimer ----- */
// La photo du groupe en noir et blanc contrasté, fondue dans le noir ; le nom en très grand ; la date en couleur ; le lieu, les infos et le QR code.
// Dessinée au format A4 (1240 × 1754 px, 150 dpi), dans le navigateur : rien n'est envoyé nulle part.
const imgOf = src => new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = src; });
async function posterDraw(b, x, st) {
  const W = 1240, H = 1754, M = 92, R = W - M;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const BG = '#0b0b0d', TEXT = '#f4f4f6', MUTED = 'rgba(244, 244, 246, .66)', ACCENT = '#8f80ff';
  const SANS = '"Hanken Grotesk", system-ui, sans-serif', MONO = '"DM Mono", ui-monospace, monospace';
  if (document.fonts) await Promise.all([...['700', '600', '500', '400'].map(w => `${w} 60px "Hanken Grotesk"`), '500 30px "DM Mono"', '400 30px "DM Mono"'].map(f => document.fonts.load(f).catch(() => {})));
  g.fillStyle = BG; g.fillRect(0, 0, W, H);
  // La photo : la première du book, sinon l'image de la fiche si elle est assez grande. Sans photo, la trame de Rec.
  let img = null;
  for (const src of [st.hero, isCover(b.cover) ? b.cover : ''].filter(Boolean)) {
    try { const i = await imgOf(src); if (src === st.hero || i.naturalWidth >= 480) { img = i; break; } } catch {}
  }
  const PH = Math.round(H * .66);
  if (img) {
    const k = Math.max(W / img.naturalWidth, PH / img.naturalHeight), dw = img.naturalWidth * k, dh = img.naturalHeight * k;
    g.save(); g.beginPath(); g.rect(0, 0, W, PH); g.clip(); // une photo en hauteur ne déborde pas sous le texte
    g.drawImage(img, (W - dw) / 2, (PH - dh) * .3, dw, dh); // recadrée un peu au-dessus du centre, là où sont les visages
    g.restore();
    // Noir et blanc contrasté, avec un grain léger : une photo de téléphone prend la tenue d'un tirage.
    // Les niveaux s'étalent d'abord du noir au blanc (1 % de chaque côté), pour qu'une photo de concert sombre ne finisse pas en aplat noir.
    const im = g.getImageData(0, 0, W, PH), p = im.data, hist = new Uint32Array(256);
    for (let i = 0; i < p.length; i += 4) hist[p[i] = Math.round(.2126 * p[i] + .7152 * p[i + 1] + .0722 * p[i + 2])]++;
    const at = share => { let n = 0, v = 0; for (; v < 255; v++) if ((n += hist[v]) >= share * W * PH) break; return v; };
    const lo = Math.min(at(.01), 215), hi = Math.max(lo + 40, at(.99)); // une photo très claire garde son blanc
    const curve = new Float32Array(256);
    for (let v = 0; v < 256; v++) { const t = Math.min(1, Math.max(0, (v - lo) / (hi - lo))); curve[v] = 255 * (t * t * (3 - 2 * t) * .7 + t * .3); } // une courbe en S douce
    for (let i = 0; i < p.length; i += 4) p[i] = p[i + 1] = p[i + 2] = curve[p[i]] * .92 + (Math.random() - .5) * 18;
    g.putImageData(im, 0, 0);
    const fade = g.createLinearGradient(0, PH * .34, 0, PH);
    fade.addColorStop(0, 'rgba(11, 11, 13, 0)'); fade.addColorStop(.7, 'rgba(11, 11, 13, .86)'); fade.addColorStop(1, BG);
    g.fillStyle = fade; g.fillRect(0, 0, W, PH);
    const veil = g.createLinearGradient(0, 0, 0, 300);
    veil.addColorStop(0, 'rgba(11, 11, 13, .62)'); veil.addColorStop(1, 'rgba(11, 11, 13, 0)');
    g.fillStyle = veil; g.fillRect(0, 0, W, 300);
  } else {
    g.strokeStyle = 'rgba(244, 244, 246, .05)'; g.lineWidth = 2;
    for (let s = -H; s < W; s += 16) { g.beginPath(); g.moveTo(s, 0); g.lineTo(s + H, H); g.moveTo(s + H, 0); g.lineTo(s, H); g.stroke(); }
  }
  const ls = px => { if ('letterSpacing' in g) g.letterSpacing = `${px}px`; };
  // Retour à la ligne aux espaces ; un mot trop long se coupe ; au-delà de max lignes, des points de suspension.
  // maxW : une largeur, ou la largeur de chaque ligne (les lignes qui longent le disque).
  const wrap = (text, maxW, max) => {
    const lim = i => (typeof maxW === 'function' ? maxW(i) : maxW);
    const out = [];
    let cur = '';
    for (let w of String(text || '').split(/\s+/).filter(Boolean)) {
      while (w.length > 1 && g.measureText(w).width > lim(out.length + (cur ? 1 : 0))) {
        if (cur) { out.push(cur); cur = ''; }
        let n = w.length - 1;
        while (n > 1 && g.measureText(w.slice(0, n)).width > lim(out.length)) n--;
        out.push(w.slice(0, n)); w = w.slice(n);
      }
      const t = cur ? `${cur} ${w}` : w;
      if (!cur || g.measureText(t).width <= lim(out.length)) cur = t; else { out.push(cur); cur = w; }
    }
    if (cur) out.push(cur);
    if (out.length > max) {
      out.length = max;
      let l = out[max - 1];
      while (l && g.measureText(`${l}…`).width > lim(max - 1)) l = l.slice(0, -1).trimEnd();
      out[max - 1] = `${l}…`;
    }
    return out;
  };
  g.textBaseline = 'top';
  // En haut : le style et la ville.
  const who = [b.style, b.city].filter(Boolean).join(' · ').toUpperCase();
  if (who) { g.font = `500 25px ${MONO}`; ls(5); g.fillStyle = 'rgba(244, 244, 246, .86)'; g.fillText(wrap(who, R - M, 1)[0], M, M); }
  // En bas à droite, un disque coupé par les bords de la feuille, comme sorti de sa pochette. Son étiquette violette porte le QR code :
  // des modules sombres sur le violet, que les téléphones lisent comme un QR code ordinaire (clair autour, sombre dessus).
  const k = st.m.key(x), qr = dateQr(x, k, false);
  const TAU = Math.PI * 2, RL = 180, RD = 330, CX = W - RL - 40, CY = H - RL - 40;
  // Le bord gauche du disque entre deux hauteurs, moins un écart : jusqu'où une ligne de texte peut aller.
  const edge = (y0, y1) => { const dy = Math.abs(Math.min(Math.max(CY, y0), y1) - CY); return dy >= RD ? R : Math.min(R, CX - Math.sqrt(RD * RD - dy * dy) - 44); };
  // En bas à gauche : quand, où, les infos, et où mène le QR code.
  // L'année seulement pour une date lointaine (ou passée) : « mardi 23 février » suffit en décembre.
  const d = st.m.day(x), far = d.getFullYear() !== new Date().getFullYear() && (st.m.until(x) > 300 || st.m.until(x) < 0);
  const when = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', ...(far ? { year: 'numeric' } : {}) });
  const specs = [];
  const add = (font, color, text, max, lh, before = 0, spacing = 0) => { if (text) specs.push({ font, color, spacing, lh, before, text, max }); };
  add(`700 66px ${SANS}`, ACCENT, when.charAt(0).toUpperCase() + when.slice(1), 2, 72, 0, -1.5);
  add(`500 66px ${SANS}`, TEXT, hourOf(x), 1, 72, 0, -1.5);
  add(`600 44px ${SANS}`, TEXT, x.where, 2, 52, 38, -.5);
  add(`400 31px ${SANS}`, MUTED, x.addr, 2, 41, 8);
  add(`400 31px ${SANS}`, MUTED, x.info, 3, 41, 20);
  // Où mène le QR code, pour qui ne le scanne pas : en entier ou pas du tout (l'étiquette dit déjà « billetterie »).
  if (qr) { g.font = `400 24px ${MONO}`; ls(0); const room = edge(CY, CY) - M, link = linkLabel(qr.url); add(`400 24px ${MONO}`, MUTED, [`${qr.what} · ${link}`, link].find(t => g.measureText(t).width <= room), 1, 34, 26); }
  // Les lignes longent le disque : plus longues en haut, là où il s'arrondit. Si tout ne tient pas sous le disque, la colonne remonte, à la largeur la plus étroite.
  const lay = (top, flat) => {
    let y = top;
    const rows = specs.map(s => { y += s.before; const y0 = y; g.font = s.font; ls(s.spacing); const lines = wrap(s.text, flat ? edge(CY, CY) - M : i => edge(y0 + i * s.lh, y0 + (i + 1) * s.lh) - M, s.max); y += lines.length * s.lh; return { ...s, y0, lines }; });
    return { rows, end: y };
  };
  let rule = CY - RD - 34, col = lay(rule + 54);
  if (col.end > H - M) { const h = lay(0, true).end; rule = H - M - h - 54; col = lay(rule + 54, true); }
  for (const r of col.rows) { g.font = r.font; ls(r.spacing); g.fillStyle = r.color; r.lines.forEach((l, i) => g.fillText(l, M, r.y0 + i * r.lh)); }
  // Le disque : des sillons d'une clarté irrégulière, deux plages lisses entre les morceaux, deux reflets opposés.
  g.save();
  g.beginPath(); g.arc(CX, CY, RD, 0, TAU);
  const disc = g.createRadialGradient(CX, CY, RL, CX, CY, RD);
  disc.addColorStop(0, '#17171b'); disc.addColorStop(1, '#0f0f12');
  g.fillStyle = disc; g.fill(); g.clip();
  g.lineWidth = 1;
  for (let r = RL + 22; r < RD - 6; r += 2.5) {
    const f = (r - RL - 22) / (RD - RL - 28), smooth = Math.abs(f - .36) < .014 || Math.abs(f - .7) < .014;
    g.strokeStyle = `rgba(255, 255, 255, ${smooth ? .01 : (.026 + .04 * (Math.sin(r * 91.7) + 1) / 2).toFixed(3)})`;
    g.beginPath(); g.arc(CX, CY, r, 0, TAU); g.stroke();
  }
  if (g.createConicGradient) {
    const sheen = g.createConicGradient(-Math.PI * .8, CX, CY);
    [[0, 0], [.07, .15], [.14, 0], [.5, 0], [.57, .09], [.64, 0], [1, 0]].forEach(([p, a]) => sheen.addColorStop(p, `rgba(255, 255, 255, ${a})`));
    g.fillStyle = sheen; g.beginPath(); g.arc(CX, CY, RD, 0, TAU); g.arc(CX, CY, RL + 14, 0, TAU, true); g.fill();
  }
  g.restore();
  g.strokeStyle = 'rgba(255, 255, 255, .12)'; g.lineWidth = 2; g.beginPath(); g.arc(CX, CY, RD - 1, 0, TAU); g.stroke();
  // L'étiquette, et le QR code dessus avec trois modules de marge, entier dans le cercle.
  const lab = g.createRadialGradient(CX - RL * .35, CY - RL * .35, 0, CX, CY, RL);
  lab.addColorStop(0, '#b3a8ff'); lab.addColorStop(1, '#9c8eff'); // un violet assez clair pour que l'encre ressorte, même imprimée en noir et blanc
  g.fillStyle = lab; g.beginPath(); g.arc(CX, CY, RL, 0, TAU); g.fill();
  g.strokeStyle = 'rgba(0, 0, 0, .3)'; g.lineWidth = 3; g.beginPath(); g.arc(CX, CY, RL - 1.5, 0, TAU); g.stroke();
  const INK = '#120d27', hq = qr ? (RL - 4) / Math.SQRT2 : 0;
  if (qr) {
    const m = QR.matrix(qr.url), n = m.length, cell = 2 * hq / (n + 6), x0 = CX - n * cell / 2, y0 = CY - n * cell / 2;
    g.fillStyle = INK;
    m.forEach((row, r) => row.forEach((on, c) => { if (on) { const a = Math.round(x0 + c * cell), e = Math.round(y0 + r * cell); g.fillRect(a, e, Math.round(x0 + (c + 1) * cell) - a, Math.round(y0 + (r + 1) * cell) - e); } }));
  } else { g.fillStyle = BG; g.beginPath(); g.arc(CX, CY, 9, 0, TAU); g.fill(); } // sans QR code, le trou du disque
  // Sur le pourtour de l'étiquette, comme sur un vrai disque : le nom du groupe en haut, ce que donne le QR code en bas.
  // Le texte reste hors du carré du QR code et de sa marge ; trop long, il n'est pas écrit.
  const ri = RL - 19, rc = ri + 6.5, span = 2 * Math.acos(Math.min(1, hq / ri));
  const arcText = (text, up) => {
    text = String(text || '').trim().toUpperCase();
    // L'arabe, l'hébreu et les écritures qui lient leurs lettres ne se dessinent pas lettre à lettre : le pourtour reste vide.
    if (!text || /[\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Syriac}\p{Script=Thaana}\p{Script=Nko}\p{Script=Devanagari}\p{Script=Bengali}\p{Script=Gurmukhi}\p{Script=Gujarati}\p{Script=Oriya}\p{Script=Tamil}\p{Script=Telugu}\p{Script=Kannada}\p{Script=Malayalam}\p{Script=Sinhala}\p{Script=Thai}\p{Script=Lao}\p{Script=Tibetan}\p{Script=Myanmar}\p{Script=Khmer}]/u.test(text)) return;
    // Par caractères visibles, pour qu'un emoji composé ou une lettre accentuée décomposée reste d'un seul tenant.
    const chars = typeof Intl !== 'undefined' && Intl.Segmenter ? [...new Intl.Segmenter('fr', { granularity: 'grapheme' }).segment(text.normalize('NFC'))].map(x => x.segment) : [...text.normalize('NFC')];
    let fs = 17, sp = 0, adv = [], w = 0;
    const fit = () => { g.font = `500 ${fs}px ${MONO}`; ls(0); sp = fs * .2; adv = chars.map(ch => g.measureText(ch).width + sp); w = adv.reduce((s, v) => s + v, 0) - sp; };
    fit();
    while (w / rc > span && fs > 12) { fs--; fit(); }
    if (w / rc > span) return;
    g.save(); g.translate(CX, CY); g.fillStyle = INK; g.textAlign = 'center'; g.textBaseline = 'middle';
    let a = up ? -Math.PI / 2 - w / rc / 2 : Math.PI / 2 + w / rc / 2;
    chars.forEach((ch, i) => {
      const mid = (adv[i] - sp) / 2 / rc;
      g.save(); g.rotate(up ? a + mid + Math.PI / 2 : a - mid - Math.PI / 2); g.fillText(ch, 0, up ? -rc : rc); g.restore();
      a += (up ? 1 : -1) * adv[i] / rc;
    });
    g.restore();
  };
  arcText(b.name, true);
  if (qr) arcText(qr.what, false);
  g.textAlign = 'left'; g.textBaseline = 'top';
  // Un filet, puis le nom du groupe, le plus grand possible sur trois lignes au plus.
  g.fillStyle = 'rgba(244, 244, 246, .24)'; g.fillRect(M, rule, R - M, 2);
  const name = String(b.name || '').trim();
  let fs = 236, nl = [];
  const sized = s => { g.font = `700 ${s}px ${SANS}`; ls(-s * .04); nl = wrap(name, R - M, 9); return nl.length <= 3 && name.split(/\s+/).every(w => g.measureText(w).width <= R - M); };
  while (fs > 80 && !sized(fs)) fs -= 6;
  if (fs <= 80) { fs = 80; sized(fs); nl = wrap(name, R - M, 3); }
  g.textBaseline = 'alphabetic'; g.fillStyle = TEXT;
  // Les lignes du nom, serrées (0,93 em), mais jamais au point qu'un jambage (ç, g, p) touche l'accent d'une capitale en dessous (É).
  const base = [];
  nl.forEach((l, i) => { base[i] = rule - 48; });
  for (let i = nl.length - 2; i >= 0; i--) base[i] = base[i + 1] - Math.max(fs * .93, g.measureText(nl[i]).actualBoundingBoxDescent + g.measureText(nl[i + 1]).actualBoundingBoxAscent + fs * .05);
  nl.forEach((l, i) => g.fillText(l, M - fs * .02, base[i]));
  // Sans photo, la date en très grand occupe le haut, comme le jour d'une ligne de concert (30.11).
  // Elle prend la place que le nom lui laisse : plus petite au-dessus d'un long nom, et pas du tout s'il ne reste presque rien.
  if (!img) {
    const nameTop = nl.length ? base[0] - g.measureText(nl[0]).actualBoundingBoxAscent : rule - 48;
    const day = `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`, y0 = M + 96;
    let s = 420;
    const size = v => { s = v; g.font = `500 ${s}px ${MONO}`; ls(-s * .05); return g.measureText(day); };
    let dm = size(s);
    if (dm.width > R - M) dm = size(Math.floor(s * (R - M) / dm.width));
    const room = nameTop - 64 - y0;
    if (dm.actualBoundingBoxAscent > room) dm = size(Math.floor(s * room / dm.actualBoundingBoxAscent));
    if (s >= 150) { g.fillStyle = ACCENT; g.fillText(day, M - s * .03, y0 + dm.actualBoundingBoxAscent); }
  }
  return c;
}
// L'affiche, prête : à l'écran en grand, avec enregistrer (ou partager, sur téléphone), imprimer, fermer.
const IOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const IN_APP = /Instagram|FBAN|FBAV|FB_IAB|TikTok|Line\//i; // les navigateurs intégrés aux réseaux : ni téléchargement, ni impression
const posterFile = p => new File([p.blob], p.file, { type: p.blob.type });
async function bandPoster(el, from) {
  if (!BP.b || !bandState().date || el.querySelector('.bp-poster')) return;
  const z = document.createElement('div');
  z.className = 'bp-poster';
  z.setAttribute('role', 'dialog'); z.setAttribute('aria-modal', 'true'); z.setAttribute('aria-label', "L'affiche du concert"); z.tabIndex = -1;
  z.innerHTML = '<p class="bp-poster-wait" aria-live="polite">L\'affiche se prépare…</p>';
  // Tant qu'elle est ouverte, la page derrière ne prend ni le clavier ni le lecteur d'écran.
  BP.posterInert = [...el.children].filter(c => !c.inert);
  BP.posterInert.forEach(c => { c.inert = true; });
  BP.posterFrom = from || null;
  el.append(z);
  el.classList.add('postering');
  z.focus();
  // Sur l'adresse publique, la photo arrive après la page : on l'attend un peu plutôt que de faire l'affiche sans elle.
  let late = '';
  try { if (!bandState().hero && BP.heroP) late = await Promise.race([BP.heroP, new Promise(r => setTimeout(r, 4000, ''))]); } catch {}
  if (!z.isConnected) return;
  const st = bandState(), x = st.date, b = BP.b;
  if (!x || !b) return posterClose(el);
  let blob = null;
  try { const cv = await posterDraw(b, x, { ...st, hero: st.hero || (isCover(late) ? late : '') }); blob = await new Promise(ok => cv.toBlob(ok, 'image/jpeg', .92)); } catch (e) { console.error(e); }
  if (!z.isConnected) return;
  if (!blob) { posterClose(el); toast("L'affiche n'a pas pu être préparée"); return; }
  const url = URL.createObjectURL(blob), file = `${slugify(b.name) || 'concert'}-${st.m.key(x)}-affiche.jpg`;
  BP.poster = { url, blob, file, title: `${b.name} · ${st.m.day(x).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}` };
  let share = false;
  try { share = !!navigator.canShare && navigator.canShare({ files: [posterFile(BP.poster)] }); } catch {}
  const touch = matchMedia('(pointer: coarse)').matches, btn = (attr, label, cls = '') => `<button type="button" class="txt-btn ${cls}" ${attr}>${label}</button>`;
  // iPhone : la feuille de partage a « Enregistrer l'image » ; Android et ordinateur : un fichier, et le partage à côté sur téléphone.
  // Dans Instagram ou Facebook, rien ne se télécharge : le partage s'il existe, sinon l'appui long.
  const acts = IN_APP.test(navigator.userAgent)
    ? `${share ? btn('data-poster-share', 'partager', 'accent') : ''}${btn('data-poster-close', 'fermer')}</p><p class="bp-poster-hint">Pour l'enregistrer : appui long sur l'image, ou ouvre la page dans ton navigateur.`
    : `${btn('data-poster-save', IOS && share ? 'enregistrer ou partager' : "enregistrer l'image", 'accent')}${share && touch && !IOS ? btn('data-poster-share', 'partager') : ''}${btn('data-poster-print', 'imprimer')}${btn('data-poster-close', 'fermer')}`;
  z.innerHTML = `<img src="${url}" alt="Affiche du concert de ${esc(b.name || '')}"><p class="bp-poster-acts">${acts}</p>`;
  const first = z.querySelector('button');
  if (first) first.focus({ preventScroll: true });
}
function posterClose(el) {
  const z = el.querySelector('.bp-poster');
  if (z) z.remove();
  el.classList.remove('postering');
  (BP.posterInert || []).forEach(c => { c.inert = false; });
  BP.posterInert = null;
  if (z && BP.posterFrom && BP.posterFrom.isConnected) BP.posterFrom.focus({ preventScroll: true });
  BP.posterFrom = null;
  if (BP.poster) { URL.revokeObjectURL(BP.poster.url); BP.poster = null; }
}
// Enregistrer : un fichier téléchargé, sauf sur iPhone où la feuille de partage l'enregistre dans Photos. Partager : la feuille de partage.
async function posterSave(how) {
  const p = BP.poster;
  if (!p || BP.sharing) return;
  const f = posterFile(p);
  let share = false;
  try { share = !!navigator.canShare && navigator.canShare({ files: [f] }); } catch {}
  if (share && (how === 'share' || IOS)) {
    BP.sharing = true; // un deuxième toucher pendant que la feuille s'ouvre ne lance pas aussi un téléchargement
    try { await navigator.share({ files: [f], title: p.title }); return; }
    catch (e) { if (e && (e.name === 'AbortError' || e.name === 'InvalidStateError')) return; }
    finally { BP.sharing = false; }
  }
  if (how === 'share' || IN_APP.test(navigator.userAgent)) return toast("Le partage n'a pas marché : appui long sur l'image pour l'enregistrer");
  const a = document.createElement('a');
  a.href = p.url; a.download = p.file;
  document.body.append(a); a.click(); a.remove();
}
// Le reste, en modules comme les idées de l'accueil : écouter, les concerts, le groupe, les photos, la vidéo.
// Sur la page d'une date : écouter, puis les autres dates.
function bandRestHtml(b, st) {
  const page = b.page && typeof b.page === 'object' ? b.page : {};
  const m = st.m, at = st.date;
  const lineup = page.lineup === false ? [] : (Array.isArray(b.lineup) ? b.lineup : []).filter(x => x && (x.name || x.inst));
  const bio = String(page.bio || '').trim();
  const yt = youtubeId(page.video);
  const mail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(page.booking || '') ? page.booking : '';
  const year = new Date().getFullYear();
  const mod =(id, title, sub, body) => `<section class="block bp-mod" id="bp-${id}">
      <div class="block-head"><span class="grip" aria-hidden="true">${PICK}</span><h2 class="block-title">${title}</h2></div>
      ${sub ? `<p class="block-sub"><span>${esc(sub)}</span></p>` : ''}${body}</section>`;
  const parts = [];
  // Écouter : chaque morceau est une prise de l'accueil (son numéro, son titre, sa forme d'onde). Le médiator s'allume pendant l'écoute.
  const playable = st.tracks.filter(canPlay);
  if (st.tracks.length) parts.push(mod('ecouter', 'Écouter', playable.length ? `${morceaux(playable.length)} · ${fmtDur(playable.reduce((sum, t) => sum + trackLen(t), 0))}` : '',
    `<ol class="takes">${st.tracks.map((t, n) => { const ok = canPlay(t); return `<li class="take bp-trk ${ok ? '' : 'mute'}" data-n="${n}">
      <button type="button" class="play" ${ok ? `data-trk="${n}"` : 'disabled'} aria-label="Écouter « ${esc(t.title)} »"><span class="num">${String(n + 1).padStart(2, '0')}</span><span class="pi">${ICONS.play}</span></button>
      <div class="take-main">
        <div class="take-line"><span class="take-title" ${ok ? `data-trk="${n}"` : ''}>${esc(t.title)}</span><span class="take-meta">${fmtDur(trackLen(t))}</span></div>
        <div class="take-note">${esc(ok ? trackNote(t) : 'Format non lu par cet appareil')}</div>
        ${ok ? `<div class="wave" data-seek="${n}">${waveSvg(t, 'w-base')}${waveSvg(t, 'w-fill')}</div>` : ''}
      </div></li>`; }).join('')}</ol>`));
  // Les concerts : une ligne par date, comme une prise. La date à la place du numéro, la salle en titre, le jour et l'heure à droite.
  // La salle ouvre la page de la date (les infos, le QR code), comme « infos ».
  const dateLi = (x, cls) => {
    const d = m.day(x), u = urlIn(String(x.url || '').trim()), k = m.key(x), to = `href="${esc(dateHref(k) || '#')}" data-date="${esc(k)}"`;
    // L'heure à droite, comme la durée d'une prise ; la date en toutes lettres en dessous, l'année seulement si ce n'est pas celle-ci.
    const other = d.getFullYear() !== year;
    const meta = cls === 'old' ? (other ? String(d.getFullYear()) : '') : hourOf(x);
    const day = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', ...(other ? { year: 'numeric' } : {}) });
    const soon = cls === 'old' ? '' : [day, cls === 'next' ? (m.live ? 'ce soir' : m.soon.toLowerCase()) : ''].filter(Boolean).join(' · ');
    return `<li class="take bp-date ${cls}"><time class="bp-day" datetime="${x.d}">${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}</time>
      <div class="take-main">
        <div class="take-line"><a class="take-title bp-dlink" ${to}>${esc(x.where)}</a>${meta ? `<span class="take-meta">${esc(meta)}</span>` : ''}</div>
        ${soon ? `<div class="take-note">${esc(soon)}</div>` : ''}
        ${cls === 'old' ? '' : `<p class="bp-acts">${u ? `<a class="txt-btn accent" href="${esc(u)}" target="_blank" rel="noopener noreferrer">billets</a>` : ''}<a class="txt-btn" ${to}>infos</a></p>`}
      </div></li>`;
  };
  if (at) { // la page d'une date : les autres dates à venir, sans les anciennes
    const others = m.next.filter(x => x !== at);
    if (others.length) parts.push(mod('concerts', 'Les autres dates', '', `<ol class="takes">${others.map(x => dateLi(x, x === m.next[0] ? 'next' : '')).join('')}</ol>`));
  } else if (m.next.length || m.past.length) parts.push(mod('concerts', 'Concerts', m.next.length ? '' : 'pas de date annoncée pour le moment',
    `<ol class="takes">${m.next.map((x, n) => dateLi(x, n ? '' : 'next')).join('')}${m.past.length ? `<li class="bp-sep">déjà joué</li>${m.past.map(x => dateLi(x, 'old')).join('')}` : ''}</ol>`));
  // Le groupe : la biographie, puis le line-up comme sur la fiche du groupe dans l'appli.
  const lineupHtml = lineup.length ? `<ul class="band-lineup">${lineup.map(x => `<li><b>${esc(x.name || '?')}</b><span>${esc(x.inst || '')}</span></li>`).join('')}</ul>` : '';
  if (!at && (bio || lineupHtml)) parts.push(mod('groupe', 'Le groupe', '', `${bio ? `<div class="bp-bio">${paras(bio)}</div>` : ''}${lineupHtml}`));
  // Les photos : la première en grand, les autres par deux. Un toucher les ouvre en grand.
  const pics = st.photos.length ? st.photos : st.hero ? [st.hero] : [];
  if (!at && pics.length) parts.push(mod('photos', 'Photos', '', `<div class="bp-gal">${pics.map(src => `<button type="button" class="bp-shot" data-ph aria-label="Agrandir la photo"><img src="${src}" alt="" loading="lazy"></button>`).join('')}</div>`));
  if (!at && yt) parts.push(mod('video', 'En vidéo', '', `<div class="bp-frame"><iframe src="https://www.youtube-nocookie.com/embed/${yt}" title="Vidéo du groupe" loading="lazy" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>`));
  return `<div class="board bp-board">${parts.join('\n')}</div>
    <footer class="bp-foot">
      ${mail ? `<span>contact <a class="txt-btn" href="mailto:${esc(mail)}">${esc(mail)}</a></span>` : ''}
      <span><a class="brand" href="${esc(location.pathname)}">Rec<i>.</i></a> le carnet d'idées des groupes</span>
    </footer>`;
}
// Les photos en grand, avec précédente et suivante (flèches, clavier, ou glissement du doigt).
function bandZoom(el, i) {
  const list = [...el.querySelectorAll('[data-ph] img')].map(x => x.src);
  if (!list.length) return;
  i = (i + list.length) % list.length;
  let z = el.querySelector('.bp-zoom');
  if (!z) { z = document.createElement('div'); z.className = 'bp-zoom'; el.append(z); }
  z.dataset.i = i;
  z.innerHTML = `<img src="${list[i]}" alt="">${list.length > 1 ? `<button type="button" data-z="-1" aria-label="Photo précédente">‹</button><button type="button" data-z="1" aria-label="Photo suivante">›</button><span>${i + 1} / ${list.length}</span>` : ''}`;
}
/* ----- L'écoute : un lecteur qui reste en bas de l'écran pendant qu'on lit ----- */
function bandAudio() {
  if (BP.audio) return BP.audio;
  const a = BP.audio = new Audio();
  a.preload = 'auto';
  a.addEventListener('loadedmetadata', () => { const t = BP.cur; if (t && cutIn(t) > 0 && a.currentTime < cutIn(t)) { try { a.currentTime = cutIn(t); } catch {} } });
  // L'arrêt à la fin de la coupe passe par timeupdate : il continue de tourner écran verrouillé, pas l'animation.
  a.addEventListener('timeupdate', () => { const t = BP.cur; bandTick(); if (t && !BP.lock && !a.paused && a.currentTime >= trackEnd(t, a) - 0.05) { BP.lock = true; bandNext(true); } });
  a.addEventListener('ended', () => { if (!BP.lock) { BP.lock = true; bandNext(true); } });
  a.addEventListener('playing', () => { BP.wait = false; BP.lock = false; if (BP.cur) BP.cur.retried = false; bandPaintPlay(); bandLoop(); });
  a.addEventListener('pause', bandPaintPlay);
  a.addEventListener('error', () => { BP.wait = false; BP.lock = false; const t = BP.cur; if (t && !t.retried && BP.o.sign) { t.retried = true; t.url = ''; const n = BP.idx; BP.idx = -1; BP.cur = null; bandPlay(n); } else bandPaintPlay(); });
  return a;
}
// Le magnéto de l'accueil, en bas de l'écran : le temps à gauche, écouter au milieu, le vumètre à droite.
function bandDeck() {
  if (BP.deck) return BP.deck;
  const d = BP.deck = document.createElement('div');
  d.className = 'rec-btn bp-mag';
  d.hidden = true;
  d.innerHTML = `<span class="deck-time">0:00</span><button type="button" class="deck-main" data-deck aria-label="Écouter"><span class="deck-ring"><svg viewBox="0 0 24 24" aria-hidden="true"><path class="pl" d="M8.5 5.5v13l10.5-6.5z"/><path class="pa" d="M7 5h3.6v14H7zM13.4 5H17v14h-3.6z"/></svg></span><span class="bp-mag-t">Écouter</span><span class="kbd">espace</span></button><span class="deck-meter" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></span>`;
  return d;
}
function bandPaintPlay() {
  const el = $('#bandpage');
  if (!el) return;
  const a = BP.audio, t = BP.cur;
  const playing = !!(a && t && (BP.wait || (!a.paused && !a.ended))); // pendant le chargement, le bouton montre déjà « pause »
  el.classList.toggle('playing', playing);
  el.classList.toggle('waiting', !!t && BP.wait);
  el.querySelectorAll('.bp-trk').forEach(x => {
    const on = !!t && +x.dataset.n === BP.idx;
    x.classList.toggle('is-current', on);
    x.classList.toggle('is-playing', on && playing);
    const pi = x.querySelector('.pi'), b = x.querySelector('.play[data-trk]');
    if (pi) pi.innerHTML = on && playing ? ICONS.pause : ICONS.play;
    if (b) b.setAttribute('aria-label', `${on && playing ? 'Pause :' : 'Écouter'} « ${(x.querySelector('.take-title') || {}).textContent || ''} »`);
    if (!on) { const f = x.querySelector('.w-fill'); if (f) f.style.clipPath = ''; }
  });
  const d = bandDeck();
  if (d.parentNode !== el) el.append(d);
  d.hidden = !BP.b || !(BP.o.tracks || []).some(canPlay);
  el.classList.toggle('decked', !d.hidden);
  d.querySelector('.bp-mag-t').textContent = t && !BP.after ? t.title : 'Écouter';
  d.querySelector('.deck-main').setAttribute('aria-label', playing ? `Pause : ${t.title}` : 'Écouter');
  if (!t || BP.after) d.querySelector('.deck-time').textContent = '0:00';
}
// La progression se lit sur la forme d'onde du morceau en cours, comme sur l'accueil, et le temps sur le magnéto.
function bandTick() {
  const a = BP.audio, t = BP.cur, el = $('#bandpage');
  if (!a || !t || !el || BP.loaded !== t.id) return 0; // pendant la signature d'un autre morceau, l'ancien son est encore là
  const from = cutIn(t), to = trackEnd(t, a);
  const p = Math.max(0, Math.min(1, (a.currentTime - from) / Math.max(.01, to - from)));
  const fill = el.querySelector(`.bp-trk[data-n="${BP.idx}"] .w-fill`);
  if (fill) fill.style.clipPath = `inset(0 ${(100 - p * 100).toFixed(2)}% 0 0)`;
  if (BP.deck && !BP.after) BP.deck.querySelector('.deck-time').textContent = fmtDur(Math.max(0, a.currentTime - from));
  return p;
}
// Tant que ça joue : la progression et le vumètre, qui suit le morceau.
function bandLoop() {
  cancelAnimationFrame(BP.raf);
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const step = now => {
    const el = $('#bandpage'), a = BP.audio, t = BP.cur;
    const meter = BP.deck && BP.deck.querySelector('.deck-meter');
    if (!el || el.hidden || !a || !t || a.paused) { BP.level = 0; setMeter(meter, 0); return; }
    const p = bandTick(), pk = wavePeaks(t), x = p * (pk.length - 1), i = Math.floor(x);
    const v = ((pk[i] || 0) + ((pk[Math.min(pk.length - 1, i + 1)] || 0) - (pk[i] || 0)) * (x - i)) / 100;
    const lively = v * (.7 + .3 * Math.abs(Math.sin(now / 90) * Math.sin(now / 37)));
    BP.level += (lively - BP.level) * .16;
    setMeter(meter, calm ? v : Math.min(1, BP.level * 1.2));
    BP.raf = requestAnimationFrame(step);
  };
  BP.raf = requestAnimationFrame(step);
}
function bandMedia(t) {
  if (!('mediaSession' in navigator) || !window.MediaMetadata) return;
  BP.media = true;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({ title: t.title, artist: (BP.b && BP.b.name) || '', album: 'Rec.', artwork: BP.b && isCover(BP.b.cover) ? [{ src: BP.b.cover, sizes: '360x360', type: 'image/jpeg' }] : [] });
    navigator.mediaSession.setActionHandler('play', () => { if (BP.audio) BP.audio.play().catch(() => {}); });
    navigator.mediaSession.setActionHandler('pause', () => { if (BP.audio) BP.audio.pause(); });
    navigator.mediaSession.setActionHandler('nexttrack', () => bandNext(false));
  } catch {}
}
async function bandPlay(n) {
  const list = BP.o.tracks || [], t = list[n];
  if (!t || !canPlay(t)) return;
  const a = bandAudio();
  if (BP.cur && BP.cur.id === t.id && a.src && !BP.after) {
    if (BP.cur !== t) { t.url = t.url || BP.cur.url; BP.cur = t; BP.idx = n; } // la liste a été rafraîchie : même morceau, nouvel objet
    if (a.paused) { BP.wait = true; bandPaintPlay(); a.play().catch(() => { BP.wait = false; bandPaintPlay(); }); }
    else { BP.wait = false; a.pause(); }
    return;
  }
  BP.idx = n; BP.cur = t; BP.after = false; BP.lock = false;
  bandDeck();
  if (!t.url) {
    BP.wait = true; a.pause(); bandPaintPlay();
    try { t.url = await BP.o.sign(t); } catch (e) { console.error(e); }
    if (BP.cur !== t) return;
    if (!t.url) { BP.wait = false; BP.cur = null; BP.idx = -1; bandPaintPlay(); return; }
  }
  a.src = t.url;
  BP.loaded = t.id; // le son chargé est celui de ce morceau
  try { a.currentTime = cutIn(t); } catch {}
  BP.wait = true;
  bandPaintPlay();
  bandMedia(t);
  a.play().catch(e => { console.error(e); BP.wait = false; bandPaintPlay(); });
}
function bandNext(auto) {
  const list = BP.o.tracks || [], a = BP.audio;
  if (!a || !BP.cur) return;
  let n = BP.idx;
  for (let k = 0; k < list.length; k++) { n++; if (n >= list.length) { if (auto) { n = -1; break; } n = 0; } if (canPlay(list[n])) break; }
  if (n < 0 || n === BP.idx) { // dernière note, ou un seul morceau : on s'arrête sur la suite (le prochain concert), prêt à rejouer
    a.pause();
    try { a.currentTime = cutIn(BP.cur); } catch {}
    BP.after = auto; BP.lock = false;
    if (!auto) { BP.after = true; bandPlay(BP.idx); return; }
    bandTick(); bandPaintPlay();
    return;
  }
  bandPlay(n);
}
function bandStop() {
  cancelAnimationFrame(BP.raf);
  if (BP.audio) { try { BP.audio.pause(); BP.audio.removeAttribute('src'); BP.audio.load(); } catch {} }
  BP.cur = null; BP.idx = -1; BP.after = false; BP.wait = false; BP.lock = false; BP.loaded = null;
  if (BP.deck) { BP.deck.querySelector('.deck-time').textContent = '0:00'; setMeter(BP.deck.querySelector('.deck-meter'), 0); }
  if (BP.media) { BP.media = false; try { navigator.mediaSession.metadata = null; for (const k of ['play', 'pause', 'nexttrack']) navigator.mediaSession.setActionHandler(k, null); } catch {} }
}
// Les soirs de concert : l'écran à la couleur du groupe. Le rythme est calé sur l'horloge, donc toute la salle respire ensemble.
function bandGlow(on) {
  const el = $('#bandpage');
  if (!el) return;
  const old = el.querySelector('.bp-glow');
  if (old) old.remove();
  keepAwake(!!on);
  if (!on || !BP.b) return;
  const g = document.createElement('div');
  g.className = 'bp-glow';
  g.style.animationDelay = `-${Date.now() % 8000}ms`;
  g.innerHTML = `<b>${esc(BP.b.name || '')}</b><span>touche l'écran pour éteindre</span>`;
  el.append(g);
}
// Une date dans l'agenda du téléphone : un fichier .ics, ou Google Agenda là où les fichiers ne s'ouvrent pas.
function bandAgenda(k) {
  const b = BP.b, m = b && bandState().m, x = m && m.find(k);
  if (!x) return;
  const pad = v => String(v).padStart(2, '0');
  const ymd = d => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  const [Y, M, D] = x.d.split('-').map(Number);
  const timed = /^\d{2}:\d{2}$/.test(x.h || '');
  const [h, mi] = timed ? x.h.split(':').map(Number) : [0, 0];
  const start = new Date(Y, M - 1, D, h, mi), end = timed ? new Date(Y, M - 1, D, h + 2, mi) : new Date(Y, M - 1, D + 1);
  const stamp = d => `${ymd(d)}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
  const title = `${b.name} en concert`, link = dateHref(k) || BP.o.link || '';
  const place = [x.where, x.addr].filter(Boolean).join(', '), about = [x.info, link].filter(Boolean).join('\n');
  if (/Instagram|FBAN|FBAV|FB_IAB|TikTok|Line\//i.test(navigator.userAgent)) {
    window.open(`https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${timed ? `${stamp(start)}/${stamp(end)}` : `${ymd(start)}/${ymd(end)}`}&location=${encodeURIComponent(place)}&details=${encodeURIComponent(about)}`, '_blank', 'noopener');
    return;
  }
  const txt = v => String(v).replace(/\\/g, '\\\\').replace(/([,;])/g, '\\$1').replace(/\r?\n/g, '\\n');
  const now = new Date();
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Rec.//Book//FR', 'BEGIN:VEVENT', `UID:${k}-${slugify(b.name)}@rec`,
    `DTSTAMP:${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`,
    timed ? `DTSTART:${stamp(start)}` : `DTSTART;VALUE=DATE:${ymd(start)}`, timed ? `DTEND:${stamp(end)}` : `DTEND;VALUE=DATE:${ymd(end)}`,
    `SUMMARY:${txt(title)}`, `LOCATION:${txt(place)}`, link ? `URL:${link}` : '', about ? `DESCRIPTION:${txt(about)}` : '',
    'BEGIN:VALARM', 'TRIGGER:-P1D', 'ACTION:DISPLAY', `DESCRIPTION:${txt(`${b.name} joue demain`)}`, 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].filter(Boolean).join('\r\n');
  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
  const dl = document.createElement('a');
  dl.href = url; dl.download = `${slugify(b.name) || 'concert'}-${x.d}.ics`;
  document.body.append(dl); dl.click(); dl.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
async function bandShare(btn) {
  // Sur la page d'une date, c'est elle qu'on partage, avec une phrase toute faite pour les messages.
  const st = bandState(), x = st.date, name = (BP.b && BP.b.name) || 'Rec.';
  const link = x ? dateHref(st.m.key(x)) : BP.o.link;
  if (!link) return;
  const when = x ? `${st.m.day(x).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}${hourOf(x) ? ` à ${hourOf(x)}` : ''}` : '';
  const title = x ? `${name} · ${when}` : name, text = x ? `${name} en concert ${when}, ${x.where}` : '';
  if (navigator.share) { try { await navigator.share({ title, ...(text ? { text } : {}), url: link }); } catch {} return; }
  const was = btn.dataset.was || (btn.dataset.was = btn.textContent);
  try { await navigator.clipboard.writeText(link); btn.textContent = 'lien copié'; } catch { btn.textContent = link.replace(/^https?:\/\//, ''); }
  setTimeout(() => { if (btn.isConnected) btn.textContent = was; }, 2600);
}
// La barre du navigateur prend la couleur du modèle ; elle reprend celle de l'appli à la fermeture.
function bandTheme(tpl) {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) return;
  if (BP.theme0 === null) BP.theme0 = meta.content;
  meta.content = tpl ? tpl[2] : BP.theme0;
  if (!tpl) BP.theme0 = null;
}
// L'essayage : dans l'aperçu, le groupe passe sa propre page d'un modèle à l'autre d'un toucher. Un modèle n'est que des variables : rien n'est recomposé.
const bandTryHtml = b => { const page = (b && b.page) || {}, cur = tplOf(page)[0], acc = /^#[0-9a-f]{6}$/i.test(page.accent || '') ? page.accent : '';
  return `<div class="bp-try">${TEMPLATES.map(t => `<button type="button" class="tpl ${t[0] === cur ? 'on' : ''}" data-tpl="${t[0]}" style="--b:${t[2]};--t:${t[3]};--a:${t[4]}"><i></i><b>${t[1]}</b></button>`).join('')}<span class="sep"></span>
    <button type="button" class="swatch auto ${acc ? '' : 'on'}" data-accent="" aria-label="Couleur du modèle" title="Couleur du modèle"></button>${PALETTE.map(c => `<button type="button" class="swatch ${c === acc ? 'on' : ''}" style="--c:${c}" data-accent="${c}" aria-label="Couleur ${c}"></button>`).join('')}</div>`; };
function bandTry(btn) {
  const el = $('#bandpage');
  if (!el || !BP.b) return;
  const page = { ...(BP.b.page || {}) };
  if ('tpl' in btn.dataset) page.template = btn.dataset.tpl; else page.accent = btn.dataset.accent;
  BP.b = { ...BP.b, page };
  const tpl = tplOf(page), accent = /^#[0-9a-f]{6}$/i.test(page.accent || '') ? page.accent : '';
  if (accent) el.style.setProperty('--accent', accent); else el.style.removeProperty('--accent');
  el.querySelectorAll('.bp-try .tpl').forEach(x => x.classList.toggle('on', x.dataset.tpl === tpl[0]));
  el.querySelectorAll('.bp-try .swatch').forEach(x => x.classList.toggle('on', x.dataset.accent === accent));
  if (BP.o.onPick) BP.o.onPick(tpl[0], accent);
  if (!('tpl' in btn.dataset)) return;
  tplReady(tpl).then(() => { // on attend la feuille du modèle : la page ne passe pas par un état à moitié habillé
    if (!BP.b || tplOf(BP.b.page) !== tpl) return;
    el.dataset.tpl = tpl[0];
    bandTheme(tpl);
    if (el.classList.contains('anim')) { el.classList.remove('again'); const hero = el.querySelector('.bp-hero'); if (hero) hero.replaceWith(hero.cloneNode(true)); } // la façade rejoue son entrée
  });
}
// Ouvrir la page d'une date (k), ou revenir à celle du groupe (k vide). La musique continue.
// Sur l'adresse publique, l'adresse suit et le bouton retour du téléphone ramène où l'on était ; dans l'aperçu de l'appli, on ne touche pas à l'adresse.
function bandGoto(k, push = true) {
  const el = $('#bandpage');
  if (!el || el.hidden || !BP.b) return;
  const pub = !BP.o.preview && !!BP.o.link, h = history.state;
  const from = bandState().date ? null : el.scrollTop; // depuis la page du groupe : on retiendra où l'on était
  // Revenir, plutôt qu'empiler, quand la page du groupe est juste derrière… dans ce même chargement (sinon la page se rechargerait et la musique s'arrêterait).
  if (!k && push && pub && h && h.bpFrom === 'band' && h.bpDoc === BP_DOC) return history.back();
  // Quitter la page du groupe dont l'adresse porte encore une date inconnue : le retour y ramènera la page du groupe, pas cette date.
  if (k && push && pub && from != null && BP.o.date) history.replaceState(h, '', BP.o.link);
  showBandPage(BP.b, { ...BP.o, date: k || null, again: true });
  if (bandState().date) { if (from != null) BP.back = from; el.scrollTop = 0; } else el.scrollTop = BP.back || 0;
  if (pub && push) history.pushState(k ? { bpDate: k, bpFrom: from != null ? 'band' : 'date', bpDoc: BP_DOC } : { bpDoc: BP_DOC }, '', k ? dateHref(k) : BP.o.link);
}
function bandClose() {
  const el = $('#bandpage');
  bandStop();
  keepAwake(false);
  bandTheme(null);
  if (el) { posterClose(el); el.hidden = true; el.innerHTML = ''; }
  document.body.classList.remove('paging');
  BP.inert.forEach(x => { x.inert = false; });
  BP.inert = [];
  if (BP.opener && BP.opener.isConnected) BP.opener.focus();
  BP.opener = null;
}
function bandShell() {
  let el = $('#bandpage');
  if (el) return el;
  el = document.createElement('div'); el.id = 'bandpage'; el.className = 'bp'; document.body.append(el);
  el.addEventListener('click', e => {
    if (el.querySelector('.bp-glow')) return bandGlow(false);
    // L'affiche ouverte : ses boutons, et un toucher à côté la ferme.
    const pz = el.querySelector('.bp-poster');
    if (pz) {
      const pb = e.target.closest('[data-poster-save], [data-poster-share], [data-poster-print], [data-poster-close]');
      if (!pb) { if (e.target === pz && e.detail < 2) posterClose(el); return; } // le fond seulement, et pas le 2e clic d'un double-clic sur « affiche »
      if (pb.matches('[data-poster-save]')) posterSave(); else if (pb.matches('[data-poster-share]')) posterSave('share'); else if (pb.matches('[data-poster-print]')) window.print(); else posterClose(el);
      return;
    }
    const z = el.querySelector('.bp-zoom'), t = e.target;
    if (z) { if (Date.now() - BP.swiped < 450) return; const step = t.closest('[data-z]'); if (step) bandZoom(el, +z.dataset.i + +step.dataset.z); else z.remove(); return; }
    const pick = t.closest('.bp-try [data-tpl], .bp-try [data-accent]');
    if (pick) return bandTry(pick);
    if (t.closest('[data-bp-close]')) return bandClose();
    if (t.closest('[data-bp-live]')) return showBandPage(BP.b, { ...BP.o, live: !BP.o.live, again: true });
    // Le magnéto : reprend le morceau en cours, ou le premier.
    if (t.closest('[data-deck], .bp-mag')) { const first = (BP.o.tracks || []).findIndex(canPlay); return bandPlay(BP.idx >= 0 && !BP.after ? BP.idx : first); }
    // La forme d'onde : sur le morceau en cours, on se place où l'on touche ; sur un autre, il démarre.
    const seek = t.closest('[data-seek]');
    if (seek) {
      const n = +seek.dataset.seek, a = BP.audio, cur = BP.cur;
      if (!a || !cur || n !== BP.idx || BP.after || !a.src) return bandPlay(n);
      const r = seek.getBoundingClientRect(), from = cutIn(cur);
      try { a.currentTime = from + Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * (trackEnd(cur, a) - from); } catch {}
      bandTick();
      if (a.paused && !BP.wait) bandPlay(n);
      return;
    }
    const trk = t.closest('[data-trk]');
    if (trk) return bandPlay(+trk.dataset.trk);
    if (t.closest('[data-glow]')) return bandGlow(true);
    const ics = t.closest('[data-ics]');
    if (ics) return bandAgenda(ics.dataset.ics);
    const share = t.closest('[data-share]');
    if (share) return bandShare(share);
    // Une date ouvre sa page ; « toute la page du groupe » y ramène. Ctrl ou Cmd + clic garde l'ouverture dans un autre onglet.
    const date = t.closest('[data-date]'), home = t.closest('[data-home]');
    if ((date || home) && !(e.metaKey || e.ctrlKey || e.shiftKey || e.button)) { e.preventDefault(); return bandGoto(date ? date.dataset.date : null); }
    if (date || home) { if (!(date || home).getAttribute('href').startsWith('http')) e.preventDefault(); return; }
    if (t.closest('[data-qr]')) return bandQrZoom(el);
    if (t.closest('[data-poster]')) return bandPoster(el, t.closest('[data-poster]'));
    const ph = t.closest('[data-ph]');
    if (ph) { const img = ph.querySelector('img'); if (img) bandZoom(el, [...el.querySelectorAll('[data-ph] img')].indexOf(img)); }
  });
  let sx = 0;
  el.addEventListener('touchstart', e => { if (e.target.closest('.bp-zoom')) sx = e.touches[0].clientX; }, { passive: true });
  el.addEventListener('touchend', e => {
    const z = el.querySelector('.bp-zoom');
    if (!z || z.classList.contains('bp-qrzoom') || !e.target.closest('.bp-zoom')) return;
    const dx = e.changedTouches[0].clientX - sx;
    if (Math.abs(dx) > 45) { BP.swiped = Date.now(); bandZoom(el, +z.dataset.i + (dx < 0 ? 1 : -1)); }
  }, { passive: true });
  document.addEventListener('keydown', e => {
    if (el.hidden) return;
    if (e.key === 'Escape' && el.querySelector('.bp-glow')) return bandGlow(false);
    if (el.querySelector('.bp-poster')) { if (e.key === 'Escape') posterClose(el); else if (e.code === 'Space' && !(e.target.closest && e.target.closest('button'))) e.preventDefault(); return; }
    const z = el.querySelector('.bp-zoom');
    if (!z) {
      // Espace : écouter et mettre en pause, comme le magnéto de l'appli.
      if (e.key === 'Escape' && BP.o.preview) return bandState().date ? bandGoto(null) : bandClose(); // l'aperçu se ferme comme une feuille, la page d'une date d'abord
      const c = e.code === 'Space' && e.target.closest ? e.target.closest('input, textarea, select, [contenteditable], iframe, button') : null;
      if (e.code !== 'Space' || !BP.deck || BP.deck.hidden || el.querySelector('.bp-glow') || (c && (c.matches('input, textarea, select, [contenteditable], iframe') || (el.contains(c) && c.matches(':focus-visible'))))) return;
      e.preventDefault(); // ni le défilement, ni un bouton cliqué plus tôt ne prennent la touche
      if (!e.repeat) BP.deck.querySelector('.deck-main').click();
      return;
    }
    if (e.key === 'Escape') z.remove();
    if (z.classList.contains('bp-qrzoom')) return;
    if (e.key === 'ArrowLeft') bandZoom(el, +z.dataset.i - 1);
    if (e.key === 'ArrowRight') bandZoom(el, +z.dataset.i + 1);
  });
  // Le bouton retour du téléphone, sur l'adresse publique : de la page d'une date à celle du groupe, et inversement.
  window.addEventListener('popstate', () => {
    if (el.hidden || !BP.b || BP.o.preview) return;
    bandGoto(new URLSearchParams(location.search).get('date'), false);
  });
  return el;
}
// Tout afficher. o : { preview, photos, tracks, hero, sign, link, live, onPick, again, date }. date : la page d'un concert plutôt que celle du groupe.
function showBandPage(b, o = {}) {
  const el = bandShell();
  if (!o.again) bandStop();
  BP.b = b;
  BP.o = { ...o, photos: (o.photos || []).filter(isCover), tracks: o.tracks || [] };
  const tpl = tplOf(b && b.page);
  const accent = MODELES && b && b.page && /^#[0-9a-f]{6}$/i.test(b.page.accent || '') ? b.page.accent : '';
  if (accent) el.style.setProperty('--accent', accent); else el.style.removeProperty('--accent');
  el.classList.toggle('anim', !matchMedia('(prefers-reduced-motion: reduce)').matches);
  el.classList.toggle('again', !!o.again);
  el.classList.toggle('framed', !!o.preview);
  el.classList.toggle('trying', MODELES && !!o.onPick);
  const st = bandState();
  const canLive = b && datesOf(b.page).some(x => x.d >= today());
  const top = bandTopHtml(b && o.link);
  el.classList.toggle('dated', !!st.date);
  if (el.querySelector('.bp-glow')) keepAwake(false); // la lumière part avec l'ancien rendu (retour arrière, autre date) : l'écran peut de nouveau se mettre en veille
  posterClose(el); // l'affiche aussi, avec son image
  // L'onglet du navigateur dit où l'on est : le groupe, ou le groupe et la date.
  if (b && !o.preview) document.title = st.date ? `${b.name} · ${st.m.day(st.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}, ${st.date.where}` : String(b.name || 'Rec.');
  el.innerHTML = (o.preview ? `<div class="bp-bar"><span>Aperçu</span><div>${canLive ? `<button type="button" class="txt-btn ${o.live ? 'on' : ''}" data-bp-live>${o.live ? 'jour normal' : 'soir de concert'}</button>` : ''}<button type="button" class="txt-btn" data-bp-close>fermer</button></div></div>` : '') +
    (b ? `<div class="bp-page">${top}<main>${st.date ? bandDateHtml(b, st.date, st) : bandHeroHtml(b, st)}<div class="bp-rest">${bandRestHtml(b, st)}</div></main></div>`
      : `<div class="bp-page bp-none">${top}<main class="empty"><h1 class="empty-title">${o.offline ? 'Page indisponible' : "Cette page n'existe pas"}</h1><p>${o.offline ? 'Pas de réseau pour le moment. Réessaie dans un instant.' : "Le groupe l'a peut-être fermée, ou l'adresse est incomplète."}</p></main></div>`) +
    (MODELES && o.onPick && b ? bandTryHtml(b) : '');
  // La feuille du modèle arrive à la demande : tant qu'elle n'est pas là, la page reste masquée plutôt qu'à moitié habillée.
  const ready = () => { if (BP.b !== b) return; el.dataset.tpl = tpl[0]; bandTheme(tpl); el.classList.remove('dressing'); };
  if (tpl[0] === 'studio' || document.getElementById('tplcss-' + tpl[0]) && document.getElementById('tplcss-' + tpl[0]).sheet) ready();
  else { el.classList.add('dressing'); Promise.race([tplReady(tpl), new Promise(r => setTimeout(r, 1800))]).then(ready); }
  el.hidden = false;
  const f = document.activeElement;
  if (f && f !== document.body && !el.contains(f)) { BP.opener = f; f.blur(); } // sinon Espace relancerait le bouton resté derrière
  for (const x of document.body.children) if (x !== el && x.tagName !== 'SCRIPT' && !x.inert) { x.inert = true; BP.inert.push(x); }
  if (!o.again) el.scrollTop = 0;
  document.body.classList.add('paging');
  bandPaintPlay();
  bandTick();
}
// Des données arrivent après coup (morceaux, photos) : on repeint les modules, sans toucher à la fiche.
function bandRefresh(patch) {
  const el = $('#bandpage');
  if (!el || el.hidden || !BP.b) return;
  Object.assign(BP.o, patch);
  BP.o.photos = (BP.o.photos || []).filter(isCover);
  BP.o.tracks = BP.o.tracks || [];
  const st = bandState();
  const rest = el.querySelector('.bp-rest');
  if (rest) rest.innerHTML = bandRestHtml(BP.b, st);
  bandPaintPlay();
  bandTick(); // la forme d'onde du morceau en cours garde sa progression
}
// Les photos du groupe, gardées en mémoire le temps de la session.
const PHOTOS = new Map();
async function photosOf(g) {
  if (!PHOTOS.has(g.id)) { try { PHOTOS.set(g.id, await S.store.listPhotos(g.id)); } catch (e) { console.error(e); return []; } }
  return PHOTOS.get(g.id);
}
async function photoFrom(file) {
  const img = await new Promise((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('Image illisible'));
    el.src = URL.createObjectURL(file);
  });
  let out = '';
  for (const [max, q] of [[1400, 0.8], [1200, 0.7], [1000, 0.6], [800, 0.5]]) {
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    out = c.toDataURL('image/jpeg', q);
    if (out.length <= 560000) break;
  }
  URL.revokeObjectURL(img.src);
  if (out.length > 560000) throw new Error('Image trop lourde');
  return out;
}
/* ----- Le book : ce que le public voit, et dans quel style ----- */
async function editBook(g) {
  const page = pageOf(g);
  let tpl = MODELES ? tplOf(page)[0] : String(page.template || 'studio'); // rangés : le choix d'avant est gardé tel quel
  let accent = /^#[0-9a-f]{6}$/i.test(page.accent || '') ? page.accent : '';
  const photos = await photosOf(g);
  const tracks = (Array.isArray(page.tracks) ? page.tracks : []).filter(x => x && takeById(x.take)).map(x => ({ take: x.take, title: String(x.title || '') })).slice(0, 5);
  // Les morceaux du groupe qui ont une prise déjà envoyée : la plus longue des versions en cours représente le morceau.
  const songs = S.ideas.filter(i => i.group_id === g.id)
    .map(i => [i, takesOf(i.id).filter(t => !baseOf(t) && !superseded(t)).reduce((best, t) => (!best || lenOf(t) > lenOf(best) ? t : best), null)])
    .filter(([, t]) => t && t.path && !waiting(t.id))
    .sort((x, y) => ideaTitle(x[0]).localeCompare(ideaTitle(y[0]), 'fr'));
  const dateRow = x => `<div class="dt-row">
      <input class="field" type="date" data-dt="d" value="${esc(x.d || '')}">
      <input class="field" type="time" data-dt="h" value="${esc(x.h || '')}" aria-label="Heure (facultative)" title="Heure (facultative)">
      <input class="field" data-dt="where" maxlength="90" autocomplete="off" placeholder="Salle, ville" value="${esc(x.where || '')}">
      <input class="field" data-dt="url" maxlength="300" autocomplete="off" placeholder="Lien billetterie (facultatif)" value="${esc(x.url || '')}">
      <button type="button" class="txt-btn danger" data-dt-del>retirer</button>
      <details class="dt-more" ${x.addr || x.link || x.info ? 'open' : ''}><summary>adresse, lien de l'évènement, infos</summary>
        <input class="field" data-dt="addr" maxlength="140" autocomplete="off" placeholder="Adresse, pour l'itinéraire" value="${esc(x.addr || '')}">
        <input class="field" data-dt="link" maxlength="300" autocomplete="off" placeholder="Lien de l'évènement : Instagram, Facebook…" value="${esc(x.link || '')}">
        <input class="field" data-dt="info" maxlength="200" autocomplete="off" placeholder="Infos : prix, ouverture des portes, première partie…" value="${esc(x.info || '')}">
      </details>
    </div>`;
  const v = await openSheet(`<h2>Le book de « ${esc(g.name)} »</h2>
    <p class="sub">Ce que le public voit sur la page du groupe. Le nom, l'image, la description, le line-up et les liens viennent de la fiche.</p>

    <h3 class="part">1 · ${MODELES ? 'Le style' : "L'accroche"}</h3>
    ${MODELES ? `<label class="label">Modèle</label>
    <div class="tpls" id="kTpl">${TEMPLATES.map(t => `<button type="button" class="tpl" data-tpl="${t[0]}" style="--b:${t[2]};--t:${t[3]};--a:${t[4]}"><i></i><b>${t[1]}</b></button>`).join('')}</div>
    <label class="label">Couleur</label>
    <div class="swatches" id="kAccent"><button type="button" class="swatch auto" data-accent="" aria-label="Couleur du modèle" title="Couleur du modèle"></button>${PALETTE.map(c => `<button type="button" class="swatch" style="--c:${c}" data-accent="${c}" aria-label="Couleur ${c}"></button>`).join('')}</div>` : ''}
    <label class="label" for="kTagline">Phrase d'accroche</label>
    <input class="field" id="kTagline" maxlength="120" autocomplete="off" placeholder="Ex : du rock à guitares, fort et mélodique" value="${esc(page.tagline || '')}">

    <h3 class="part">2 · L'histoire</h3>
    <label class="label" for="kBio">Biographie</label>
    <textarea class="field band-field" id="kBio" maxlength="6000" placeholder="L'histoire du groupe : la rencontre, les influences, les sorties, les concerts marquants. Saute une ligne entre deux paragraphes.">${esc(page.bio || '')}</textarea>
    <p class="hint">La description courte de la fiche reste en introduction, juste au-dessus.</p>

    <h3 class="part">3 · Les photos</h3>
    <p class="hint">Jusqu'à 8 photos, réduites automatiquement. La première s'affiche en grand. Elles sont enregistrées dès que tu les ajoutes.</p>
    <div class="ph-grid" id="kPhotos"></div>
    <button type="button" class="add-take" data-ph-add>+ ajouter des photos</button>
    <input type="file" id="kFile" accept="image/*" multiple hidden>

    <h3 class="part">4 · Les morceaux</h3>
    <p class="hint">Jusqu'à 5 morceaux que tout le monde pourra écouter sur la page, sans compte. Le premier est proposé dès l'ouverture.</p>
    <p class="hint"><b>À savoir :</b> on entend la partie gardée par la coupe, mais c'est le fichier entier de la prise qui devient accessible tant qu'elle est dans cette liste. Choisis des prises que le groupe assume.</p>
    <div id="kTracks"></div>
    <div class="trk-add"><select class="field" id="kSong" aria-label="Morceau à ajouter"></select><button type="button" class="txt-btn accent" data-trk-add>ajouter</button></div>
    <p class="hint" id="kNoSong" hidden>Aucun morceau du groupe n'a encore de prise envoyée.</p>

    <h3 class="part">5 · Vidéo et concerts</h3>
    <label class="label" for="kVideo">Vidéo</label>
    <input class="field" id="kVideo" maxlength="300" autocomplete="off" placeholder="Lien YouTube" value="${esc(page.video || '')}">
    <label class="label">Dates de concert</label>
    <p class="hint">Le jour, l'heure si tu veux, la salle et la ville. Chaque date a sa page à partager, avec un QR code vers la billetterie (ou le lien de l'évènement) et son affiche, faite avec ta première photo, à partager ou à imprimer. Le soir venu, la page annonce « Ce soir » toute seule.</p>
    <div id="kDates">${datesOf(page).map(dateRow).join('')}</div>
    <button type="button" class="add-take" data-dt-add>+ ajouter une date</button>

    <h3 class="part">6 · Sur la page</h3>
    <label class="check"><input type="checkbox" id="kLineup" ${page.lineup === false ? '' : 'checked'}><span>Afficher le line-up</span></label>
    <label class="label" for="kBooking">E-mail de contact public</label>
    <input class="field" id="kBooking" type="email" maxlength="120" autocomplete="off" placeholder="Facultatif : booking@exemple.fr" value="${esc(page.booking || '')}">
    <p class="hint">Visible par tous sur la page. Laisse vide pour ne pas afficher de contact.</p>
    <p class="band-acts"><button type="button" class="txt-btn accent" data-preview>${MODELES ? "voir l'aperçu et essayer les modèles" : "voir l'aperçu"}</button></p>
    <div class="row"><button class="btn" data-x>Annuler</button><button class="btn primary" data-ok>Enregistrer</button></div>`,
  (sh, close) => {
    const paintTpl = () => sh.querySelectorAll('.tpl').forEach(b => b.classList.toggle('on', b.dataset.tpl === tpl));
    const paintAccent = () => sh.querySelectorAll('#kAccent .swatch').forEach(b => b.classList.toggle('on', b.dataset.accent === accent));
    if (MODELES) {
      sh.querySelector('#kTpl').onclick = e => { const b = e.target.closest('.tpl'); if (b) { tpl = b.dataset.tpl; paintTpl(); } };
      sh.querySelector('#kAccent').onclick = e => { const b = e.target.closest('.swatch'); if (b) { accent = b.dataset.accent; paintAccent(); } };
      paintTpl(); paintAccent();
    }
    const grid = sh.querySelector('#kPhotos');
    const paintPhotos = () => {
      grid.innerHTML = photos.map(ph => `<figure><img src="${isCover(ph.data) ? ph.data : ''}" alt=""><button type="button" class="txt-btn danger" data-ph-del="${ph.id}">retirer</button></figure>`).join('');
      sh.querySelector('[data-ph-add]').hidden = photos.length >= 8;
    };
    paintPhotos();
    const trkBox = sh.querySelector('#kTracks'), trkSel = sh.querySelector('#kSong');
    const keepTitles = () => trkBox.querySelectorAll('.trk-row').forEach(r => { tracks[+r.dataset.n].title = r.querySelector('[data-trk-title]').value.trim(); });
    const paintTracks = () => {
      trkBox.innerHTML = tracks.map((x, n) => { const t = takeById(x.take); return `<div class="trk-row" data-n="${n}">
          <input class="field" data-trk-title maxlength="80" autocomplete="off" value="${esc(x.title)}" aria-label="Titre affiché">
          <span class="trk-len">${t ? fmtDur(lenOf(t)) : ''}</span>
          ${n ? '<button type="button" class="txt-btn" data-trk-up>monter</button>' : '<span class="trk-len">ouverture</span>'}
          <button type="button" class="txt-btn danger" data-trk-del>retirer</button></div>`; }).join('');
      const left = songs.filter(([, t]) => !tracks.some(x => x.take === t.id));
      trkSel.innerHTML = left.map(([i, t]) => `<option value="${t.id}">${esc(ideaTitle(i))} · ${fmtDur(lenOf(t))}</option>`).join('');
      sh.querySelector('.trk-add').hidden = tracks.length >= 5 || !left.length;
      sh.querySelector('#kNoSong').hidden = songs.length > 0;
    };
    sh.querySelector('[data-trk-add]').onclick = () => {
      keepTitles();
      const t = takeById(trkSel.value), i = t && ideaById(t.idea_id);
      if (!t || !i || tracks.length >= 5) return;
      tracks.push({ take: t.id, title: ideaTitle(i) });
      paintTracks();
    };
    trkBox.onclick = e => {
      const r = e.target.closest('.trk-row');
      if (!r || !e.target.closest('[data-trk-del], [data-trk-up]')) return;
      keepTitles();
      const n = +r.dataset.n;
      if (e.target.closest('[data-trk-del]')) tracks.splice(n, 1); else tracks.splice(n - 1, 0, tracks.splice(n, 1)[0]);
      paintTracks();
    };
    paintTracks();
    const file = sh.querySelector('#kFile');
    sh.querySelector('[data-ph-add]').onclick = () => file.click();
    file.onchange = async () => {
      const files = [...file.files].slice(0, 8 - photos.length);
      file.value = '';
      for (const f of files) {
        try {
          const row = await S.store.addPhoto(g.id, await photoFrom(f), photos.reduce((m, x) => Math.max(m, x.position || 0), 0) + 1);
          photos.push(row);
          paintPhotos();
        } catch (e) { fail(e, isNetErr(e) ? 'Il faut du réseau pour ajouter une photo' : 'Photo refusée'); break; }
      }
    };
    grid.onclick = async e => {
      const b = e.target.closest('[data-ph-del]');
      if (!b) return;
      b.disabled = true;
      try { await S.store.deletePhoto(b.dataset.phDel); photos.splice(photos.findIndex(x => x.id === b.dataset.phDel), 1); paintPhotos(); }
      catch (err) { b.disabled = false; fail(err, 'Retrait impossible'); }
    };
    const dates = sh.querySelector('#kDates');
    sh.querySelector('[data-dt-add]').onclick = () => { dates.insertAdjacentHTML('beforeend', dateRow({})); dates.lastElementChild.querySelector('input').focus(); };
    dates.onclick = e => { if (e.target.closest('[data-dt-del]')) e.target.closest('.dt-row').remove(); };
    const val = id => (sh.querySelector('#' + id).value || '').replace(/\r\n?/g, '\n').trim();
    const read = () => {
      const out = {};
      if (tpl !== 'studio') out.template = tpl;
      if (accent) out.accent = accent;
      for (const [k, id] of [['tagline', 'kTagline'], ['bio', 'kBio'], ['video', 'kVideo'], ['booking', 'kBooking']]) if (val(id)) out[k] = val(id);
      if (!sh.querySelector('#kLineup').checked) out.lineup = false;
      const list = [...dates.querySelectorAll('.dt-row')].map(r => Object.fromEntries([...r.querySelectorAll('[data-dt]')].map(i => [i.dataset.dt, i.value.trim()]))).filter(x => x.d && x.where);
      if (list.length) out.dates = list.slice(0, 40).map(x => { const d = { d: x.d, where: x.where }; if (/^\d{2}:\d{2}$/.test(x.h || '')) d.h = x.h; for (const k of ['url', 'addr', 'link', 'info']) if (x[k]) d[k] = x[k]; return d; });
      keepTitles();
      if (tracks.length) out.tracks = tracks.map(x => ({ take: x.take, title: x.title }));
      return out;
    };
    // L'aperçu sert aussi d'essayage quand les modèles sont là : le modèle et la couleur choisis dedans reviennent ici.
    sh.querySelector('[data-preview]').onclick = () => { const now = read(); showBandPage({ ...publicView(g), page: now }, { preview: true, photos: photos.map(x => x.data), tracks: tracksView(g, now.tracks), sign: signMine,
      link: g.public_slug ? pageLink(g.public_slug) : '', ...(MODELES ? { onPick: (t, a) => { tpl = t; accent = a; paintTpl(); paintAccent(); } } : {}) }); };
    sh.querySelector('[data-x]').onclick = () => close(null);
    sh.querySelector('[data-ok]').onclick = async e => {
      const btn = e.currentTarget, now = read();
      const profile = { ...profOf(g) };
      if (Object.keys(now).length) profile.page = now; else delete profile.page;
      if (JSON.stringify(profile).length > 18500) { toast('Le book est trop long pour être enregistré : raccourcis la biographie ou les infos des dates'); return; }
      btn.disabled = true; btn.textContent = 'Enregistrement…';
      try { await S.store.saveGroupProfile(g.id, g.memo, g.cover, profile); g.profile = profile; close(true); }
      catch (err) { btn.disabled = false; btn.textContent = 'Enregistrer'; fail(err, isNetErr(err) ? 'Il faut du réseau pour enregistrer le book' : 'Enregistrement impossible'); }
    };
  });
  if (!v) return;
  render();
  toast(g.public_slug ? 'Book enregistré, la page est à jour' : 'Book enregistré');
}
// Un visiteur arrive par l'adresse du groupe : il ne voit que la page, pas l'appli.
// Le premier écran arrive entier : la fiche, les morceaux et le prochain concert ensemble. Les photos suivent, plus bas.
async function openPublicPage(raw) {
  const slug = slugify(raw);
  const el = bandShell();
  if (!el.innerHTML) el.innerHTML = `<div class="bp-page">${bandTopHtml(false)}</div>`;
  el.hidden = false;
  document.body.classList.add('paging');
  const sleep = (ms, v = null) => new Promise(r => setTimeout(() => r(v), ms));
  const key = 'rec.page.' + slug, link = pageLink(slug);
  const dk = new URLSearchParams(location.search).get('date') || null; // arrivé par la page d'une date (lien partagé, QR code)
  let cloud = null;
  const sign = t => cloud.trackUrl(t.path);
  // Déjà venu : on repeint tout de suite ce que l'appareil a gardé, même sans réseau.
  let kept = null;
  try { kept = JSON.parse(localStorage.getItem(key)); } catch {}
  if (!kept || !kept.b || !kept.b.name) kept = null;
  if (kept) { document.title = kept.b.name; showBandPage(kept.b, { tracks: Array.isArray(kept.tracks) ? kept.tracks : [], hero: kept.hero || '', link, sign, date: dk }); }
  let b = null, heroP = null, tracksP = null, down = false;
  try {
    cloud = new CloudStore(loadConfig());
    await cloud.init();
    if (slug) {
      heroP = cloud.publicHero(slug).then(x => (isCover(x) ? x : '')).catch(() => null); // '' : pas de photo ; null : pas de réponse
      BP.heroP = heroP; // l'affiche l'attend si on la demande avant qu'elle arrive
      tracksP = cloud.publicTracks(slug).then(x => (Array.isArray(x) ? x : [])).catch(() => []);
      b = await cloud.publicBand(slug);
    }
  } catch (e) { console.error(e); down = true; if (kept) return; }
  if (!b || !b.name) { if (!down) { try { localStorage.removeItem(key); } catch {} } showBandPage(null, { offline: down }); return; }
  if (!kept) document.title = b.name; // sinon le titre posé par le rendu (le groupe, ou la date) reste juste
  const [tracks, hero] = await Promise.all([
    Promise.race([tracksP, sleep(700)]),
    Promise.race([heroP, sleep(80)]), // la photo n'est plus au premier écran : elle rejoint les photos quand elle arrive
    Promise.race([tplReady(tplOf(b.page)), sleep(1500)]),
  ]);
  const fresh = !kept || JSON.stringify(kept.b) !== JSON.stringify(b);
  const known = h => (h != null ? { hero: h } : {});
  if (fresh) showBandPage(b, { tracks: tracks || (kept && BP.o.tracks) || [], hero: (kept && kept.hero) || '', ...known(hero), link, sign, again: !!kept, date: kept ? BP.o.date : dk }); // la date où le visiteur est déjà allé
  else if (tracks || hero != null) bandRefresh({ ...(tracks ? { tracks } : {}), ...known(hero) });
  // La suite arrive dans les modules, sans toucher à la fiche.
  const all = tracks || await tracksP;
  if (!tracks) bandRefresh({ tracks: all });
  const pic = hero != null ? hero : await heroP;
  if (hero == null && pic != null) bandRefresh(known(pic));
  const keep = h => { try { localStorage.setItem(key, JSON.stringify({ b, tracks: all.map(t => ({ ...t, url: undefined, retried: undefined })), hero: h })); return true; } catch { return false; } };
  if (!keep(pic && pic.length < 300000 ? pic : '')) keep('');
  if (all.length) cloud.trackUrls(all.map(t => t.path)).then(urls => all.forEach(t => { if (urls[t.path]) t.url = urls[t.path]; })).catch(e => console.error(e));
  try {
    const photos = await cloud.publicPhotos(slug);
    if (Array.isArray(photos) && photos.length) bandRefresh({ photos });
  } catch (e) { console.error(e); }
}
// Depuis la fiche du groupe : l'adresse à partager, son QR code, et l'aperçu.
async function sharePage(g) {
  const link = pageLink(g.public_slug);
  const v = await openSheet(`<h2>Page publique</h2><p class="sub">Visible par tous, sans compte. À mettre sur une affiche, un flyer, ou en bio.</p>
    <div class="qr-big">${QR.svg(link)}</div><p class="qr-link">${esc(link.replace(/^https?:\/\//, ''))}</p>
    <div class="row"><button class="btn" data-see>Voir la page</button><button class="btn primary" data-copy>Copier le lien</button></div>`,
  (sh, close) => { sh.querySelector('[data-see]').onclick = () => close('see'); sh.querySelector('[data-copy]').onclick = () => close('copy'); });
  if (v === 'see') showBandPage(publicView(g), { preview: true, photos: (await photosOf(g)).map(x => x.data), tracks: tracksView(g, pageOf(g).tracks), sign: signMine, link });
  if (v === 'copy') { try { await navigator.clipboard.writeText(link); toast('Lien copié'); } catch { await promptText('Copie ce lien', link); } }
}
// Le lien du groupe : sa page publique si elle est ouverte, sinon le premier de la case « Liens ». C'est lui que le QR code ouvre.
const bandLink = g => {
  if (g.public_slug) return pageLink(g.public_slug);
  for (const w of String(profOf(g).links || '').split(/\s+/)) {
    if (/^https?:\/\/\S+\.\S+/i.test(w)) return w;
    if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(w) && !w.includes('@')) return 'https://' + w;
  }
  return '';
};
const linkLabel = u => u.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '');
function showQr(g) {
  const link = bandLink(g);
  return openSheet(`<h2>${esc(g.name)}</h2><p class="sub">À scanner avec l'appareil photo d'un téléphone.</p>
    <div class="qr-big">${QR.svg(link)}</div><p class="qr-link">${esc(linkLabel(link))}</p>
    <div class="row"><button class="btn primary" data-x>Fermer</button></div>`,
  (sh, close) => { sh.querySelector('[data-x]').onclick = () => close(null); });
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
  const link = bandLink(g);
  const qr = link ? QR.svg(link) : '';
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
      ${contact || p.links ? `<footer class="rider-contact ${qr ? 'has-qr' : ''}"><div><h2>Contact</h2>
        ${p.contact ? `<p class="who">${esc(p.contact)}</p>` : ''}
        ${p.phone || p.mail ? `<p class="rider-text">${esc([p.phone, p.mail].filter(Boolean).join(' · '))}</p>` : ''}
        ${p.links ? `<p class="rider-text links">${esc(p.links)}</p>` : ''}</div>
        ${qr ? `<button class="rider-qr" data-qr title="Afficher en grand">${qr}<span>${esc(linkLabel(link))}</span></button>` : ''}</footer>` : ''}
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
    if (b.hasAttribute('data-qr')) showQr(g);
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
  renderTabs();
  renderFilters();
  renderHero();
  const board = $('#board');
  const f = S.filter;
  let html = '';
  let inbox = inboxTakes();
  if (f.q) inbox = inbox.filter(t => norm(t.title || fmtDayTime(t.created_at)).includes(norm(f.q)));
  const tab = tabNow();
  const searching = !!f.q;
  if (inbox.length && !f.star && !f.tags.size && (tab === 'idea' || searching)) html += blockHtml(null, inbox);
  if (SETLISTS && isCloud() && !f.q && !f.star && !f.tags.size) html += setlistsHtml();
  const byAlbum = tab === 'albums' && !searching;
  board.classList.toggle('albums-view', byAlbum);
  const blank = !visibleIdeas().length && !inboxTakes().length && tab === 'idea';
  const racked = !byAlbum && !searching && !f.star && !f.tags.size && (tab === 'idea' || tab === 'compo') && foldersIn(tab).length > 0;
  if (!racked || !foldersIn(tab).includes(FOLDER)) FOLDER = '';
  board.classList.toggle('racked', racked);
  const body = byAlbum ? albumsHtml()
    : recentIdeas().filter(i => searching || inTab(i, tab)).filter(i => !racked || folderOf(i) === FOLDER).filter(matchesIdea).map(i => blockHtml(i, takesOf(i.id))).join('');
  if (racked) html += rackHtml(tab, body);
  else html += body || (blank || html ? '' : `<p class="tab-empty">${searching || f.star || f.tags.size ? 'Rien ne correspond.' : TAB_EMPTY[tab]}</p>`);
  board.innerHTML = html;
  $('#empty').hidden = !blank;
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
  document.querySelectorAll('.take[data-id]').forEach(row => {
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
  document.querySelectorAll('.take[data-id]').forEach(row => { // les lignes de la page d'un groupe (sans data-id) se peignent seules
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
  $('#deckTime').textContent = deckClock(Math.max(0, audio.currentTime - a));
  const pk = Array.isArray(take.peaks) ? take.peaks : [];
  setMeter($('#deckMeter'), pk.length ? (pk[Math.min(pk.length - 1, Math.floor(audio.currentTime / total * pk.length))] || 0) / 100 : 0);
});
const deckIdle = () => { if (audio.paused) { setMeter($('#deckMeter'), 0); if (!S.playing) $('#deckTime').textContent = '0:00'; } };
audio.addEventListener('pause', deckIdle);
audio.addEventListener('ended', () => setTimeout(deckIdle, 0));
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
document.addEventListener('keydown', e => { if (e.key === 'Escape' && sheetClose && !document.body.classList.contains('paging')) sheetClose(undefined); }); // la page d'un groupe gère sa propre touche Échap

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

// Icônes des menus d'actions, par action.
const ACT = {
  rename: '<path d="M4 20l1-4L16.5 4.5a1.4 1.4 0 012 0l1 1a1.4 1.4 0 010 2L8 19z"/>',
  edit: '<path d="M4 20l1-4L16.5 4.5a1.4 1.4 0 012 0l1 1a1.4 1.4 0 010 2L8 19z"/>',
  instrument: '<path d="M9 18V5.5l10-2V16"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>',
  note: '<path d="M5 6h14M5 11h14M5 16h9"/>',
  notes: '<path d="M5 6h14M5 11h14M5 16h9"/>',
  over: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.5" fill="currentColor"/>',
  version: '<path d="M8 4.5h10.5a1 1 0 011 1V16"/><rect x="4.5" y="8" width="11.5" height="11.5" rx="1"/><path d="M10.25 11v5.5M7.5 13.75H13"/>',
  nudge: '<path d="M4 12h16M8 8l-4 4 4 4M16 8l4 4-4 4"/>',
  cut: '<circle cx="6" cy="7" r="2.5"/><circle cx="6" cy="17" r="2.5"/><path d="M8 8.5L20 17M8 15.5L20 7"/>',
  move: '<path d="M5 5v8a3 3 0 003 3h11M15 12l4 4-4 4"/>',
  download: '<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>',
  export: '<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>',
  import: '<path d="M12 16V5M7 9l5-5 5 5M5 20h14"/>',
  delete: '<path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/>',
  tags: '<path d="M9 4L7 20M17 4l-2 16M4.5 9h16M3.5 15h16"/>',
  folder: '<path d="M4 5h16M4 9.5h16M4 14h16M4 18.5h16"/><path d="M7 3v17.5"/>',
  tempo: '<path d="M9 3h6l4 18H5zM12 15l5-9"/>',
  star: '<path d="M12 4l2.5 5.2 5.5.8-4 4 1 5.6-5-2.8-5 2.8 1-5.6-4-4 5.5-.8z"/>',
  share: '<circle cx="12" cy="8" r="3"/><path d="M6.5 20v-1.5a5.5 5.5 0 0111 0V20"/><circle cx="4.8" cy="10.5" r="2"/><circle cx="19.2" cy="10.5" r="2"/>',
  unshare: '<circle cx="12" cy="8" r="3"/><path d="M6.5 20v-1.5a5.5 5.5 0 0111 0V20"/>',
  album: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="2.5"/>',
  merge: '<path d="M5 5c5 0 7 3 7 7v8M19 5c-5 0-7 3-7 7M9 17l3 3 3-3"/>',
  fill: '<path d="M12 5v14M5 12h14"/>',
  stage: '<path d="M5 20V8M12 20V4M19 20v-9"/><path d="M3 20h18"/>',
  out: '<path d="M14 5h5v5M19 5l-8 8"/><path d="M10 6H6a1 1 0 00-1 1v11a1 1 0 001 1h11a1 1 0 001-1v-4"/>',
  up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
};
// Un titre donné sous la forme { title, kind } affiche les actions en pads, comme sur une boîte à rythmes.
function actionSheet(title, items) {
  if (title && typeof title === 'object') {
    return openSheet(`<div class="amp"><div class="amp-head"><div class="amp-name"><p class="pads-kind"><i class="amp-led"></i>${esc(title.kind || '')}</p><h2>${esc(title.title)}</h2></div><div class="amp-knobs">${'star' in title ? `<button class="amp-star ${title.star ? 'on' : ''}" data-star aria-label="${title.star ? 'Retirer des favoris' : 'Ajouter aux favoris'}" title="${title.star ? 'Retirer des favoris' : 'Ajouter aux favoris'}">${ico(ACT.star)}</button>` : ''}<i aria-hidden="true"></i><i aria-hidden="true"></i><i aria-hidden="true"></i></div></div><div class="amp-grille"><div class="pads">${items.map((it, i) =>
      `<button class="pad ${it.cls || ''}" data-i="${i}">${ico(ACT[it.value] || '<circle cx="12" cy="12" r="2"/>')}<b>${esc(it.label)}</b>${it.sub ? `<small>${esc(it.sub)}</small>` : ''}</button>`).join('')}</div><p class="amp-badge" aria-hidden="true">Rec.</p></div></div>`,
    (sh, close) => {
      sh.querySelectorAll('[data-i]').forEach(b => { b.onclick = () => close(items[+b.dataset.i].value); });
      const star = sh.querySelector('[data-star]');
      if (star) star.onclick = () => {
        if (!title.onStar) return close('star');
        const on = !!title.onStar();
        star.classList.toggle('on', on);
        star.setAttribute('aria-label', on ? 'Retirer des favoris' : 'Ajouter aux favoris');
        star.title = star.getAttribute('aria-label');
      };
    });
  }
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
  if (!fields.folder) FOLDER = '';
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
  const idea = newIdea({ title: name, ...(!albumId && tabNow() === 'compo' && stageReady() ? { stage: 'compo' } : {}), ...(!albumId && FOLDER && folderOn() ? { folder: FOLDER } : {}) });
  if (albumId && albumById(albumId)) { idea.album_id = albumId; idea.track = nextTrack(albumId); S.openIdea = idea.id; }
  try { await saveIdea(idea); }
  catch (e) { S.ideas = S.ideas.filter(x => x !== idea); render(); return fail(e, 'Création impossible'); }
  render();
  editText(idea);
}
async function createRehearsal() {
  if (!stageReady()) return;
  const idea = newIdea({ title: `Répète du ${fmtDay(nowIso())}`, stage: 'rehearsal' });
  try { await saveIdea(idea); }
  catch (e) { S.ideas = S.ideas.filter(x => x !== idea); render(); return fail(e, 'Création impossible'); }
  render();
  pickImport(idea.id);
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
  const v = await actionSheet({ title: album.name, kind: album.kind || 'Album' }, [
    { label: 'Ajouter', value: 'fill', sub: 'Des morceaux' },
    { label: 'Modifier', value: 'edit', sub: 'Nom, type et image' },
    at > 0 && { label: 'Monter', value: 'up' },
    at < list.length - 1 && { label: 'Descendre', value: 'down' },
    (isMine(album) || isAdmin(album.group_id)) && { label: 'Supprimer', value: 'delete', cls: 'danger', sub: 'Ses morceaux sont gardés' },
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
  if (target.folder) return folderOf(idea) === target.folder ? undefined : setFolder(idea, target.folder);
  if (target.stage) { // posé sur un onglet
    if (target.stage === 'albums') return isCloud() ? fileIdea(idea) : undefined;
    const inAlbum = !!albumOf(idea);
    if (!STAGES[target.stage] || (!inAlbum && stageOf(idea) === target.stage) || !stageReady()) return;
    if (inAlbum) { idea.album_id = null; idea.track = 0; }
    idea.stage = target.stage;
    render();
    try { await S.store.saveIdea(idea); toast(`« ${ideaTitle(idea)} » est dans ${STAGES[target.stage][1]}`); }
    catch (e) { fail(e, 'Déplacement impossible'); await reload(); }
    return;
  }
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
  if (!albumId && STAGES[target.stage] && stageReady()) idea.stage = target.stage;
  render();
  try {
    await S.store.saveIdea(idea);
    toast(from === albumId ? 'Ordre modifié' : albumId ? `Rangé dans « ${albumById(albumId).name} »` : `Sorti de l'album, dans ${STAGES[stageOf(idea)][1]}`);
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
let versionDest = null; // prise sur laquelle on pose le prochain fichier choisi
function pickImport(ideaId = null) { importDest = ideaId; versionDest = null; $('#importInput').click(); }
function pickVersion(take) {
  if (!take) return;
  // La colonne arrive avec supabase-versions.sql : tant qu'elle manque, on n'envoie rien.
  if (isCloud() && !S.takes.some(t => 'version_of' in t)) { toast('Les versions ne sont pas encore activées sur le serveur'); return; }
  versionDest = take.id; $('#importInput').click(); }
async function addVersion(file, prev) {
  if (!isAudioFile(file)) { toast('Aucun fichier audio'); return; }
  const idea = ideaById(prev.idea_id);
  if (!idea) return;
  const picked = await openSheet(`<h2>Qu'est-ce que tu as ajouté ?</h2>
    <p class="sub">${esc(file.name)} · par-dessus « ${esc(prev.title || ideaTitle(idea))} »</p>
    <div class="inst-picker">${INSTRUMENTS.map(i => `<button class="inst-btn" data-inst="${i.id}">${i.icon}<span>${i.label}</span></button>`).join('')}</div>`,
  (sh, close) => sh.querySelectorAll('[data-inst]').forEach(b => { b.onclick = () => close(b.dataset.inst); }));
  if (!picked) { toast('Rien envoyé'); return; }
  setStatus(`Envoi : ${file.name}`);
  try {
    const info = await computePeaks(file);
    const take = {
      id: uid(), idea_id: idea.id, title: '', notes: '', instrument: picked, version_of: prev.id,
      duration: info ? info.duration : await probeDuration(file), peaks: info ? info.peaks : [],
      mime: file.type || 'audio/mp4', path: '', position: prev.position, created_at: nowIso(),
    };
    if (isCloud()) take.author = idea.group_id ? (myMember(idea.group_id)?.name || '') : '';
    await S.store.saveTake(take, file);
    S.takes.push(take);
    await touchIdea(idea);
    render();
    toast(`Version ${pathOf(take).length} envoyée`);
  } catch (e) { fail(e, 'Envoi impossible'); }
  setStatus('');
}
async function downloadTake(take) {
  const blob = await S.store.getBlob(take);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  const idea = ideaById(take.idea_id);
  const name = take.title || (pathOf(take).length > 1 || superseded(take) ? `v${pathOf(take).length}` : fmtDayTime(take.created_at));
  a.download = `${(idea ? ideaTitle(idea) + ' - ' : '') + name}.${window.FredonStore.extFor(take.mime)}`.replace(/[\\/:*?"<>|]/g, '-');
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
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

/* ---------------- Entrée audio ---------------- */
// Ce qu'enregistre « Enregistrer » : le micro par défaut, ou une carte son (une guitare branchée dans une Scarlett…).
// fredon.entree = { id, nom, son: 'voix' | 'instrument', canal: '1' | '2' | '12' }. Sans réglage : le micro par défaut, en voix.
// Choisir une carte passe en « instrument » : le son brut, sans le traitement prévu pour la voix, qui abîme une guitare.
const INPUT = { voies: new Map() }; // nombre de canaux vu pour chaque entrée, en instrument
const loadInput = () => { try { return JSON.parse(localStorage.getItem('fredon.entree')) || {}; } catch { return {}; } };
const saveInput = v => { try { localStorage.setItem('fredon.entree', JSON.stringify(v)); } catch {} };
const inputName = label => (label || '').replace(/^(par défaut|défaut|default|communications)\s*-\s*/i, '').replace(/\s*\([0-9a-f]{4}:[0-9a-f]{4}\)$/i, '').trim();
const ALIAS = id => id === 'default' || id === 'communications'; // les noms que donne le système à « son » micro, pas des appareils
const inputRaw = cfg => (cfg.id ? cfg.son !== 'voix' : cfg.son === 'instrument');
const describeInput = cfg => `${cfg.id ? cfg.nom || 'Entrée choisie' : 'Par défaut'}${inputRaw(cfg) ? ' · instrument' : ''}`;
async function audioInputs() {
  try { return (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'audioinput'); } catch { return []; }
}
function audioConstraints(id, raw) {
  // Voix : pas de réduction de bruit ni d'annulation d'écho, on garde le son tel quel, avec un volume réglé tout seul.
  // Instrument : aucun traitement, et les deux entrées de la carte si elle en a deux.
  const a = { echoCancellation: false, noiseSuppression: false, autoGainControl: !raw };
  if (raw) a.channelCount = { ideal: 2 };
  if (id) a.deviceId = { exact: id };
  return a;
}
// Ouvre l'entrée choisie ; si elle a disparu (carte débranchée, prise par une autre appli), le micro par défaut.
async function openInput() {
  const cfg = loadInput();
  let id = cfg.id || '';
  if (id) {
    const devs = await audioInputs();
    if (devs.some(d => d.label) && !devs.some(d => d.deviceId === id)) {
      // L'identifiant change parfois (autre port USB) : on retrouve la carte par son nom.
      const same = cfg.nom && devs.find(d => !ALIAS(d.deviceId) && inputName(d.label) === cfg.nom);
      id = same ? same.deviceId : '';
      if (same) saveInput({ ...cfg, id });
    }
  }
  const open = async (dev, raw) => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints(dev, raw) });
    const track = stream.getAudioTracks()[0];
    const voies = track?.getSettings?.().channelCount;
    if (raw && voies) INPUT.voies.set(dev || 'default', voies);
    return { stream, input: { id: dev, raw, canal: cfg.canal || '12', voies, label: inputName(track?.label) } };
  };
  if (id) {
    try { return await open(id, inputRaw(cfg)); }
    catch (e) { if (e.name === 'NotAllowedError' || e.name === 'SecurityError') throw e; }
  }
  const res = await open('', cfg.id ? false : inputRaw(cfg));
  if (cfg.id) {
    // Les noms des entrées étaient peut-être cachés (micro pas encore autorisé) : maintenant qu'ils sont là, on cherche la carte par son nom.
    const devs = await audioInputs(), same = cfg.nom && devs.find(d => !ALIAS(d.deviceId) && d.deviceId !== id && inputName(d.label) === cfg.nom);
    if (same) {
      try {
        const card = await open(same.deviceId, inputRaw(cfg));
        res.stream.getTracks().forEach(t => t.stop());
        saveInput({ ...cfg, id: same.deviceId });
        return card;
      } catch {}
    }
    toast(`« ${cfg.nom || 'Entrée choisie'} » indisponible : micro par défaut`);
  }
  return res;
}
// Une carte à deux entrées donne un son stéréo : la guitare d'un côté (entrée 1 à gauche), rien de l'autre.
// On enregistre l'entrée choisie, ou les deux mélangées, au centre.
async function routeChannels(stream, canal) {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC || !window.MediaStreamAudioDestinationNode) return null;
  let ctx;
  try {
    ctx = new AC();
    if (ctx.state !== 'running') await Promise.race([ctx.resume(), new Promise(r => setTimeout(r, 500))]);
    if (ctx.state !== 'running') { ctx.close(); return null; } // moteur audio à l'arrêt : la prise serait muette
    const src = ctx.createMediaStreamSource(stream);
    const split = ctx.createChannelSplitter(2);
    const mono = ctx.createGain();
    mono.channelCount = 1;
    mono.channelCountMode = 'explicit';
    src.connect(split);
    if (canal !== '2') split.connect(mono, 0);
    if (canal !== '1') split.connect(mono, 1);
    // Les deux entrées additionnées : une guitare seule sur l'entrée 1 garde tout son niveau ; si les deux portent du son, un limiteur évite la saturation.
    let out = mono;
    if (canal !== '1' && canal !== '2') {
      const lim = ctx.createDynamicsCompressor();
      lim.threshold.value = -2; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = .002; lim.release.value = .12;
      mono.connect(lim);
      out = lim;
    }
    const dest = ctx.createMediaStreamDestination();
    dest.channelCount = 1;
    out.connect(dest);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    out.connect(analyser);
    return { ctx, analyser, stream: dest.stream };
  } catch {
    try { ctx && ctx.close(); } catch {}
    return null;
  }
}

async function openInputSheet() {
  let cfg = loadInput();
  const before = JSON.stringify(cfg);
  let devs = await audioInputs();
  const paint = sh => {
    const body = sh.querySelector('#inputBody');
    if (!body) return;
    const named = devs.some(d => d.label);
    const def = devs.find(d => d.deviceId === 'default');
    const items = [{ id: '', nom: 'Par défaut', note: def ? inputName(def.label) : '' }];
    for (const d of devs) {
      if (d.deviceId && d.deviceId !== 'default' && d.deviceId !== 'communications') items.push({ id: d.deviceId, nom: inputName(d.label) || 'Entrée', note: '' });
    }
    let cur = cfg.id || '';
    if (cur && !items.some(i => i.id === cur)) {
      const same = named && cfg.nom && items.find(i => i.nom === cfg.nom);
      if (same) cur = same.id;
      else items.push({ id: cur, nom: cfg.nom || 'Entrée choisie', note: named ? 'débranchée' : '' });
    }
    const raw = inputRaw(cfg);
    const canal = cfg.canal || '12';
    const mono = INPUT.voies.get(cur || 'default') === 1;
    body.innerHTML = `
      <div class="choices picks input-picks">${items.map(i => `<button class="choice pick ${i.id === cur ? 'on' : ''}" data-dev="${esc(i.id)}"><span class="ico"></span><span>${esc(i.nom)}<small>${esc(i.note)}</small></span></button>`).join('')}</div>
      ${named ? '' : '<p class="small-print">Le nom des entrées s\'affiche une fois le micro autorisé. <button class="txt-btn accent" data-allow>autoriser le micro</button></p>'}
      <label class="label">Son</label>
      <div class="seg"><button data-son="voix" class="${raw ? '' : 'on'}">Voix</button><button data-son="instrument" class="${raw ? 'on' : ''}">Instrument</button></div>
      <p class="hint">${raw ? 'Le son brut, sans réduction de bruit ni volume automatique. Pour une guitare ou un micro branchés dans une carte son.' : 'Le volume se règle tout seul. Pour le micro de l\'ordinateur ou du téléphone.'}</p>
      ${raw && !mono ? `<label class="label">Canal</label>
      <div class="seg">${[['1', 'Entrée 1'], ['2', 'Entrée 2'], ['12', 'Les deux']].map(([v, l]) => `<button data-canal="${v}" class="${canal === v ? 'on' : ''}">${l}</button>`).join('')}</div>
      <p class="hint">Une carte à deux entrées met l'entrée 1 à gauche et l'entrée 2 à droite. La prise, elle, est enregistrée au centre.</p>` : ''}`;
    body.querySelectorAll('[data-dev]').forEach(b => { b.onclick = () => {
      const id = b.dataset.dev;
      cfg = { ...cfg, id, nom: id ? items.find(i => i.id === id).nom : '', son: id ? 'instrument' : 'voix' };
      saveInput(cfg);
      paint(sh);
    }; });
    body.querySelectorAll('[data-son]').forEach(b => { b.onclick = () => { cfg = { ...cfg, son: b.dataset.son }; saveInput(cfg); paint(sh); }; });
    body.querySelectorAll('[data-canal]').forEach(b => { b.onclick = () => { cfg = { ...cfg, canal: b.dataset.canal }; saveInput(cfg); paint(sh); }; });
    const allow = body.querySelector('[data-allow]');
    if (allow) allow.onclick = async () => {
      try { (await navigator.mediaDevices.getUserMedia({ audio: true })).getTracks().forEach(t => t.stop()); }
      catch { toast('Micro refusé : autorise-le pour cette page dans le navigateur.'); return; }
      devs = await audioInputs();
      paint(sh);
    };
  };
  let refresh = null;
  await openSheet(`<h2>Entrée</h2>
    <p class="sub">D'où vient le son des prises.</p>
    <div id="inputBody"></div>`,
  sh => {
    paint(sh);
    // Une carte branchée ou débranchée pendant que le panneau est ouvert : la liste suit.
    refresh = async () => { devs = await audioInputs(); paint(sh); };
    navigator.mediaDevices?.addEventListener?.('devicechange', refresh);
  });
  if (refresh) navigator.mediaDevices.removeEventListener('devicechange', refresh);
  // Pendant une prise, on ne la relance que si ce qui serait enregistré change vraiment : une autre entrée, un autre son, un autre canal.
  // Retoucher ce qui était déjà choisi ne coûte pas la prise ; brancher la carte prévue, si.
  if (REC.recorder && REC.input && JSON.stringify(loadInput()) !== before) {
    const c = loadInput(), list = await audioInputs();
    const there = !!c.id && (list.some(d => d.deviceId === c.id) || !list.some(d => d.label));
    const id = there ? c.id : '', raw = there ? inputRaw(c) : (c.id ? false : inputRaw(c)), now = REC.input;
    if (REC.recorder && REC.input === now && (id !== (now.id || '') || raw !== !!now.raw || (raw && (c.canal || '12') !== (now.canal || '12')))) relaunchRecording();
  }
}

// Changer d'entrée pendant une prise : au début, on la reprend de zéro avec la nouvelle ; une prise déjà longue continue.
function relaunchRecording() {
  if ((Date.now() - REC.start) / 1000 > 30) { toast('La prise continue. Nouvelle entrée à la prochaine prise.'); return; }
  REC.restart = { target: REC.target, over: REC.overId, bpm: REC.bpm, metro: REC.metro };
  stopRecording(true);
}

function syncInputUI() {
  const b = $('#recInput');
  if (!REC.input) return;
  b.textContent = `${REC.input.label || 'Micro'}${REC.input.raw ? ' · instrument' : ''}`;
}

// Un seul départ à la fois : pendant qu'une prise s'ouvre (pistes, micro, carte), Espace ou un bouton n'en lancent pas une deuxième.
// « Arrêter » ou « annuler » touchés pendant ce temps sont appliqués dès que l'enregistreur tourne.
async function startRecording(targetIdeaId = null, overId = null, again = null) {
  if (REC.recorder || REC.starting) return;
  REC.starting = true;
  try { await startRecordingNow(targetIdeaId, overId, again); } finally { delete REC.starting; }
  const abort = REC.abort;
  delete REC.abort;
  if (abort && REC.recorder) stopRecording(abort === 'cancel');
  else if (abort) $('#recOverlay').hidden = true;
}
async function startRecordingNow(targetIdeaId, overId, again) {
  if (REC.recorder) return;
  const bail = () => { if (again) $('#recOverlay').hidden = true; };
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
    } catch (e) { setStatus(''); bail(); fail(e, 'Lecture impossible'); return; }
    targetIdeaId = overTake.idea_id;
  }
  const mime = pickMime();
  if (mime === null || !navigator.mediaDevices?.getUserMedia) {
    bail();
    toast("Ce navigateur ne permet pas d'enregistrer (il faut une page en https).");
    return;
  }
  let stream, input;
  try {
    ({ stream, input } = await openInput());
  } catch (e) {
    bail();
    toast('Micro inaccessible : autorise le micro pour cette page.');
    return;
  }
  // En instrument, une carte à deux entrées passe par le moteur audio pour finir au centre. Seulement si l'entrée se dit stéréo :
  // en mono, ou quand le navigateur ne le dit pas (Safari), « entrée 2 » donnerait une prise muette ; on garde alors le son tel quel.
  const route = input.raw && input.voies >= 2 ? await routeChannels(stream, input.canal) : null;
  const recorder = new MediaRecorder(route ? route.stream : stream, mime ? { mimeType: mime, audioBitsPerSecond: 96000 } : undefined);
  const chunks = []; // les morceaux de cette prise-ci, même si une autre a pris sa place dans REC
  Object.assign(REC, { recorder, stream, input, chunks, start: Date.now(), target: targetIdeaId, overId, cancelled: false, levels: [] });
  recorder.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
  recorder.onstop = onRecordingStopped;
  // Carte débranchée en pleine prise : on s'arrête là et on garde ce qui est enregistré.
  stream.getAudioTracks().forEach(t => t.addEventListener('ended', () => {
    if (REC.stream !== stream || !REC.recorder) return;
    toast('Entrée débranchée : prise arrêtée');
    stopRecording(false);
  }));
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

  if (route) { REC.ctx = route.ctx; REC.analyser = route.analyser; }
  else try {
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
  REC.bpm = (again && again.bpm) || (idea && idea.bpm) || savedBpm();
  REC.metro = !overTake && (again ? !!again.metro : savedMetro()); // par-dessus une prise, c'est elle qui donne le tempo
  REC.metroUsed = REC.metro;
  syncMetroUI();
  syncInputUI();
  if (REC.metro) startMetro(REC.bpm);
  $('#recOverlay').hidden = false;
  if (again) toast(`Prise reprise avec « ${input.label || 'Micro'} »`);
  tickRecording();
}

// Le magnéto du bas : un compteur et un niveau à six voyants.
const deckClock = sec => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
function setMeter(el, level) {
  if (!el) return;
  const n = Math.round(Math.max(0, Math.min(1, level)) * el.children.length);
  [...el.children].forEach((seg, i) => seg.classList.toggle('on', i < n));
}
function tickRecording() {
  if (!REC.recorder) return;
  const sec = (Date.now() - REC.start) / 1000;
  $('#recTime').textContent = fmtDur(Math.floor(sec));
  $('#recDeckTime').textContent = deckClock(sec);
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
  setMeter($('#recMeter'), level);
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
  if (!REC.recorder) { if (REC.starting) REC.abort = cancel || REC.abort === 'cancel' ? 'cancel' : 'stop'; return; }
  REC.cancelled = cancel;
  REC.duration = (Date.now() - REC.start) / 1000;
  if (REC.recorder.state !== 'inactive') REC.recorder.stop();
}

function onRecordingStopped() {
  cancelAnimationFrame(REC.raf);
  stopMetro();
  if (REC.over) stopMix();
  REC.stream.getTracks().forEach(t => t.stop());
  REC.recorder.stream.getTracks().forEach(t => t.stop());
  try { REC.ctx && REC.ctx.close(); } catch {}
  try { REC.wake && REC.wake.release(); } catch {}
  if (!REC.restart) $('#recOverlay').hidden = true;
  const type = REC.recorder.mimeType || REC.chunks[0]?.type || 'audio/webm';
  const duration = REC.duration ?? (Date.now() - REC.start) / 1000;
  const result = { blob: new Blob(REC.chunks, { type }), duration, mime: type.split(';')[0], bpm: REC.metroUsed ? REC.bpm : null, over: REC.over || null };
  const { cancelled, target, restart } = REC;
  for (const k of Object.keys(REC)) delete REC[k];
  if (restart) { startRecording(restart.target, restart.over, restart); return; }
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
  const v = await actionSheet({ title: ideaTitle(idea), kind: albumOf(idea) ? 'Morceau' : STAGES[stageOf(idea)][0], star: !!idea.starred, onStar: () => { idea.starred = !idea.starred; render(); S.store.saveIdea(idea).catch(e => fail(e, 'Action impossible')); return idea.starred; } }, [
    { label: 'Renommer', ico: '✎', value: 'rename' },
    { label: 'Étiquettes', ico: '#', value: 'tags', sub: (idea.tags || []).join(', ') },
    { label: 'Texte', value: 'notes', sub: 'Paroles, accords, notes' },
    { label: 'Tempo et tonalité', ico: '♩', value: 'tempo', sub: [idea.bpm ? `${idea.bpm} bpm` : '', idea.tona || '', (idea.chords || '').split('\n')[0].trim()].filter(Boolean).join(' · ') },
    stageOf(idea) !== 'rehearsal' && !albumOf(idea) && { label: stageOf(idea) === 'compo' ? 'Repasser en idée' : 'Passer en compo', value: 'stage', sub: stageOf(idea) === 'compo' ? 'Elle retourne dans Idées' : 'Elle est assez travaillée' },
    stageOf(idea) !== 'rehearsal' && !albumOf(idea) && { label: 'Dossier', value: 'folder', sub: folderOf(idea) || 'Jazz, acoustique, live…' },
    albumOf(idea) && { label: 'Sortir de l\'album', value: 'out', sub: stageOf(idea) === 'idea' ? 'Vers Compos' : `Vers ${STAGES[stageOf(idea)][1]}` },
    isCloud() && !group && S.groups.length && isMine(idea) && { label: 'Partager', value: 'share', sub: 'Avec un groupe' },
    group && isMine(idea) && { label: 'Reprendre', value: 'unshare', sub: `La retirer de « ${group.name} »` },
    isCloud() && { label: 'Album', value: 'album', sub: albumOf(idea)?.name || 'Ranger dans un album' },
    { label: 'Importer', value: 'import', sub: 'Des fichiers audio' },
    takesOf(idea.id).length && { label: 'Exporter', value: 'export', sub: 'Pour Reaper : un WAV par piste' },
    { label: 'Fusionner', value: 'merge', sub: 'Avec un autre morceau' },
    canDeleteIdea(idea) && { label: 'Supprimer', value: 'delete', cls: 'danger', sub: group ? 'Les prises sont rendues' : 'Les prises vont dans À trier' },
  ].filter(Boolean));
  try {
    if (v === 'rename') return renameIdea(idea);
    if (v === 'tempo') return editTempo(idea);
    if (v === 'export') return exportIdea(idea);
    if (v === 'import') return pickImport(idea.id);
    if (v === 'album') return fileIdea(idea);
    if (v === 'folder') return pickFolder(idea);
    if (v === 'star') { idea.starred = !idea.starred; render(); return S.store.saveIdea(idea); }
    if (v === 'out') {
      const was = { album_id: idea.album_id, track: idea.track, stage: idea.stage };
      const name = albumOf(idea)?.name || 'l\'album';
      idea.album_id = null; idea.track = 0;
      if (stageOf(idea) === 'idea' && stageReady()) idea.stage = 'compo';
      try { await S.store.saveIdea(idea); } catch (e) { Object.assign(idea, was); throw e; }
      render();
      return toast(`« ${ideaTitle(idea)} » est sortie de « ${name} », dans ${STAGES[stageOf(idea)][1]}`);
    }
    if (v === 'stage') {
      if (!stageReady()) return;
      const was = idea.stage;
      idea.stage = stageOf(idea) === 'compo' ? 'idea' : 'compo';
      try { await S.store.saveIdea(idea); } catch (e) { idea.stage = was; throw e; }
      render();
      return toast(idea.stage === 'compo' ? `« ${ideaTitle(idea)} » est passée dans Compos` : `« ${ideaTitle(idea)} » est repassée dans Idées`);
    }
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
  const v = await actionSheet({ title: take.title || (pathOf(take).length > 1 || superseded(take) ? `Version ${pathOf(take).length}` : 'Prise'), kind: baseOf(take) ? 'Piste' : 'Prise' }, [
    { label: 'Renommer', ico: '✎', value: 'rename' },
    { label: 'Instrument', value: 'instrument', sub: instrumentOf(take.instrument)?.label || 'Non précisé' },
    { label: 'Note', ico: '¶', value: 'note' },
    take.idea_id && ideaById(take.idea_id) && { label: 'Jouer par-dessus', value: 'over', sub: 'En écoutant, au casque' },
    take.idea_id && ideaById(take.idea_id) && !baseOf(take) && { label: 'Nouvelle version', value: 'version', sub: 'Un mixage avec un instrument en plus' },
    baseOf(take) && { label: 'Recaler', value: 'nudge', sub: `${fmtMs((take.offset_ms || 0) - Math.round(cutIn(baseOf(take)) * 1000))}` },
    { label: 'Couper', value: 'cut', sub: isCut(take) ? `Garde ${fmtDur(lenOf(take))} sur ${fmtDur(take.duration)}` : 'Le début et la fin' },
    { label: 'Déplacer', value: 'move', sub: 'Vers un autre morceau' },
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
    if (v === 'download') await downloadTake(take);
    if (v === 'version') return pickVersion(take);
    if (v === 'delete') {
      if (!(await confirmBox('Supprimer cette prise ?', "L'enregistrement sera effacé définitivement.", 'Supprimer'))) return;
      if (S.playing === take.id) { audio.pause(); S.playing = null; }
      // Les versions posées dessus se raccrochent à la précédente : la pile reste entière.
      for (const c of S.takes.filter(x => x.version_of === take.id)) {
        c.version_of = take.version_of || null;
        try { await S.store.saveTake(c); } catch {}
      }
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
        ${mode === 'signup' ? '<label class="label">Apparence</label><div class="seg"><button type="button" data-theme-pick="dark">Sombre</button><button type="button" data-theme-pick="light">Clair</button></div><p class="hint">Ça se change à tout moment dans les réglages.</p>' : ''}
        <button class="btn primary wide" data-go>${mode === 'signup' ? "S'inscrire et rejoindre le groupe" : mode === 'login' ? 'Me connecter et rejoindre le groupe' : 'Rejoindre le groupe'}</button>
        <div class="invite-foot">
          ${mode === 'join' ? '' : `<button class="txt-btn accent" data-swap>${mode === 'signup' ? "J'ai déjà un compte" : 'Je n\'ai pas encore de compte'}</button>`}
          <button class="txt-btn" data-later>plus tard</button>
        </div>`;
      const swap = root.querySelector('[data-swap]');
      const themeBtns = root.querySelectorAll('[data-theme-pick]');
      const showTheme = () => themeBtns.forEach(b => b.classList.toggle('on', b.dataset.themePick === currentTheme()));
      themeBtns.forEach(b => { b.onclick = () => { setTheme(b.dataset.themePick); showTheme(); }; });
      showTheme();
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
    $('#tabs').classList.add('drop-ready');
    const tab = under && under.closest('.tab[data-tab]');
    if (tab) { tab.classList.add('drop-hover'); DRAG.target = { album: 'none', stage: tab.dataset.tab }; return; }
    const spine = under && under.closest('.spine');
    if (spine) { spine.classList.add('drop-hover'); DRAG.target = { folder: spine.dataset.folder }; return; }
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
  $('#tabs').classList.remove('drop-ready');
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

// On attrape une prise, un morceau d'album, ou un bloc par son titre (pour le poser sur un onglet).
const DRAG_SRC = '.take, .song-row, .block:not(.inbox):not(.in-album):not(.new-zone) > .block-head';
const dragOf = (t, x, y) => (t.classList.contains('block-head')
  ? { id: t.closest('.block').dataset.drop, set: null, kind: 'idea', el: t, x, y }
  : { id: t.dataset.id || t.dataset.idea || t.dataset.setIdea, set: t.dataset.setIdea ? t.dataset.set : null,
    kind: t.dataset.setIdea ? 'set' : t.dataset.idea ? 'idea' : 'take', el: t, x, y });
function wireDrag() {
  const board = $('#board');
  // Souris / stylet
  board.addEventListener('pointerdown', e => {
    if (e.pointerType === 'touch' || e.button !== 0) return;
    const t = e.target.closest(DRAG_SRC);
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
    const t = e.target.closest(DRAG_SRC);
    if (!t || e.target.closest('button') || e.touches.length > 1) return;
    const pt = e.touches[0];
    DRAG.pending = dragOf(t, pt.clientX, pt.clientY);
    clearTimeout(DRAG.timer);
    DRAG.timer = setTimeout(() => {
      const p = DRAG.pending;
      if (!p) return;
      try { navigator.vibrate && navigator.vibrate(18); } catch {}
      beginDrag(p, p.x, p.y);
    }, e.target.closest('.grip') ? 70 : 380);
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
  board.addEventListener('contextmenu', e => { if (e.target.closest(DRAG_SRC)) e.preventDefault(); });
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
    <label class="label">Enregistrement</label>
    <div class="choices"><button class="choice" id="inputOpen"><span class="ico"></span><span>Entrée<small>${esc(describeInput(loadInput()))}</small></span></button></div>
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
    sh.querySelector('#inputOpen').onclick = () => { close(); openInputSheet(); };
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
  $('#recInput').onclick = openInputSheet;
  $('#settingsBtn').onclick = openSettings;
  $('#importBtn').onclick = () => pickImport();
  $('#importInput').onchange = e => {
    const f = e.target.files;
    const prev = versionDest && takeById(versionDest);
    versionDest = null;
    if (f && f.length) { if (prev) addVersion(f[0], prev); else importFiles(f, ideaById(importDest) ? importDest : undefined); }
    e.target.value = '';
  };
  $('#hero').onclick = e => { if (e.target.closest('#newSong')) createSong(); if (e.target.closest('#newRehearsal')) createRehearsal(); if (e.target.closest('#newAlbum')) createAlbum(); if (e.target.closest('#newSet')) createSet();
    const g = groupById(S.scope);
    const band = e.target.closest('[data-band]');
    if (g && (e.target.closest('#bandNew') || band?.dataset.band === 'edit')) editBand(g);
    if (g && band?.dataset.band === 'rider') openRider(g);
    if (g && band?.dataset.band === 'page') sharePage(g);
    if (g && band?.dataset.band === 'book') editBook(g);
    if (g && band?.dataset.band === 'fold' && !e.target.closest('a')) { if (!BAND_OPEN.delete(g.id)) BAND_OPEN.add(g.id); render(); }
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

  $('#tabs').onclick = e => {
    const b = e.target.closest('[data-tab]');
    if (!b) return;
    TAB = b.dataset.tab;
    try { localStorage.setItem('fredon.tab', TAB); } catch {}
    render();
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
    if (a === 'folder-open') { FOLDER = FOLDER === el.dataset.folder ? '' : el.dataset.folder; render(); }
    if (a === 'folder-menu') folderMenu(el.dataset.folder);
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
    if (a === 'ver-add') pickVersion(takeById(el.dataset.id));
    if (a === 'ver-download' && takeById(el.dataset.id)) downloadTake(takeById(el.dataset.id)).catch(err => fail(err, 'Téléchargement impossible'));
    if (a === 'ver-fold') { if (!VER_OPEN.delete(el.dataset.id)) VER_OPEN.add(el.dataset.id); render(); }
    if (a === 'tempo' && idea) editTempo(idea);
    if (a === 'rename' && idea) renameIdea(idea);
    if (a === 'text' && idea) editText(idea);
    if (a === 'idea-menu' && idea) ideaMenu(idea);
    if (a === 'record-into' && idea) startRecording(idea.id);
    if (a === 'import-into' && idea) pickImport(idea.id);
    if (a === 'fold' && idea) { if (!UNFOLDED.delete(idea.id)) UNFOLDED.add(idea.id); render(); }
    if (a === 'play-all' && idea) {
      const ids = takesOf(idea.id).filter(t => !baseOf(t) && !superseded(t)).map(t => t.id); // les pistes superposées ne se lisent pas à la suite
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
    if (e.code !== 'Space' || sheetClose || STAGE.on || RIDER_ON || document.body.classList.contains('paging') || /INPUT|TEXTAREA/.test(document.activeElement?.tagName)) return;
    e.preventDefault();
    // Pendant qu'une prise se relance (écran d'enregistrement ouvert), Espace l'arrête comme le bouton ; sinon il n'en lance pas une deuxième.
    if (REC.recorder || (REC.starting && !$('#recOverlay').hidden)) stopRecording(false); else startRecording(null);
  });

  // Quand on revient sur l'appli, on récupère ce qui a été fait depuis l'autre appareil.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && S.store?.kind === 'cloud' && !REC.recorder && !DRAG.active && !sheetClose) reload();
  });
}

async function boot() {
  setTheme(currentTheme());
  const band = new URLSearchParams(location.search).get('groupe');
  if (band) return openPublicPage(band);
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
