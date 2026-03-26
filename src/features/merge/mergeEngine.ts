import type { MergeRow, FormulaConfig } from '@/stores/merge.store'

type FabricStyles = Record<number, Record<number, Record<string, unknown>>>

/**
 * Remappe les styles per-character après résolution des {{variables}}.
 * Pour chaque placeholder dans le template, étend le style du premier char
 * à tous les chars de la valeur résolue.
 */
export function remapStyles(
  templateText: string,
  templateStyles: FabricStyles,
  row: MergeRow,
  formulas?: Record<string, string>,
  hideLineIfEmpty?: Record<string, boolean>,
  formulaConfigs?: Record<string, FormulaConfig>,
): FabricStyles {
  const PH_RE = /\{\{([^}]+)\}\}/g
  const newStyles: FabricStyles = {}
  const templateLines = templateText.split('\n')
  const removedLines = new Set<number>()
  if (hideLineIfEmpty) {
    for (let li = 0; li < templateLines.length; li++) {
      let m: RegExpExecArray | null
      PH_RE.lastIndex = 0
      while ((m = PH_RE.exec(templateLines[li])) !== null) {
        const key = m[1]
        if (hideLineIfEmpty[key]) {
          const r = row[key]
          if (r == null || String(r).trim() === '') { removedLines.add(li); break }
        }
      }
    }
  }

  let outLineIdx = 0
  for (let lineIdx = 0; lineIdx < templateLines.length; lineIdx++) {
    if (removedLines.has(lineIdx)) continue
    const tLine = templateLines[lineIdx]
    const lineStyles = templateStyles[lineIdx]

    const phs: { start: number; end: number; key: string }[] = []
    let m: RegExpExecArray | null
    PH_RE.lastIndex = 0
    while ((m = PH_RE.exec(tLine)) !== null) {
      phs.push({ start: m.index, end: m.index + m[0].length, key: m[1] })
    }

    if (phs.length === 0) {
      if (lineStyles) newStyles[outLineIdx] = { ...lineStyles }
      outLineIdx++
      continue
    }

    const newLine: Record<number, Record<string, unknown>> = {}
    let tPos = 0
    let rPos = 0

    for (const ph of phs) {
      while (tPos < ph.start) {
        if (lineStyles?.[tPos]) newLine[rPos] = { ...lineStyles[tPos] }
        tPos++
        rPos++
      }

      let value = formulas?.[ph.key]
        ? evaluateFormula(formulas[ph.key], row)
        : String(row[ph.key] ?? `{{${ph.key}}}`)
      if (formulas?.[ph.key] && formulaConfigs) {
        value = formatFormulaResult(value, formulaConfigs[ph.key])
      }

      // Appliquer le style du placeholder à tous les caractères résolus
      const phStyle = lineStyles?.[ph.start]
      for (let i = 0; i < value.length; i++) {
        if (phStyle) newLine[rPos + i] = { ...phStyle }
      }

      tPos = ph.end
      rPos += value.length
    }

    while (tPos < tLine.length) {
      if (lineStyles?.[tPos]) newLine[rPos] = { ...lineStyles[tPos] }
      tPos++
      rPos++
    }

    if (Object.keys(newLine).length > 0) newStyles[outLineIdx] = newLine
    outLineIdx++
  }

  return newStyles
}

const PLACEHOLDER_RE = /\{\{([^}]+)\}\}/g

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
 * Évalue une formule en remplaçant les [colonne] par les valeurs de la ligne.
 * Supporte : texte littéral, [colonne], UPPER(), LOWER(), TRIM(), LEFT(n), RIGHT(n)
 *
 * Exemples :
 *   '"[brands]"'           → '"LYNDA"'
 *   'UPPER([brands])'      → 'LYNDA'
 *   '[Libelle Article] - [brands]' → 'Crème nettoyant - LYNDA'
 *   'LEFT([code], 3)'      → 'ABC'
 */
const COL_REF_RE = /\[([^\]]+)\]/g

export function evaluateFormula(formula: string, row: MergeRow): string {
  // Step 1: Replace [column] references with values
  let result = formula.replace(COL_REF_RE, (_, colKey: string) => {
    const val = row[colKey]
    if (val === undefined || val === null) return ''
    return String(val)
  })

  // Step 2: Apply functions (simple pattern matching)
  // UPPER(text)
  result = result.replace(/UPPER\(([^)]*)\)/gi, (_, inner) => inner.toUpperCase())
  // LOWER(text)
  result = result.replace(/LOWER\(([^)]*)\)/gi, (_, inner) => inner.toLowerCase())
  // TRIM(text)
  result = result.replace(/TRIM\(([^)]*)\)/gi, (_, inner) => inner.trim())
  // LEFT(text, n)
  result = result.replace(/LEFT\(([^,]*),\s*(\d+)\)/gi, (_, inner, n) => inner.slice(0, parseInt(n)))
  // RIGHT(text, n)
  result = result.replace(/RIGHT\(([^,]*),\s*(\d+)\)/gi, (_, inner, n) => inner.slice(-parseInt(n)))
  // REPLACE(text, search, replace)
  result = result.replace(/REPLACE\(([^,]*),\s*"([^"]*)",\s*"([^"]*)"\)/gi, (_, inner, search, rep) =>
    inner.split(search).join(rep)
  )

  return result
}

/**
 * Formate la valeur d'une formule selon le type résultat et le nombre de décimales.
 */
export function formatFormulaResult(value: string, config: FormulaConfig | undefined): string {
  if (!config || config.resultType !== 'number') return value
  const num = parseFloat(value.replace(',', '.'))
  if (isNaN(num)) return value
  const decimals = config.decimals ?? 0
  return num.toFixed(decimals)
}

/**
 * Résout un template texte avec les valeurs d'une ligne.
 * Si une formule existe pour une variable, elle est évaluée à la place de la valeur brute.
 * "Bonjour {{nom}}" + { nom: "Dupont" } → "Bonjour Dupont"
 * Variables non trouvées : laissées telles quelles.
 */
export function resolveText(
  template: string,
  row: MergeRow,
  formulas?: Record<string, string>,
  hideLineIfEmpty?: Record<string, boolean>,
  formulaConfigs?: Record<string, FormulaConfig>,
): string {
  // Phase 1 : résoudre les variables, tracker les lignes avec valeurs vides
  const linesToRemove = new Set<number>()
  const lines = template.split('\n')

  const resolvedLines = lines.map((line, lineIdx) => {
    return line.replace(PLACEHOLDER_RE, (match, key: string) => {
      let value: string
      if (formulas && formulas[key]) {
        value = evaluateFormula(formulas[key], row)
        value = formatFormulaResult(value, formulaConfigs?.[key])
      } else {
        const raw = row[key]
        if (raw === undefined || raw === null) return match
        value = String(raw)
      }

      // Si la valeur brute de la colonne est vide et l'option "supprimer ligne" est active → marquer la ligne
      // On vérifie la valeur brute (pas le résultat de la formule) car une formule comme `"[brands]"`
      // donne `""` quand brands est vide, ce qui n'est pas techniquement vide.
      const rawVal = row[key]
      const rawIsEmpty = rawVal === undefined || rawVal === null || String(rawVal).trim() === ''
      if (rawIsEmpty && hideLineIfEmpty?.[key]) {
        linesToRemove.add(lineIdx)
      }

      return value
    })
  })

  // Phase 2 : supprimer les lignes marquées
  if (linesToRemove.size > 0) {
    return resolvedLines.filter((_, i) => !linesToRemove.has(i)).join('\n')
  }
  return resolvedLines.join('\n')
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
