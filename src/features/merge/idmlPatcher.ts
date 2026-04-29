/**
 * IDML Patcher — Injecte les données d'une ligne de merge dans le XML IDML source.
 *
 * Fonction pure : XML IDML (stories + spreads) + ligne de données → XML patché.
 * Gère : texte ({{variables}}), images (src binding), couleurs (fill/stroke).
 */

import JSZip from 'jszip'
import type { MergeRow, FormulaConfig } from '@/stores/merge.store'
import type { IdmlZipContents } from '@/features/idml/assemblyLoader'
import { resolveText } from './mergeEngine'

const PH_RE = /\{\{([^}]+)\}\}/g

interface PatchBindings {
  /** objectId → { property: columnKey } */
  [objectId: string]: Record<string, string>
}

export interface PatchOptions {
  row: MergeRow
  formulas?: Record<string, string>
  formulaConfigs?: Record<string, FormulaConfig>
  hideLineIfEmpty?: Record<string, boolean>
  /** Property bindings: objectId → { fill: 'col', stroke: 'col', src: 'col' } */
  bindings?: PatchBindings
}

interface PatchedIdml {
  stories: Record<string, string>
  spreads: Record<string, string>
  /** New image files to inject: linkPath → Blob */
  newImages: Map<string, Blob>
  /** New color swatches to add to Graphic.xml */
  newSwatches: Map<string, string>
  resources: Record<string, string>
}

/**
 * Patche les stories XML en remplaçant les {{variables}} par les valeurs de la ligne.
 * Préserve les CharacterStyleRange — seul le contenu <Content> est modifié.
 */
function patchStories(
  stories: Record<string, string>,
  options: PatchOptions,
): Record<string, string> {
  const patched: Record<string, string> = {}

  for (const [path, xml] of Object.entries(stories)) {
    let result = xml

    // Find all <Content> elements containing {{variables}}
    PH_RE.lastIndex = 0
    if (PH_RE.test(result)) {
      // Replace {{variables}} inside <Content>...</Content> tags
      result = result.replace(
        /(<Content>)([\s\S]*?)(<\/Content>)/g,
        (_match, open: string, content: string, close: string) => {
          PH_RE.lastIndex = 0
          if (!PH_RE.test(content)) return _match

          const resolved = resolveText(
            content,
            options.row,
            options.formulas,
            options.hideLineIfEmpty,
            options.formulaConfigs,
          )
          return `${open}${resolved}${close}`
        },
      )

      // Handle hideLineIfEmpty: remove entire ParagraphStyleRange if all content is empty
      if (options.hideLineIfEmpty) {
        result = removeEmptyParagraphs(result, options)
      }
    }

    patched[path] = result
  }

  return patched
}

/**
 * Supprime les ParagraphStyleRange dont le contenu résolu est vide
 * et dont les variables ont hideLineIfEmpty activé.
 */
function removeEmptyParagraphs(xml: string, _options: PatchOptions): string {
  // Parse and check each ParagraphStyleRange
  // A PSR with only empty/whitespace Content after resolution should be removed
  // This is a simplified approach — works for single-paragraph lines
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  const psrs = doc.getElementsByTagName('ParagraphStyleRange')

  const toRemove: Element[] = []
  for (let i = 0; i < psrs.length; i++) {
    const psr = psrs[i]
    const contents = psr.getElementsByTagName('Content')
    let allEmpty = true
    for (let j = 0; j < contents.length; j++) {
      const text = contents[j].textContent ?? ''
      if (text.trim() !== '') {
        allEmpty = false
        break
      }
    }
    if (allEmpty && contents.length > 0) {
      toRemove.push(psr)
    }
  }

  if (toRemove.length === 0) return xml

  for (const el of toRemove) {
    // Also remove preceding <Br/> if present
    const prev = el.previousElementSibling
    if (prev && prev.tagName === 'Br') {
      prev.parentNode?.removeChild(prev)
    }
    el.parentNode?.removeChild(el)
  }

  return new XMLSerializer().serializeToString(doc)
}

/**
 * Patche les spreads XML pour les bindings de propriétés (fill, stroke, opacity).
 * Retourne les spreads modifiés + les swatches à ajouter.
 */
