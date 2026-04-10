import { setGlobalOptions } from 'firebase-functions/v2'
import { scrapeCatalogForBrief } from './scraper/scrapeCatalogForBrief'

setGlobalOptions({ region: 'europe-west1', maxInstances: 10 })

export { scrapeCatalogForBrief }

// --- DAM ---
export { searchImages as damSearchImages } from './dam/searchImages'
export { searchSimilar as damSearchSimilar } from './dam/searchSimilar'
export { damAutocomplete } from './dam/autocomplete'
