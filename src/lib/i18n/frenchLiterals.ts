/**
 * Détecteur de PROSE FRANÇAISE dans un fragment de code — outil des garde-fous
 * i18n (`runMessagesWiring.test.ts`, `userMessages.test.ts`).
 *
 * Il vit hors des fichiers de test parce que DEUX garde-fous s'en servent : le
 * dupliquer déclencherait `npm run dup`, et une copie qui dérive de l'autre est
 * exactement le piège documenté pour les forks de scraping.
 */

/** Ponctuation, chiffres, séparateurs : jamais du texte à traduire. */
const NO_WORDS = /^[\s\d\p{P}\p{S}·—–…×≥°%]*$/u

/** Un accent = du français, sans discussion possible. */
const ACCENTED = /[àâäéèêëîïôöùûüÿçÀÂÄÉÈÊËÎÏÔÖÙÛÜŸÇ]/

/** Une phrase : au moins deux mots, dont un de 3 lettres ou plus. */
const SENTENCE = /[A-Za-z]{3,}[^\S\n]+\S/

/**
 * Mots français fréquents, pour les cas SANS accent ni espace.
 *
 * ⚠️ Cette liste est la LEÇON la plus chère du chantier : « Aucune base
 * selectionnee », « Configure le bot token », « Choisis au moins un site » ont
 * traversé plusieurs passes parce que tout contrôle reposait sur les accents.
 * Du français sans accent existe, et il s'affiche à l'écran comme les autres.
 */
const FRENCH = new RegExp(
  '\\b(aucun|aucune|produit|produits|feuille|colonne|ligne|lignes|prix|rapport|erreur|echec' +
  '|termine|introuvable|manquant|vide|trouve|enregistre|moisson|budget|cycle|balayage' +
  '|configure|choisis|selectionne|impossible|veuillez|cliquez|supprime|creer|creee' +
  '|sauvegarde|chargement|suppression|duplication|renommage)\\b',
  'i',
)

/**
 * Littéraux d'un fragment de code : simples quotes, doubles quotes, gabarits.
 * Pour un gabarit on ne garde que les portions LITTÉRALES ; l'intérieur des
 * `${…}` est du code, rescanné à son tour (`sites.join(', ')` y est un littéral
 * légitime).
 *
 * ⚠️ C'est un BALAYAGE, pas une regex, pour une raison vécue : les COMMENTAIRES
 * doivent être sautés. Un `// … d'origine …` à l'intérieur d'un appel ouvrait
 * une fausse chaîne sur l'apostrophe et faisait crier le garde-fou sur du
 * commentaire parfaitement légitime.
 */
function literals(code: string): string[] {
  const out: string[] = []
  let i = 0
  const n = code.length
  while (i < n) {
    const c = code[i]
    if (c === '/' && code[i + 1] === '/') {
      while (i < n && code[i] !== '\n') i++
      continue
    }
    if (c === '/' && code[i + 1] === '*') {
      i += 2
      while (i < n && !(code[i] === '*' && code[i + 1] === '/')) i++
      i += 2
      continue
    }
    if (c === "'" || c === '"') {
      const quote = c
      let buf = ''
      i++
      while (i < n && code[i] !== quote) {
        if (code[i] === '\\') { buf += code[i + 1] ?? ''; i += 2 } else buf += code[i++]
      }
      i++
      out.push(buf)
      continue
    }
    if (c === '`') {
      let buf = ''
      i++
      while (i < n && code[i] !== '`') {
        if (code[i] === '\\') { buf += code[i + 1] ?? ''; i += 2; continue }
        if (code[i] === '$' && code[i + 1] === '{') {
          out.push(buf)
          buf = ''
          let depth = 1
          i += 2
          const start = i
          while (i < n && depth > 0) {
            if (code[i] === '{') depth++
            else if (code[i] === '}') depth--
            if (depth > 0) i++
          }
          out.push(...literals(code.slice(start, i)))
          i++
          continue
        }
        buf += code[i++]
      }
      i++
      out.push(buf)
      continue
    }
    i++
  }
  return out
}

/**
 * Extrait le source de chaque appel ouvert par `opener` — parenthèses
 * ÉQUILIBRÉES, donc les appels multi-lignes sont capturés en entier. Une regex
 * ligne à ligne les manquerait.
 */
export function extractCalls(source: string, opener: RegExp): string[] {
  const calls: string[] = []
  for (const m of source.matchAll(opener)) {
    const open = m.index + m[0].length - 1
    let depth = 0
    let i = open
    for (; i < source.length; i++) {
      if (source[i] === '(') depth++
      else if (source[i] === ')') {
        depth--
        if (depth === 0) break
      }
    }
    calls.push(source.slice(m.index, i + 1))
  }
  return calls
}

/**
 * Littéraux d'un fragment qui sont de la PROSE à traduire.
 *
 * ⚠️ Limite connue et assumée : un mot ANGLAIS isolé et sans espace (`'Done'`)
 * passe. On préfère cette lacune à un garde-fou qui crie au loup sur `'30d'` ou
 * `'text/html'` — celui-là finirait désactivé.
 */
export function frenchLiterals(code: string, exempt: (lit: string) => boolean = () => false): string[] {
  return literals(code).filter((lit) => {
    if (exempt(lit)) return false
    if (NO_WORDS.test(lit)) return false
    return ACCENTED.test(lit) || SENTENCE.test(lit) || FRENCH.test(lit)
  })
}