function patchSpreads(
  spreads: Record<string, string>,
  options: PatchOptions,
): { spreads: Record<string, string>; newSwatches: Map<string, string> } {
  const patched: Record<string, string> = {}
  const newSwatches = new Map<string, string>()

  if (!options.bindings) {
    return { spreads, newSwatches }
  }

  for (const [path, xml] of Object.entries(spreads)) {
    let result = xml

    for (const [objectId, props] of Object.entries(options.bindings)) {
      // Fill binding
      if (props.fill) {
        const value = String(options.row[props.fill] ?? '')
        if (value && isColorValue(value)) {
          const hex = normalizeColor(value)
          const swatchName = `Color/Web2Print_${hex.replace('#', '')}`
          newSwatches.set(swatchName, hex)
          result = patchElementAttribute(result, objectId, 'FillColor', swatchName)
        }
      }

      // Stroke binding
      if (props.stroke) {
        const value = String(options.row[props.stroke] ?? '')
        if (value && isColorValue(value)) {
          const hex = normalizeColor(value)
          const swatchName = `Color/Web2Print_${hex.replace('#', '')}`
          newSwatches.set(swatchName, hex)
          result = patchElementAttribute(result, objectId, 'StrokeColor', swatchName)
        }
      }

      // Opacity binding
      if (props.opacity) {
        const value = String(options.row[props.opacity] ?? '')
        const num = parseFloat(value)
        if (!isNaN(num)) {
          result = patchOpacity(result, objectId, num)
        }
      }
    }

    patched[path] = result
  }

  return { spreads: patched, newSwatches }
}

/**
 * Patche un attribut d'un élément IDML identifié par Self="objectId".
 * Utilise du string replacement pour préserver les namespaces XML.
 */
function patchElementAttribute(
  xml: string,
  selfId: string,
  attrName: string,
  newValue: string,
): string {
  // Find the element with Self="selfId" and replace its attribute
  const selfPattern = new RegExp(
    `(<[^>]*\\bSelf="${escapeRegex(selfId)}"[^>]*?)\\b${attrName}="[^"]*"`,
    'g',
  )
  return xml.replace(selfPattern, `$1${attrName}="${newValue}"`)
}

/**
 * Patche l'opacité d'un élément via son TransparencySetting.
 */
function patchOpacity(xml: string, selfId: string, opacity: number): string {
  // Clamp 0-100
  const clamped = Math.max(0, Math.min(100, opacity))
  // Find the element and its Opacity
  const pattern = new RegExp(
    `(Self="${escapeRegex(selfId)}"[\\s\\S]*?<BlendingSetting[^>]*?)Opacity="[^"]*"`,
  )
  return xml.replace(pattern, `$1Opacity="${clamped}"`)
}

/** Vérifie si une string ressemble à une couleur CSS */
function isColorValue(value: string): boolean {
  return /^#[0-9a-fA-F]{3,8}$/.test(value) || /^rgb/i.test(value)
}

