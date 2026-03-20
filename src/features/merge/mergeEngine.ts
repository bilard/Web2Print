import type { MergeRow } from '@/stores/merge.store'

const PLACEHOLDER_RE = /\{\{(\w+)\}\}/g

/**
 * Extrait les noms de variables d'un template texte.
 * "Bonjour {{nom}}, {{poste}}" → ['nom', 'poste']
 */
export function extractVariables(template: string): string[] {
  const vars: string[] = []
  let match: RegExpExecArray | null
  PLACEHOLDER_RE.lastIndex = 0
  while ((match = PLACEHOLDER_RE.exec(template)) !== null) {
    if (!vars.includes(match[1])) vars.push(match[1])
  }
  return vars
}

/**
 * Détecte si un texte contient au moins un placeholder {{...}}
 */
export function hasPlaceholders(text: string): boolean {
  PLACEHOLDER_RE.lastIndex = 0
  return PLACEHOLDER_RE.test(text)
}

/**
 * Résout un template texte avec les valeurs d'une ligne.
 * "Bonjour {{nom}}" + { nom: "Dupont" } → "Bonjour Dupont"
 * Variables non trouvées : laissées telles quelles.
 */
export function resolveText(template: string, row: MergeRow): string {
  return template.replace(PLACEHOLDER_RE, (_, key: string) => {
    const value = row[key]
    if (value === undefined || value === null) return `{{${key}}}`
    return String(value)
  })
}

/**
 * Résout une valeur de binding propriété (fill, stroke, opacity, src).
 * Retourne la valeur de la colonne ou null si non trouvée.
 */
export function resolveBinding(columnKey: string, row: MergeRow): string | null {
  const value = row[columnKey]
  if (value === undefined || value === null) return null
  return String(value)
}

/**
 * Détermine si une valeur d'image est une URL ou un nom de fichier asset.
 */
export function isImageUrl(value: string): boolean {
  return value.startsWith('http://') || value.startsWith('https://')
}

/**
 * Sanitize un nom de fichier en remplaçant les caractères interdits.
 */
export function sanitizeFileName(name: string): string {
  const sanitized = name.replace(/[/\\:*?"<>|]/g, '_').trim()
  return sanitized || 'export'
}

/**
 * Résout un pattern de nommage avec les valeurs d'une ligne.
 * "carte_{{nom}}_{{poste}}" + row → "carte_Dupont_Designer"
 */
export function resolveFileName(pattern: string, row: MergeRow): string {
  const resolved = resolveText(pattern, row)
  return sanitizeFileName(resolved)
}
