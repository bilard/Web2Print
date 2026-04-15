import { setGlobalOptions } from 'firebase-functions/v2'
import { scrapeCatalogForBrief } from './scraper/scrapeCatalogForBrief'
import { jinaScrape } from './scraper/jinaProxy'
import { scrapePage } from './scraper/puppeteerScrape'

setGlobalOptions({ region: 'europe-west1', maxInstances: 10 })

export { scrapeCatalogForBrief, jinaScrape, scrapePage }

// --- DAM ---
export { searchImages as damSearchImages } from './dam/searchImages'
export { searchSimilar as damSearchSimilar } from './dam/searchSimilar'
export { analyzeImage as damAnalyzeImage } from './dam/analyzeImage'
export { damAutocomplete } from './dam/autocomplete'
