/* Stockage de Fredon.
 * Deux implémentations avec la même interface :
 *   - LocalStore : tout reste dans le navigateur (IndexedDB) — pour essayer.
 *   - CloudStore : Supabase (base + fichiers) — synchronisé entre téléphone et PC.
 *
 * Idée  : { id, title, tags[], starred, notes, created_at, updated_at }
 * Prise : { id, idea_id|null, title, notes, duration, mime, path, position, created_at }
 */

const CONFIG_KEY = 'fredon.config';

// Projet Supabase de Fredon. La clé « publishable » est faite pour être publique :
// ce sont les règles d'accès de la base (RLS) qui protègent les données.
const DEFAULT_CONFIG = {
  mode: 'cloud',
  url: 'https://dvptokkafcwfvkaafaya.supabase.co',
  key: 'sb_publishable_mq4Ikoexfa0ri76RPinz0g_KwFzybNN',
};

function loadConfig() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(CONFIG_KEY)) || {}; } catch {}
  return { ...DEFAULT_CONFIG, ...saved };
}
function saveConfig(cfg) {
  try { localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg)); } catch {}
}

function extFor(mime) {
  if (!mime) return 'webm';
  if (mime.includes('mp4') || mime.includes('m4a') || mime.includes('aac')) return 'm4a';
  if (mime.includes('mpeg') || mime.includes('mp3')) return 'mp3';
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('wav')) return 'wav';
  return 'webm';
}

/* ------------------------------------------------------------------ */
class LocalStore {
  constructor() { this.kind = 'local'; this.urls = new Map(); }

  async init() {
    this.db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('fredon', 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        db.createObjectStore('ideas', { keyPath: 'id' });
        db.createObjectStore('takes', { keyPath: 'id' });
        db.createObjectStore('blobs');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return true;
  }

  _tx(store, mode, fn) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(store, mode);
      const s = tx.objectStore(store);
      const r = fn(s);
      tx.oncomplete = () => resolve(r && 'result' in r ? r.result : undefined);
      tx.onerror = () => reject(tx.error);
    });
  }

  listIdeas() { return this._tx('ideas', 'readonly', s => s.getAll()); }
  listTakes() { return this._tx('takes', 'readonly', s => s.getAll()); }
  saveIdea(idea) { return this._tx('ideas', 'readwrite', s => s.put(idea)); }
  deleteIdea(id) { return this._tx('ideas', 'readwrite', s => s.delete(id)); }
  async saveTake(take, blob) {
    if (blob) await this._tx('blobs', 'readwrite', s => s.put(blob, take.id));
    return this._tx('takes', 'readwrite', s => s.put(take));
  }
  async deleteTake(take) {
    await this._tx('blobs', 'readwrite', s => s.delete(take.id));
    return this._tx('takes', 'readwrite', s => s.delete(take.id));
  }
  getBlob(take) { return this._tx('blobs', 'readonly', s => s.get(take.id)); }
  async audioUrl(take) {
    if (this.urls.has(take.id)) return this.urls.get(take.id);
    const blob = await this.getBlob(take);
    if (!blob) throw new Error('Fichier audio introuvable');
    const url = URL.createObjectURL(blob);
    this.urls.set(take.id, url);
    return url;
  }
  async wipe() {
    for (const s of ['ideas', 'takes', 'blobs']) await this._tx(s, 'readwrite', st => st.clear());
  }
}

/* ------------------------------------------------------------------ */
// File d'attente : ce qui n'a pas pu partir faute de réseau reste sur l'appareil (IndexedDB),
// fichier audio compris, et part tout seul au retour du réseau.
class Outbox {
  async open() {
    this.db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('fredon-outbox', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('items', { keyPath: 'id' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  _tx(mode, fn) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('items', mode);
      const r = fn(tx.objectStore('items'));
      tx.oncomplete = () => resolve(r && 'result' in r ? r.result : undefined);
      tx.onerror = () => reject(tx.error);
    });
  }
  all() { return this._tx('readonly', s => s.getAll()); }
  put(item) { return this._tx('readwrite', s => s.put(item)); }
  del(id) { return this._tx('readwrite', s => s.delete(id)); }
}
// Erreur de réseau (et non refus du serveur) ?
const isNetErr = e => !navigator.onLine || /failed to fetch|networkerror|load failed|network request failed|network connection/i.test(String((e && e.message) || e));
const USER_KEY = 'fredon.user';

class CloudStore {
  constructor(cfg) { this.kind = 'cloud'; this.cfg = cfg; this.urls = new Map(); this.pending = new Map(); }