/** Normalise une couleur en hex #rrggbb */
function normalizeColor(value: string): string {
  if (value.startsWith('#')) {
    if (value.length === 4) {
      // #rgb → #rrggbb
      return `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`
    }
    return value.slice(0, 7)
  }
  return value
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Ajoute les swatches de couleurs dans Graphic.xml.
 */
function patchGraphicResources(
  resources: Record<string, string>,
  newSwatches: Map<string, string>,
): Record<string, string> {
  if (newSwatches.size === 0) return resources

  const patched = { ...resources }

  for (const [path, xml] of Object.entries(patched)) {
    if (!xml.includes('<Color ') && !xml.includes('Graphic')) continue

    let result = xml
    for (const [swatchName, hex] of newSwatches) {
      // Skip if swatch already exists
      if (result.includes(`Self="${swatchName}"`)) continue

      // Convert hex to CMYK-ish (simplified: use RGB model for screen)
      const r = parseInt(hex.slice(1, 3), 16) / 255
      const g = parseInt(hex.slice(3, 5), 16) / 255
      const b = parseInt(hex.slice(5, 7), 16) / 255

      const colorXml = `<Color Self="${swatchName}" Model="Process" Space="RGB" ColorValue="${(r * 255).toFixed(0)} ${(g * 255).toFixed(0)} ${(b * 255).toFixed(0)}" />`

      // Insert before </idPkg:Graphic> or before the last </RootCharacterStyleGroup> etc.
      const insertPoint = result.lastIndexOf('</Color>')
      if (insertPoint >= 0) {
        const endTag = result.indexOf('>', insertPoint + 7)
        result = result.slice(0, endTag + 1) + '\n' + colorXml + result.slice(endTag + 1)
      } else {
        // Fallback: insert before closing root tag
        const rootClose = result.lastIndexOf('</')
        result = result.slice(0, rootClose) + colorXml + '\n' + result.slice(rootClose)
      }
    }

    patched[path] = result
  }

  return patched
}

/**
 * Fonction principale : patche un ZIP IDML complet pour une ligne de données.
 * Retourne les contenus XML patchés, prêts pour re-parse ou export.
 */
function patchIdmlForRow(
  contents: IdmlZipContents,
  options: PatchOptions,
): PatchedIdml {
  // 1. Patch stories (text {{variables}})
  const patchedStories = patchStories(contents.stories, options)

  // 2. Patch spreads (fill, stroke, opacity bindings)
  const { spreads: patchedSpreads, newSwatches } = patchSpreads(
    contents.spreads,
    options,
  )

  // 3. Patch graphic resources (add color swatches)
  const patchedResources = patchGraphicResources(contents.resources, newSwatches)

  return {
    stories: patchedStories,
    spreads: patchedSpreads,
    newImages: new Map(),
    newSwatches,
    resources: patchedResources,
  }
}

/**
 * Suffixe tous les Self IDs et leurs références dans un spread + stories
 * pour éviter les collisions dans un IDML multi-pages.
 */
function suffixIds(xml: string, suffix: string): string {
  // Suffix Self="..." attributes (catches ALL elements including Story, TextFrame, Page, etc.)
  let result = xml.replace(/Self="([^"]+)"/g, `Self="$1${suffix}"`)
  // Suffix ParentStory="..." references (TextFrame → Story link)
  result = result.replace(/ParentStory="([^"]+)"/g, `ParentStory="$1${suffix}"`)
  // Suffix TextFrame chain references
  result = result.replace(/PreviousTextFrame="([^"n][^"]*)"/g, `PreviousTextFrame="$1${suffix}"`)
  result = result.replace(/NextTextFrame="([^"n][^"]*)"/g, `NextTextFrame="$1${suffix}"`)
  return result
}

/**
 * Crée un ZIP IDML multi-pages à partir d'un buffer source et de lignes de données.
 */
