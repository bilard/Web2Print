import JSZip from 'jszip'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { storage } from '@/lib/firebase/config'
import { registerDynamicFontVariant } from '@/features/assets/useFonts'
import opentype from 'opentype.js'
import { parseAdobeFntList, buildFontLookup, type AdobeFontEntry } from './adobeFntParser'

export interface AssemblyFiles {
  idmlFile: File | null
  pdfFile: File | null
  fontFiles: File[]
  imageFiles: File[]
  fontListFile: File | null
}

export interface LoadedFont {
  name: string
  family: string
  file: File
}

export interface IdmlZipContents {
  spreads: Record<string, string>    // filename → XML string
  stories: Record<string, string>    // filename → XML string
  resources: Record<string, string>  // filename → XML string
  masterSpreads: Record<string, string>
  designMap: string
}

const FONT_EXTENSIONS = ['.otf', '.ttf', '.woff', '.woff2']
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.tif', '.tiff', '.gif', '.bmp', '.webp', '.svg', '.eps', '.psd', '.ai']

/**
 * Scanne une liste de fichiers pour détecter les composants d'un Assembly InDesign
 */
export function detectAssemblyFiles(files: FileList | File[]): AssemblyFiles {
  const all = Array.from(files)
  const result: AssemblyFiles = { idmlFile: null, pdfFile: null, fontFiles: [], imageFiles: [], fontListFile: null }

  // First pass: detect IDML, PDF, and AdobeFnt*.lst
  for (const file of all) {
    const name = file.name.toLowerCase()
    if (name.endsWith('.idml') && !result.idmlFile) {
      result.idmlFile = file
    } else if (name.endsWith('.pdf') && !result.pdfFile) {
      result.pdfFile = file
    } else if (name.startsWith('adobefnt') && name.endsWith('.lst')) {
      result.fontListFile = file
    }
  }

  // Second pass: detect font files
  // Check if any file has a path containing "fonts" (webkitRelativePath or custom _path)
  const hasFontFolder = all.some((file) => {
    const path = getFilePath(file)
    return path.includes('document fonts') || path.includes('fonts/')
  })

  for (const file of all) {
    const name = file.name.toLowerCase()
    if (!FONT_EXTENSIONS.some((ext) => name.endsWith(ext))) continue

    if (hasFontFolder) {
      // Strict: only accept fonts from a fonts directory
      const path = getFilePath(file)
      if (path.includes('document fonts') || path.includes('fonts')) {
        result.fontFiles.push(file)
      }
    } else {
      // Relaxed: accept any font file (drag & drop without path info)
      result.fontFiles.push(file)
    }
  }

  // Third pass: detect image files (from Links folder or loose)
  const hasLinksFolder = all.some((file) => {
    const path = getFilePath(file)
    return path.includes('links/') || path.includes('links\\')
  })

  for (const file of all) {
    const name = file.name.toLowerCase()
    if (!IMAGE_EXTENSIONS.some((ext) => name.endsWith(ext))) continue
    // Skip PDF (already captured) and font files
    if (name.endsWith('.pdf')) continue

    if (hasLinksFolder) {
      const path = getFilePath(file)
      if (path.includes('links')) {
        result.imageFiles.push(file)
      }
    } else {
      // Accept any image file when no Links folder structure
      result.imageFiles.push(file)
    }
  }

  return result
}

/** Get file path (webkitRelativePath, custom _path, or just name) */
function getFilePath(file: File): string {
  const f = file as File & { webkitRelativePath?: string; _path?: string }
  return (f.webkitRelativePath || f._path || f.name).toLowerCase()
}

/**
 * Derive base font family from filename:
 * "Overpass-Black.ttf" → "Overpass"
 * "FontFont - DIN OT Black.otf" → "DIN OT"
 * "DIN Condensed Bold.ttf" → "DIN Condensed"
 */
/** Known weight/style/width tokens to strip from font filenames */
const FONT_TOKENS = /^(Black|Bold|Semi(?:Bold)?|Demi(?:Bold)?|Medium|Regular|Book|Roman|Light|Extra(?:Bold|Light)?|Ultra(?:Bold|Light)?|Heavy|Thin|Hairline|Italic|Oblique|It|Condensed|Cond|Narrow|Wide|Extended|Ext|Compressed|Std|Pro|LT)$/i

