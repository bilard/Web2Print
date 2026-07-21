// functions/src/workflow/nodes/index.ts
import './pure'
import './network'
import './sinks'
import './priceWatch'
import './priceWatchTrack'
import './listProducts'
import './comparePrices'
import './google'
import './webScraping'
import './webhookPost'
import './costReport'   // jumeau serveur cost-report (headless, lit Firestore)
import './analyticsReport' // jumeau serveur analytics-report (headless, owner-only)
import './gdriveExport' // jumeau serveur gdrive-export (upload Drive via jeton serveur)
import './higgsfield'   // jumeau serveur higgsfield (génération image/vidéo via SDK)
import './harvestCompetitor' // jumeau serveur harvest-competitor (moisson index concurrent, cron)
import './compareCatalog'    // jumeau serveur compare-catalog (matrice produit × concurrent)
import './directedSearch'    // jumeau serveur directed-search (recherche dirigée réf/EAN, cron)

/** Types présents côté client mais non exécutables côté serveur (navigateur/OAuth/canvas). */
export const SERVER_UNSUPPORTED = new Set<string>([
  'export-pdf', 'image-to-svg', 'pdf-to-svg', 'decompose',
  'gdrive-import', 'save-dam',
  'import-idml', 'import-svg', 'import-pptx', 'import-image',
  'import-csv', 'upload', 'export-excel', 'export-pptx', 'generate-image',
  'chart', // rendu PNG via <canvas> (client) ; le graphe en cron passe par l'option Sheets natif
])

/** Sous-ensemble de SERVER_UNSUPPORTED purement VISUEL/aperçu (sortie sans valeur de
 *  donnée côté serveur, p.ex. `chart` = image PNG navigateur). Côté serveur on les IGNORE
 *  proprement (no-op + warning) au lieu de les marquer en erreur : leur absence ne doit pas
 *  faire passer tout le run en « partial » alors que les sorties utiles (Sheet, mail) sont OK. */
export const SERVER_SKIP_VISUAL = new Set<string>([
  'chart',
])
