# Data Merge Excel → Template Canvas — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre de lier un dataset Excel aux objets du canvas via `{{variable}}` et dropdown, avec prévisualisation interactive ligne par ligne et export batch (PDF multi-pages, ZIP de fichiers individuels PDF/PPTX/PNG).

**Architecture:** Un store Zustand `merge.store` gère l'état (source connectée, ligne courante, rows chargées). Un `mergeEngine` pur résout les bindings texte/propriétés. Un panneau accordéon "Données" dans le RightPanelStack expose la navigation, les liaisons et l'export. L'export batch réutilise les hooks existants `useExportPdf`/`useExportPptx` en boucle séquentielle.

**Tech Stack:** React 18, Zustand v4, Fabric.js v6, Firebase Firestore, pdf-lib, PptxGenJS, JSZip (nouveau), xlsx (existant)

**Spec:** `docs/superpowers/specs/2026-03-21-data-merge-design.md`

---

## Structure des fichiers

| Action | Fichier | Responsabilité |
|--------|---------|----------------|
| Créer | `src/stores/merge.store.ts` | State : source connectée, ligne courante, rows, colonnes |
| Créer | `src/features/merge/mergeEngine.ts` | Fonctions pures : résolution `{{var}}`, bindings propriétés |
| Créer | `src/features/merge/useDataMerge.ts` | Hook : connexion source, chargement rows, navigation, apply sur canvas |
| Créer | `src/features/merge/useBatchExport.ts` | Hook : export batch séquentiel (PDF/PPTX/PNG, multi-pages/ZIP) |
| Créer | `src/features/merge/DataMergePanel.tsx` | Panneau accordéon UI : source, navigation, bindings, export |
| Créer | `src/features/merge/ExportModal.tsx` | Modale config export : format, mode, lignes, nommage |
| Créer | `src/features/merge/DataSourcePicker.tsx` | Sélecteur source : dataset existant ou import direct |
| Modifier | `src/stores/ui.store.ts` | Ajouter `{ id: 'data', collapsed: true }` dans `rightPanels` |
| Modifier | `src/components/panels/RightPanelStack.tsx` | Enregistrer DataMergePanel dans `panelConfig` |
| Modifier | `src/features/editor/useAutoSave.ts` | Sauvegarder `dataSource` dans le document projet |
| Modifier | `src/features/editor/useLoadCanvas.ts` | Charger `dataSource` et reconnecter au mount |
| Ajouter | `jszip` (npm) | Dépendance pour génération ZIP |

---

### Task 1 : Installer JSZip et créer le merge store

**Files:**
- Create: `src/stores/merge.store.ts`
- Modify: `src/stores/ui.store.ts`

- [ ] **Step 1 : Installer JSZip**

```bash
npm install jszip
```

- [ ] **Step 2 : Créer `src/stores/merge.store.ts`**

```typescript
import { create } from 'zustand'

export interface MergeRow {
  _id: string
  [key: string]: unknown
}

export interface MergeColumn {
  key: string
  label: string
  fieldType: string
}

export interface DataSourceRef {
  excelDocId: string
  sheetIndex: number
  fileName: string
}

interface MergeState {
  // Source
  dataSource: DataSourceRef | null
  columns: MergeColumn[]
  rows: MergeRow[]

  // Navigation
  currentRowIndex: number
  isConnected: boolean

  // Actions
  connect: (source: DataSourceRef, columns: MergeColumn[], rows: MergeRow[]) => void
  disconnect: () => void
  setCurrentRow: (index: number) => void
  nextRow: () => void
  prevRow: () => void
}

export const useMergeStore = create<MergeState>((set, get) => ({
  dataSource: null,
  columns: [],
  rows: [],
  currentRowIndex: 0,
  isConnected: false,

  connect: (source, columns, rows) =>
    set({ dataSource: source, columns, rows, currentRowIndex: 0, isConnected: true }),

  disconnect: () =>
    set({ dataSource: null, columns: [], rows: [], currentRowIndex: 0, isConnected: false }),

  setCurrentRow: (index) => {
    const { rows } = get()
    if (index >= 0 && index < rows.length) {
      set({ currentRowIndex: index })
    }
  },

  nextRow: () => {
    const { currentRowIndex, rows } = get()
    if (currentRowIndex < rows.length - 1) {
      set({ currentRowIndex: currentRowIndex + 1 })
    }
  },

  prevRow: () => {
    const { currentRowIndex } = get()
    if (currentRowIndex > 0) {
      set({ currentRowIndex: currentRowIndex - 1 })
    }
  },
}))
```

- [ ] **Step 3 : Ajouter le panneau "data" dans `ui.store.ts`**

