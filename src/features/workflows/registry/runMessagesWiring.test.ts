import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * Garde-fou de CÂBLAGE des messages de run.
 *
 * Le test de parité (`src/lib/i18n/runMessages.test.ts`) garantit que les deux
 * catalogues disent la même chose. Il ne dit rien du code : un node peut très
 * bien avoir ses clés traduites et continuer à loguer un littéral français.
 * C'est exactement l'erreur qui a laissé `harvest-competitor` avec 1 message
 * traduit sur 9 — un panneau anglais parsemé de français.
 *
 * Règle encodée ici : dans les fichiers listés ci-dessous (les deux côtés d'un
 * `type` de node DÉCLARÉ FAIT), tout littéral passé à `ctx.log(` doit être un
 * niveau, une clé `run.*`, ou de la ponctuation. Autrement dit : le texte
 * traverse forcément le catalogue.
 *
 * Ajouter une paire à cette liste = déclarer le node fait. Un message oublié
 * fait échouer le test, des deux côtés.
 */
const DONE: readonly { type: string; files: readonly string[] }[] = [
  {
    type: 'analytics-report',
    files: [
      'src/features/workflows/registry/analyticsReportNode.tsx',
      'functions/src/workflow/nodes/analyticsReport.ts',
    ],
  },
  {
    type: 'compare-prices',
    files: [
      'src/features/workflows/registry/comparePricesNode.ts',
      'functions/src/workflow/nodes/comparePrices.ts',
    ],
  },
]

/** Niveaux de log — premier argument de `ctx.log`. */
const LEVELS = new Set(['debug', 'info', 'warn', 'error'])

/**
 * Extrait le source de chaque appel `ctx.log(` — parenthèses ÉQUILIBRÉES, donc
 * les appels multi-lignes (fréquents : messages concaténés sur 3 lignes) sont
 * capturés en entier. Une regex ligne à ligne les manquerait.
 */
function extractLogCalls(source: string): string[] {
  const calls: string[] = []
  const NEEDLE = 'ctx.log('
  let from = 0
  for (;;) {
    const start = source.indexOf(NEEDLE, from)
    if (start === -1) break
    let depth = 0
    let i = start + NEEDLE.length - 1
    for (; i < source.length; i++) {
      if (source[i] === '(') depth++
      else if (source[i] === ')') {
        depth--
        if (depth === 0) break
      }
    }
    calls.push(source.slice(start, i + 1))
    from = i + 1
  }
  return calls
}

/**
 * Littéraux d'un fragment de code : simples quotes, doubles quotes, et
 * gabarits. Pour un gabarit on ne garde que les portions LITTÉRALES (hors
 * `${…}`) : c'est là que se cache le texte en dur, alors que l'intérieur des
 * interpolations est du code (`String(e)`, `sites.join(', ')`).
 */
function literals(code: string): string[] {
  const out: string[] = []
  for (const m of code.matchAll(/'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"/g)) {
    out.push(m[1] ?? m[2] ?? '')
  }
  for (const m of code.matchAll(/`((?:[^`\\]|\\.)*)`/g)) {
    // Retire les interpolations, puis découpe : chaque morceau restant est du texte.
    out.push(...m[1].split(/\$\{[^}]*\}/g))
  }
  return out
}

/** Ponctuation, chiffres, séparateurs : jamais du texte à traduire. */
const NO_WORDS = /^[\s\d\p{P}\p{S}·—–…×≥°%]*$/u

/** Un accent = du français, sans discussion possible. */
const ACCENTED = /[àâäéèêëîïôöùûüÿçÀÂÄÉÈÊËÎÏÔÖÙÛÜŸÇ]/

/** Une phrase : au moins deux mots, dont un de 3 lettres ou plus. */
const SENTENCE = /[A-Za-z]{3,}[^\S\n]+\S/

/**
 * Mots français fréquents dans les logs, pour les cas SANS accent ni espace.
 * La mémoire du chantier le rappelle : du français sans accent (« Aucune base
 * selectionnee ») échappe à tout contrôle fondé sur les accents.
 */
const FRENCH = /\b(aucun|aucune|produit|produits|feuille|colonne|ligne|lignes|prix|rapport|erreur|echec|termine|introuvable|manquant|vide|trouve|enregistre|moisson|budget|cycle|balayage)\b/i

/**
 * ⚠️ Limite connue et assumée : un mot ANGLAIS isolé et sans espace
 * (`'Done'`) passe. Le corpus est français — un texte anglais en dur dans un
 * `ctx.log` serait un autre bug que celui-ci. On préfère cette lacune à un
 * garde-fou qui crie au loup sur `'30d'` ou `'text/html'` et finit désactivé.
 */
function offendingLiterals(code: string): string[] {
  return literals(code).filter((lit) => {
    if (LEVELS.has(lit)) return false
    if (lit.startsWith('run.')) return false // clé du catalogue
    if (NO_WORDS.test(lit)) return false
    return ACCENTED.test(lit) || SENTENCE.test(lit) || FRENCH.test(lit)
  })
}

describe('câblage des messages de run', () => {
  for (const { type, files } of DONE) {
    for (const file of files) {
      it(`${type} — ${file} ne logue aucun texte en dur`, () => {
        const source = readFileSync(file, 'utf8')
        const offences: string[] = []
        for (const call of extractLogCalls(source)) {
          for (const lit of offendingLiterals(call)) {
            offences.push(`« ${lit.trim()} »`)
          }
        }
        expect(
          offences,
          `${file} : texte non traduit dans un ctx.log —\n${offences.join('\n')}`,
        ).toEqual([])
      })
    }
  }

  it('détecte réellement un texte en dur', () => {
    // Un garde-fou non éprouvé est un garde-fou fail-open : on provoque l'échec.
    // Cf. reference_audit_gates_must_fail_closed.
    expect(offendingLiterals(`ctx.log('info', 'Aucun produit en entrée.')`)).toEqual([
      'Aucun produit en entrée.',
    ])
    expect(offendingLiterals("ctx.log('info', `${n} produit(s) trouvés`)")).toEqual([
      ' produit(s) trouvés',
    ])
    expect(offendingLiterals(`ctx.log('info', t(ctx.locale, 'run.noProduct'))`)).toEqual([])
    expect(offendingLiterals("ctx.log('info', `${a} : ${sites.join(', ') || '—'}.`)")).toEqual([])
    // Du français SANS accent — le piège du lot 6a, invisible aux regex d'accents.
    expect(offendingLiterals(`ctx.log('warn', 'Aucune colonne')`)).toEqual(['Aucune colonne'])
    // Valeurs de CODE légitimes dans un appel de log : ne doivent pas alerter.
    expect(offendingLiterals(`ctx.log('info', t('run.x', { p: c.period ?? '30d' }))`)).toEqual([])
    expect(offendingLiterals(`ctx.log('info', t('run.x', { m: 'text/html;charset=utf-8' }))`)).toEqual([])
  })
})
