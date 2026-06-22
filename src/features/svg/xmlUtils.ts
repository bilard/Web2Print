/** Échappe les caractères XML/HTML spéciaux pour une insertion sûre dans du SVG. */
export const escapeXml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Normalise un nom de fichier en slug ASCII (≤ 40 car.) ; `fallback` si vide. */
export const slugifyFileName = (name: string, fallback: string): string =>
  name
    .toLowerCase()
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || fallback
