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
import './priceWatchReport' // jumeau serveur price-watch-report (mail du matin, cron)
import './textEnrich' // jumeau serveur text-enrich (traduction/enrichissement au cron)
import './sendWindow'      // jumeau serveur send-window (cadence des envois)
import './analyticsReport' // jumeau serveur analytics-report (headless, owner-only)
import './gdriveExport' // jumeau serveur gdrive-export (upload Drive via jeton serveur)
import './higgsfield'   // jumeau serveur higgsfield (génération image/vidéo via SDK)
import './sourceSites'       // jumeau serveur source-sites (émet la liste des sites sur le port)
import './pairingRules'      // jumeau serveur pairing-rules (écrit les règles d'appariement du suivi)
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
/** Non exécutables ici, mais qui LAISSENT PASSER leur entrée vers l'aval.
 *
 *  ⚠ VIDE depuis que `text-enrich` a son jumeau serveur : elle traduit maintenant DANS le
 *  run planifié au lieu d'être traversée. Le laisser ici ferait mentir le pré-vol, qui
 *  annoncerait « la donnée passe sans être traitée » sur une carte qui travaille. */
export const SERVER_PASS_THROUGH = new Set<string>([
])

export const SERVER_SKIP_VISUAL = new Set<string>([
  'chart',
])
