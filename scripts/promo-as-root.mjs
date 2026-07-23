// Post-build : sert la page promo à l'URL racine "/" sans redirection.
//
// Firebase Hosting donne la priorité aux fichiers statiques sur les rewrites :
// tant que dist/index.html existe, il est servi pour "/" et aucun rewrite ne
// peut le remplacer. On promeut donc la promo en index.html racine, et on
// conserve le shell de l'app sous _app.html (vers lequel pointe le rewrite SPA
// dans firebase.json). Les assets de l'app sont en chemins absolus (/assets/…),
// le shell fonctionne donc depuis n'importe quel nom de fichier.
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const dist = join(process.cwd(), 'site-web') // dossier de build (ex-« dist »)
const appShell = join(dist, 'index.html')
const appShellRenamed = join(dist, '_app.html')
const promo = join(dist, 'promo', 'index.html')

if (!existsSync(appShell) || !existsSync(promo)) {
  console.error('[promo-as-root] site-web/index.html ou site-web/promo/index.html introuvable — build incomplet ?')
  process.exit(1)
}

copyFileSync(appShell, appShellRenamed)       // shell app préservé pour le rewrite SPA
copyFileSync(promo, appShell)                 // promo promue à la racine
console.log('[promo-as-root] site-web/index.html ← promo ; shell app → site-web/_app.html')

// Shell dédié « radarPrice » : /radarprice est réécrit vers _radar.html (cf. firebase.json).
// iOS Safari CAPTURE apple-mobile-web-app-title / apple-touch-icon / manifest au chargement
// initial du HTML et IGNORE toute modification JS ultérieure au moment de « Ajouter à
// l'écran d'accueil » → le script de bascule d'index.html ne suffit pas. On grave donc les
// balises PWA radarPrice dans un HTML distinct (copie du shell app, mêmes assets absolus).
const radarShell = join(dist, '_radar.html')
const radarHtml = readFileSync(appShellRenamed, 'utf8')
  .replace(/\/pulse\.webmanifest/g, '/radarprice.webmanifest')
  .replace(/\/pulse-icon-180\.png/g, '/radarprice-icon-180.png')
  .replace(/content="Pulse"/, 'content="radarPrice"')
writeFileSync(radarShell, radarHtml)
console.log('[promo-as-root] _radar.html ← shell app + balises PWA radarPrice gravées')

// Cache-buster des service workers des PWA internes (Pulse, radarPrice) : on tamponne
// la version du cache avec l'horodatage du build. Le contenu du SW change donc à CHAQUE
// déploiement → iOS réinstalle le SW → le handler `activate` purge les anciens caches et
// la PWA installée récupère la dernière version au prochain lancement.
for (const [file, prefix] of [['pulse-sw.js', 'pulse'], ['radarprice-sw.js', 'radarprice']]) {
  const sw = join(dist, file)
  if (existsSync(sw)) {
    const stamp = `${prefix}-${Date.now().toString(36)}`
    const patched = readFileSync(sw, 'utf8').replace(/const CACHE = '[^']*'/, `const CACHE = '${stamp}'`)
    writeFileSync(sw, patched)
    console.log(`[promo-as-root] ${file} ← CACHE = '${stamp}'`)
  } else {
    console.warn(`[promo-as-root] site-web/${file} introuvable — cache-buster SW non appliqué.`)
  }
}
