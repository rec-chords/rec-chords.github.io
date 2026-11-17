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
  async signOut() { await this.sb.auth.signOut(); this.user = null; }

  async _check(p) { const { data, error } = await p; if (error) throw error; return data; }

  listIdeas() { return this._check(this.sb.from('ideas').select('*')); }
  listTakes() { return this._check(this.sb.from('takes').select('*')); }
  saveIdea(idea) { return this._check(this.sb.from('ideas').upsert(idea)); }
  deleteIdea(id) { return this._check(this.sb.from('ideas').delete().eq('id', id)); }

  async saveTake(take, blob) {
    if (blob) {
      take.path = `${this.user.id}/${take.id}.${extFor(take.mime)}`;
      await this._check(this.sb.storage.from('takes').upload(take.path, blob, {
        contentType: take.mime || 'audio/webm', upsert: true,
      }));
    }
    return this._check(this.sb.from('takes').upsert(take));
  }
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
