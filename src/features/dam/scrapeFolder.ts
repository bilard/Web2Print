// Nom du sous-dossier DAM (Drive) d'un scraping : le nom de la feuille, sinon le
// hostname de l'URL source. Source UNIQUE — utilisée à l'upload (rangement) ET à
// la suppression (corbeille par emplacement), pour garantir la correspondance.
export function scrapeFolderName(sheetName: string | undefined, sourceUrl: string | undefined): string {
  const name = (sheetName ?? '').trim()
  if (name && !/^feuille\s*\d*$/i.test(name)) return name
  if (sourceUrl) { try { return new URL(sourceUrl).hostname.replace(/^www\./, '') } catch { /* ignore */ } }
  return name || 'Scraping'
}
