// Helpers pour traiter les drops de dossiers via l'API File System Entry.
// Utilisé par ImportPanel et le node Upload du WorkflowEditor.

type FsEntry = {
  isFile: boolean
  isDirectory: boolean
  fullPath: string
  file?: (cb: (f: File) => void, err?: (e: unknown) => void) => void
  createReader?: () => { readEntries: (cb: (entries: FsEntry[]) => void, err?: (e: unknown) => void) => void }
}

async function readEntriesAll(reader: { readEntries: (cb: (entries: FsEntry[]) => void) => void }): Promise<FsEntry[]> {
  const all: FsEntry[] = []
  while (true) {
    const batch = await new Promise<FsEntry[]>((resolve) => reader.readEntries(resolve))
    if (!batch.length) break
    all.push(...batch)
  }
  return all
}

async function entryToFiles(entry: FsEntry): Promise<File[]> {
  if (entry.isFile && entry.file) {
    const file = await new Promise<File>((resolve, reject) => entry.file!(resolve, reject))
    const path = entry.fullPath.replace(/^\//, '')
    Object.defineProperty(file, '_path', { value: path, configurable: true })
    return [file]
  }
  if (entry.isDirectory && entry.createReader) {
    const children = await readEntriesAll(entry.createReader())
    const nested = await Promise.all(children.map(entryToFiles))
    return nested.flat()
  }
  return []
}

/** Récupère tous les fichiers d'un drag-and-drop, en descendant dans les sous-dossiers. */
export async function traverseDataTransfer(items: DataTransferItemList): Promise<File[]> {
  const entries: FsEntry[] = []
  for (let i = 0; i < items.length; i++) {
    const item = items[i] as DataTransferItem & { webkitGetAsEntry?: () => FsEntry | null }
    const entry = item.webkitGetAsEntry?.()
    if (entry) entries.push(entry)
  }
  const collected = await Promise.all(entries.map(entryToFiles))
  return collected.flat()
}

/** Indique si le drop transfert contient au moins un dossier. */
export function dataTransferHasDirectory(items: DataTransferItemList | null | undefined): boolean {
  if (!items) return false
  return Array.from(items).some((it) => {
    const entry = (it as DataTransferItem & { webkitGetAsEntry?: () => FsEntry | null }).webkitGetAsEntry?.()
    return entry?.isDirectory === true
  })
}
