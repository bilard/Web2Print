// functions/src/workflow/nodes/serverFile.ts
// Représentation HEADLESS d'un fichier produit par un node de workflow.
// Côté serveur il n'existe pas de `File`/`Blob` navigateur : les nodes qui
// produisent un fichier (ex : `cost-report`) émettent un ServerFile, et les
// consommateurs (`gdrive-export`, `send-gmail` en pièce jointe « source ») le
// lisent via asServerFile(). Contrat 100 % JSON-sérialisable → survit aux
// checkpoints Firestore (saveNodeOutput) et aux aperçus live (writeRunLive).

export interface ServerFile {
  name: string
  mimeType: string
  /** Contenu encodé en base64 standard (pas base64url). */
  base64: string
}

/** Fabrique un ServerFile depuis une chaîne UTF-8 ou un Buffer. */
export function makeServerFile(name: string, mimeType: string, content: string | Buffer): ServerFile {
  const buf = typeof content === 'string' ? Buffer.from(content, 'utf8') : content
  return { name, mimeType, base64: buf.toString('base64') }
}

/** Normalise une valeur d'entrée arbitraire en ServerFile, ou null si ce n'en est pas un. */
export function asServerFile(v: unknown): ServerFile | null {
  if (!v || typeof v !== 'object') return null
  const f = v as Partial<ServerFile>
  if (typeof f.base64 !== 'string' || f.base64.length === 0) return null
  return {
    name: typeof f.name === 'string' && f.name ? f.name : 'fichier.bin',
    mimeType: typeof f.mimeType === 'string' && f.mimeType ? f.mimeType : 'application/octet-stream',
    base64: f.base64,
  }
}
