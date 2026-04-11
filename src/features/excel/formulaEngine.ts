import type { ExcelColumn, CellValue } from './types'

// --- Types ---

export type FormulaCategory = 'logique' | 'texte' | 'math' | 'date'

interface FormulaFunction {
  name: string
  description: string
  syntax: string
  examples: { formula: string; result: string }[]
  category: FormulaCategory
  evaluate: (...args: any[]) => CellValue
}

// --- Function definitions ---

export const FORMULA_FUNCTIONS: FormulaFunction[] = [
  {
    name: 'SI',
    description: 'Retourne une valeur si la condition est vraie, une autre sinon',
    syntax: 'SI(condition, valeur_vrai, valeur_faux)',
    examples: [
      { formula: 'SI([Prix] > 100, "Cher", "Abordable")', result: '"Cher" ou "Abordable"' },
      { formula: 'SI([Stock] == 0, "Rupture", [Stock])', result: '"Rupture" ou la valeur du stock' },
      { formula: 'SI([Note] >= 10, "Admis", "Refusé")', result: '"Admis" si note >= 10' },
    ],
    category: 'logique',
    evaluate: (condition: any, vTrue: any, vFalse: any) => (condition ? vTrue : vFalse),
  },
  {
    name: 'CONCAT',
    description: 'Concatène plusieurs textes en un seul',
    syntax: 'CONCAT(val1, val2, ...)',
    examples: [
      { formula: 'CONCAT([Prénom], " ", [Nom])', result: '"Jean Dupont"' },
      { formula: 'CONCAT("Total: ", [Prix], " €")', result: '"Total: 42 €"' },
    ],
    category: 'texte',
    evaluate: (...args: any[]) => args.map((a) => (a === null || a === undefined ? '' : String(a))).join(''),
  },
  {
    name: 'ADDITION',
    description: 'Additionne deux nombres',
    syntax: 'ADDITION(a, b)',
    examples: [
      { formula: 'ADDITION([Prix], [Taxe])', result: 'Somme des deux colonnes' },
      { formula: 'ADDITION(10, 5)', result: '15' },
    ],
    category: 'math',
    evaluate: (a: any, b: any) => toNum(a) + toNum(b),
  },
  {
    name: 'SOUSTRACTION',
    description: 'Soustrait le deuxième nombre du premier',
    syntax: 'SOUSTRACTION(a, b)',
    examples: [
      { formula: 'SOUSTRACTION([Prix], [Remise])', result: 'Prix moins remise' },
      { formula: 'SOUSTRACTION(100, 30)', result: '70' },
    ],
    category: 'math',
    evaluate: (a: any, b: any) => toNum(a) - toNum(b),
  },
  {
    name: 'MULTIPLICATION',
    description: 'Multiplie deux nombres',
    syntax: 'MULTIPLICATION(a, b)',
    examples: [
      { formula: 'MULTIPLICATION([Quantité], [PrixUnit])', result: 'Quantité x prix unitaire' },
      { formula: 'MULTIPLICATION(6, 7)', result: '42' },
    ],
    category: 'math',
    evaluate: (a: any, b: any) => toNum(a) * toNum(b),
  },
  {
    name: 'DIVISION',
    description: 'Divise le premier nombre par le deuxième',
    syntax: 'DIVISION(a, b)',
    examples: [
      { formula: 'DIVISION([Total], [Quantité])', result: 'Prix moyen par unité' },
      { formula: 'DIVISION(100, 4)', result: '25' },
    ],
    category: 'math',
    evaluate: (a: any, b: any) => {
      const d = toNum(b)
      return d === 0 ? '#ERREUR: division par zéro' : toNum(a) / d
    },
  },
  {
    name: 'REMPLACE',
    description: 'Remplace une portion de texte par un autre',
    syntax: 'REMPLACE(texte, ancien, nouveau)',
    examples: [
      { formula: 'REMPLACE([Nom], "Sr", "Jr")', result: 'Texte avec remplacement' },
      { formula: 'REMPLACE("Bonjour", "jour", "soir")', result: '"Bonsoir"' },
    ],
    category: 'texte',
    evaluate: (text: any, old: any, rep: any) => String(text ?? '').split(String(old ?? '')).join(String(rep ?? '')),
  },
  {
    name: 'MAJUSCULE',
    description: 'Convertit le texte en majuscules',
    syntax: 'MAJUSCULE(texte)',
    examples: [
      { formula: 'MAJUSCULE([Nom])', result: '"DUPONT"' },
      { formula: 'MAJUSCULE("bonjour")', result: '"BONJOUR"' },
    ],
    category: 'texte',
    evaluate: (text: any) => String(text ?? '').toUpperCase(),
  },
  {
    name: 'MINUSCULE',
    description: 'Convertit le texte en minuscules',
    syntax: 'MINUSCULE(texte)',
    examples: [
      { formula: 'MINUSCULE([Nom])', result: '"dupont"' },
      { formula: 'MINUSCULE("BONJOUR")', result: '"bonjour"' },
    ],
    category: 'texte',
    evaluate: (text: any) => String(text ?? '').toLowerCase(),
  },
  {
    name: 'ARRONDI',
    description: 'Arrondit un nombre au nombre de décimales spécifié',
    syntax: 'ARRONDI(nombre, décimales)',
    examples: [
      { formula: 'ARRONDI([Prix], 2)', result: 'Prix arrondi à 2 décimales' },
      { formula: 'ARRONDI(3.14159, 2)', result: '3.14' },
    ],
    category: 'math',
    evaluate: (n: any, d: any) => {
      const decimals = Math.max(0, Math.floor(toNum(d)))
      return parseFloat(toNum(n).toFixed(decimals))
    },
  },
  {
    name: 'GAUCHE',
    description: 'Extrait les N premiers caractères d\'un texte',
    syntax: 'GAUCHE(texte, n)',
    examples: [
      { formula: 'GAUCHE([Code], 3)', result: 'Les 3 premiers caractères' },
      { formula: 'GAUCHE("Bonjour", 3)', result: '"Bon"' },
    ],
    category: 'texte',
    evaluate: (text: any, n: any) => String(text ?? '').slice(0, Math.max(0, toNum(n))),
  },
  {
    name: 'DROITE',
    description: 'Extrait les N derniers caractères d\'un texte',
    syntax: 'DROITE(texte, n)',
    examples: [
      { formula: 'DROITE([Code], 4)', result: 'Les 4 derniers caractères' },
      { formula: 'DROITE("Bonjour", 4)', result: '"jour"' },
    ],
    category: 'texte',
    evaluate: (text: any, n: any) => {
      const s = String(text ?? '')
      const count = Math.max(0, toNum(n))
      return s.slice(-count)
    },
  },
  {
    name: 'LONGUEUR',
    description: 'Retourne la longueur d\'un texte',
    syntax: 'LONGUEUR(texte)',
    examples: [
      { formula: 'LONGUEUR([Nom])', result: 'Nombre de caractères' },
      { formula: 'LONGUEUR("Bonjour")', result: '7' },
    ],
    category: 'texte',
    evaluate: (text: any) => String(text ?? '').length,
  },
  {
    name: 'ABS',
    description: 'Retourne la valeur absolue d\'un nombre',
    syntax: 'ABS(nombre)',
    examples: [
      { formula: 'ABS([Solde])', result: 'Valeur positive du solde' },
      { formula: 'ABS(-42)', result: '42' },
    ],
    category: 'math',
    evaluate: (n: any) => Math.abs(toNum(n)),
  },
  {
    name: 'MAX',
    description: 'Retourne le plus grand des deux nombres',
    syntax: 'MAX(a, b)',
    examples: [
      { formula: 'MAX([Prix1], [Prix2])', result: 'Le prix le plus élevé' },
      { formula: 'MAX(10, 25)', result: '25' },
    ],
    category: 'math',
    evaluate: (a: any, b: any) => Math.max(toNum(a), toNum(b)),
  },
  {
    name: 'MIN',
    description: 'Retourne le plus petit des deux nombres',
    syntax: 'MIN(a, b)',
    examples: [
      { formula: 'MIN([Prix1], [Prix2])', result: 'Le prix le plus bas' },
      { formula: 'MIN(10, 25)', result: '10' },
    ],
    category: 'math',
    evaluate: (a: any, b: any) => Math.min(toNum(a), toNum(b)),
  },
  {
    name: 'MOYENNE',
    description: 'Calcule la moyenne de deux nombres',
    syntax: 'MOYENNE(a, b)',
    examples: [
      { formula: 'MOYENNE([Note1], [Note2])', result: 'Moyenne des deux notes' },
      { formula: 'MOYENNE(10, 20)', result: '15' },
    ],
    category: 'math',
    evaluate: (a: any, b: any) => (toNum(a) + toNum(b)) / 2,
  },
  {
    name: 'MAINTENANT',
    description: 'Retourne la date et l\'heure actuelles',
    syntax: 'MAINTENANT()',
    examples: [
      { formula: 'MAINTENANT()', result: '"15/03/2026 14:30"' },
      { formula: 'CONCAT("Mis à jour: ", MAINTENANT())', result: '"Mis à jour: 15/03/2026 14:30"' },
    ],
    category: 'date',
    evaluate: () => new Date().toLocaleString('fr-FR'),
  },
]

