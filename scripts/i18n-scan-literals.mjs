// Recense les littéraux FRANÇAIS encore en dur dans le JSX de l'application.
//
//   node scripts/i18n-scan-literals.mjs            # rapport lisible
//   node scripts/i18n-scan-literals.mjs --json     # pour outillage
//
// ⚠️ Pourquoi un vrai PARSEUR et pas une regex : le texte d'un bouton vit
// souvent seul sur sa ligne, sans `>` ni `<` autour —
//
//     <button ...>
//       <Save /> Enregistrer
//     </button>
//
// — et une regex ligne à ligne ne le voit jamais. C'est ce qui a laissé passer
// cinq écrans entiers (éditeur de templates, Finances, panneau du catalogue…)
// après deux passes réputées propres. On lit donc l'AST TypeScript : chaque
// nœud `JsxText`, chaque attribut de texte, chaque propriété de libellé.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Zones EXCLUES du balayage, et pourquoi :
 *  - `pulse/` et `radar/` : PWA internes que l'utilisateur garde en français
 *    (décision du 30/07/2026) ;
 *  - `help/content/` : contenus d'aide traduits par mapping sur le texte FR,
 *    pas par clés (cf. `helpI18n.ts`) ;
 *  - `ui/` : shadcn/ui, code vendorisé qu'on ne modifie pas ;
 *  - tests et fixtures : du français y est de la DONNÉE d'entrée.
 */
const EXCLUDED = [
  'src/components/pulse/', 'src/components/radar/', 'src/features/help/content/',
  'src/components/ui/',
]
const isExcluded = (f) => EXCLUDED.some((d) => f.includes(d)) || /\.(test|spec)\.tsx?$/.test(f)

/** Attributs dont la valeur est LUE par l'utilisateur (ou son lecteur d'écran). */
const TEXT_ATTRS = new Set(['title', 'placeholder', 'aria-label', 'alt', 'label', 'aria-description'])

/** Propriétés d'objet qui portent un libellé affiché (barres d'outils, menus…). */
const TEXT_PROPS = new Set(['label', 'title', 'hint', 'placeholder', 'desc', 'description', 'tooltip'])

/** Un accent : du français, sans discussion. */
const ACCENTED = /[àâäéèêëîïôöùûüÿçÀÂÄÉÈÊËÎÏÔÖÙÛÜŸÇ]/
/** Mots français fréquents SANS accent — la moitié des libellés n'en portent pas. */
const FRENCH_WORD = /(?<!\p{L})(le|la|les|des|une|un|du|au|aux|ou|et|dans|pour|avec|sans|sur|sous|vous|votre|vos|aucun|aucune|tous|toutes|nouveau|nouvelle|autre|champ|champs|groupe|groupes|page|pages|fiche|fiches|nom|taille|couleur|police|fond|titre|titres|texte|textes|ligne|lignes|colonne|colonnes|produit|produits|prix|coût|coûts|mois|date|retour|suivant|precedent|charger|masquer|afficher|effacer|ajouter|supprimer|modifier|choisir|enregistrer|importer|exporter|continuer|annuler|valider|fermer|ouvrir|activer|copier|coller|glisser|cliquer|rechercher|selectionner|gabarit|calque|calques|apercu|reglages|parametres)(?!\p{L})/iu
/** Deux mots dont un de trois lettres et plus : de la prose, pas un identifiant. */
const SENTENCE = /[A-Za-zÀ-ÿ]{3,}[^\S\n]+[A-Za-zÀ-ÿ]/

/**
 * Textes à ne PAS signaler : unités, symboles, noms propres et jargon qui
 * s'écrivent pareil dans toutes les langues servies.
 */
const IGNORE = /^(ok|json|pdf|idml|svg|pptx|xlsx|csv|html|css|api|url|ean|sku|dpi|rvb|rgb|cmjn|llm|ia|ai|pim|dam|mm|cm|px|pt|%|€|·|—|–|\||…|→|←|↑|↓|×|✓|✗|\d+)$/i

function isFrench(text) {
  const t = text.trim()
  if (t.length < 3 || IGNORE.test(t)) return false
  if (!/[A-Za-zÀ-ÿ]/.test(t)) return false
  return ACCENTED.test(t) || FRENCH_WORD.test(t) || SENTENCE.test(t)
}

const walk = (d) =>
  statSync(d).isFile() ? [d] : readdirSync(d, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(d, e.name)) : /\.tsx$/.test(e.name) ? [join(d, e.name)] : [])

const findings = []

for (const file of walk(join(ROOT, 'src'))) {
  const rel = relative(ROOT, file)
  if (isExcluded(rel)) continue
  const src = readFileSync(file, 'utf8')
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const at = (node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1

  const visit = (node) => {
    if (ts.isJsxText(node) && isFrench(node.text)) {
      findings.push({ file: rel, line: at(node), kind: 'jsx', text: node.text.trim().replace(/\s+/g, ' ') })
    }
    if (ts.isJsxAttribute(node) && TEXT_ATTRS.has(node.name.getText(sf))) {
      const init = node.initializer
      if (init && ts.isStringLiteral(init) && isFrench(init.text)) {
        findings.push({ file: rel, line: at(node), kind: node.name.getText(sf), text: init.text })
      }
    }
    if (ts.isPropertyAssignment(node) && ts.isStringLiteral(node.initializer)) {
      const name = node.name.getText(sf).replace(/['"]/g, '')
      if (TEXT_PROPS.has(name) && isFrench(node.initializer.text)) {
        findings.push({ file: rel, line: at(node), kind: name, text: node.initializer.text })
      }
    }
    // Ternaire rendu DANS du JSX : `{x ? 'Masquer' : 'Afficher'}` — invisible
    // aux règles ci-dessus, et pourtant affiché tel quel.
    if (ts.isJsxExpression(node) && node.expression && ts.isConditionalExpression(node.expression)) {
      for (const branch of [node.expression.whenTrue, node.expression.whenFalse]) {
        if (ts.isStringLiteral(branch) && isFrench(branch.text)) {
          findings.push({ file: rel, line: at(branch), kind: 'ternaire', text: branch.text })
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(findings, null, 2))
} else {
  const byFile = new Map()
  for (const f of findings) byFile.set(f.file, [...(byFile.get(f.file) ?? []), f])
  console.log(`${findings.length} littéraux français dans ${byFile.size} fichiers\n`)
  for (const [file, list] of [...byFile.entries()].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`${file} (${list.length})`)
    for (const f of list) console.log(`  ${f.line} · ${f.kind} · ${f.text.slice(0, 80)}`)
  }
}
