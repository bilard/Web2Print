// src/features/workflows/runtime/fileStore.ts
// Persistent IndexedDB-backed store for Files uploaded via the Upload node.
// Files cannot be persisted in Firestore, so we keep them in IndexedDB on
// the user's device. They survive page reloads but stay local to the
// browser/profile.

const DB_NAME = 'designstudio_workflows'
const STORE_NAME = 'files'
const VERSION = 1

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function putFile(key: string, file: File): Promise<void> {
  const db = await openDb()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).put(file, key)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}

export async function getFile(key: string): Promise<File | null> {
  const db = await openDb()
  try {
    return await new Promise<File | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const req = tx.objectStore(STORE_NAME).get(key)
      req.onsuccess = () => resolve((req.result as File | undefined) ?? null)
      req.onerror = () => reject(req.error)
    })
  } finally {
    db.close()
  }
}

export async function deleteFile(key: string): Promise<void> {
  const db = await openDb()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).delete(key)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}

// Stored shape for folder uploads: each File keeps its relative path so the
// consumer (e.g. detectAssemblyFiles) can rebuild the directory structure.
interface StoredFolderEntry {
  file: File
  path: string
}

export async function putFiles(key: string, files: File[]): Promise<void> {
  const entries: StoredFolderEntry[] = files.map((f) => {
    const ff = f as File & { webkitRelativePath?: string; _path?: string }
    return { file: f, path: ff._path || ff.webkitRelativePath || f.name }
  })
  const db = await openDb()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).put(entries, key)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}

export async function getFiles(key: string): Promise<File[] | null> {
  const db = await openDb()
  try {
    return await new Promise<File[] | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const req = tx.objectStore(STORE_NAME).get(key)
      req.onsuccess = () => {
        const raw = req.result as StoredFolderEntry[] | undefined
        if (!raw || !Array.isArray(raw)) {
          resolve(null)
          return
        }
        const restored = raw.map((e) => {
          Object.defineProperty(e.file, '_path', { value: e.path, configurable: true })
          return e.file
        })
        resolve(restored)
      }
      req.onerror = () => reject(req.error)
    })
  } finally {
    db.close()
  }
}