// --- Helpers ---

function toNum(v: any): number {
  if (typeof v === 'number') return v
  if (typeof v === 'string') {
    const cleaned = v.replace(/[€$%\s]/g, '').replace(',', '.')
    const n = parseFloat(cleaned)
    return isNaN(n) ? 0 : n
  }
  return 0
}

const FUNC_MAP = new Map(FORMULA_FUNCTIONS.map((f) => [f.name, f]))

// --- Parser & Evaluator ---

/** Check if a formula is a pure expression (functions, operators, numbers, field refs, quoted strings)
 *  vs a template containing literal text between field references */
function isExpressionFormula(formula: string): boolean {
  // Strip [field] references and quoted strings
  let stripped = formula.replace(/\[([^\]]+)\]/g, '')
  stripped = stripped.replace(/"([^"\\]|\\.)*"/g, '')
  // What remains should only be: operators, numbers, function names, parens, commas, whitespace
  // If there are other characters, it's a template
  stripped = stripped.trim()
  if (!stripped) return true
  // Allow: operators, digits, dots, parens, commas, whitespace, and known function names
  const funcNames = FORMULA_FUNCTIONS.map((f) => f.name).join('|')
  const exprPattern = new RegExp(`^[\\s+\\-*\\/(),><=!.\\d]|(?:${funcNames})`, 'i')
  // Check each non-whitespace segment
  const segments = stripped.split(/\s+/).filter(Boolean)
  return segments.every((seg) => {
    if (/^[+\-*\/(),><=!]+$/.test(seg)) return true
    if (/^\d+\.?\d*$/.test(seg)) return true
    if (FUNC_MAP.has(seg.toUpperCase())) return true
    if (['true', 'false'].includes(seg.toLowerCase())) return true
    return false
  })
}

