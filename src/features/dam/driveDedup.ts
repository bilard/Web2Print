// src/features/dam/driveDedup.ts
// Planification pure de la déduplication d'un dossier Drive par CONTENU (md5).
// Deux fichiers au même md5Checksum = octets identiques → doublons. On garde le
// plus ancien de chaque groupe (par createdTime, repli modifiedTime), les autres
// partent à la corbeille (récupérable).

export interface DedupFile {
  id: string
  name: string
  md5Checksum?: string
  createdTime?: string
  modifiedTime?: string
}

export interface DedupPlan {
  groups: { md5: string; keep: DedupFile; remove: DedupFile[] }[]
  removeIds: string[]
  scanned: number   // fichiers examinés (hors dossiers)
  hashed: number    // fichiers avec une empreinte md5 (binaires)
  duplicates: number // nombre de fichiers à mettre en corbeille
}

/** Horodatage de référence (le plus ancien gagne). Sans date → +∞ (donc retiré
 *  en priorité, jamais conservé au détriment d'un fichier daté). */
function refTime(f: DedupFile): number {
  const t = f.createdTime || f.modifiedTime
  const n = t ? Date.parse(t) : NaN
  return Number.isNaN(n) ? Number.POSITIVE_INFINITY : n
}

export function planDedup(files: DedupFile[]): DedupPlan {
  const byHash = new Map<string, DedupFile[]>()
  let hashed = 0
  for (const f of files) {
    if (!f.md5Checksum) continue
    hashed++
    const arr = byHash.get(f.md5Checksum)
    if (arr) arr.push(f)
    else byHash.set(f.md5Checksum, [f])
  }

  const groups: DedupPlan['groups'] = []
  const removeIds: string[] = []
  for (const [md5, arr] of byHash) {
    if (arr.length < 2) continue
    const sorted = [...arr].sort((a, b) => refTime(a) - refTime(b) || a.id.localeCompare(b.id))
    const keep = sorted[0]
    const remove = sorted.slice(1)
    groups.push({ md5, keep, remove })
    for (const r of remove) removeIds.push(r.id)
  }
  // Plus gros groupes en tête pour l'aperçu.
  groups.sort((a, b) => b.remove.length - a.remove.length)
  return { groups, removeIds, scanned: files.length, hashed, duplicates: removeIds.length }
}