Dans `src/stores/ui.store.ts`, ajouter `{ id: 'data', collapsed: true }` au début du tableau `rightPanels` (pour qu'il apparaisse en premier dans les accordéons) :

```typescript
// Modifier le tableau rightPanels par défaut (ligne ~74)
// Avant :
rightPanels: [
  { id: 'layers', collapsed: true },
  { id: 'images', collapsed: true },
  ...
]
// Après :
rightPanels: [
  { id: 'data', collapsed: true },
  { id: 'layers', collapsed: true },
  { id: 'images', collapsed: true },
  ...
]
```

- [ ] **Step 4 : Vérifier compilation**

```bash
npx tsc --noEmit
```

- [ ] **Step 5 : Commit**

```bash
git add src/stores/merge.store.ts src/stores/ui.store.ts package.json package-lock.json
git commit -m "feat(merge): add merge store and data panel slot in UI"
```

---

### Task 2 : Créer le moteur de merge (mergeEngine)

**Files:**
- Create: `src/features/merge/mergeEngine.ts`

Ce fichier contient les fonctions pures de résolution. Aucune dépendance Fabric.js — uniquement du traitement de données.

- [ ] **Step 1 : Créer `src/features/merge/mergeEngine.ts`**

```typescript
import type { MergeRow } from '@/stores/merge.store'

const PLACEHOLDER_RE = /\{\{(\w+)\}\}/g

/**
 * Extrait les noms de variables d'un template texte.
 * "Bonjour {{nom}}, {{poste}}" → ['nom', 'poste']
 */
export function extractVariables(template: string): string[] {
  const vars: string[] = []
  let match: RegExpExecArray | null
  PLACEHOLDER_RE.lastIndex = 0
  while ((match = PLACEHOLDER_RE.exec(template)) !== null) {
    if (!vars.includes(match[1])) vars.push(match[1])
  }
  return vars
}

/**
 * Détecte si un texte contient au moins un placeholder {{...}}
 */
export function hasPlaceholders(text: string): boolean {
  PLACEHOLDER_RE.lastIndex = 0
  return PLACEHOLDER_RE.test(text)
}

/**
 * Résout un template texte avec les valeurs d'une ligne.
 * "Bonjour {{nom}}" + { nom: "Dupont" } → "Bonjour Dupont"
 * Variables non trouvées : laissées telles quelles.
 */
export function resolveText(template: string, row: MergeRow): string {
  return template.replace(PLACEHOLDER_RE, (_, key: string) => {
    const value = row[key]
    if (value === undefined || value === null) return `{{${key}}}`
    return String(value)
  })
}

/**
 * Résout une valeur de binding propriété (fill, stroke, opacity, src).
 * Retourne la valeur de la colonne ou null si non trouvée.
 */
export function resolveBinding(columnKey: string, row: MergeRow): string | null {
  const value = row[columnKey]
  if (value === undefined || value === null) return null
  return String(value)
}

/**
 * Détermine si une valeur d'image est une URL ou un nom de fichier asset.
 */
export function isImageUrl(value: string): boolean {
  return value.startsWith('http://') || value.startsWith('https://')
}

/**
 * Sanitize un nom de fichier en remplaçant les caractères interdits.
 */
export function sanitizeFileName(name: string): string {
  const sanitized = name.replace(/[/\\:*?"<>|]/g, '_').trim()
  return sanitized || 'export'
}

/**
 * Résout un pattern de nommage avec les valeurs d'une ligne.
 * "carte_{{nom}}_{{poste}}" + row → "carte_Dupont_Designer"
 */
export function resolveFileName(pattern: string, row: MergeRow): string {
  const resolved = resolveText(pattern, row)
  return sanitizeFileName(resolved)
}
```

- [ ] **Step 2 : Vérifier compilation**

```bash
npx tsc --noEmit
```

- [ ] **Step 3 : Commit**

```bash
git add src/features/merge/mergeEngine.ts
git commit -m "feat(merge): create pure merge engine for text/binding resolution"
```

---

### Task 3 : Créer le hook useDataMerge

**Files:**
- Create: `src/features/merge/useDataMerge.ts`

Ce hook orchestre la connexion à une source de données et l'application des bindings sur le canvas Fabric.js.

- [ ] **Step 1 : Créer `src/features/merge/useDataMerge.ts`**

```typescript
import { useCallback, useEffect, useRef } from 'react'
import { Textbox, FabricImage } from 'fabric'
import { doc, getDoc } from 'firebase/firestore'
import { ref, getDownloadURL, listAll } from 'firebase/storage'
import { db, storage } from '@/lib/firebase/config'
import { globalFabricCanvas } from '@/features/editor/CanvasContainer'
import { useMergeStore, type DataSourceRef, type MergeColumn, type MergeRow } from '@/stores/merge.store'
import { useEditorStore } from '@/stores/editor.store'
import { resolveText, resolveBinding, hasPlaceholders, isImageUrl } from './mergeEngine'
import type { ExcelSheet } from '@/features/excel/types'

/** Cache des URLs d'assets du projet */
const assetUrlCache = new Map<string, string>()

/** Cache des images téléchargées (URL → dataURL) */
const imageCache = new Map<string, string>()

export function useDataMerge() {
  const projectId = useEditorStore((s) => s.projectId)
  const {
    dataSource, isConnected, rows, columns, currentRowIndex,
    connect, disconnect: storeDisconnect, nextRow, prevRow, setCurrentRow,
  } = useMergeStore()

  const prevRowIndexRef = useRef<number>(-1)

  /**
   * Connecte une source de données : charge les rows depuis Firestore
   */
  const connectSource = useCallback(async (source: DataSourceRef) => {
    const docRef = doc(db, 'excel_data', source.excelDocId)
    const snap = await getDoc(docRef)
    if (!snap.exists()) throw new Error('Dataset introuvable')

    const data = snap.data()
    const sheets: ExcelSheet[] = JSON.parse(data.sheets)
    const sheet = sheets[source.sheetIndex] ?? sheets[0]

    const cols: MergeColumn[] = sheet.columns.map((c) => ({
      key: c.key,
      label: c.label,
      fieldType: c.fieldType,
    }))

    const mergeRows: MergeRow[] = sheet.rows.map((r) => ({ ...r }))

    connect(source, cols, mergeRows)

    // Capturer les templateText pour tous les textbox avec {{}}
    const canvas = globalFabricCanvas
    if (!canvas) return

    for (const obj of canvas.getObjects()) {
      if (obj instanceof Textbox && obj.text && hasPlaceholders(obj.text)) {
        if (!obj.data) obj.data = {}
        obj.data.templateText = obj.text
      }
    }

    // Appliquer la première ligne
    applyRow(mergeRows[0], cols)
  }, [connect])

  /**
   * Déconnecte la source et restaure les textes template
   */
  const disconnectSource = useCallback(() => {
    const canvas = globalFabricCanvas
    if (canvas) {
      for (const obj of canvas.getObjects()) {
        if (obj instanceof Textbox && obj.data?.templateText) {
          obj.set('text', obj.data.templateText)
          obj.setCoords()
        }
      }
      canvas.requestRenderAll()
    }
    storeDisconnect()
    prevRowIndexRef.current = -1
  }, [storeDisconnect])

  /**
   * Charge l'URL d'un asset du projet par nom de fichier
   */
  const getAssetUrl = useCallback(async (fileName: string): Promise<string | null> => {
    if (!projectId) return null
    if (assetUrlCache.has(fileName)) return assetUrlCache.get(fileName)!

    try {
      const folderRef = ref(storage, `projects/${projectId}/links`)
      const list = await listAll(folderRef)
      for (const item of list.items) {
        if (item.name === fileName || item.name.startsWith(fileName.split('.')[0])) {
          const url = await getDownloadURL(item)
          assetUrlCache.set(fileName, url)
          return url
        }
      }
    } catch { /* ignore */ }
    return null
  }, [projectId])

  /**
   * Télécharge une image et retourne son dataURL (avec cache)
   */
  const loadImage = useCallback(async (urlOrName: string): Promise<string | null> => {
    if (imageCache.has(urlOrName)) return imageCache.get(urlOrName)!

    let url = urlOrName
    if (!isImageUrl(urlOrName)) {
      const assetUrl = await getAssetUrl(urlOrName)
      if (!assetUrl) return null
      url = assetUrl
    }

    try {
      const res = await fetch(url)
      const blob = await res.blob()
      return new Promise((resolve) => {
        const reader = new FileReader()
        reader.onload = () => {
          const dataUrl = reader.result as string
          imageCache.set(urlOrName, dataUrl)
          resolve(dataUrl)
        }
        reader.onerror = () => resolve(null)
        reader.readAsDataURL(blob)
      })
    } catch {
      return null
    }
  }, [getAssetUrl])

  /**
   * Applique une ligne de données sur le canvas
   */
  const applyRow = useCallback(async (row: MergeRow, cols?: MergeColumn[]) => {
    const canvas = globalFabricCanvas
    if (!canvas) return

    for (const obj of canvas.getObjects()) {
      if (obj.data?.isGrid || obj.data?.isPageBg) continue

      // Résolution texte {{variable}}
      if (obj instanceof Textbox && obj.data?.templateText) {
        const resolved = resolveText(obj.data.templateText, row)
        obj.set('text', resolved)
        obj.setCoords()
      }

      // Résolution bindings propriétés
      const bindings = obj.data?.bindings as Record<string, string> | undefined
      if (!bindings) continue

      for (const [prop, columnKey] of Object.entries(bindings)) {
        const value = resolveBinding(columnKey, row)
        if (value === null) continue

        if (prop === 'src' && obj instanceof FabricImage) {
          const imgData = await loadImage(value)
          if (imgData) {
            const imgEl = new Image()
            imgEl.src = imgData
            await new Promise<void>((resolve) => {
              imgEl.onload = () => {
                obj.setElement(imgEl)
                obj.setCoords()
                resolve()
              }
              imgEl.onerror = () => resolve()
            })
          }
        } else if (prop === 'fill' || prop === 'stroke') {
          obj.set(prop, value)
        } else if (prop === 'opacity') {
          const num = parseFloat(value)
          if (!isNaN(num)) obj.set('opacity', Math.min(1, Math.max(0, num)))
        }
      }
    }

    canvas.requestRenderAll()
  }, [loadImage])

  // Réagir aux changements de ligne
  useEffect(() => {
    if (!isConnected || rows.length === 0) return
    if (currentRowIndex === prevRowIndexRef.current) return
    prevRowIndexRef.current = currentRowIndex
    applyRow(rows[currentRowIndex])
  }, [isConnected, currentRowIndex, rows, applyRow])

  return {
    // State
    isConnected,
    dataSource,
    columns,
    rows,
    currentRowIndex,
    totalRows: rows.length,

    // Actions
    connectSource,
    disconnectSource,
    nextRow,
    prevRow,
    setCurrentRow,
    applyRow,
  }
}
```

- [ ] **Step 2 : Vérifier compilation**

```bash
npx tsc --noEmit
```

- [ ] **Step 3 : Commit**

```bash
git add src/features/merge/useDataMerge.ts
git commit -m "feat(merge): create useDataMerge hook for source connection and canvas binding"
```

---

### Task 4 : Créer le hook useBatchExport

**Files:**
- Create: `src/features/merge/useBatchExport.ts`

- [ ] **Step 1 : Créer `src/features/merge/useBatchExport.ts`**

```typescript
import { useCallback, useRef, useState } from 'react'
import { PDFDocument, rgb } from 'pdf-lib'
import PptxGenJS from 'pptxgenjs'
import JSZip from 'jszip'
import { globalFabricCanvas } from '@/features/editor/CanvasContainer'
import { useUIStore } from '@/stores/ui.store'
import { useEditorStore } from '@/stores/editor.store'
import { useMergeStore, type MergeRow } from '@/stores/merge.store'
import { useDataMerge } from './useDataMerge'
import { resolveFileName } from './mergeEngine'

export type ExportFormat = 'pdf' | 'pptx' | 'png'
export type ExportMode = 'multi-page' | 'zip'

export interface BatchExportConfig {
  format: ExportFormat
  mode: ExportMode
  rangeStart: number     // 0-indexed
  rangeEnd: number       // 0-indexed inclusive
  fileNamePattern: string // ex: "carte_{{nom}}"
}

export function useBatchExport() {
  const { canvasWidth, canvasHeight } = useUIStore()
  const projectTitle = useEditorStore((s) => s.projectTitle)
  const { rows } = useMergeStore()
  const { applyRow } = useDataMerge()

  const [progress, setProgress] = useState(0)
  const [total, setTotal] = useState(0)
  const [isExporting, setIsExporting] = useState(false)
  const cancelledRef = useRef(false)

  /**
   * Capture le canvas actuel en dataURL PNG
   */
  const captureCanvas = useCallback((): string => {
    const canvas = globalFabricCanvas
    if (!canvas) return ''

    const origVpt = [...(canvas.viewportTransform ?? [1, 0, 0, 1, 0, 0])]
    const origW = canvas.getWidth()
    const origH = canvas.getHeight()

    canvas.discardActiveObject()
    const gridObjs = canvas.getObjects().filter((o) => o.data?.isGrid)
    gridObjs.forEach((o) => canvas.remove(o))

    canvas.setViewportTransform([1, 0, 0, 1, 0, 0])
    canvas.setDimensions({ width: canvasWidth, height: canvasHeight })
    canvas.requestRenderAll()

    const dataUrl = canvas.toDataURL({ format: 'png', multiplier: 2, quality: 1 })

    canvas.setViewportTransform(origVpt as [number, number, number, number, number, number])
    canvas.setDimensions({ width: origW, height: origH })
    gridObjs.forEach((o) => canvas.add(o))
    canvas.requestRenderAll()

    return dataUrl
  }, [canvasWidth, canvasHeight])

  /**
   * Export batch principal
   */
  const exportBatch = useCallback(async (config: BatchExportConfig) => {
    const selectedRows = rows.slice(config.rangeStart, config.rangeEnd + 1)
    if (selectedRows.length === 0) return

    setIsExporting(true)
    setProgress(0)
    setTotal(selectedRows.length)
    cancelledRef.current = false

    try {
      if (config.mode === 'multi-page' && config.format === 'pdf') {
        await exportMultiPagePdf(selectedRows, config)
      } else {
        await exportZip(selectedRows, config)
      }
    } finally {
      setIsExporting(false)
      setProgress(0)
      setTotal(0)
    }
  }, [rows])

  /**
   * PDF multi-pages : toutes les lignes dans un seul PDF
   */
  const exportMultiPagePdf = useCallback(async (
    selectedRows: MergeRow[],
    config: BatchExportConfig
  ) => {
    const pdfDoc = await PDFDocument.create()

    for (let i = 0; i < selectedRows.length; i++) {
      if (cancelledRef.current) break

      await applyRow(selectedRows[i])
      // Petit délai pour laisser le canvas se mettre à jour
      await new Promise((r) => setTimeout(r, 50))

      const dataUrl = captureCanvas()
      const pngBytes = await fetch(dataUrl).then((r) => r.arrayBuffer())
      const pngImage = await pdfDoc.embedPng(pngBytes)

      const page = pdfDoc.addPage([canvasWidth, canvasHeight])
      page.drawRectangle({ x: 0, y: 0, width: canvasWidth, height: canvasHeight, color: rgb(1, 1, 1) })
      page.drawImage(pngImage, { x: 0, y: 0, width: canvasWidth, height: canvasHeight })

      setProgress(i + 1)
    }

    if (!cancelledRef.current) {
      const pdfBytes = await pdfDoc.save()
      downloadBlob(
        new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' }),
        `${projectTitle.replace(/[^a-z0-9]/gi, '_')}_merge.pdf`
      )
    }
  }, [applyRow, captureCanvas, canvasWidth, canvasHeight, projectTitle])

  /**
   * ZIP de fichiers individuels
   */
  const exportZip = useCallback(async (
    selectedRows: MergeRow[],
    config: BatchExportConfig
  ) => {
    const zip = new JSZip()
    const pxToIn = (px: number) => px / 96

    for (let i = 0; i < selectedRows.length; i++) {
      if (cancelledRef.current) break

      const row = selectedRows[i]
      await applyRow(row)
      await new Promise((r) => setTimeout(r, 50))

      const fileName = resolveFileName(config.fileNamePattern || `export_${i + 1}`, row)

      if (config.format === 'png') {
        const dataUrl = captureCanvas()
        const base64 = dataUrl.split(',')[1]
        zip.file(`${fileName}.png`, base64, { base64: true })

      } else if (config.format === 'pdf') {
        const pdfDoc = await PDFDocument.create()
        const dataUrl = captureCanvas()
        const pngBytes = await fetch(dataUrl).then((r) => r.arrayBuffer())
        const pngImage = await pdfDoc.embedPng(pngBytes)
        const page = pdfDoc.addPage([canvasWidth, canvasHeight])
        page.drawRectangle({ x: 0, y: 0, width: canvasWidth, height: canvasHeight, color: rgb(1, 1, 1) })
        page.drawImage(pngImage, { x: 0, y: 0, width: canvasWidth, height: canvasHeight })
        const pdfBytes = await pdfDoc.save()
        zip.file(`${fileName}.pdf`, pdfBytes)

      } else if (config.format === 'pptx') {
        const pptx = new PptxGenJS()
        const slideW = pxToIn(canvasWidth)
        const slideH = pxToIn(canvasHeight)
        pptx.defineLayout({ name: 'MERGE', width: slideW, height: slideH })
        pptx.layout = 'MERGE'
        const slide = pptx.addSlide()
        slide.background = { fill: 'FFFFFF' }
        const dataUrl = captureCanvas()
        slide.addImage({ data: dataUrl, x: 0, y: 0, w: slideW, h: slideH })
        const pptxBlob = await pptx.write({ outputType: 'blob' }) as Blob
        zip.file(`${fileName}.pptx`, pptxBlob)
      }

      setProgress(i + 1)
    }

    if (!cancelledRef.current) {
      const zipBlob = await zip.generateAsync({ type: 'blob' })
      downloadBlob(zipBlob, `${projectTitle.replace(/[^a-z0-9]/gi, '_')}_merge.zip`)
    }
  }, [applyRow, captureCanvas, canvasWidth, canvasHeight, projectTitle])

  const cancel = useCallback(() => {
    cancelledRef.current = true
  }, [])

  return {
    exportBatch,
    cancel,
    isExporting,
    progress,
    total,
  }
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}
```

- [ ] **Step 2 : Vérifier compilation**

```bash
npx tsc --noEmit
```

- [ ] **Step 3 : Commit**

```bash
git add src/features/merge/useBatchExport.ts
git commit -m "feat(merge): create useBatchExport hook for multi-page PDF and ZIP export"
```

---

### Task 5 : Créer le DataSourcePicker

**Files:**
- Create: `src/features/merge/DataSourcePicker.tsx`

Composant affiché quand aucune source n'est connectée. Permet de choisir un dataset Firestore existant ou d'importer un nouveau fichier.

- [ ] **Step 1 : Créer `src/features/merge/DataSourcePicker.tsx`**

```tsx
import { useState, useEffect, useCallback } from 'react'
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { useAuthStore } from '@/stores/auth.store'
import { useExcelImport } from '@/features/excel/useExcelImport'
import { useExcelFirebase } from '@/features/excel/useExcelFirebase'
import { useDataMerge } from './useDataMerge'
import { Database, Upload, Loader2, FileSpreadsheet } from 'lucide-react'
import type { DataSourceRef } from '@/stores/merge.store'

interface SavedDataset {
  docId: string
  fileName: string
  totalRows: number
  totalColumns: number
  sheetCount: number
  updatedAt: number
}

export function DataSourcePicker() {
  const user = useAuthStore((s) => s.user)
  const { connectSource } = useDataMerge()
  const { importFile } = useExcelImport()
  const { saveToFirebase } = useExcelFirebase()

  const [datasets, setDatasets] = useState<SavedDataset[]>([])
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<'choose' | 'list'>('choose')
  const [importing, setImporting] = useState(false)

  // Charger la liste des datasets existants
  const loadDatasets = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      const q = query(
        collection(db, 'excel_data'),
        where('userId', '==', user.uid),
        orderBy('updatedAt', 'desc')
      )
      const snap = await getDocs(q)
      setDatasets(snap.docs.map((d) => {
        const data = d.data()
        return {
          docId: d.id,
          fileName: data.fileName ?? d.id,
          totalRows: data.totalRows ?? 0,
          totalColumns: data.totalColumns ?? 0,
          sheetCount: data.sheetCount ?? 1,
          updatedAt: data.updatedAt?.toMillis?.() ?? Date.now(),
        }
      }))
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    if (mode === 'list') loadDatasets()
  }, [mode, loadDatasets])

  // Sélectionner un dataset existant
  const handleSelect = async (ds: SavedDataset) => {
    const source: DataSourceRef = {
      excelDocId: ds.docId,
      sheetIndex: 0,
      fileName: ds.fileName,
    }
    await connectSource(source)
  }

  // Construit le même docId que useExcelFirebase.getDocId()
  const getFirebaseDocId = (fileName: string) => {
    const base = fileName.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase()
    return `${user!.uid}_${base}`
  }

  // Import direct d'un fichier
  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    try {
      const sheets = await importFile(file)
      if (sheets && sheets.length > 0) {
        await saveToFirebase(file.name, sheets)
        const source: DataSourceRef = {
          excelDocId: getFirebaseDocId(file.name),
          sheetIndex: 0,
          fileName: file.name,
        }
        await connectSource(source)
      }
    } finally {
      setImporting(false)
    }
  }

  if (mode === 'choose') {
    return (
      <div className="p-3 space-y-2">
        <p className="text-xs text-white/40 text-center mb-3">Aucune source de données</p>
        <button
          onClick={() => setMode('list')}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-md bg-white/5 hover:bg-white/10 text-sm text-white/70 transition-colors"
        >
          <Database className="w-4 h-4 text-indigo-400" />
          Choisir un dataset existant
        </button>
        <label className="w-full flex items-center gap-2 px-3 py-2 rounded-md bg-white/5 hover:bg-white/10 text-sm text-white/70 transition-colors cursor-pointer">
          <Upload className="w-4 h-4 text-indigo-400" />
          {importing ? 'Import en cours...' : 'Importer un fichier Excel/CSV'}
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleFileImport}
            className="hidden"
            disabled={importing}
          />
        </label>
      </div>
    )
  }

  return (
    <div className="p-3 space-y-2">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-white/60 font-medium">Datasets disponibles</span>
        <button
          onClick={() => setMode('choose')}
          className="text-xs text-white/40 hover:text-white/70"
        >
          Retour
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
        </div>
      ) : datasets.length === 0 ? (
        <p className="text-xs text-white/30 text-center py-4">Aucun dataset trouvé</p>
      ) : (
        <div className="space-y-1 max-h-48 overflow-y-auto">
          {datasets.map((ds) => (
            <button
              key={ds.docId}
              onClick={() => handleSelect(ds)}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-md bg-white/5 hover:bg-indigo-500/20 text-left transition-colors"
            >
              <FileSpreadsheet className="w-4 h-4 text-green-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm text-white/80 truncate">{ds.fileName}</div>
                <div className="text-xs text-white/30">{ds.totalRows} lignes · {ds.totalColumns} colonnes</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2 : Vérifier compilation**

```bash
npx tsc --noEmit
```

- [ ] **Step 3 : Commit**

```bash
git add src/features/merge/DataSourcePicker.tsx
git commit -m "feat(merge): create DataSourcePicker for selecting or importing data sources"
```

---

### Task 6 : Créer la modale ExportModal

**Files:**
- Create: `src/features/merge/ExportModal.tsx`

- [ ] **Step 1 : Créer `src/features/merge/ExportModal.tsx`**

```tsx
import { useState } from 'react'
import { X, FileText, Image, Presentation, Loader2 } from 'lucide-react'
import { useMergeStore } from '@/stores/merge.store'
import { useBatchExport, type ExportFormat, type ExportMode, type BatchExportConfig } from './useBatchExport'

interface ExportModalProps {
  open: boolean
  onClose: () => void
}

export function ExportModal({ open, onClose }: ExportModalProps) {
  const totalRows = useMergeStore((s) => s.rows.length)
  const { exportBatch, cancel, isExporting, progress, total } = useBatchExport()

  const [format, setFormat] = useState<ExportFormat>('pdf')
  const [mode, setMode] = useState<ExportMode>('zip')
  const [rangeAll, setRangeAll] = useState(true)
  const [rangeStart, setRangeStart] = useState(1)
  const [rangeEnd, setRangeEnd] = useState(totalRows)
  const [fileNamePattern, setFileNamePattern] = useState('export_{{_id}}')

  if (!open) return null

  const handleExport = () => {
    const config: BatchExportConfig = {
      format,
      mode: format === 'pdf' ? mode : 'zip',
      rangeStart: rangeAll ? 0 : rangeStart - 1,
      rangeEnd: rangeAll ? totalRows - 1 : rangeEnd - 1,
      fileNamePattern,
    }
    exportBatch(config)
  }

  const progressPercent = total > 0 ? Math.round((progress / total) * 100) : 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-[#1a1a1a] border border-white/10 rounded-xl w-[420px] max-h-[80vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <h3 className="text-sm font-semibold text-white">Export en masse</h3>
          <button onClick={onClose} className="text-white/40 hover:text-white/70">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Format */}
          <div>
            <label className="text-xs text-white/50 font-medium mb-2 block">Format</label>
            <div className="flex gap-2">
              {([
                { id: 'pdf', label: 'PDF', icon: FileText },
                { id: 'pptx', label: 'PPTX', icon: Presentation },
                { id: 'png', label: 'PNG', icon: Image },
              ] as const).map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setFormat(id)}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-sm transition-colors ${
                    format === id
                      ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
                      : 'bg-white/5 text-white/50 hover:bg-white/10 border border-transparent'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Mode (PDF uniquement) */}
          {format === 'pdf' && (
            <div>
              <label className="text-xs text-white/50 font-medium mb-2 block">Mode</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setMode('multi-page')}
                  className={`flex-1 px-3 py-2 rounded-md text-sm transition-colors ${
                    mode === 'multi-page'
                      ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
                      : 'bg-white/5 text-white/50 hover:bg-white/10 border border-transparent'
                  }`}
                >
                  PDF multi-pages
                </button>
                <button
                  onClick={() => setMode('zip')}
                  className={`flex-1 px-3 py-2 rounded-md text-sm transition-colors ${
                    mode === 'zip'
                      ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
                      : 'bg-white/5 text-white/50 hover:bg-white/10 border border-transparent'
                  }`}
                >
                  ZIP individuels
                </button>
              </div>
            </div>
          )}

          {/* Lignes */}
          <div>
            <label className="text-xs text-white/50 font-medium mb-2 block">Lignes</label>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm text-white/70">
                <input
                  type="radio"
                  checked={rangeAll}
                  onChange={() => setRangeAll(true)}
                  className="accent-indigo-500"
                />
                Toutes ({totalRows})
              </label>
              <label className="flex items-center gap-2 text-sm text-white/70">
                <input
                  type="radio"
                  checked={!rangeAll}
                  onChange={() => setRangeAll(false)}
                  className="accent-indigo-500"
                />
                Plage :
                <input
                  type="number"
                  min={1}
                  max={totalRows}
                  value={rangeStart}
                  onChange={(e) => setRangeStart(Number(e.target.value))}
                  disabled={rangeAll}
                  className="w-16 px-2 py-1 bg-white/5 border border-white/10 rounded text-xs text-white disabled:opacity-30"
                />
                <span>à</span>
                <input
                  type="number"
                  min={1}
                  max={totalRows}
                  value={rangeEnd}
                  onChange={(e) => setRangeEnd(Number(e.target.value))}
                  disabled={rangeAll}
                  className="w-16 px-2 py-1 bg-white/5 border border-white/10 rounded text-xs text-white disabled:opacity-30"
                />
              </label>
            </div>
          </div>

          {/* Nommage (ZIP uniquement) */}
          {(mode === 'zip' || format !== 'pdf') && (
            <div>
              <label className="text-xs text-white/50 font-medium mb-2 block">
                Nommage des fichiers
              </label>
              <input
                type="text"
                value={fileNamePattern}
                onChange={(e) => setFileNamePattern(e.target.value)}
                placeholder="export_{{nom}}_{{poste}}"
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-md text-sm text-white placeholder:text-white/20"
              />
              <p className="text-xs text-white/30 mt-1">
                Utilisez {'{{colonne}}'} pour insérer des valeurs dynamiques
              </p>
            </div>
          )}

          {/* Progress */}
          {isExporting && (
            <div>
              <div className="flex items-center justify-between text-xs text-white/50 mb-1">
                <span>Export en cours...</span>
                <span>{progress}/{total} ({progressPercent}%)</span>
              </div>
              <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
                <div
                  className="h-full bg-indigo-500 transition-all duration-200"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-white/10">
          {isExporting ? (
            <button
              onClick={cancel}
              className="px-4 py-2 rounded-md bg-red-500/20 text-red-400 text-sm hover:bg-red-500/30 transition-colors"
            >
              Annuler
            </button>
          ) : (
            <>
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-md bg-white/5 text-white/50 text-sm hover:bg-white/10 transition-colors"
              >
                Fermer
              </button>
              <button
                onClick={handleExport}
                className="px-4 py-2 rounded-md bg-indigo-500 text-white text-sm hover:bg-indigo-600 transition-colors flex items-center gap-2"
              >
                {isExporting && <Loader2 className="w-4 h-4 animate-spin" />}
                Exporter {rangeAll ? totalRows : Math.max(0, rangeEnd - rangeStart + 1)} lignes
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2 : Vérifier compilation**

```bash
npx tsc --noEmit
```

- [ ] **Step 3 : Commit**

```bash
git add src/features/merge/ExportModal.tsx
git commit -m "feat(merge): create ExportModal for batch export configuration"
```

---

### Task 7 : Créer le DataMergePanel

**Files:**
- Create: `src/features/merge/DataMergePanel.tsx`

Panneau accordéon principal affiché dans le RightPanelStack. Affiche soit le DataSourcePicker (pas de source), soit l'interface de navigation/bindings.

- [ ] **Step 1 : Créer `src/features/merge/DataMergePanel.tsx`**

```tsx
import { useState, useMemo } from 'react'
import { Textbox, FabricImage } from 'fabric'
import { ChevronLeft, ChevronRight, Unlink, Rocket, Plus, Trash2 } from 'lucide-react'
import { globalFabricCanvas } from '@/features/editor/CanvasContainer'
import { useEditorStore } from '@/stores/editor.store'
import { useMergeStore } from '@/stores/merge.store'
import { useDataMerge } from './useDataMerge'
import { hasPlaceholders } from './mergeEngine'
import { DataSourcePicker } from './DataSourcePicker'
import { ExportModal } from './ExportModal'

export function DataMergePanel() {
  const { isConnected, dataSource, columns, currentRowIndex, totalRows, nextRow, prevRow, disconnectSource } =
    useDataMerge()
  const selectedObjectId = useEditorStore((s) => s.selectedObjectId)
  const [exportOpen, setExportOpen] = useState(false)

  if (!isConnected) {
    return <DataSourcePicker />
  }

  return (
    <div className="text-sm">
      {/* Source info */}
      <div className="px-3 py-2 flex items-center justify-between border-b border-white/5">
        <span className="text-white/70 truncate flex-1">
          <span className="text-indigo-400 font-medium">{dataSource?.fileName}</span>
        </span>
        <span className="text-xs text-white/30 ml-2 shrink-0">{totalRows} lignes</span>
      </div>

      {/* Navigation */}
      <div className="px-3 py-2 border-b border-white/5">
        <div className="flex items-center gap-2 justify-center">
          <button
            onClick={prevRow}
            disabled={currentRowIndex <= 0}
            className="p-1 rounded bg-white/5 hover:bg-white/10 disabled:opacity-20 transition-colors"
          >
            <ChevronLeft className="w-4 h-4 text-white/70" />
          </button>
          <span className="text-indigo-400 font-semibold min-w-[80px] text-center">
            {currentRowIndex + 1} / {totalRows}
          </span>
          <button
            onClick={nextRow}
            disabled={currentRowIndex >= totalRows - 1}
            className="p-1 rounded bg-white/5 hover:bg-white/10 disabled:opacity-20 transition-colors"
          >
            <ChevronRight className="w-4 h-4 text-white/70" />
          </button>
        </div>
      </div>

      {/* Bindings actifs */}
      <ActiveBindings />

      {/* Binding pour objet sélectionné */}
      {selectedObjectId && (
        <BindingEditor selectedObjectId={selectedObjectId} columns={columns} />
      )}

      {/* Actions */}
      <div className="px-3 py-2 flex gap-2">
        <button
          onClick={() => setExportOpen(true)}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-medium transition-colors"
        >
          <Rocket className="w-3.5 h-3.5" />
          Exporter tout ({totalRows})
        </button>
        <button
          onClick={disconnectSource}
          className="p-2 rounded-md bg-white/5 hover:bg-red-500/20 text-white/40 hover:text-red-400 transition-colors"
          title="Déconnecter"
        >
          <Unlink className="w-3.5 h-3.5" />
        </button>
      </div>

      <ExportModal open={exportOpen} onClose={() => setExportOpen(false)} />
    </div>
  )
}

/**
 * Affiche la liste des bindings actifs détectés sur le canvas
 */
function ActiveBindings() {
  const canvas = globalFabricCanvas
  const { isConnected } = useMergeStore()

  const bindings = useMemo(() => {
    if (!canvas || !isConnected) return []
    const result: { name: string; type: string; variables: string[] }[] = []

    for (const obj of canvas.getObjects()) {
      if (obj.data?.isGrid || obj.data?.isPageBg) continue
      const name = obj.data?.name ?? obj.type ?? 'Objet'

      // Texte avec {{}}
      if (obj instanceof Textbox && obj.data?.templateText && hasPlaceholders(obj.data.templateText)) {
        const vars = obj.data.templateText.match(/\{\{(\w+)\}\}/g)?.map((m: string) => m.slice(2, -2)) ?? []
        result.push({ name, type: 'texte', variables: vars })
      }

      // Bindings propriétés
      const b = obj.data?.bindings as Record<string, string> | undefined
      if (b) {
        for (const [prop, col] of Object.entries(b)) {
          result.push({ name, type: prop, variables: [col] })
        }
      }
    }
    return result
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvas, isConnected])

  if (bindings.length === 0) {
    return (
      <div className="px-3 py-3 border-b border-white/5">
        <p className="text-xs text-white/30 text-center">
          Aucune liaison. Tapez {'{{colonne}}'} dans un texte ou liez une propriété ci-dessous.
        </p>
      </div>
    )
  }

  return (
    <div className="px-3 py-2 border-b border-white/5">
      <div className="text-[10px] text-white/30 uppercase tracking-wider mb-1.5">Liaisons actives</div>
      <div className="space-y-1">
        {bindings.map((b, i) => (
          <div key={i} className="flex items-center justify-between text-xs">
            <span className="text-white/60 truncate">
              {b.name} → <code className="text-indigo-400">{b.variables.join(', ')}</code>
            </span>
            <span className={`text-[10px] shrink-0 ml-2 ${
              b.type === 'texte' ? 'text-green-400' :
              b.type === 'src' ? 'text-blue-400' : 'text-amber-400'
            }`}>
              {b.type}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Éditeur de binding pour l'objet sélectionné
 */
function BindingEditor({ selectedObjectId, columns }: { selectedObjectId: string; columns: { key: string; label: string }[] }) {
  const canvas = globalFabricCanvas
  if (!canvas) return null

  const obj = canvas.getObjects().find((o) => o.data?.id === selectedObjectId)
  if (!obj || obj.data?.isGrid || obj.data?.isPageBg) return null

  // Propriétés liables selon le type
  const bindableProps: { key: string; label: string }[] = []
  if (obj instanceof FabricImage) {
    bindableProps.push({ key: 'src', label: 'Source image' })
  }
  bindableProps.push(
    { key: 'fill', label: 'Couleur de fond' },
    { key: 'stroke', label: 'Contour' },
    { key: 'opacity', label: 'Opacité' },
  )

  const currentBindings = (obj.data?.bindings ?? {}) as Record<string, string>

  const updateBinding = (prop: string, columnKey: string) => {
    if (!obj.data) obj.data = {}
    const bindings = { ...(obj.data.bindings as Record<string, string> ?? {}) }
    if (columnKey === '') {
      delete bindings[prop]
    } else {
      bindings[prop] = columnKey
    }
    obj.data.bindings = bindings
    canvas.requestRenderAll()
  }

  return (
    <div className="px-3 py-2 border-b border-white/5">
      <div className="text-[10px] text-white/30 uppercase tracking-wider mb-1.5">
        Lier une propriété — {obj.data?.name ?? obj.type}
      </div>
      <div className="space-y-1.5">
        {bindableProps.map(({ key, label }) => (
          <div key={key} className="flex items-center gap-2">
            <span className="text-xs text-white/50 w-24 shrink-0">{label}</span>
            <select
              value={currentBindings[key] ?? ''}
              onChange={(e) => updateBinding(key, e.target.value)}
              className="flex-1 bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white"
            >
              <option value="">— aucun —</option>
              {columns.map((col) => (
                <option key={col.key} value={col.key}>{col.label}</option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2 : Vérifier compilation**

```bash
npx tsc --noEmit
```

- [ ] **Step 3 : Commit**

```bash
git add src/features/merge/DataMergePanel.tsx
git commit -m "feat(merge): create DataMergePanel with navigation, bindings and export"
```

---

### Task 8 : Intégrer le panneau dans RightPanelStack

**Files:**
- Modify: `src/components/panels/RightPanelStack.tsx`

- [ ] **Step 1 : Ajouter l'import et l'entrée dans `panelConfig`**

Dans `src/components/panels/RightPanelStack.tsx` :

1. Ajouter les imports :
```typescript
import { Database } from 'lucide-react'
import { DataMergePanel } from '@/features/merge/DataMergePanel'
```

2. Ajouter dans `panelConfig` (avant `layers`) :
```typescript
data: { title: 'Données', icon: Database, content: <DataMergePanel /> },
```

Le `panelConfig` complet devient :
```typescript
const panelConfig: Record<string, { title: string; icon: ComponentType<{ className?: string }>; content: ReactNode }> = {
  data: { title: 'Données', icon: Database, content: <DataMergePanel /> },
  layers: { title: 'Calques', icon: Layers, content: <LayersPanel /> },
  images: { title: 'Images', icon: ImagePlus, content: <NanoBanaPanel /> },
  palette: { title: 'Palette', icon: Palette, content: <PalettePanel /> },
  assets: { title: 'Assets', icon: FolderOpen, content: <AssetsPanel /> },
  import: { title: 'Import', icon: Download, content: <ImagesPanel /> },
}
```

- [ ] **Step 2 : Vérifier compilation**

```bash
npx tsc --noEmit
```

- [ ] **Step 3 : Vérifier visuellement**

Lancer l'app et vérifier que le panneau "Données" apparaît dans la pile droite avec l'icône Database.

```bash
npm run dev
```

- [ ] **Step 4 : Commit**

```bash
git add src/components/panels/RightPanelStack.tsx
git commit -m "feat(merge): register DataMergePanel in RightPanelStack"
```

---

### Task 9 : Persister la dataSource dans le projet (save & load)

**Files:**
- Modify: `src/features/editor/useAutoSave.ts`
- Modify: `src/features/editor/useLoadCanvas.ts`

- [ ] **Step 1 : Sauvegarder dataSource dans useAutoSave**

Dans `src/features/editor/useAutoSave.ts`, dans la fonction de sauvegarde qui appelle `updateDoc()` (vers ligne 150-164) :

1. Importer le merge store :
```typescript
import { useMergeStore } from '@/stores/merge.store'
```

2. Dans le hook (au même niveau que les autres `useXxxStore`) :
```typescript
const dataSource = useMergeStore((s) => s.dataSource)
```

3. Ajouter le champ `dataSource` dans l'objet passé à `updateDoc()` :
```typescript
await updateDoc(doc(db, 'projects', projectId), {
  // ... champs existants ...
  dataSource: dataSource ? JSON.stringify(dataSource) : null,
  updatedAt: Date.now(),
})
```

- [ ] **Step 2 : Ajouter `savedDataSource` au merge store**

Dans `src/stores/merge.store.ts`, ajouter au state et aux actions :

```typescript
// Ajouter à l'interface MergeState
savedDataSource: DataSourceRef | null
setSavedDataSource: (source: DataSourceRef | null) => void

// Ajouter à l'implémentation du store
savedDataSource: null,
setSavedDataSource: (source) => set({ savedDataSource: source }),
```

Cela permet de stocker la référence sans charger les rows (reconnexion lazy par l'utilisateur).

- [ ] **Step 3 : Charger dataSource dans useLoadCanvas**

Dans `src/features/editor/useLoadCanvas.ts`, après le chargement du projet (après `syncToStore`) :

1. Importer :
```typescript
import { useMergeStore } from '@/stores/merge.store'
```

2. Récupérer le setter dans le hook :
```typescript
const setSavedDataSource = useMergeStore((s) => s.setSavedDataSource)
```

3. Après le chargement réussi du canvas, charger la dataSource si elle existe :
```typescript
// Restaurer la référence dataSource (sans connexion complète)
if (projectData.dataSource) {
  try {
    setSavedDataSource(JSON.parse(projectData.dataSource))
  } catch { /* ignore */ }
}
```

Le DataSourcePicker vérifiera `savedDataSource` et proposera une reconnexion rapide.

- [ ] **Step 3 : Mettre à jour DataSourcePicker pour la reconnexion**

Dans `src/features/merge/DataSourcePicker.tsx`, ajouter en haut du composant :

```typescript
const savedDataSource = useMergeStore((s) => s.savedDataSource)

// Si une source sauvegardée existe, afficher un bouton de reconnexion
if (savedDataSource) {
  return (
    <div className="p-3 space-y-2">
      <p className="text-xs text-white/40 text-center mb-2">Source précédente disponible</p>
      <button
        onClick={() => connectSource(savedDataSource)}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-md bg-indigo-500/20 hover:bg-indigo-500/30 text-sm text-indigo-400 transition-colors"
      >
        <Database className="w-4 h-4" />
        Reconnecter {savedDataSource.fileName}
      </button>
      <button
        onClick={() => useMergeStore.getState().setSavedDataSource(null)}
        className="w-full text-xs text-white/30 hover:text-white/50 text-center"
      >
        Choisir une autre source
      </button>
    </div>
  )
}
```

- [ ] **Step 4 : Vérifier compilation**

```bash
npx tsc --noEmit
```

- [ ] **Step 5 : Commit**

```bash
git add src/features/editor/useAutoSave.ts src/features/editor/useLoadCanvas.ts src/stores/merge.store.ts src/features/merge/DataSourcePicker.tsx
git commit -m "feat(merge): persist and restore dataSource reference in project"
```

---

### Task 10 : Gérer l'édition texte en mode merge

**Files:**
- Modify: `src/features/merge/useDataMerge.ts`

Ajouter la gestion de l'édition de texte quand le merge est actif : l'utilisateur édite le template, pas le texte résolu.

- [ ] **Step 1 : Ajouter les listeners Fabric dans useDataMerge**

Dans `src/features/merge/useDataMerge.ts`, ajouter un `useEffect` pour intercepter les événements d'édition texte :

```typescript
// Ajouter dans le hook useDataMerge, après l'effect de navigation

/**
 * En mode merge, quand l'utilisateur entre en édition texte :
 * - Afficher le template ({{variables}}) au lieu du texte résolu
 * - À la sortie d'édition, re-capturer le template et re-résoudre
 */
useEffect(() => {
  const canvas = globalFabricCanvas
  if (!canvas || !isConnected) return

  const handleEditingEntered = (e: { target?: unknown }) => {
    const target = e.target
    if (!(target instanceof Textbox)) return
    if (target.data?.templateText) {
      // Afficher le template pour édition
      target.set('text', target.data.templateText)
      canvas.requestRenderAll()
    }
  }

  const handleEditingExited = (e: { target?: unknown }) => {
    const target = e.target
    if (!(target instanceof Textbox)) return
    const currentText = target.text ?? ''

    // Sauvegarder le nouveau template
    if (hasPlaceholders(currentText)) {
      if (!target.data) target.data = {}
      target.data.templateText = currentText
      // Re-résoudre avec la ligne courante
      const row = rows[currentRowIndex]
      if (row) {
        const resolved = resolveText(currentText, row)
        target.set('text', resolved)
      }
    } else {
      // Plus de placeholders — retirer le template
      if (target.data?.templateText) {
        delete target.data.templateText
      }
    }
    canvas.requestRenderAll()
  }

  canvas.on('text:editing:entered', handleEditingEntered)
  canvas.on('text:editing:exited', handleEditingExited)

  return () => {
    canvas.off('text:editing:entered', handleEditingEntered)
    canvas.off('text:editing:exited', handleEditingExited)
  }
}, [isConnected, rows, currentRowIndex])
```

- [ ] **Step 2 : Vérifier compilation**

```bash
npx tsc --noEmit
```

- [ ] **Step 3 : Commit**

```bash
git add src/features/merge/useDataMerge.ts
git commit -m "feat(merge): handle text editing in merge mode (edit template, not resolved text)"
```

---

### Task 11 : Test d'intégration et polish

**Files:**
- Tous les fichiers créés/modifiés

- [ ] **Step 1 : Vérifier la compilation complète**

```bash
npx tsc --noEmit
```

- [ ] **Step 2 : Lancer l'app et tester le flow complet**

```bash
npm run dev
```

Tests manuels à effectuer :
1. Ouvrir un projet dans l'éditeur
2. Déplier le panneau "Données" → voir le DataSourcePicker
3. Importer un fichier Excel ou sélectionner un dataset existant
4. Vérifier la connexion : nombre de lignes, colonnes listées
5. Créer un Textbox avec `{{colonne}}` → vérifier la résolution
6. Naviguer entre les lignes avec ◀ ▶ → vérifier la mise à jour du canvas
7. Sélectionner une image → lier `src` à une colonne → vérifier le changement
8. Double-cliquer un texte résolu → vérifier que le template apparaît
9. Modifier le template → sortir → vérifier la re-résolution
10. Cliquer "Exporter tout" → configurer format/mode → lancer l'export
11. Vérifier le fichier téléchargé (PDF multi-pages ou ZIP)
12. Déconnecter la source → vérifier la restauration des templates
13. Recharger la page → vérifier que la reconnexion est proposée

- [ ] **Step 3 : Corriger les éventuels bugs**

Corriger tout problème détecté lors des tests manuels.

- [ ] **Step 4 : Commit final**

```bash
git add -A
git commit -m "feat(merge): complete data merge feature integration and fixes"
```