/** Resolve a template formula: concatenate literal text + field values */
function resolveTemplate(
  formula: string,
  row: Record<string, any>,
  columns: ExcelColumn[],
): CellValue {
  const fieldRegex = /\[([^\]]+)\]/g
  let result = ''
  let lastIdx = 0
  let match

  while ((match = fieldRegex.exec(formula)) !== null) {
    // Append literal text before this field ref
    if (match.index > lastIdx) {
      result += formula.slice(lastIdx, match.index)
    }
    // Resolve field value
    const label = match[1]
    const col = columns.find((c) => c.label === label || c.key === label)
    if (col) {
      const val = row[col.key]
      if (val !== null && val !== undefined) result += String(val)
    }
    lastIdx = match.index + match[0].length
  }

  // Append remaining text after last field ref
  if (lastIdx < formula.length) {
    result += formula.slice(lastIdx)
  }

  return result
}

/** Replace [column_label] references with actual row values (expression mode) */
function resolveColumnRefs(
  formula: string,
  row: Record<string, any>,
  columns: ExcelColumn[],
): string {
  return formula.replace(/\[([^\]]+)\]/g, (_match, label: string) => {
    const col = columns.find((c) => c.label === label || c.key === label)
    if (!col) return '""'
    const val = row[col.key]
    if (val === null || val === undefined) return '""'
    if (typeof val === 'number') return String(val)
    return `"${String(val).replace(/"/g, '\\"')}"`
  })
}

/** Parse a token stream and evaluate the expression */
function parseExpression(tokens: string[], pos: { i: number }): any {
  let left = parseUnary(tokens, pos)

  while (pos.i < tokens.length) {
    const op = tokens[pos.i]
    if (['+', '-', '*', '/', '>', '<', '>=', '<=', '==', '!='].includes(op)) {
      pos.i++
      const right = parseUnary(tokens, pos)
      left = applyOp(op, left, right)
    } else {
      break
    }
  }
  return left
}

function parseUnary(tokens: string[], pos: { i: number }): any {
  if (tokens[pos.i] === '-') {
    pos.i++
    return -toNum(parsePrimary(tokens, pos))
  }
  return parsePrimary(tokens, pos)
}

