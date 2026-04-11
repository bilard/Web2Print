import { useState, useCallback } from 'react'
import {
  detectAssemblyFiles,
  loadFontsFromFiles,
  unzipIdml,
  buildImageBlobMap,
} from './assemblyLoader'
import type { AssemblyFiles, LoadedFont, IdmlZipContents } from './assemblyLoader'

type UploadStep = 'idle' | 'detecting' | 'loading_fonts' | 'unzipping' | 'ready' | 'error'

export interface IdmlUploadState {
  step: UploadStep
  assembly: AssemblyFiles
  loadedFonts: LoadedFont[]
  idmlContents: IdmlZipContents | null
  pdfUrl: string | null
  imageMap: Map<string, string>
  error: string | null
  spreadCount: number
}

const INITIAL_STATE: IdmlUploadState = {
  step: 'idle',
  assembly: { idmlFile: null, pdfFile: null, fontFiles: [], imageFiles: [], fontListFile: null },
  loadedFonts: [],
  idmlContents: null,
  pdfUrl: null,
  imageMap: new Map(),
  error: null,
  spreadCount: 0,
}

export function useIdmlUpload() {
  const [state, setState] = useState<IdmlUploadState>(INITIAL_STATE)

  const processFiles = useCallback(async (files: FileList | File[]): Promise<IdmlUploadState | null> => {
    setState((s) => ({ ...s, step: 'detecting', error: null }))

    try {
      // 1. Detect components
      const assembly = detectAssemblyFiles(files)

      const missing: string[] = []
      if (!assembly.idmlFile) missing.push('fichier .idml')
      if (!assembly.pdfFile) missing.push('fichier .pdf de référence')

      if (missing.length > 0) {
        const errorState: IdmlUploadState = {
          ...INITIAL_STATE,
          step: 'error',
          assembly,
          error: `Composants manquants : ${missing.join(', ')}`,
        }
        setState(errorState)
        return null
      }

      setState((s) => ({ ...s, assembly, step: 'loading_fonts' }))

      // 2. Load fonts (pass AdobeFnt.lst for accurate style names)
      const loadedFonts = assembly.fontFiles.length > 0
        ? await loadFontsFromFiles(assembly.fontFiles, assembly.fontListFile)
        : []

      setState((s) => ({ ...s, loadedFonts, step: 'unzipping' }))

      // 3. Unzip IDML
      const idmlContents = await unzipIdml(assembly.idmlFile!)
      const spreadCount = Object.keys(idmlContents.spreads).length

      // 4. Create object URL for PDF preview
      const pdfUrl = URL.createObjectURL(assembly.pdfFile!)

      // 5. Build image blob URL map from assembly image files
      const imageMap = buildImageBlobMap(assembly.imageFiles)

      const readyState: IdmlUploadState = {
        step: 'ready',
        assembly,
        loadedFonts,
        idmlContents,
        pdfUrl,
        imageMap,
        spreadCount,
        error: null,
      }
      setState(readyState)
      return readyState
    } catch (err) {
      console.error('IDML upload error', err)
      setState((s) => ({ ...s, step: 'error', error: String(err) }))
      return null
    }
  }, [])

  const reset = useCallback(() => {
    setState((s) => {
      if (s.pdfUrl) URL.revokeObjectURL(s.pdfUrl)
      return INITIAL_STATE
    })
  }, [])

  return { state, processFiles, reset }
}
