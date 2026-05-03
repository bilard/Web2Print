/**
 * E2E smoke tests for the universal scraping engine.
 * SKIPPED by default (real network calls). Unskip locally with:
 *   describe.skip → describe
 * to validate quality on real product URLs.
 */
import { describe, it, expect } from 'vitest'
import { sanitizeJinaMarkdown } from '@/features/excel/ai-enrichment/markdownSanitize'
import { parseSpecsFromMarkdown } from '../parsers/parseSpecifications'
import { parseAdvantagesFromMarkdown } from '../parsers/parseAdvantages'
import { parseDescriptionFromMarkdown } from '../parsers/parseDescription'
import { extractStructuredDataFromUrl } from '../structuredDataFetcher'

const PRODUCTS = [
  { name: 'Dyson Spot+Scrub', url: 'https://www.dyson.fr/aspirateurs/robots/spot-scrub-ai/noir', expectSpecs: 10, expectAdvs: 10 },
  { name: 'RS Makita Tronçonneuse', url: 'https://fr.rs-online.com/web/p/tronconneuses/2522571', expectSpecs: 7, expectAdvs: 0 },
  { name: 'Jardiland Mythos', url: 'https://www.jardiland.com/p/serre-de-jardin-polycarbonate-aluminium-vert-2-3-m-mythos-avec-embase-canopia-by-palram-21373502', expectSpecs: 5, expectAdvs: 3 },
  { name: 'Leroy Merlin DHR202Z', url: 'https://www.leroymerlin.fr/produits/perforateur-sans-fil-sans-batterie-makita-dhr202z-18-v-70255710.html', expectSpecs: 3, expectAdvs: 0 },
]

describe.skip('E2E real products (manual run)', () => {
  for (const p of PRODUCTS) {
    it(`${p.name}: enrichissement complet`, async () => {
      // Fetch via Jina basic GET (proxy local of cascade behavior)
      const r = await fetch('https://r.jina.ai/' + p.url, { headers: { 'Accept': 'application/json' } })
      const json = await r.json() as { data?: { content?: string } }
      const md = json.data?.content ?? ''
      const sanitized = sanitizeJinaMarkdown(md)
      const specs = parseSpecsFromMarkdown(sanitized)
      const advs = parseAdvantagesFromMarkdown(sanitized)
      const desc = parseDescriptionFromMarkdown(sanitized)
      const structured = await extractStructuredDataFromUrl(p.url)

      console.log(`\n[E2E ${p.name}]`)
      console.log(`  markdown: ${md.length} chars`)
      console.log(`  specs (md): ${specs.length}`)
      console.log(`  specs (json-ld): ${structured?.specs.length ?? 0}`)
      console.log(`  advs: ${advs.length}`)
      console.log(`  desc: ${desc.length} chars`)

      const totalSpecs = specs.length + (structured?.specs?.length ?? 0)
      expect(totalSpecs).toBeGreaterThanOrEqual(p.expectSpecs)
      expect(advs.length).toBeGreaterThanOrEqual(p.expectAdvs)
    }, 60_000)
  }
})
