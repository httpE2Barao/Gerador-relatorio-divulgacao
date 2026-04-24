const DB_NAME = 'gerador-pdf-db';
const DB_VERSION = 2;
const STORE_PROOFS = 'proofs';
const STORE_COVER = 'cover';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_PROOFS)) {
        db.createObjectStore(STORE_PROOFS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_COVER)) {
        db.createObjectStore(STORE_COVER, { keyPath: 'id' });
      }
    };
  });
}

export interface CoverItem {
  id: string;
  projectTitle: string;
  sponsor: string;
  fileBlob: Blob;
  previewBase64: string;
}

export interface ProofItem {
  id: string;
  fileBlob: Blob;
  previewBase64: string;
  title: string;
}

// Cover functions
export async function saveCover(item: CoverItem): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_COVER, 'readwrite');
    const store = tx.objectStore(STORE_COVER);
    const request = store.put(item);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

export async function getCover(): Promise<CoverItem | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_COVER, 'readonly');
    const store = tx.objectStore(STORE_COVER);
    const request = store.get('cover');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

export async function clearCover(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_COVER, 'readwrite');
    const store = tx.objectStore(STORE_COVER);
    const request = store.clear();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

// Proofs functions
export async function saveProof(item: ProofItem): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PROOFS, 'readwrite');
    const store = tx.objectStore(STORE_PROOFS);
    const request = store.put(item);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

export async function getAllProofs(): Promise<ProofItem[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PROOFS, 'readonly');
    const store = tx.objectStore(STORE_PROOFS);
    const request = store.getAll();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

export async function deleteProof(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PROOFS, 'readwrite');
    const store = tx.objectStore(STORE_PROOFS);
    const request = store.delete(id);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

export async function clearAllProofs(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PROOFS, 'readwrite');
    const store = tx.objectStore(STORE_PROOFS);
    const request = store.clear();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}