// Publie la galerie interne des animations de la home (marketing/home-anim-capture)
// dans dist/animations/ pour qu'elle soit servie sur https://ibs-studio.com/animations/.
// Réécrit les liens/chemins LOCAUX (file://, /Applications/…) en liens PUBLICS.
// Les vidéos out/*.mp4 sont gitignorées (régénérables via capture.mjs) : si elles
// manquent (checkout frais / CI), on saute proprement sans casser le build.
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, copyFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'marketing', 'home-anim-capture')
const SRC_HTML = join(SRC, 'index.html')
const SRC_OUT = join(SRC, 'out')
const DST = join(ROOT, 'dist', 'animations')
const DST_OUT = join(DST, 'out')

if (!existsSync(SRC_HTML)) {
  console.warn('[animations] index.html source absent — galerie non publiée')
  process.exit(0)
}
const videos = existsSync(SRC_OUT) ? readdirSync(SRC_OUT).filter((f) => f.endsWith('.mp4')) : []
if (videos.length === 0) {
  console.warn('[animations] aucune vidéo out/*.mp4 (gitignorées) — galerie non publiée. Lancer capture.mjs puis re-déployer.')
  process.exit(0)
}

let html = readFileSync(SRC_HTML, 'utf8')

// (b) Remplace la phrase note « Ouvre le dossier : open /Applications/… » (Mac-local).
html = html.replace(
  'Toutes les vidéos sont dans <code>marketing/home-anim-capture/out/</code>. Ouvre le dossier :\n    <code>open /Applications/_IA/Claude_workspace/Web2Print/marketing/home-anim-capture/out/</code> · le bouton « Copier » met le chemin complet du fichier dans le presse-papier.',
  "Les 16 animations de la page d'accueil d'IBS-Studio. Le bouton « Copier » copie l'URL publique du fichier .mp4.",
)

// (c) Boutons « Copier » : chemin absolu local → URL publique.
html = html.replaceAll(
  'data-p="/Applications/_IA/Claude_workspace/Web2Print/marketing/home-anim-capture/out/',
  'data-p="https://ibs-studio.com/animations/out/',
)

// (d) Chemins informatifs restants (codes .path) → chemin public.
html = html.replaceAll('marketing/home-anim-capture/out/', 'animations/out/')

// (a) Menu local (file://, dossier) → lien retour vers la doc publique.
html = html.replace(
  '    <div class="docmenu">\n      <a class="docbtn" href="file:///Applications/_IA/Claude_workspace/Web2Print/marketing/home-anim-capture/index.html">🎬 Galerie des animations</a>\n      <a class="docbtn" href="out/">📂 Dossier des vidéos</a>\n    </div>',
  '    <div class="docmenu">\n      <a class="docbtn" href="/docs/">← Documentation IBS-Studio</a>\n    </div>',
)

// Garde-fou : plus aucun chemin local ne doit subsister.
if (html.includes('/Applications/') || html.includes('file://')) {
  console.error('[animations] ERREUR : des chemins locaux subsistent dans le HTML publié')
  process.exit(1)
}

mkdirSync(DST_OUT, { recursive: true })
writeFileSync(join(DST, 'index.html'), html)
for (const v of videos) copyFileSync(join(SRC_OUT, v), join(DST_OUT, v))

console.log(`[animations] dist/animations/ ← galerie + ${videos.length} vidéos (public : /animations/)`)
