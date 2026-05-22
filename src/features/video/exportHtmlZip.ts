import JSZip from 'jszip'
import type { AspectFormat } from './types'

interface ExportOptions {
  aspect: AspectFormat
  isMultiScene: boolean
  /** Variables HyperFrames injectées (composition multi-scene OU svg+brand+caption…) */
  variables: Record<string, unknown>
  /** Dimensions exactes du canvas source (si fourni, écrase data-width/height) */
  width?: number
  height?: number
  /** Nom de base du ZIP (sans extension) */
  filename?: string
}

const TEMPLATE_ID = (aspect: AspectFormat, multi: boolean): string =>
  `${multi ? 'multi-scene' : 'design-reveal'}-${aspect}`

const fetchText = async (url: string): Promise<string> => {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`HTTP ${r.status} sur ${url}`)
  return r.text()
}

/** Patch des dimensions data-width/data-height + viewport meta + width/height
 *  CSS — reproduit le patch de `HyperframesPlayer` pour que le template exporté
 *  ait exactement le ratio du canvas source. */
function patchDimensions(html: string, width: number, height: number): string {
  const wMatch = html.match(/data-width="(\d+)"/)
  const hMatch = html.match(/data-height="(\d+)"/)
  if (!wMatch || !hMatch) return html
  const oldW = wMatch[1]
  const oldH = hMatch[1]
  const newW = String(Math.round(width))
  const newH = String(Math.round(height))
  let patched = html
    .replace(
      /(<meta\s+name="viewport"\s+content="width=)\d+(\s*,\s*height=)\d+("\s*\/?>)/,
      `$1${newW}$2${newH}$3`,
    )
    .replace(/data-width="\d+"/g, `data-width="${newW}"`)
    .replace(/data-height="\d+"/g, `data-height="${newH}"`)
  patched = patched.split(`width: ${oldW}px`).join(`width: ${newW}px`)
  patched = patched.split(`height: ${oldH}px`).join(`height: ${newH}px`)
  return patched
}

/** Extrait le premier bloc <style>…</style> en CSS séparé. Remplace par un
 *  <link rel="stylesheet"> pour pointer vers le CSS externalisé. Les templates
 *  HyperFrames ont un unique bloc style, donc le 1er suffit. */
function extractStyle(html: string): { html: string; css: string } {
  const re = /<style\b[^>]*>([\s\S]*?)<\/style>/i
  const match = re.exec(html)
  if (!match) return { html, css: '' }
  const css = match[1].trim()
  const replaced = html.replace(re, '<link rel="stylesheet" href="./styles.css" />')
  return { html: replaced, css }
}

/** Extrait le DERNIER <script>…</script> inline (sans attribut src) en JS
 *  séparé. Les templates HyperFrames ont l'animation GSAP dans le dernier
 *  script inline (les premiers sont CDN/aux), donc on cible spécifiquement
 *  le dernier inline. Préserve `<script src="…">` pour le CDN GSAP, mockups,
 *  et le bloc d'injection de variables. */
function extractInlineScript(html: string): { html: string; js: string } {
  const inlineRe = /<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi
  const matches: { index: number; full: string; body: string }[] = []
  let m: RegExpExecArray | null
  while ((m = inlineRe.exec(html)) !== null) {
    matches.push({ index: m.index, full: m[0], body: m[1] })
  }
  if (matches.length === 0) return { html, js: '' }
  // Heuristique : on prend le PLUS GROS bloc inline (= l'animation principale).
  // L'injection vars (qu'on ajoutera ensuite via vars.js) reste séparée.
  const biggest = matches.reduce((a, b) => (b.body.length > a.body.length ? b : a))
  const replaced =
    html.slice(0, biggest.index) +
    '<script src="./script.js"></script>' +
    html.slice(biggest.index + biggest.full.length)
  return { html: replaced, js: biggest.body.trim() }
}

function buildVarsJs(vars: Record<string, unknown>): string {
  const safe = JSON.stringify(vars, null, 2)
  return `// Variables HyperFrames injectées au moment de la génération.
// Édite ce fichier pour changer le rendu sans toucher au template.
window.__hyperframes = window.__hyperframes || {};
window.__hyperframes.getVariables = function () {
  return ${safe};
};
`
}