function parsePrimary(tokens: string[], pos: { i: number }): any {
  const token = tokens[pos.i]
  if (token === undefined) return ''

  // Parenthesized expression
  if (token === '(') {
    pos.i++
    const val = parseExpression(tokens, pos)
    if (tokens[pos.i] === ')') pos.i++
    return val
  }

  // String literal
  if (token.startsWith('"')) {
    pos.i++
    return token.slice(1, -1).replace(/\\"/g, '"')
  }

  // Number literal
  const num = parseFloat(token)
  if (!isNaN(num) && /^-?\d+(\.\d+)?$/.test(token)) {
    pos.i++
    return num
  }

  // Function call: NAME(args...)
  const funcDef = FUNC_MAP.get(token.toUpperCase())
  if (funcDef && tokens[pos.i + 1] === '(') {
    pos.i += 2 // skip name and (
    const args: any[] = []
    while (pos.i < tokens.length && tokens[pos.i] !== ')') {
      if (tokens[pos.i] === ',') { pos.i++; continue }
      args.push(parseExpression(tokens, pos))
    }
    if (tokens[pos.i] === ')') pos.i++
    return funcDef.evaluate(...args)
  }

  // Boolean
  if (token.toLowerCase() === 'true') { pos.i++; return true }
  if (token.toLowerCase() === 'false') { pos.i++; return false }

  // Fallback: treat as string
  pos.i++
  return token
}

function isNumeric(v: any): boolean {
  if (typeof v === 'number') return true
  if (typeof v === 'string') {
    const cleaned = v.replace(/[€$%\s]/g, '').replace(',', '.')
    return !isNaN(parseFloat(cleaned)) && cleaned.trim() !== ''
  }
  return false
}

function applyOp(op: string, a: any, b: any): any {
  switch (op) {
    case '+': {
      // Both numeric → arithmetic addition
      if (isNumeric(a) && isNumeric(b)) return toNum(a) + toNum(b)
      // At least one is text → concatenation
      return String(a ?? '') + String(b ?? '')
    }
    case '-': return toNum(a) - toNum(b)
    case '*': return toNum(a) * toNum(b)
    case '/': { const nb = toNum(b); return nb === 0 ? '#ERREUR: division par zéro' : toNum(a) / nb }
    case '>': return toNum(a) > toNum(b)
    case '<': return toNum(a) < toNum(b)
    case '>=': return toNum(a) >= toNum(b)
    case '<=': return toNum(a) <= toNum(b)
    case '==': return String(a) === String(b)
    case '!=': return String(a) !== String(b)
    default: return a
  }
}

/** Tokenize a resolved formula string */
function tokenize(expr: string): string[] {
  const tokens: string[] = []
  let i = 0
  while (i < expr.length) {
    // Skip whitespace
    if (/\s/.test(expr[i])) { i++; continue }

    // String literal
    if (expr[i] === '"') {
      let s = '"'
      i++
      while (i < expr.length && expr[i] !== '"') {
        if (expr[i] === '\\' && i + 1 < expr.length) { s += expr[i] + expr[i + 1]; i += 2 }
        else { s += expr[i]; i++ }
      }
      s += '"'
      i++ // closing quote
      tokens.push(s)
      continue
    }

    // Multi-char operators
    if (i + 1 < expr.length && ['>=', '<=', '==', '!='].includes(expr[i] + expr[i + 1])) {
      tokens.push(expr[i] + expr[i + 1])
      i += 2
      continue
    }

    // Single-char operators / delimiters
    if ('()+-*/>,<'.includes(expr[i])) {
      tokens.push(expr[i])
      i++
      continue
    }

    // Number
    if (/[\d.]/.test(expr[i])) {
      let num = ''
      while (i < expr.length && /[\d.]/.test(expr[i])) { num += expr[i]; i++ }
      tokens.push(num)
      continue
    }

    // Identifier (function name, etc.)
    if (/[a-zA-ZÀ-ÿ_]/.test(expr[i])) {
      let id = ''
      while (i < expr.length && /[a-zA-ZÀ-ÿ_0-9]/.test(expr[i])) { id += expr[i]; i++ }
      tokens.push(id)
      continue
    }

    i++ // skip unknown chars
  }
  return tokens
}

// --- Public API ---

export function evaluateFormula(
  formula: string,
  row: Record<string, any>,
  columns: ExcelColumn[],
): CellValue {
  try {
    if (!formula || !formula.trim()) return ''

    // Template mode: literal text between [field] refs is preserved as-is
    if (!isExpressionFormula(formula)) {
      return resolveTemplate(formula, row, columns)
    }

    // Expression mode: parse and evaluate
    const resolved = resolveColumnRefs(formula, row, columns)
    const tokens = tokenize(resolved)
    if (tokens.length === 0) return ''
    const pos = { i: 0 }
    const result = parseExpression(tokens, pos)
    if (result === null || result === undefined) return ''
    return result as CellValue
  } catch {
    return '#ERREUR'
  }
}