/**
 * Derive base font family from filename by splitting into tokens
 * and removing weight/style/width tokens from the right.
 * "DINOT-CondBlackItalic.otf" → split at camelCase boundaries → "DINOT"
 * "FontFont - DIN OT Black.otf" → "DIN OT"
 */
function deriveFamily(fileName: string): string {
  let base = fileName.replace(/\.[^.]+$/, '')
  base = base.replace(/^FontFont\s*[-–]\s*/i, '')

  // Split into tokens: by -, _, space, AND camelCase boundaries
  // "CondBlackItalic" → ["Cond", "Black", "Italic"]
  const tokens = base
    .replace(/([a-z])([A-Z])/g, '$1 $2')  // camelCase split
    .split(/[-_\s]+/)
    .filter(Boolean)

  // Strip tokens from the right that are known weight/style/width
  while (tokens.length > 1 && FONT_TOKENS.test(tokens[tokens.length - 1])) {
    tokens.pop()
  }

  return tokens.join(' ').trim() || fileName.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ')
}

function detectWeight(name: string): string {
  // Split camelCase so "BoldItalic" → "Bold Italic", "CondBlack" → "Cond Black"
  const n = name.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()
  if (/black|ultra.?bold|heavy/.test(n)) return '900'
  if (/extrabold|extra.bold/.test(n)) return '800'
  if (/semibold|semi.bold|demibold|demi.bold|\bdemi\b/.test(n)) return '600'
  if (/bold/.test(n)) return '700'
  if (/medium/.test(n)) return '500'
  if (/book|roman/.test(n)) return '400'
  if (/extra.?light/.test(n)) return '200'
  if (/light/.test(n)) return '300'
  if (/thin|hairline/.test(n)) return '100'
  return '400'
}

/**
 * Charge les fonts via FontFace API et les ajoute au document.
 * Enregistre chaque font sous son nom de famille de base avec les
 * descripteurs CSS weight/style pour que le matching fonctionne.
 */
export async function loadFontsFromFiles(fontFiles: File[], fontListFile?: File | null): Promise<LoadedFont[]> {
  const loaded: LoadedFont[] = []
  // Track loaded weights per family to create fallbacks for missing weights
  const familyBuffers = new Map<string, { buffer: ArrayBuffer; weight: string; style: string }[]>()

  // Parse AdobeFnt.lst if available for accurate style names
  let fntLookup: Map<string, AdobeFontEntry> | null = null
  if (fontListFile) {
    try {
      const lstContent = await fontListFile.text()
      const entries = parseAdobeFntList(lstContent)
      fntLookup = buildFontLookup(entries)
    } catch (err) {
      console.warn('[Font] Failed to parse AdobeFnt.lst', err)
    }
  }

  for (const file of fontFiles) {
    try {
      const buffer = await file.arrayBuffer()

      // Check AdobeFnt lookup first for authoritative metadata
      const lstEntry = fntLookup?.get(file.name.toLowerCase())

      // Try to read the real font family from metadata via opentype.js
      let family: string
      if (lstEntry) {
        family = lstEntry.familyName
      } else {
        try {
          const font = opentype.parse(buffer.slice(0))  // slice to avoid detached buffer
          const names = font.names as any
          const preferred = names.preferredFamily?.en || names.preferredFamily?.fr
          const legacy = names.fontFamily?.en || names.fontFamily?.fr
          family = preferred || legacy || deriveFamily(file.name)
        } catch {
          family = deriveFamily(file.name)
        }
      }

      // Use AdobeFnt metadata for weight/style if available
      const weight = lstEntry ? String(lstEntry.weightClass) : detectWeight(file.name)
      const style = lstEntry
        ? (lstEntry.angleClass > 0 ? 'italic' : 'normal')
        : (/italic|oblique/i.test(file.name) ? 'italic' : 'normal')
      const styleLabel = lstEntry?.styleName

      const fontFace = new FontFace(family, buffer, { weight, style })
      await fontFace.load()
      document.fonts.add(fontFace)
      registerDynamicFontVariant(family, weight, style, file.name, styleLabel)
      loaded.push({ name: file.name, family, file })


      if (!familyBuffers.has(family)) familyBuffers.set(family, [])
      familyBuffers.get(family)!.push({ buffer, weight, style })
    } catch (err) {
      console.warn(`Impossible de charger la font ${file.name}`, err)
    }
  }

  // For families missing weight 400 (regular), register the lightest available as fallback
  for (const [family, variants] of familyBuffers) {
    const normalVariants = variants.filter(v => v.style === 'normal')
    const hasRegular = normalVariants.some(v => v.weight === '400' || v.weight === 'normal')
    if (!hasRegular && normalVariants.length > 0) {
      // Pick the lightest weight as fallback for regular
      const lightest = normalVariants.reduce((a, b) =>
        parseInt(a.weight) < parseInt(b.weight) ? a : b
      )
      try {
        const fallback = new FontFace(family, lightest.buffer, { weight: '400', style: 'normal' })
        await fallback.load()
        document.fonts.add(fallback)
      } catch { /* ignore */ }
    }
  }

  return loaded
}