function buildReadme(opts: { isMultiScene: boolean; aspect: AspectFormat }): string {
  const kind = opts.isMultiScene ? 'multi-scene (Gemini)' : 'design-reveal (SVG canvas)'
  return `# Export HTML HyperFrames

Template : **${kind}** · ratio **${opts.aspect}**

## Contenu

- \`index.html\` — page principale, ouvre-la directement dans un navigateur
- \`styles.css\` — feuille de style extraite du template
- \`script.js\` — animation GSAP / orchestration des scènes
- \`vars.js\` — variables (composition, brand, caption, styleConfig…) injectées au moment de la génération
${opts.isMultiScene ? '- `mockups.js` — modules visuels par scène\n' : ''}- \`vars.json\` — mêmes variables au format JSON (pour outils tiers)

## Lecture

1. Décompresse le ZIP.
2. Double-clique \`index.html\` (ou sers le dossier via \`npx serve .\`).
3. GSAP est chargé depuis le CDN public — connexion requise.

## Modification

- Édite \`vars.js\` pour changer le texte, la marque ou la composition.
- Édite \`styles.css\` pour ajuster les couleurs et la typographie.
- Édite \`script.js\` pour modifier la timeline d'animation.

Généré par Web2Print.
`
}

/** Construit le ZIP en mémoire (blob). Réutilisable pour download local OU
 *  upload Firebase Storage (sauvegarde DAM). */
export async function buildHtmlZipBlob(opts: ExportOptions): Promise<Blob> {
  const id = TEMPLATE_ID(opts.aspect, opts.isMultiScene)
  const baseDir = `/hf-templates/${id}`
  const indexUrl = `${baseDir}/index.html`

  // Fetch template + assets auxiliaires (mockups pour le mode multi-scene)
  const auxFiles = opts.isMultiScene ? ['mockups.js'] : []
  const [rawHtml, ...auxContents] = await Promise.all([
    fetchText(indexUrl),
    ...auxFiles.map((f) => fetchText(`${baseDir}/${f}`)),
  ])

  // Patch dimensions selon le canvas source (si fourni)
  let html = rawHtml
  if (opts.width && opts.height) {
    html = patchDimensions(html, opts.width, opts.height)
  }

  // Sépare CSS et JS inline en fichiers dédiés
  const styleResult = extractStyle(html)
  html = styleResult.html
  const scriptResult = extractInlineScript(html)
  html = scriptResult.html

  // Injecte un <script src="./vars.js"></script> AVANT script.js pour que les
  // variables soient disponibles quand l'animation s'initialise. Le template
  // d'origine attendait `window.__hyperframes.getVariables` ; on garde le
  // contrat — vars.js le définit, script.js le consomme.
  html = html.replace(
    /<script\s+src="\.\/script\.js"\s*><\/script>/,
    '<script src="./vars.js"></script>\n    <script src="./script.js"></script>',
  )

  // Si le marqueur script.js n'a pas été inséré (pas de bloc inline trouvé),
  // glisse vars.js avant </head> en dernier recours.
  if (!html.includes('vars.js') && html.includes('</head>')) {
    html = html.replace('</head>', '    <script src="./vars.js"></script>\n  </head>')
  }

  const zip = new JSZip()
  zip.file('index.html', html)
  if (styleResult.css) zip.file('styles.css', styleResult.css)
  if (scriptResult.js) zip.file('script.js', scriptResult.js)
  zip.file('vars.js', buildVarsJs(opts.variables))
  zip.file('vars.json', JSON.stringify(opts.variables, null, 2))
  auxFiles.forEach((file, i) => {
    zip.file(file, auxContents[i])
  })
  zip.file('README.md', buildReadme({ isMultiScene: opts.isMultiScene, aspect: opts.aspect }))

  return zip.generateAsync({ type: 'blob' })
}

/** Construit le ZIP et déclenche le téléchargement navigateur. */
export async function downloadHtmlZip(opts: ExportOptions): Promise<void> {
  const blob = await buildHtmlZipBlob(opts)
  const id = TEMPLATE_ID(opts.aspect, opts.isMultiScene)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${opts.filename ?? `hyperframes-${id}`}.zip`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