export async function buildMultiPageIdml(
  rawBuffer: ArrayBuffer,
  contents: IdmlZipContents,
  rows: MergeRow[],
  options: Omit<PatchOptions, 'row'>,
  onProgress?: (current: number, total: number) => void,
  cancelledRef?: { current: boolean },
): Promise<Blob> {
  const sourceZip = await JSZip.loadAsync(rawBuffer)
  const outputZip = new JSZip()

  // Copy non-spread/story/resource files as-is (mimetype, META-INF, etc.)
  for (const [path, entry] of Object.entries(sourceZip.files)) {
    if (entry.dir) continue
    if (
      path.startsWith('Spreads/') ||
      path.startsWith('Stories/') ||
      path.startsWith('MasterSpreads/')
    ) continue
    // Resources will be patched separately
    if (path.startsWith('Resources/')) continue
    if (path.toLowerCase() === 'designmap.xml') continue

    const data = await entry.async('uint8array')
    outputZip.file(path, data)
  }

  // Copy master spreads as-is
  for (const [path, xml] of Object.entries(contents.masterSpreads)) {
    outputZip.file(path, xml)
  }

  // Build designmap entries
  const spreadEntries: string[] = []
  const storyEntries = new Set<string>()
  const allNewSwatches = new Map<string, string>()
  // Collect suffixed story Self IDs for StoryList update
  const allStoryIds: string[] = []

  // Extract original story Self IDs from source stories
  const originalStoryIds: string[] = []
  for (const xml of Object.values(contents.stories)) {
    const m = xml.match(/<Story[^>]*\bSelf="([^"]+)"/)
    if (m) originalStoryIds.push(m[1])
  }

  // Extract original page Self IDs from source spreads (for Section PageStart fix)
  const originalPageIds: string[] = []
  for (const xml of Object.values(contents.spreads)) {
    const pageMatches = xml.matchAll(/<Page[^>]*\bSelf="([^"]+)"/g)
    for (const pm of pageMatches) {
      originalPageIds.push(pm[1])
    }
  }

  // Process each row
  for (let i = 0; i < rows.length; i++) {
    if (cancelledRef?.current) break
    onProgress?.(i + 1, rows.length)

    const suffix = `_row${i + 1}`
    const patched = patchIdmlForRow(contents, { ...options, row: rows[i] })

    // Merge swatches
    for (const [name, hex] of patched.newSwatches) {
      allNewSwatches.set(name, hex)
    }

    // Write suffixed spreads
    for (const [path, xml] of Object.entries(patched.spreads)) {
      const baseName = path.replace(/^Spreads\//, '').replace(/\.xml$/, '')
      const newPath = `Spreads/${baseName}${suffix}.xml`
      outputZip.file(newPath, suffixIds(xml, suffix))
      spreadEntries.push(newPath)
    }

    // Write suffixed stories
    for (const [path, xml] of Object.entries(patched.stories)) {
      const baseName = path.replace(/^Stories\//, '').replace(/\.xml$/, '')
      const newPath = `Stories/${baseName}${suffix}.xml`
      outputZip.file(newPath, suffixIds(xml, suffix))
      storyEntries.add(newPath)
    }

    // Collect suffixed story IDs for StoryList
    for (const id of originalStoryIds) {
      allStoryIds.push(`${id}${suffix}`)
    }
  }

  // Write patched resources (with all accumulated swatches)
  const finalResources = patchGraphicResources(contents.resources, allNewSwatches)
  for (const [path, xml] of Object.entries(finalResources)) {
    outputZip.file(path, xml)
  }

  // Build designmap.xml
  let designMap = contents.designMap

  // Remove original spread/story references
  designMap = designMap.replace(/<idPkg:Spread[^/]*\/>\s*/g, '')
  designMap = designMap.replace(/<idPkg:Story[^/]*\/>\s*/g, '')

  // Update StoryList attribute with all suffixed story IDs
  designMap = designMap.replace(
    /StoryList="[^"]*"/,
    `StoryList="${allStoryIds.join(' ')}"`,
  )

  // Update Section PageStart to reference the first row's page ID
  if (originalPageIds.length > 0) {
    designMap = designMap.replace(
      /(<Section[^>]*\bPageStart=")([^"]+)(")/g,
      `$1$2_row1$3`,
    )
  }

  // Insert new spread references before closing tag
  const spreadRefs = spreadEntries
    .map((p) => `<idPkg:Spread src="${p}"/>`)
    .join('\n')
  const storyRefs = [...storyEntries]
    .map((p) => `<idPkg:Story src="${p}"/>`)
    .join('\n')

  // Insert before </Document>
  designMap = designMap.replace(
    '</Document>',
    `${spreadRefs}\n${storyRefs}\n</Document>`,
  )

  outputZip.file('designmap.xml', designMap)

  return outputZip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.adobe.indesign-idml-package',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  })
}

/**
 * Extrait le contenu XML d'un buffer IDML (sans fichiers binaires).
 * Utile pour obtenir les contenus une seule fois et les réutiliser.
 */
export async function extractIdmlContents(
  rawBuffer: ArrayBuffer,
): Promise<IdmlZipContents> {
  const zip = await JSZip.loadAsync(rawBuffer)
  const contents: IdmlZipContents = {
    spreads: {},
    stories: {},
    resources: {},
    masterSpreads: {},
    designMap: '',
  }

  for (const [path, zipEntry] of Object.entries(zip.files)) {
    if (zipEntry.dir) continue
    const text = await zipEntry.async('text')

    if (path.startsWith('Spreads/') || path.match(/^Spread_/i)) {
      contents.spreads[path] = text
    } else if (path.startsWith('Stories/') || path.match(/^Story_/i)) {
      contents.stories[path] = text
    } else if (path.startsWith('Resources/') || path.match(/^(Graphic|Styles|Preferences)/i)) {
      contents.resources[path] = text
    } else if (path.startsWith('MasterSpreads/')) {
      contents.masterSpreads[path] = text
    } else if (path.toLowerCase() === 'designmap.xml') {
      contents.designMap = text
    }
  }

  return contents
}
