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
