import { helpSections } from './content/index'
import type { HelpBlock, HelpSection } from './content/types'

export interface SearchHit {
  sectionId: string
  sectionTitle: string
  category: string
  snippet: string
  matchStart: number
  matchEnd: number
}

interface IndexedBlock {
  sectionId: string
  sectionTitle: string
  category: string
  text: string
  textLower: string
}

const STOPWORDS = new Set([
  'le', 'la', 'les', 'un', 'une', 'des', 'de', 'du', 'au', 'aux',
  'et', 'ou', 'où', 'ni', 'mais', 'donc', 'car', 'or',
  'à', 'en', 'dans', 'sur', 'sous', 'par', 'pour', 'avec', 'sans',
  'que', 'qui', 'quoi', 'dont', 'quand', 'comme', 'si',
  'ce', 'ces', 'cet', 'cette', 'son', 'sa', 'ses', 'leur', 'leurs',
  'mon', 'ma', 'mes', 'ton', 'ta', 'tes', 'notre', 'nos', 'votre', 'vos',
  'je', 'tu', 'il', 'elle', 'on', 'nous', 'vous', 'ils', 'elles',
  'me', 'te', 'se', 'lui', 'eux',
  'est', 'sont', 'était', 'étaient', 'sera', 'seront', 'être',
  'a', 'as', 'ai', 'ont', 'avait', 'avaient', 'aura', 'auront', 'avoir',
  'pas', 'plus', 'moins', 'très', 'trop', 'tout', 'tous', 'toute', 'toutes',
  'aussi', 'encore', 'déjà', 'puis', 'alors', 'ensuite',
  'the', 'a', 'an', 'and', 'or', 'of', 'in', 'on', 'at', 'to', 'for',
  'with', 'is', 'are', 'was', 'were', 'be', 'been',
  'l', 'd', 'n', 'm', 's', 't', 'qu',
])

let indexedBlocks: IndexedBlock[] | null = null
let vocabulary: string[] | null = null
let vocabSet: Set<string> | null = null

function extractText(block: HelpBlock): string {
  switch (block.type) {
    case 'text':
      return block.md
    case 'screenshot':
      return [block.alt, block.caption].filter(Boolean).join(' ')
    case 'menu-link':
      return block.label
    case 'shortcut':
      return `${block.label} ${block.keys.join(' ')}`
    case 'accordion':
      return block.items.map((it) => `${it.title} ${it.md}`).join(' ')
    case 'mockup':
      return ''
    default: {
      const _exhaustive: never = block
      return _exhaustive
    }
  }
}

/** Strip markdown syntax for cleaner snippets. */
function clean(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#+\s*/gm, '')
    .replace(/^[-*|]\s*/gm, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function buildIndex(): { blocks: IndexedBlock[]; vocab: string[]; vocabSet: Set<string> } {
  const blocks: IndexedBlock[] = []
  const wordSet = new Set<string>()

  const ingest = (section: HelpSection, text: string) => {
    const cleaned = clean(text)
    if (!cleaned) return
    blocks.push({
      sectionId: section.id,
      sectionTitle: section.title,
      category: section.category,
      text: cleaned,
      textLower: cleaned.toLowerCase(),
    })
    for (const raw of cleaned.split(/[^\p{L}\p{N}-]+/u)) {
      const w = raw.toLowerCase()
      if (w.length < 3) continue
      if (STOPWORDS.has(w)) continue
      wordSet.add(w)
    }
  }

  for (const section of helpSections) {
    ingest(section, `${section.title} ${section.intro}`)
    for (const block of section.blocks) {
      const text = extractText(block)
      if (text) ingest(section, text)
    }
  }

  const vocab = Array.from(wordSet).sort((a, b) => a.localeCompare(b, 'fr'))
  return { blocks, vocab, vocabSet: wordSet }
}

function ensureIndex() {
  if (indexedBlocks && vocabulary && vocabSet) return
  const { blocks, vocab, vocabSet: vs } = buildIndex()
  indexedBlocks = blocks
  vocabulary = vocab
  vocabSet = vs
}

/** Mots du vocabulaire qui matchent le préfixe query (insensible à la casse). */
export function suggestWords(query: string, max = 8): string[] {
  ensureIndex()
  const q = query.trim().toLowerCase()
  if (!q || !vocabulary) return []
  const exact: string[] = []
  const prefix: string[] = []
  const sub: string[] = []
  for (const w of vocabulary) {
    if (w === q) exact.push(w)
    else if (w.startsWith(q)) prefix.push(w)
    else if (w.includes(q)) sub.push(w)
    if (exact.length + prefix.length + sub.length >= max * 3) break
  }
  return [...exact, ...prefix, ...sub].slice(0, max)
}

/** Sections + extraits qui contiennent le terme. */
export function searchSections(query: string, max = 12): SearchHit[] {
  ensureIndex()
  const q = query.trim().toLowerCase()
  if (!q || !indexedBlocks) return []
  const hits: SearchHit[] = []
  const seenSections = new Map<string, number>()
  for (const block of indexedBlocks) {
    const idx = block.textLower.indexOf(q)
    if (idx === -1) continue
    const prev = seenSections.get(block.sectionId)
    if (prev !== undefined && prev >= 2) continue
    const start = Math.max(0, idx - 30)
    const end = Math.min(block.text.length, idx + q.length + 60)
    const prefix = start > 0 ? '…' : ''
    const suffix = end < block.text.length ? '…' : ''
    hits.push({
      sectionId: block.sectionId,
      sectionTitle: block.sectionTitle,
      category: block.category,
      snippet: prefix + block.text.slice(start, end) + suffix,
      matchStart: idx - start + prefix.length,
      matchEnd: idx - start + prefix.length + q.length,
    })
    seenSections.set(block.sectionId, (prev ?? 0) + 1)
    if (hits.length >= max) break
  }
  return hits
}

/** Pour les tests : reset du cache (et exposer le compte d'index pour vérification). */
export function __resetIndexForTests() {
  indexedBlocks = null
  vocabulary = null
  vocabSet = null
}
