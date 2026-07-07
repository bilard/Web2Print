// Génère public/docs/content.js à partir de l'aide in-app (src/features/help/content).
// Lancé en `prebuild` → la doc publique /docs/ reste TOUJOURS synchro avec l'app.
//
// On charge le contenu via le loader SSR de Vite (transpile TSX, alias @, lucide,
// JSX — exactement comme le build de l'app), donc aucune dépendance en plus.
import { createServer } from 'vite'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

// Icône (emoji) par module. Défaut gracieux si un nouveau module d'aide
// n'est pas encore listé ici.
const ICON = {
  'getting-started': '🚀', nouveautes: '✨', onboarding: '🧰', navigation: '🧭',
  editor: '✏️', 'conditional-rules': '🔀', hyperframes: '🎬',
  'import-idml': '📐', easycatalog: '🔗', 'import-pptx': '📊', 'import-excel': '🧮',
  'import-image': '🌄', 'import-svg': '✒️', 'import-image-to-svg': '🪄', 'import-pdf-to-svg': '📄',
  dam: '🖼️', pim: '📦', taxonomies: '🌳', briefs: '📝',
  scraping: '🕸️', 'scraping-templates': '🧩', 'scraping-hub': '🛰️', 'price-watch': '💰', catalog: '📕',
  export: '📤', workflow: '⚡', telegram: '✈️', chat: '💬', access: '🛡️', settings: '⚙️',
  explorer: '🗺️',
}
// Métadonnées d'affichage des 8 catégories (ordre = ordre des sections).
const CATEGORIES = [
  { id: 'demarrage', label: 'Démarrage', icon: '🚀', desc: 'Connexion, prise en main, navigation et nouveautés : tout pour bien démarrer.' },
  { id: 'edition', label: 'Édition', icon: '✏️', desc: "L'éditeur type Canva : canvas, outils, calques, impression et animations." },
  { id: 'import', label: 'Import', icon: '📥', desc: "Repartez d'un fichier existant : IDML, EasyCatalog, PPTX, Excel, image, SVG, PDF." },
  { id: 'donnees', label: 'Données', icon: '🗂️', desc: 'Le cœur data : PIM, médias (DAM), taxonomies, scraping et veille tarifaire.' },
  { id: 'export', label: 'Export', icon: '📤', desc: 'Sortez vos créations : PDF print, IDML, PPTX, SVG, PNG, web et pack social.' },
  { id: 'automatisation', label: 'Automatisation', icon: '⚡', desc: 'Workflows visuels et pilotage Telegram : enchaînez les modules sans effort.' },
  { id: 'assistant-ia', label: 'Assistant IA', icon: '🤖', desc: 'Un assistant conversationnel pour interroger, rédiger et générer.' },
  { id: 'administration', label: 'Administration', icon: '🛡️', desc: "Comptes, rôles, permissions et réglages de l'espace de travail." },
]

/** Nettoie un markdown en texte courant lisible (sans balises ni liens). */
function stripMd(md) {
  return String(md || '')
    .replace(/```[\s\S]*?```/g, ' ')              // blocs de code
    .replace(/^#{1,6}\s+/gm, '')                  // titres
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')        // images
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')      // liens → texte
    .replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, '$1') // gras/italique
    .replace(/`([^`]+)`/g, '$1')                  // code inline
    .replace(/^\s*[-*+]\s+/gm, '• ')              // puces
    .replace(/^\s*\|.*\|\s*$/gm, ' ')             // lignes de tableau
    .replace(/\s+/g, ' ')                          // espaces multiples
    .trim()
}

/** Condense à ~2 phrases pour les paragraphes longs (sous les titres ###). */
function condense(text, max = 240) {
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  const lastDot = cut.lastIndexOf('. ')
  return (lastDot > 80 ? cut.slice(0, lastDot + 1) : cut.trim() + '…')
}

/** Extrait les sous-fonctions d'une section (accordéons + titres ### des blocs texte). */
function extractFeatures(blocks) {
  const out = []
  for (const b of blocks) {
    if (b.type === 'accordion') {
      for (const it of b.items) out.push({ title: it.title, desc: condense(stripMd(it.md)) })
    } else if (b.type === 'text' && /^#{2,3}\s+/m.test(b.md)) {
      // Découpe chaque section "### Titre\n\ncorps"
      const parts = String(b.md).split(/^#{2,3}\s+/m).filter(Boolean)
      for (const part of parts) {
        const nl = part.indexOf('\n')
        if (nl < 0) continue
        const title = part.slice(0, nl).trim()
        const body = condense(stripMd(part.slice(nl)))
        if (title && body) out.push({ title, desc: body })
      }
    }
  }
  return out
}

function extractShortcuts(blocks) {
  return blocks.filter((b) => b.type === 'shortcut').map((b) => ({ keys: b.keys, label: b.label }))
}

const server = await createServer({
  configFile: join(root, 'vite.config.ts'),
  root,
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
})

try {
  const mod = await server.ssrLoadModule('/src/features/help/content/index.ts')
  const sections = mod.helpSections

  const MODULES = sections.map((s) => {
    const features = extractFeatures(s.blocks)
    return {
      id: s.id,
      cat: s.category,
      icon: ICON[s.id] || '✦',
      title: s.title,
      intro: s.intro,
      features,
      shortcuts: extractShortcuts(s.blocks),
    }
  })

  const header = `// ⚠️ Fichier AUTO-GÉNÉRÉ par scripts/build-docs-content.mjs (prebuild).
// Source de vérité : l'aide intégrée à l'app (src/features/help/content/*.tsx).
// NE PAS éditer à la main — relancer \`npm run build\` (ou le script) régénère ce fichier.
`
  const out = `${header}
export const CATEGORIES = ${JSON.stringify(CATEGORIES, null, 2)}

export const MODULES = ${JSON.stringify(MODULES, null, 2)}
`
  writeFileSync(join(root, 'public/docs/content.js'), out)
  const featCount = MODULES.reduce((n, m) => n + m.features.length, 0)
  console.log(`[docs-content] ${MODULES.length} modules, ${CATEGORIES.length} catégories, ${featCount} fonctions → public/docs/content.js`)
} finally {
  await server.close()
}
