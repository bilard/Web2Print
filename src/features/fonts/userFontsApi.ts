// src/features/fonts/userFontsApi.ts
// Polices utilisateur (« Mes polices ») : fichier dans Storage users/{uid}/fonts/,
// méta dans Firestore users/{uid}/userFonts — upsert par famille (slug).
import { collection, deleteDoc, doc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore'
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { auth, db, storage } from '@/lib/firebase/config'

export interface UserFont {
  id: string
  /** Nom de famille CSS (dérivé du nom de fichier ou de l'URL Google Fonts). */
  family: string
  /** Fichier uploadé : downloadURL Storage. Police Google : '' (chargée par stylesheet). */
  url: string
  storagePath: string
  /** 'file' = fichier uploadé ; 'google' = famille Google Fonts ajoutée par URL/nom. */
  kind: 'file' | 'google'
}

const FONT_EXTS = ['woff2', 'woff', 'ttf', 'otf']
const MAX_FONT_BYTES = 4 * 1024 * 1024

/** « Helvetica-Now_Bold.woff2 » → « Helvetica Now Bold ». */
function fontFamilyFromFileName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function slugify(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'font'
}

const colPath = (uid: string) => collection(db, 'users', uid, 'userFonts')

export async function listUserFonts(): Promise<UserFont[]> {
  const uid = auth.currentUser?.uid
  if (!uid) return []
  const snap = await getDocs(colPath(uid))
  return snap.docs
    .map((d) => ({
      id: d.id, family: String(d.data().family ?? ''), url: String(d.data().url ?? ''),
      storagePath: String(d.data().storagePath ?? ''),
      kind: (d.data().kind === 'google' ? 'google' : 'file') as UserFont['kind'],
    }))
    .filter((f) => f.family && (f.kind === 'google' || f.url))
    .sort((a, b) => a.family.localeCompare(b.family))
}

/**
 * Extrait la famille d'une entrée Google Fonts : URL specimen
 * (fonts.google.com/specimen/Open+Sans), URL css2 (…css2?family=Open+Sans:wght@…),
 * ou nom saisi tel quel. Lève si rien d'exploitable.
 */
export function parseGoogleFontFamily(input: string): string {
  const raw = input.trim()
  if (!raw) throw new Error('Collez une URL Google Fonts ou un nom de police')
  let m = raw.match(/fonts\.google\.com\/specimen\/([^/?#]+)/i)
  if (m) return decodeURIComponent(m[1]).replace(/\+/g, ' ').trim()
  m = raw.match(/[?&]family=([^:&]+)/i)
  if (m) return decodeURIComponent(m[1]).replace(/\+/g, ' ').trim()
  if (/^https?:/i.test(raw)) throw new Error('URL non reconnue — utilisez le lien fonts.google.com ou fonts.googleapis.com')
  return raw.replace(/\s+/g, ' ')
}

/** Ajoute une famille Google Fonts (upsert par famille). */
export async function addGoogleFont(input: string): Promise<UserFont> {
  const uid = auth.currentUser?.uid
  if (!uid) throw new Error('Non connecté')
  const family = parseGoogleFontFamily(input)
  const id = slugify(family)
  await setDoc(doc(db, 'users', uid, 'userFonts', id), { family, url: '', storagePath: '', kind: 'google', createdAt: serverTimestamp() })
  return { id, family, url: '', storagePath: '', kind: 'google' }
}

/** Upload + méta (upsert par famille). Rejette les extensions inconnues et les fichiers > 4 Mo. */
export async function uploadUserFont(file: File): Promise<UserFont> {
  const uid = auth.currentUser?.uid
  if (!uid) throw new Error('Non connecté')
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (!FONT_EXTS.includes(ext)) throw new Error(`Format non géré (.${ext}) — utilisez ${FONT_EXTS.map((e) => `.${e}`).join(', ')}`)
  if (file.size > MAX_FONT_BYTES) throw new Error('Fichier trop lourd (max 4 Mo)')
  const family = fontFamilyFromFileName(file.name)
  const id = slugify(family)
  const storagePath = `users/${uid}/fonts/${id}.${ext}`
  await uploadBytes(ref(storage, storagePath), file)
  const url = await getDownloadURL(ref(storage, storagePath))
  await setDoc(doc(db, 'users', uid, 'userFonts', id), { family, url, storagePath, kind: 'file', createdAt: serverTimestamp() })
  return { id, family, url, storagePath, kind: 'file' }
}

export async function deleteUserFont(font: UserFont): Promise<void> {
  const uid = auth.currentUser?.uid
  if (!uid) return
  // L'objet Storage peut manquer (police Google, nettoyage manuel) : la méta part quand même.
  if (font.storagePath) {
    try { await deleteObject(ref(storage, font.storagePath)) } catch { /* méta supprimée ci-dessous */ }
  }
  await deleteDoc(doc(db, 'users', uid, 'userFonts', font.id))
}
