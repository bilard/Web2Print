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
  {
    // Le MOTEUR de moisson est dans le même lot que le node : ses messages
    // remontent par `deps.log` dans le même panneau. Un node traduit dont le
    // moteur logue en dur reste à moitié français.
    type: 'harvest-competitor',
    files: [
      'src/features/workflows/registry/harvestCompetitorNode.ts',
      'functions/src/workflow/nodes/harvestCompetitor.ts',
      'src/features/priceWatch/catalog/runHarvest.ts',
      'functions/src/priceWatch/catalog/runHarvest.ts',
      'src/features/priceWatch/catalog/probeListings.ts',
      'functions/src/priceWatch/catalog/probeListings.ts',
    ],
  },
  {
    type: 'compare-catalog',
    files: [
      'src/features/workflows/registry/compareCatalogNode.ts',
      'functions/src/workflow/nodes/compareCatalog.ts',
    ],
  },
  {
    // Même logique que la moisson : le moteur de recherche dirigée et la passe
    // authentifiée loguent dans le panneau du node.
    type: 'directed-search',
    files: [
      'src/features/workflows/registry/directedSearchNode.ts',
      'functions/src/workflow/nodes/directedSearch.ts',
      'src/features/priceWatch/catalog/searchDirected.ts',
      'functions/src/priceWatch/catalog/searchDirected.ts',
      'functions/src/priceWatch/catalog/krampAuthPass.ts',
    ],
  },
  {
    type: 'price-watch',
    files: [
      'src/features/workflows/registry/priceWatchNode.ts',
      'functions/src/workflow/nodes/priceWatch.ts',
    ],
  },
  {
    // Le client délègue à `runPriceWatch` ; le serveur inline la même boucle.
    // Structures différentes, messages communs — d'où les mêmes clés.
    type: 'price-watch-track',
    files: [
      'src/features/workflows/registry/priceWatchTrackNode.ts',
      'functions/src/workflow/nodes/priceWatchTrack.ts',
      'src/features/priceWatch/runPriceWatch.ts',
    ],
  },
  {
    type: 'cost-report',
    files: [
      'src/features/workflows/registry/costReportNode.tsx',
      'functions/src/workflow/nodes/costReport.ts',
    ],
  },
  {
    type: 'webhook-post',
    files: [
      'src/features/workflows/registry/webhookNode.tsx',
      'functions/src/workflow/nodes/webhookPost.ts',
    ],
  },
  {
    type: 'list-products',
    files: [
      'src/features/workflows/registry/listProductsNode.ts',
      'functions/src/workflow/nodes/listProducts.ts',
    ],
  },
  {
    // `pure.ts` héberge huit types côté serveur ; le client les répartit en trois
    // fichiers. Le garde-fou travaillant par FICHIER, les trois sont couverts.
    type: 'if-else / pipe / loop-* / text-input / transform-*',
    files: [
      'src/features/workflows/registry/logicNodes.ts',
      'src/features/workflows/registry/transformationNodes.ts',
      'src/features/workflows/registry/textInputNode.tsx',
      'functions/src/workflow/nodes/pure.ts',
    ],
  },
  {
    type: 'web-search / scrape-url / enrichment',
    files: [
      'src/features/workflows/registry/webSearchNode.ts',
      'src/features/workflows/registry/scrapeNodes.ts',
      'src/features/workflows/registry/enrichmentNodes.ts',
      'functions/src/workflow/nodes/network.ts',
    ],
  },
  {
    type: 'save-pim / send-telegram',
    files: [
      'src/features/workflows/registry/persistenceNodes.ts',
      'src/features/workflows/registry/telegramNodes.tsx',
      'functions/src/workflow/nodes/sinks.ts',
    ],
  },
  {
    type: 'higgsfield',
    files: [
      'src/features/workflows/registry/higgsfield.tsx',
      'functions/src/workflow/nodes/higgsfield.ts',
    ],
  },
  {
    type: 'source-sites',
    files: [
      'src/features/workflows/registry/sourceSitesNode.tsx',
      'functions/src/workflow/nodes/sourceSites.ts',
    ],
  },
]

/** Niveaux de log — premier argument de `ctx.log`. */
const LEVELS = new Set(['debug', 'info', 'warn', 'error'])

/**
 * Ouvertures d'un message de run. `ctx.log` est celui des nodes ; `deps.log?.` et
 * `opts.log?.` sont les rappels des MOTEURS (`priceWatch/catalog/`), que le node
 * branche sur `ctx.log` — leurs messages atterrissent dans le même panneau et
 * sont donc soumis à la même règle.
 *
 * ⚠️ `throw new Error` en fait partie, et c'est une leçon payée à l'écran : le
 * garde-fou ne surveillait que les logs, il est passé au vert sur
 * `directed-search`, et le panneau affichait quand même « Recherche dirigée :
 * aucune donnée produit en entrée. » en rouge au milieu d'une UI anglaise. Un
 * node échoue AUSSI dans le journal de run.
 */
const LOG_OPENER = /(?:(?:ctx|deps|opts)\.log\??\.?|throw new Error)\(/g

/**
 * Extrait le source de chaque appel de log — parenthèses ÉQUILIBRÉES, donc les
 * appels multi-lignes (fréquents : messages concaténés sur 3 lignes) sont
 * capturés en entier. Une regex ligne à ligne les manquerait.
 */
function extractLogCalls(source: string): string[] {
  const calls: string[] = []
  for (const m of source.matchAll(LOG_OPENER)) {
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
 * Littéraux d'un fragment de code : simples quotes, doubles quotes, gabarits.
 * Pour un gabarit on ne garde que les portions LITTÉRALES ; l'intérieur des
 * `${…}` est du code, rescanné à son tour (`sites.join(', ')` y est un
 * littéral légitime).
 *
 * ⚠️ C'est un BALAYAGE, pas une regex, pour une raison vécue : les
 * COMMENTAIRES doivent être sautés. Un `// … d'origine …` à l'intérieur d'un
 * appel de log ouvrait une fausse chaîne sur l'apostrophe et faisait crier le
 * garde-fou sur du commentaire français parfaitement légitime.
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
    // Un COMMENTAIRE français dans l'appel : légitime, et son apostrophe ne doit
    // pas ouvrir une fausse chaîne qui avalerait le reste de la ligne.
    expect(offendingLiterals("ctx.log('info', t('run.x', {\n  // conserve le rendu d'origine\n  p: String(v),\n}))")).toEqual([])
    // Une EXCEPTION est un message de run comme un autre.
    expect(offendingLiterals("throw new Error('Utilisateur non connecté.')")).toEqual([
      'Utilisateur non connecté.',
    ])
    expect(offendingLiterals("throw new Error(t('run.notSignedIn'))")).toEqual([])
  })
})
