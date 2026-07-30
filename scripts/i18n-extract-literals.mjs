// Extrait les littéraux français d'un MODULE vers le catalogue : remplace le
// texte en dur par `t('clé')` dans le source, et écrit les clés dans `fr.ts`.
//
//   node scripts/i18n-extract-literals.mjs src/features/retail-promo rp
//   node scripts/i18n-extract-literals.mjs src/features/retail-promo rp --dry
//
// ⚠️ NE TRAITE QUE LES LIBELLÉS ENTIERS. Les FRAGMENTS de phrase coupés par une
// expression JSX (`Aucun template pour {x} — crée-en un depuis {y}`) sont
// laissés au traitement manuel et listés en fin de run : une clé par fragment
// produirait, en espagnol ou en anglais, une phrase dont l'ordre des mots est
// faux — invisible pour `tsc`, le lint et les tests. C'est la seule partie du
// chantier qu'on ne peut pas automatiser sans livrer du texte cassé.
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs'
import { join, relative, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const [target, prefix] = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const DRY = process.argv.includes('--dry')
if (!target || !prefix) {
  console.error('Usage : node scripts/i18n-extract-literals.mjs <dossier|fichier> <prefixe> [--dry]')
  process.exit(1)
}

const TEXT_ATTRS = new Set(['title', 'placeholder', 'aria-label', 'alt', 'label'])
const TEXT_PROPS = new Set(['label', 'title', 'hint', 'placeholder', 'desc', 'description'])
const ACCENTED = /[àâäéèêëîïôöùûüÿçÀÂÄÉÈÊËÎÏÔÖÙÛÜŸÇ]/
const FRENCH_WORD = /(?<!\p{L})(le|la|les|des|une|un|du|au|aux|ou|et|dans|pour|avec|sans|sur|sous|vous|votre|vos|aucun|aucune|tous|toutes|nouveau|nouvelle|autre|champ|champs|groupe|page|pages|fiche|fiches|nom|taille|couleur|police|fond|titre|titres|texte|ligne|lignes|colonne|colonnes|produit|produits|prix|mois|retour|suivant|charger|masquer|afficher|effacer|ajouter|supprimer|modifier|choisir|enregistrer|importer|exporter|continuer|annuler|fermer|ouvrir|activer|copier|coller|glisser|cliquer|rechercher|gabarit|calques?|opacité|épaisseur)(?!\p{L})/iu
/**
 * Mots français ISOLÉS, sans accent — l'angle mort des deux règles ci-dessus :
 * « Connecteur », « Appareil », « Restant » ne portent pas d'accent et tiennent
 * en un mot, donc ni `ACCENTED` ni `SENTENCE` ne les voient. Ils passaient pour
 * des identifiants alors qu'ils titrent des colonnes à l'écran. Un mot identique
 * en anglais (« Volume », « Budget », « Source ») compte AUSSI : il lui faut une
 * clé pour exister en espagnol.
 */
const FRENCH_LONE = /^(connecteur|connecteurs|appareil|appareils|utilisateur|utilisateurs|visiteur|visiteurs|pays|zone|perso|restant|restants|volume|budget|source|sources|jour|jours|semaine|mois|annee|heure|heures|minute|minutes|seconde|secondes|taille|marque|modele|reference|fournisseur|fournisseurs|client|clients|commande|remise|quantite|unite|stock|image|images|fichier|fichiers|dossier|dossiers|vue|vues|total|actif|actifs|inactif|tous|toutes|oui|non|nom|prix|poids|hauteur|largeur|couleur|police|calque|calques|gabarit|modele|libelle|etat|statut|type|types|niveau|ordre|position|debut|fin|duree|moyenne|somme|nombre|aucune|aucun)$/i

const SENTENCE = /[A-Za-zÀ-ÿ]{3,}[^\S\n]+[A-Za-zÀ-ÿ]/
// Noms propres et jargon qui ne se traduisent dans aucune des langues servies.
const IGNORE = /^(ok|json|pdf|idml|svg|pptx|xlsx|csv|html|api|url|ean|sku|dpi|llm|ia|pim|dam|mm|px|%|€|·|—|→|←|×|\d+|bright data|google drive|remove\.bg|claude|firecrawl|jina|telegram|gmail|make|excel|indesign|illustrator)$/i

const isFrench = (raw) => {
  const t = raw.trim()
  if (t.length < 3 || IGNORE.test(t) || !/[A-Za-zÀ-ÿ]/.test(t)) return false
  return ACCENTED.test(t) || FRENCH_WORD.test(t) || SENTENCE.test(t) || FRENCH_LONE.test(t.replace(/[^A-Za-zÀ-ÿ]/g, ''))
}

/** Clé lisible dérivée du texte : `rp.addRule` plutôt qu'un hash. */
function slug(text) {
  const words = text
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 ]/g, ' ')
    .trim().split(/\s+/).filter(Boolean).slice(0, 4)
  if (words.length === 0) return 'label'
  return words
    .map((w, i) => (i === 0 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase()))
    .join('')
}

