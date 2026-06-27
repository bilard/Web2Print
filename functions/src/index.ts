import { setGlobalOptions } from 'firebase-functions/v2'
import { scrapeCatalogForBrief } from './scraper/scrapeCatalogForBrief'
import { extractBreadcrumb } from './scraper/extractBreadcrumb'
import { scrapeWithBrightData } from './scraper/brightDataUnlocker'
import { scrapeWithScrapingBrowser } from './scraper/scrapingBrowser'
import { getBrightDataAccount } from './scraper/brightDataAccount'
import { fetchPageHtml } from './scraper/fetchPageHtml'

setGlobalOptions({ region: 'europe-west1', maxInstances: 10 })

export { scrapeCatalogForBrief, extractBreadcrumb, scrapeWithBrightData, scrapeWithScrapingBrowser, getBrightDataAccount, fetchPageHtml }

// --- DAM ---
export { searchImages as damSearchImages } from './dam/searchImages'
export { searchSimilar as damSearchSimilar } from './dam/searchSimilar'
export { analyzeImage as damAnalyzeImage } from './dam/analyzeImage'
export { damAutocomplete } from './dam/autocomplete'

// --- Image proxy (contourne CORS pour les photos catalogue scraped) ---
export { imageProxy } from './imageProxy'

// --- DAM : upload serveur d'une image vers Drive (centralisation, sans base64 client) ---
export { damUpload } from './dam/damUpload'

// --- DAM : corbeille Drive des assets d'un produit supprimé ---
export { damDelete } from './dam/damDelete'

// --- DAM : ranger les assets existants sous le sous-dossier du scraping ---
export { damMove } from './dam/damMove'

// --- DAM : résout le dossier cible une fois (anti-course uploads parallèles) ---
export { damEnsureFolder } from './dam/damEnsureFolder'

// --- DAM : corbeille par emplacement+nom (suppression produit/scraping robuste) ---
export { damTrashByName } from './dam/damTrashByName'

// --- Telegram entrant (2a) : webhook → file Firestore ---
export { telegramWebhook } from './telegramWebhook'

// --- Telegram : digest quotidien (08:00 Europe/Paris, opt-in par user) ---
export { telegramDailyDigest } from './telegram/dailyDigest'

// --- Telegram : répondeur serveur (réponse sans navigateur ouvert) ---
export { telegramResponder } from './telegram/responder'

// --- Google OAuth offline (Drive/Gmail côté serveur) ---
export { googleOAuthCallback } from './google/serverAuth'
export { mintGoogleToken } from './google/mintGoogleToken'

// --- RBAC : notifications email (nouvel inscrit en attente + confirmation d'accès) ---
export { onUserAccessChange } from './access/onUserAccessChange'

// --- Workflow cron serveur ---
export { workflowCronScheduler, runWorkflowNow } from './workflow/scheduler'

// --- Workflow webhook entrant (déclenchement externe) ---
export { workflowWebhook } from './workflow/webhookTrigger'

// --- Plugin InDesign : API lecture seule (token personnel) ---
export { pluginApi } from './plugin/pluginApi'

// --- Proxy LLM authentifié (clé Firestore + budget mensuel bloquant) ---
export { llmProxy } from './llm/llmProxy'

// --- Higgsfield (génération image/vidéo IA, clé per-user, SDK officiel) ---
export { higgsfieldGenerate } from './higgsfield/higgsfieldGenerate'
export { higgsfieldCatalog } from './higgsfield/higgsfieldCatalog'
