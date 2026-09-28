export interface StoredMedia {
  id: string;
  name: string;
  type: 'image' | 'model';
  url: string;
}

const DB_NAME = 'anatomyzh-media';
const STORE_NAME = 'files';
const MEDIA_PREFIX = 'media:';
const LEGACY_MEDIA_KEY = 'tester_pro_media';

const openDatabase = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
  if (!('indexedDB' in window)) {
    reject(new Error('IndexedDB is not available in this browser context'));
    return;
  }

  const request = indexedDB.open(DB_NAME, 1);
  request.onupgradeneeded = () => {
    const db = request.result;
    if (!db.objectStoreNames.contains(STORE_NAME)) {
      db.createObjectStore(STORE_NAME, { keyPath: 'id' });
    }
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

const getStoredFile = async (id: string): Promise<{ id: string; dataUrl: string } | null> => {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
};

const readLegacyMedia = (): StoredMedia[] => {
  try {
    const raw = localStorage.getItem(LEGACY_MEDIA_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredMedia[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const mediaStore = {
  reference(id: string): string {
    return `${MEDIA_PREFIX}${id}`;
  },

  async save(id: string, dataUrl: string): Promise<void> {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const request = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put({ id, dataUrl });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  },

  async clearCustomMedia(): Promise<void> {
    localStorage.removeItem(LEGACY_MEDIA_KEY);
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const request = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  },

  async migrateLegacyMedia(): Promise<void> {
    const legacy = readLegacyMedia();
    for (const item of legacy) {
      const url = item?.url || '';
      if (!url || !url.startsWith('data:') && !url.startsWith('blob:')) continue;
      const recordId = item.id || `legacy_${Math.random().toString(36).slice(2, 10)}`;
      await this.save(recordId, url);
      item.id = recordId;
      item.url = this.reference(recordId);
    }

    if (legacy.length > 0) {
      localStorage.setItem(LEGACY_MEDIA_KEY, JSON.stringify(legacy));
    }
  },

  async resolve(value?: string): Promise<string> {
    if (!value) return '';
    if (value.startsWith('data:') || value.startsWith('blob:')) return value;
    if (!value.startsWith(MEDIA_PREFIX)) return value;

    const id = value.slice(MEDIA_PREFIX.length);
    const stored = await getStoredFile(id);
    if (stored?.dataUrl) return stored.dataUrl;

    const legacy = readLegacyMedia();
    const match = legacy.find((item) => item.id === id || item.url === value);
    if (match && (match.url.startsWith('data:') || match.url.startsWith('blob:'))) {
      return match.url;
    }

    return '';
  },
};