const walk = (d) =>
  statSync(d).isFile() ? [d] : readdirSync(d, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(d, e.name)) : /\.tsx$/.test(e.name) ? [join(d, e.name)] : [])

const keys = new Map() // clé → texte FR

/**
 * Clés DÉJÀ présentes dans `fr.ts`, indexées par leur texte : un libellé qui
 * existe se réutilise au lieu d'être dupliqué. Sans ça, l'extraction crée des
 * jumeaux (`tax.classerCeProduitDans` à côté de `xl.classifyProduct`) — que le
 * garde-fou `i18n.test.ts` refuse, à raison : deux clés au même texte finissent
 * par diverger et l'écran devient incohérent.
 */
const existingByText = new Map()
for (const m of readFileSync(join(ROOT, 'src/lib/i18n/fr.ts'), 'utf8')
  .matchAll(/^  '([^']+)':\s*(?:'((?:\\.|[^'])*)'|"((?:\\.|[^"])*)")/gm)) {
  const text = (m[2] ?? m[3] ?? '').replace(/\\'/g, "'").replace(/\\"/g, '"')
  if (text && !existingByText.has(text)) existingByText.set(text, m[1])
}

const fragments = []
let reused = 0
let rewritten = 0

for (const file of walk(join(ROOT, target))) {
  if (/\.(test|spec)\.tsx$/.test(file)) continue
  const src = readFileSync(file, 'utf8')
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  /** @type {{start:number,end:number,replacement:string}[]} */
  const edits = []

  // Clés du fichier COURANT : publiées dans `keys` seulement si le fichier est
  // effectivement réécrit. Sinon un fichier ignoré (t local, aucun littéral)
  // laisserait des clés orphelines dans `fr.ts`.
  const localKeys = new Map()
  const keyFor = (text) => {
    const already = existingByText.get(text)
    if (already) {
      reused += 1
      return already
    }
    const base = `${prefix}.${slug(text)}`
    let key = base
    let n = 2
    while ((keys.has(key) && keys.get(key) !== text) || (localKeys.has(key) && localKeys.get(key) !== text)) {
      key = `${base}${n++}`
    }
    localKeys.set(key, text)
    return key
  }

  const visit = (node) => {
    if (ts.isJsxText(node) && isFrench(node.text)) {
      const raw = node.getFullText(sf)
      const text = node.text.trim().replace(/\s+/g, ' ')
      // Fragment : du JSX suit ou précède SUR LA MÊME LIGNE logique, donc la
      // phrase est coupée par une expression. On ne touche pas.
      const parent = node.parent
      const siblings = ts.isJsxElement(parent) ? parent.children : []
      const idx = siblings.indexOf(node)
      const neighbour = (i) => siblings[i] && ts.isJsxExpression(siblings[i])
      const cutBySibling = (neighbour(idx - 1) || neighbour(idx + 1)) && !/^[.:;!?,)…]/.test(text)
      if (cutBySibling && !/[.!?]$/.test(text) && text.split(/\s+/).length > 1) {
        fragments.push(`${relative(ROOT, file)}:${sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1} · ${text}`)
        return
      }
      const key = keyFor(text)
      // On conserve l'indentation d'origine autour du texte.
      const before = raw.slice(0, raw.indexOf(node.text.trim()[0]))
      const after = raw.slice(raw.lastIndexOf(node.text.trim().slice(-1)) + 1)
      edits.push({ start: node.getFullStart(), end: node.getEnd(), replacement: `${before}{t('${key}')}${after}` })
      return
    }
    if (ts.isJsxAttribute(node) && TEXT_ATTRS.has(node.name.getText(sf))) {
      const init = node.initializer
      if (init && ts.isStringLiteral(init) && isFrench(init.text)) {
        const key = keyFor(init.text)
        edits.push({ start: init.getStart(sf), end: init.getEnd(), replacement: `{t('${key}')}` })
      }
    }
    if (ts.isPropertyAssignment(node) && ts.isStringLiteral(node.initializer)) {
      const name = node.name.getText(sf).replace(/['"]/g, '')
      // ⚠️ Une propriété d'une CONSTANTE DE MODULE ne doit PAS devenir `t()` :
      // hors composant, `t` n'est même pas dans la portée quand le fichier passe
      // par `useTranslation`, et surtout l'appel serait évalué à l'import — la
      // langue resterait figée à celle du premier chargement (piège connu du
      // projet). Ces cas se traitent à la main, en stockant une CLÉ.
      let inFunction = false
      for (let p = node.parent; p; p = p.parent) {
        if (ts.isFunctionDeclaration(p) || ts.isArrowFunction(p) || ts.isFunctionExpression(p) || ts.isMethodDeclaration(p)) {
          inFunction = true
          break
        }
      }
      if (inFunction && TEXT_PROPS.has(name) && isFrench(node.initializer.text)) {
        const key = keyFor(node.initializer.text)
        edits.push({ start: node.initializer.getStart(sf), end: node.initializer.getEnd(), replacement: `t('${key}')` })
      }
    }
    if (ts.isJsxExpression(node) && node.expression && ts.isConditionalExpression(node.expression)) {
      for (const branch of [node.expression.whenTrue, node.expression.whenFalse]) {
        if (ts.isStringLiteral(branch) && isFrench(branch.text)) {
          const key = keyFor(branch.text)
          edits.push({ start: branch.getStart(sf), end: branch.getEnd(), replacement: `t('${key}')` })
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)

  // ⚠️ Un `t` local (paramètre de `map`, variable) MASQUE la fonction de
  // traduction : `t('clé')` devient un appel sur une chaîne. Vécu deux fois —
  // dans la liste des templates de scraping et dans le panneau de propriétés
  // promo. On refuse d'écrire plutôt que de produire du code qui ne compile pas.
  let shadowed = false
  const findShadow = (node) => {
    if ((ts.isParameter(node) || ts.isVariableDeclaration(node)) &&
        ts.isIdentifier(node.name) && node.name.text === 't') shadowed = true
    ts.forEachChild(node, findShadow)
  }
  findShadow(sf)
  if (shadowed && edits.length > 0) {
    console.warn(`  ⚠ ${relative(ROOT, file)} — un « t » local masque la traduction : à renommer d'abord, fichier IGNORÉ`)
    continue
  }

  if (edits.length === 0) continue
  let out = src
  for (const e of edits.sort((a, b) => b.start - a.start)) {
    out = out.slice(0, e.start) + e.replacement + out.slice(e.end)
  }
  if (!/from '@\/lib\/i18n'/.test(out)) {
    // ⚠️ Position calculée sur l'AST, PAS sur « la dernière ligne qui commence
    // par import » : un import multi-ligne (`import {\n  A,\n} from '…'`) a des
    // lignes de continuation, et l'heuristique textuelle insère EN PLEIN MILIEU
    // — le fichier ne compile alors plus. Vécu au premier run.
    const after = ts.createSourceFile(file, out, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    const imports = after.statements.filter(ts.isImportDeclaration)
    const pos = imports.length > 0 ? imports[imports.length - 1].getEnd() : 0
    out = `${out.slice(0, pos)}\nimport { t } from '@/lib/i18n'${out.slice(pos)}`
  }
  if (!DRY) writeFileSync(file, out)
  for (const [k, v] of localKeys) keys.set(k, v)
  rewritten += edits.length
  console.info(`  ${relative(ROOT, file)} → ${edits.length} littéraux`)
}

// — Clés dans fr.ts ————————————————————————————————————————————————————
if (!DRY && keys.size > 0) {
  const frPath = join(ROOT, 'src/lib/i18n/fr.ts')
  const fr = readFileSync(frPath, 'utf8')
  const esc = (v) => (v.includes("'") ? `"${v.replace(/"/g, '\\"')}"` : `'${v}'`)
  const block = [...keys.entries()].map(([k, v]) => `  '${k}': ${esc(v)},`).join('\n')
  const anchor = "  'au.refresh':"
  const i = fr.indexOf(anchor)
  writeFileSync(frPath, `${fr.slice(0, i)}  // — Extraits de ${target} ————————————————————————————\n${block}\n\n${fr.slice(i)}`)
}

console.info(`\n${rewritten} littéraux remplacés · ${keys.size} clés créées · ${reused} clés existantes réutilisées`)
if (fragments.length > 0) {
  console.warn(`\n⚠ ${fragments.length} FRAGMENTS laissés en place (phrase coupée par du JSX — à recomposer à la main) :`)
  for (const f of fragments) console.warn(`   ${f}`)
}