  async init() {
    if (!window.supabase) throw new Error('Bibliothèque Supabase non chargée (pas de réseau ?)');
    this.sb = window.supabase.createClient(this.cfg.url, this.cfg.key, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'fredon.auth' },
      global: { fetch: (...args) => fetch(...args) },
    });
    let user = null;
    try { const { data } = await this.sb.auth.getSession(); user = data.session?.user || null; } catch {}
    // Sans réseau, la session ne peut pas toujours être relue : on se souvient de qui était connecté ici.
    if (user) { try { localStorage.setItem(USER_KEY, JSON.stringify({ id: user.id, email: user.email })); } catch {} }
    else if (!navigator.onLine) { try { user = JSON.parse(localStorage.getItem(USER_KEY)); } catch {} }
    this.user = user || null;
    await this._openOutbox();
    return !!this.user;
  }
  async _openOutbox() {
    this.pending = new Map();
    if (!this.user) return;
    try {
      if (!this.outbox) { this.outbox = new Outbox(); await this.outbox.open(); }
      for (const it of await this.outbox.all()) if (it.user === this.user.id) this.pending.set(it.id, it);
    } catch { this.outbox = null; }
  }
  async _queue(kind, row, blob) {
    if (!this.outbox) throw new Error('Pas de réseau');
    const prev = this.pending.get(row.id);
    const item = { id: row.id, kind, row: { ...row }, blob: blob || (prev && prev.blob) || null, at: prev ? prev.at : Date.now(), user: this.user.id };
    await this.outbox.put(item);
    this.pending.set(row.id, item);
  }
  async _unqueue(id) {
    this.pending.delete(id);
    try { if (this.outbox) await this.outbox.del(id); } catch {}
  }
  // Envoie ce qui attend : les idées d'abord, puis les prises, dans l'ordre où elles ont été faites.
  async flush() {
    const items = [...this.pending.values()].sort((a, b) => (a.kind === b.kind ? a.at - b.at : a.kind === 'idea' ? -1 : 1));
    let sent = 0;
    const errors = [];
    for (const it of items) {
      try {
        if (it.kind === 'idea') await this._sendIdea(it.row);
        else {
          try { await this._sendTake(it.row, it.blob); }
          catch (e) {
            if (isNetErr(e) || !it.row.idea_id) throw e;
            // L'idée a disparu entre-temps : la prise n'est pas perdue, elle va dans « À trier ».
            it.row.idea_id = null; it.row.layer_of = null;
            await this._sendTake(it.row, it.blob);
          }
        }
      } catch (e) {
        if (isNetErr(e)) break;
        errors.push(e);
        continue;
      }
      await this._unqueue(it.id);
      sent++;
    }
    return { sent, left: this.pending.size, errors };
  }
  // Données reprises de la dernière copie locale : ces lignes existent déjà sur le serveur.
  assumeKnown(ideas, takes) {
    this.knownIdeas = new Set(ideas.map(r => r.id));
    this.knownTakes = new Set(takes.map(r => r.id));
  }

  async signIn(email, password) {
    const { data, error } = await this.sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    this.user = data.user;
    try { localStorage.setItem(USER_KEY, JSON.stringify({ id: data.user.id, email: data.user.email })); } catch {}
    await this._openOutbox();
  }
  // Crée un compte. Renvoie true si la session est ouverte tout de suite,
  // false s'il faut d'abord confirmer l'adresse par e-mail.
  async signUp(email, password, redirect) {
    const { data, error } = await this.sb.auth.signUp({
      email, password, options: { emailRedirectTo: redirect || location.origin + location.pathname },
    });
    if (error) throw error;
    this.user = data.session ? data.user : null;
    if (this.user) await this._openOutbox();
    return !!data.session;
  }
  async signOut() { await this.sb.auth.signOut(); this.user = null; this.pending = new Map(); try { localStorage.removeItem(USER_KEY); } catch {} }

  async _check(p) { const { data, error } = await p; if (error) throw error; return data; }

  // On retient les lignes déjà sur le serveur : celles-là se modifient (update),
  // les nouvelles s'ajoutent (insert). Un « upsert » échouerait sur la prise d'un autre membre.
  _fields(obj, drop) { const o = { ...obj }; for (const k of drop) delete o[k]; return o; }

  async listIdeas() {
    const rows = await this._check(this.sb.from('ideas').select('*'));
    this.knownIdeas = new Set(rows.map(r => r.id));
    return rows;
  }
  async listTakes() {
    const rows = await this._check(this.sb.from('takes').select('*'));
    this.knownTakes = new Set(rows.map(r => r.id));
    return rows;
  }
  async saveIdea(idea) {
    if (this.pending.has(idea.id)) return this._queue('idea', idea); // déjà en attente : on garde l'ordre
    try { await this._sendIdea(idea); }
    catch (e) { if (!isNetErr(e)) throw e; await this._queue('idea', idea); }
  }
  async _sendIdea(idea) {
    this.knownIdeas = this.knownIdeas || new Set();
    if (this.knownIdeas.has(idea.id)) {
      return this._check(this.sb.from('ideas').update(this._fields(idea, ['id', 'user_id', 'created_at'])).eq('id', idea.id));
    }
    const { error } = await this.sb.from('ideas').insert(this._fields(idea, ['user_id']));
    this.knownIdeas.add(idea.id);
    if (error && error.code === '23505') return this._sendIdea(idea); // déjà sur le serveur : on la modifie
    if (error) { this.knownIdeas.delete(idea.id); throw error; }
  }
  async deleteIdea(id) {
    const local = this.pending.has(id) && !(this.knownIdeas && this.knownIdeas.has(id));
    await this._unqueue(id);
    if (local) return; // jamais envoyée : rien à effacer sur le serveur
    return this._check(this.sb.from('ideas').delete().eq('id', id));
  }

  async saveTake(take, blob) {
    if (blob) take.path = `${this.user.id}/${take.id}.${extFor(take.mime)}`;
    // Déjà en attente, ou rangée dans une idée qui n'est pas encore partie : elle attend son tour.
    if (this.pending.has(take.id) || (take.idea_id && this.pending.has(take.idea_id))) return this._queue('take', take, blob);
    try { await this._sendTake(take, blob); }
    catch (e) { if (!isNetErr(e)) throw e; await this._queue('take', take, blob); }
  }
  async _sendTake(take, blob) {
    this.knownTakes = this.knownTakes || new Set();
    if (blob) {
      await this._check(this.sb.storage.from('takes').upload(take.path, blob, {
        contentType: take.mime || 'audio/webm', upsert: true,
      }));
    }
    if (this.knownTakes.has(take.id)) {
      return this._check(this.sb.from('takes').update(this._fields(take, ['id', 'user_id', 'created_at', 'path'])).eq('id', take.id));
    }
    const { error } = await this.sb.from('takes').insert(this._fields(take, ['user_id']));
    this.knownTakes.add(take.id);
    if (error && error.code === '23505') return this._sendTake(take);
    if (error) { this.knownTakes.delete(take.id); throw error; }
  }

  /* ----- albums ----- */
  listAlbums() { return this._check(this.sb.from('albums').select('*')); }
  addAlbum(a) { return this._check(this.sb.from('albums').insert(a).select().single()); }
  saveAlbum(a) { return this._check(this.sb.from('albums').update({ name: a.name, kind: a.kind, position: a.position }).eq('id', a.id)); }
  deleteAlbum(id) { return this._check(this.sb.from('albums').delete().eq('id', id)); }

  /* ----- discussion ----- */
  listComments() { return this._check(this.sb.from('comments').select('*').order('created_at')); }
  addComment(c) { return this._check(this.sb.from('comments').insert(c).select().single()); }
  deleteComment(id) { return this._check(this.sb.from('comments').delete().eq('id', id)); }

  /* ----- groupes ----- */
  listGroups() { return this._check(this.sb.from('groups').select('*')); }
  listMembers() { return this._check(this.sb.from('group_members').select('*')); }
  createGroup(name, displayName) { return this._check(this.sb.rpc('create_group', { group_name: name, display_name: displayName })); }
  inviteInfo(code) { return this._check(this.sb.rpc('invite_info', { invite_code: code })); }
  joinGroup(code, displayName) { return this._check(this.sb.rpc('join_group', { invite_code: code, display_name: displayName })); }
  renameGroup(id, name) { return this._check(this.sb.from('groups').update({ name }).eq('id', id)); }
  deleteGroup(id) { return this._check(this.sb.from('groups').delete().eq('id', id)); }
  removeMember(groupId, userId) { return this._check(this.sb.from('group_members').delete().eq('group_id', groupId).eq('user_id', userId)); }

  async deleteTake(take) {
    const local = this.pending.has(take.id) && !(this.knownTakes && this.knownTakes.has(take.id));
    await this._unqueue(take.id);
    if (local) return;
    if (take.path) await this.sb.storage.from('takes').remove([take.path]);
    return this._check(this.sb.from('takes').delete().eq('id', take.id));
  }
  async audioUrl(take) {
    const hit = this.urls.get(take.id);
    if (hit && hit.exp > Date.now()) return hit.url;
    const wait = this.pending.get(take.id);
    if (wait && wait.blob) { // pas encore envoyée : on lit la copie gardée sur l'appareil
      const url = URL.createObjectURL(wait.blob);
      this.urls.set(take.id, { url, exp: Date.now() + 6 * 3600 * 1000 });
      return url;
    }
    const data = await this._check(this.sb.storage.from('takes').createSignedUrl(take.path, 3600));
    this.urls.set(take.id, { url: data.signedUrl, exp: Date.now() + 50 * 60 * 1000 });
    return data.signedUrl;
  }
  async getBlob(take) {
    const wait = this.pending.get(take.id);
    if (wait && wait.blob) return wait.blob;
    return this._check(this.sb.storage.from('takes').download(take.path));
  }
}

window.FredonStore = { LocalStore, CloudStore, loadConfig, saveConfig, extFor, isNetErr };
