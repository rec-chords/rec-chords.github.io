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
class CloudStore {
  constructor(cfg) { this.kind = 'cloud'; this.cfg = cfg; this.urls = new Map(); }

  async init() {
    if (!window.supabase) throw new Error('Bibliothèque Supabase non chargée (pas de réseau ?)');
    this.sb = window.supabase.createClient(this.cfg.url, this.cfg.key, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'fredon.auth' },
    });
    const { data } = await this.sb.auth.getSession();
    this.user = data.session?.user || null;
    return !!this.user;
  }

  async signIn(email, password) {
    const { data, error } = await this.sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    this.user = data.user;
  }
  // Crée un compte. Renvoie true si la session est ouverte tout de suite,
  // false s'il faut d'abord confirmer l'adresse par e-mail.
  async signUp(email, password) {
    const { data, error } = await this.sb.auth.signUp({
      email, password, options: { emailRedirectTo: location.origin + location.pathname },
    });
    if (error) throw error;
    this.user = data.session ? data.user : null;
    return !!data.session;
  }
  async signOut() { await this.sb.auth.signOut(); this.user = null; }

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
    this.knownIdeas = this.knownIdeas || new Set();
    if (this.knownIdeas.has(idea.id)) {
      return this._check(this.sb.from('ideas').update(this._fields(idea, ['id', 'user_id', 'created_at'])).eq('id', idea.id));
    }
    const { error } = await this.sb.from('ideas').insert(this._fields(idea, ['user_id']));
    this.knownIdeas.add(idea.id);
    if (error && error.code === '23505') return this.saveIdea(idea); // déjà sur le serveur : on la modifie
    if (error) { this.knownIdeas.delete(idea.id); throw error; }
  }
  deleteIdea(id) { return this._check(this.sb.from('ideas').delete().eq('id', id)); }

  async saveTake(take, blob) {
    this.knownTakes = this.knownTakes || new Set();
    if (blob) {
      take.path = `${this.user.id}/${take.id}.${extFor(take.mime)}`;
      await this._check(this.sb.storage.from('takes').upload(take.path, blob, {
        contentType: take.mime || 'audio/webm', upsert: true,
      }));
    }
    if (this.knownTakes.has(take.id)) {
      return this._check(this.sb.from('takes').update(this._fields(take, ['id', 'user_id', 'created_at', 'path'])).eq('id', take.id));
    }
    const { error } = await this.sb.from('takes').insert(this._fields(take, ['user_id']));
    this.knownTakes.add(take.id);
    if (error && error.code === '23505') return this.saveTake(take);
    if (error) { this.knownTakes.delete(take.id); throw error; }
  }

  /* ----- discussion ----- */
  listComments() { return this._check(this.sb.from('comments').select('*').order('created_at')); }
  addComment(c) { return this._check(this.sb.from('comments').insert(c).select().single()); }
  deleteComment(id) { return this._check(this.sb.from('comments').delete().eq('id', id)); }

  /* ----- groupes ----- */
  listGroups() { return this._check(this.sb.from('groups').select('*')); }
  listMembers() { return this._check(this.sb.from('group_members').select('*')); }
  createGroup(name, displayName) { return this._check(this.sb.rpc('create_group', { group_name: name, display_name: displayName })); }
  joinGroup(code, displayName) { return this._check(this.sb.rpc('join_group', { invite_code: code, display_name: displayName })); }
  renameGroup(id, name) { return this._check(this.sb.from('groups').update({ name }).eq('id', id)); }
  deleteGroup(id) { return this._check(this.sb.from('groups').delete().eq('id', id)); }
  removeMember(groupId, userId) { return this._check(this.sb.from('group_members').delete().eq('group_id', groupId).eq('user_id', userId)); }

  async deleteTake(take) {
    if (take.path) await this.sb.storage.from('takes').remove([take.path]);
    return this._check(this.sb.from('takes').delete().eq('id', take.id));
  }
  async audioUrl(take) {
    const hit = this.urls.get(take.id);
    if (hit && hit.exp > Date.now()) return hit.url;
    const data = await this._check(this.sb.storage.from('takes').createSignedUrl(take.path, 3600));
    this.urls.set(take.id, { url: data.signedUrl, exp: Date.now() + 50 * 60 * 1000 });
    return data.signedUrl;
  }
  async getBlob(take) {
    return this._check(this.sb.storage.from('takes').download(take.path));
  }
}

window.FredonStore = { LocalStore, CloudStore, loadConfig, saveConfig, extFor };
