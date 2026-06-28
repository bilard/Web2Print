// src/features/dam/driveImageMatch.ts
// Logique pure de correspondance entre une valeur de cellule (nom de fichier,
// éventuellement préfixé d'un dossier et avec une extension différente) et un
// fichier image présent dans un dossier Google Drive.
//
// Exemple : cellule « img/246674928_tables-de-jardin-alto-792.jpg » doit matcher
// le fichier Drive « 246674928_tables-de-jardin-alto-792.png ».

export interface DriveImageFile {
  id: string
  name: string
  webViewLink: string
}

/** Nom de base normalisé : sans préfixe de dossier, sans extension, minuscule. */
export function normalizeBasename(s: string): string {
  const afterSlash = s.split(/[\\/]/).pop() ?? s
  return afterSlash.replace(/\.[a-z0-9]{2,5}$/i, '').trim().toLowerCase()
}

/** Identifiant numérique de tête (avant le premier « _ »), ou null. */
export function leadingId(s: string): string | null {
  const base = s.split(/[\\/]/).pop() ?? s
  const m = base.match(/^(\d{3,})/)
  return m ? m[1] : null
}

export interface DriveIndex {
  byBasename: Map<string, DriveImageFile>
  byId: Map<string, DriveImageFile>
}

/** Indexe les fichiers Drive par nom de base normalisé ET par ID numérique. */
export function buildDriveIndex(files: DriveImageFile[]): DriveIndex {
  const byBasename = new Map<string, DriveImageFile>()
  const byId = new Map<string, DriveImageFile>()
  for (const f of files) {
    const b = normalizeBasename(f.name)
    if (b && !byBasename.has(b)) byBasename.set(b, f)
    const id = leadingId(f.name)
    if (id && !byId.has(id)) byId.set(id, f)
  }
  return { byBasename, byId }
}

/** Cherche le fichier Drive correspondant à une valeur de cellule.
 *  Priorité au nom de base exact ; repli sur l'ID numérique de tête. */
export function matchCell(value: unknown, index: DriveIndex): DriveImageFile | null {
  if (typeof value !== 'string' || !value.trim()) return null
  const b = normalizeBasename(value)
  const byName = b ? index.byBasename.get(b) : undefined
  if (byName) return byName
  const id = leadingId(value)
  const byId = id ? index.byId.get(id) : undefined
  return byId ?? null
}
