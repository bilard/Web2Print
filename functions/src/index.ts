import { setGlobalOptions } from 'firebase-functions/v2'
import { scrapeCatalogForBrief } from './scraper/scrapeCatalogForBrief'
import { extractBreadcrumb } from './scraper/extractBreadcrumb'
import { scrapeWithBrightData } from './scraper/brightDataUnlocker'

setGlobalOptions({ region: 'europe-west1', maxInstances: 10 })

export { scrapeCatalogForBrief, extractBreadcrumb, scrapeWithBrightData }

// --- DAM ---
export { searchImages as damSearchImages } from './dam/searchImages'
export { searchSimilar as damSearchSimilar } from './dam/searchSimilar'
export { analyzeImage as damAnalyzeImage } from './dam/analyzeImage'
export { damAutocomplete } from './dam/autocomplete'

// --- Image proxy (contourne CORS pour les photos catalogue scraped) ---
export { imageProxy } from './imageProxy'