/**
 * Creates a map of image filename → blob URL from assembly image files.
 * Matches are case-insensitive on filename only (no path).
 */
export function buildImageBlobMap(imageFiles: File[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const file of imageFiles) {
    const url = URL.createObjectURL(file)
    // Store by filename (lowercase) for case-insensitive matching
    map.set(file.name.toLowerCase(), url)
    // Also store with original case
    map.set(file.name, url)
  }
  return map
}

/**
 * Upload assembly images to Firebase Storage for persistence across sessions.
 * Uploads ALL image formats (including TIF, PSD, EPS, AI) for storage.
 * Returns a map of filename → download URL for immediate use.
 */
export async function uploadImagesToStorage(
  projectId: string,
  imageFiles: File[],
): Promise<Map<string, string>> {
  const urlMap = new Map<string, string>()
  if (imageFiles.length === 0) return urlMap

  await Promise.allSettled(imageFiles.map(async (file) => {
    try {
      const buffer = await file.arrayBuffer()
      const imgRef = ref(storage, `projects/${projectId}/links/${file.name}`)
      await uploadBytes(imgRef, buffer)
      const url = await getDownloadURL(imgRef)
      urlMap.set(file.name, url)
      urlMap.set(file.name.toLowerCase(), url)
    } catch (err) {
      console.error(`[Image] FAILED to upload ${file.name}:`, err)
    }
  }))
  return urlMap
}

/**
 * Dézipe un fichier IDML et retourne son contenu XML structuré
 */
export async function unzipIdml(idmlFile: File): Promise<IdmlZipContents> {
  const buffer = await idmlFile.arrayBuffer()
  const zip = await JSZip.loadAsync(buffer)

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

/**
 * Upload project fonts to Firebase Storage so they persist across sessions.
 * Filename format: "family__weight__style__styleName.ext" for easy parsing on reload.
 */
export async function uploadFontsToStorage(
  projectId: string,
  fontFiles: File[],
  fontListFile?: File | null,
): Promise<void> {
  if (fontFiles.length === 0) return

  // Parse AdobeFnt.lst for accurate metadata
  let fntLookup: Map<string, AdobeFontEntry> | null = null
  if (fontListFile) {
    try {
      const lstContent = await fontListFile.text()
      const entries = parseAdobeFntList(lstContent)
      fntLookup = buildFontLookup(entries)
    } catch { /* ignore */ }
  }

  for (const file of fontFiles) {
    try {
      const buffer = await file.arrayBuffer()
      const lstEntry = fntLookup?.get(file.name.toLowerCase())

      // Read real family from metadata (same logic as loadFontsFromFiles)
      let family: string
      if (lstEntry) {
        family = lstEntry.familyName
      } else {
        try {
          const font = opentype.parse(buffer.slice(0))
          const names = font.names as any
          const preferred = names.preferredFamily?.en || names.preferredFamily?.fr
          const legacy = names.fontFamily?.en || names.fontFamily?.fr
          family = preferred || legacy || deriveFamily(file.name)
        } catch {
          family = deriveFamily(file.name)
        }
      }

      const weight = lstEntry ? String(lstEntry.weightClass) : detectWeight(file.name)
      const style = lstEntry
        ? (lstEntry.angleClass > 0 ? 'italic' : 'normal')
        : (/italic|oblique/i.test(file.name) ? 'italic' : 'normal')
      const styleName = lstEntry?.styleName ?? ''
      const ext = file.name.replace(/^.*\./, '')
      const storageName = styleName
        ? `${family}__${weight}__${style}__${styleName}.${ext}`
        : `${family}__${weight}__${style}.${ext}`

      const fontRef = ref(storage, `projects/${projectId}/fonts/${storageName}`)
      await uploadBytes(fontRef, buffer)
    } catch (err) {
      console.warn(`[Font] Failed to upload ${file.name}:`, err)
    }
  }
}
