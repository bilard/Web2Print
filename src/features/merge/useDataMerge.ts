import { useCallback, useEffect, useRef } from 'react'
import { IText, Textbox, FabricImage } from 'fabric'
import { doc, getDoc } from 'firebase/firestore'
import { ref, getDownloadURL, listAll } from 'firebase/storage'
import { db, storage } from '@/lib/firebase/config'
import { globalFabricCanvas } from '@/features/editor/CanvasContainer'
import { syncToStore } from '@/features/editor/useAddObject'
import { useMergeStore, type DataSourceRef, type MergeColumn, type MergeRow } from '@/stores/merge.store'
import { useEditorStore } from '@/stores/editor.store'
import { resolveText, resolveBinding, hasPlaceholders, isImageUrl, remapStyles } from './mergeEngine'
import { formatPriceParts, type PriceSegment } from './priceFormat'
import { fitScaleForWidth, clampFitFont, MIN_FIT_FONT, FIT_SHRINK_STEP } from './fitToZone'
import { collectObjectsDeep, refreshAncestorGroups } from '@/features/editor/deepObjects'
import { isPimSource, pimProjectIdFromSource, loadPimMergeData } from './pimSource'
import { evaluateFormula as evaluateExcelFormula } from '@/features/excel/formulaEngine'
import { ENRICHMENT_ALIASES } from '@/features/excel/ai-enrichment/useSaveEnrichedProduct'
import type { ExcelSheet, CellValue } from '@/features/excel/types'

/**
 * Fonction pure : met à jour `data.originText` et `data.originStyles` d'un bloc
 * Textbox IDML après édition directe, UNIQUEMENT en état déconnecté.
 *
 * Appelée depuis un handler `text:editing:exited` toujours attaché (indépendant
 * de l'état de connexion) pour que l'édition hors connexion soit préservée au save.
 *
 * Conditions pour agir :
 *  - Le bloc a `data.originText` (bloc IDML balisé)
 *  - La source n'est PAS connectée (sinon obj.text = preview de ligne, pas la valeur stable)
 *  - Le texte édité ne contient pas de `{{}}` (pas de template retapé)
 *
 * Exporté pour les tests unitaires.
 */
export function syncOriginTextOnEdit(
  target: { text?: string; data?: Record<string, unknown>; styles?: unknown },
  isConnected: boolean,
): void {
  if (!target.data) return
  if (typeof target.data.originText !== 'string') return
  if (isConnected) return
  const currentText = target.text ?? ''
  if (hasPlaceholders(currentText)) return
  target.data.originText = currentText
  const styles = (target as any).styles as Record<number, Record<number, Record<string, unknown>>> | undefined
  if (styles && Object.keys(styles).length > 0) {
    target.data.originStyles = JSON.parse(JSON.stringify(styles))
  }
}

/** Cache des URLs d'assets du projet */
const assetUrlCache = new Map<string, string>()

/** Cache des images téléchargées (URL → dataURL) */
const imageCache = new Map<string, string>()

/**
 * Auto-fit la largeur d'un Textbox à placeholder unique sur son contenu — MAIS
 * seulement si la valeur résolue tient sur UNE ligne dans le cadre d'origine.
 *
 * Piège : une description longue se replie sur plusieurs lignes. `calcTextWidth()`
 * renvoie alors la ligne wrappée la PLUS LONGUE (< largeur du cadre). Régler
 * `width` sur cette valeur replie le texte sur ENCORE plus de lignes — et comme
 * `autoFitWidth` est persisté puis ré-appliqué au chargement, la description
 * gagnait une ligne à CHAQUE sauvegarde/rechargement. On garde donc le cadre
 * fixe dès que le contenu déborde sur 2 lignes ou plus.
 */
export function autoFitPlaceholderWidth(tb: Textbox): void {
  const data = ((tb as any).data ??= {}) as Record<string, unknown>
  // Largeur du cadre de référence (capturée AVANT tout auto-fit).
  const frameW = (data.originalWidth as number | undefined) ?? tb.width ?? 0
  if (data.originalWidth === undefined) data.originalWidth = frameW
  // Mesurer le wrapping AU CADRE D'ORIGINE.
  tb.set({ width: frameW, scaleX: 1, scaleY: 1 })
  ;(tb as any).initDimensions?.()
  const lineCount = ((tb as any)._textLines as unknown[] | undefined)?.length ?? 1
  if (lineCount > 1) {
    // Contenu multi-ligne → cadre fixe, pas d'auto-fit (et purge de l'ancienne valeur).
    delete data.autoFitWidth
    tb.setCoords()
    return
  }
  // Contenu sur une seule ligne → ajuster la largeur au contenu.
  const minW = Math.max((tb as any).calcTextWidth(), 10)
  data.autoFitWidth = minW
  tb.set({ width: minW })
  ;(tb as any).initDimensions?.()
  tb.setCoords()
}

/**
 * « Supprimer la ligne si vide » pour les champs SÉPARÉS d'un bloc (imports
 * PDF) : resolveText vide bien le texte, mais le Textbox occupait toujours sa
 * place — le trou ne se refermait pas. Cette passe masque les champs vidés
 * par l'option et REMONTE les frères du bloc situés en dessous, comme une
 * vraie suppression de ligne ; tout est réversible à chaque changement de
 * ligne (positions d'origine mémorisées dans data.mergeBaseTop).
 */
function compactHiddenMergeFields(canvas: NonNullable<typeof globalFabricCanvas>): void {
  const { hideLineIfEmpty } = useMergeStore.getState()
  const groups = new Set<import('fabric').Group>()
  for (const obj of collectObjectsDeep(canvas.getObjects())) {
    const g = (obj as FabricObjectWithData).group
    if (obj.data?.templateText && g) groups.add(g)
  }
  for (const g of groups) {
    const children = g.getObjects() as FabricObjectWithData[]
    // 1. Restaure l'état d'origine (positions + visibilité) du bloc.
    for (const c of children) {
      if (!c.data) c.data = {}
      if (c.data.mergeBaseTop === undefined) {
        c.data.mergeBaseTop = c.top ?? 0
        c.data.mergeBaseHeight = (c.height ?? 0) * (c.scaleY ?? 1)
      } else {
        c.set({ top: c.data.mergeBaseTop as number })
      }
      if (c.data.mergeHidden) {
        c.set({ visible: true })
        delete c.data.mergeHidden
      }
    }
    // 2. Masque les champs vidés par « Supprimer la ligne si vide ».
    const hidden: FabricObjectWithData[] = []
    for (const c of children) {
      const tmpl = c.data?.templateText as string | undefined
      if (!tmpl) continue
      const keys = Array.from(tmpl.matchAll(/\{\{([^}]+)\}\}/g), (m) => m[1])
      const text = (c as unknown as IText).text ?? ''
      if (text.trim() === '' && keys.some((k) => hideLineIfEmpty?.[k])) {
        c.set({ visible: false })
        c.data!.mergeHidden = true
        hidden.push(c)
      }
    }
    // 3. Compacte : remonte les frères situés SOUS chaque champ masqué.
    for (const h of hidden) {
      const hTop = (h.data?.mergeBaseTop as number) ?? h.top ?? 0
      const hHeight = (h.data?.mergeBaseHeight as number) ?? 0
      for (const c of children) {
        if (c === h || c.data?.mergeHidden) continue
        if ((c.top ?? 0) > hTop) c.set({ top: (c.top ?? 0) - hHeight })
      }
    }
    for (const c of children) c.setCoords()
    g.triggerLayout()
    g.set('dirty', true)
  }
}

type FabricObjectWithData = import('fabric').FabricObject & {
  data?: Record<string, unknown>
  group?: import('fabric').Group
}

export interface FitZone { width: number; height: number; maxLines?: number }

/**
 * « Réduire pour tenir dans la zone » : abaisse la taille de police (et celle
 * des styles par caractère, ex. le « € » plus petit) jusqu'à ce que la valeur
 * tienne dans la zone capturée. Une seule ligne → contrainte de largeur
 * (linéaire) ; cadre qui wrappe (Textbox) → contrainte de hauteur (itératif,
 * le wrapping rend la hauteur non linéaire). Les styles sont supposés déjà
 * remappés à leur taille d'origine (remapStyles) au moment de l'appel.
 */
function fitTextToZone(obj: IText, zone: FitZone, baseFontSize: number): void {
  const isWrap = obj instanceof Textbox
  const anyObj = obj as unknown as {
    styles?: Record<string, Record<string, { fontSize?: number }>>
    calcTextWidth?: () => number
    initDimensions?: () => void
  }
  // Tailles par caractère telles que posées par remapStyles (= originales).
  const styleSizes: { l: string; c: string; size: number }[] = []
  if (anyObj.styles) {
    for (const [l, line] of Object.entries(anyObj.styles)) {
      for (const [c, ch] of Object.entries(line)) {
        if (typeof ch.fontSize === 'number') styleSizes.push({ l, c, size: ch.fontSize })
      }
    }
  }
  const apply = (scale: number) => {
    obj.set('fontSize', clampFitFont(baseFontSize * scale))
    for (const s of styleSizes) {
      const cell = anyObj.styles?.[s.l]?.[s.c]
      if (cell) cell.fontSize = clampFitFont(s.size * scale)
    }
    obj.set(isWrap ? { width: zone.width, scaleX: 1, scaleY: 1 } : { scaleX: 1, scaleY: 1 })
    anyObj.initDimensions?.()
  }
  apply(1)
  if (isWrap) {
    let scale = 1
    let guard = 0
    while ((obj.height ?? 0) > zone.height + 0.5 && baseFontSize * scale > MIN_FIT_FONT && guard < 60) {
      scale *= FIT_SHRINK_STEP
      apply(scale)
      guard++
    }
  } else {
    const w = anyObj.calcTextWidth?.() ?? 0
    if (w > zone.width) {
      let scale = fitScaleForWidth(w, zone.width)
      apply(scale)
      let guard = 0
      while ((anyObj.calcTextWidth?.() ?? 0) > zone.width + 0.5 && baseFontSize * scale > MIN_FIT_FONT && guard < 12) {
        scale *= 0.97
        apply(scale)
        guard++
      }
    }
  }
  obj.setCoords()
}

interface PriceFormatStyle {
  integerStyle?: object
  currencyStyle?: object
  decimalsStyle?: object
  currency: string
}

/** Map de styles Fabric (ligne 0) : applique le style capturé de chaque rôle à ses caractères. */
function buildPriceStyles(
  segments: PriceSegment[],
  pf: PriceFormatStyle,
): Record<number, Record<number, object>> {
  const line: Record<number, object> = {}
  let idx = 0
  for (const seg of segments) {
    const style =
      seg.role === 'integer' ? pf.integerStyle
      : seg.role === 'currency' ? pf.currencyStyle
      : pf.decimalsStyle
    for (let i = 0; i < seg.text.length; i++) {
      if (style) line[idx] = JSON.parse(JSON.stringify(style)) as object
      idx++
    }
  }
  return { 0: line }
}

export function useDataMerge() {
  const projectId = useEditorStore((s) => s.projectId)
  const {
    dataSource, isConnected, rows, columns, currentRowIndex,
    connect, disconnect: storeDisconnect, nextRow, prevRow, setCurrentRow,
  } = useMergeStore()

  const prevRowIndexRef = useRef<number>(-1)
  const applyRowRef = useRef<((row: MergeRow, cols?: MergeColumn[]) => Promise<void>) | null>(null)

  const connectSource = useCallback(async (source: DataSourceRef) => {
    let cols: MergeColumn[]
    let mergeRows: MergeRow[]

    if (isPimSource(source)) {
      // Source PIM (« re-skin de promo ») : les produits master du projet sont les lignes.
      const data = await loadPimMergeData(pimProjectIdFromSource(source))
      cols = data.columns
      mergeRows = data.rows
    } else {
      // Lit d'abord les méta dans `excel_data` (toujours autorisé) ; si `sheets`
      // est encore inline (legacy non migré), on l'utilise direct, sinon on va
      // chercher le blob dans `excel_data_payload`. NB : on n'attaque PAS le
      // payload en premier — la rule deny les reads sur doc inexistant.
      const metaSnap = await getDoc(doc(db, 'excel_data', source.excelDocId))
      if (!metaSnap.exists()) throw new Error('Dataset introuvable')
      const meta = metaSnap.data()
      let sheets: ExcelSheet[]
      if (typeof meta.sheets === 'string') {
        sheets = JSON.parse(meta.sheets)
      } else {
        const payloadSnap = await getDoc(doc(db, 'excel_data_payload', source.excelDocId))
        if (!payloadSnap.exists()) throw new Error('Dataset vide ou corrompu')
        sheets = JSON.parse(payloadSnap.data().json)
      }
      const sheet = sheets[source.sheetIndex] ?? sheets[0]

      cols = sheet.columns.map((c) => ({
        key: c.key,
        label: c.label,
        fieldType: c.fieldType,
        aliases: ENRICHMENT_ALIASES[c.key],
      }))

      // Pre-compute formula columns so {{formula_key}} resolves correctly in templates
      const formulaCols = sheet.columns.filter((c) => c.fieldType === 'formula' && c.formula)
      mergeRows = sheet.rows.map((r) => {
        const row: MergeRow = { ...r }
        for (const col of formulaCols) {
          const value = evaluateExcelFormula(col.formula!, row as Record<string, CellValue>, sheet.columns)
          if (col.formulaResultType === 'number' && col.formulaDecimals != null) {
            const num = typeof value === 'number' ? value : parseFloat(String(value ?? '').replace(',', '.'))
            row[col.key] = isNaN(num) ? String(value ?? '') : num.toFixed(col.formulaDecimals)
          } else {
            row[col.key] = value == null ? '' : String(value)
          }
        }
        return row
      })
    }

    // Capturer les templateText AVANT connect() (sinon le re-render
    // déclenché par connect() exécute le memo avant la capture)
    const canvas = globalFabricCanvas
    if (canvas) {
      for (const obj of collectObjectsDeep(canvas.getObjects())) {
        if (obj instanceof IText && obj.text && hasPlaceholders(obj.text)) {
          if (!obj.data) obj.data = {}
          obj.data.templateText = obj.text
          // Ne pas écraser templateStyles s'il existe déjà (provient d'un bind ou d'un rechargement correct)
          if (!obj.data.templateStyles) {
            const styles = (obj as any).styles
            if (styles && Object.keys(styles).length > 0) {
              obj.data.templateStyles = JSON.parse(JSON.stringify(styles))
            }
          }
        }
      }
    }

    connect(source, cols, mergeRows)

    // Appliquer la première ligne puis auto-fit les blocs purement liés
    if (canvas) {
      await applyRowRef.current?.(mergeRows[0], cols)
      // Auto-fit uniquement les Textbox dont tout le contenu est un placeholder unique
      for (const obj of collectObjectsDeep(canvas.getObjects())) {
        if (!(obj instanceof Textbox)) continue
        if (!obj.data) continue
        const tmpl = obj.data.templateText as string | undefined
        if (!tmpl) continue
        if (obj.data.mergeFrame) continue // cadre fixe (champ PDF) : pas d'auto-fit
        if (obj.data.fitToZone) continue // « tenir dans la zone » : géré par applyRow
        const isSinglePlaceholder = /^\{\{[^}]+\}\}$/.test(tmpl.trim())
        if (isSinglePlaceholder) {
          autoFitPlaceholderWidth(obj)
          refreshAncestorGroups(obj)
        }
      }
      canvas.requestRenderAll()
      // Persister la nouvelle taille des blocs auto-fit dans le store
      syncToStore(canvas)
    }
  }, [connect])

  const disconnectSource = useCallback(() => {
    const canvas = globalFabricCanvas
    if (canvas) {
      for (const obj of collectObjectsDeep(canvas.getObjects())) {
        if (obj instanceof IText && obj.data?.templateText) {
          // Restaure l'état du bloc (champ masqué/compacté par « Supprimer la ligne si vide »)
          if (obj.data.mergeHidden) { obj.set({ visible: true }); delete obj.data.mergeHidden }
          if (obj.data.mergeBaseTop !== undefined) obj.set({ top: obj.data.mergeBaseTop as number })
          const restore = (obj.data.originText ?? obj.data.templateText) as string
          obj.set('text', restore)
          // Restaurer les styles originaux du template
          const restoreStyles = (obj.data.originStyles ?? obj.data.templateStyles) as Record<number, Record<number, Record<string, unknown>>> | undefined
          if (restoreStyles && Object.keys(restoreStyles).length > 0) {
            ;(obj as any).styles = JSON.parse(JSON.stringify(restoreStyles))
            ;(obj as any).dirty = true
          }
          obj.setCoords()
          refreshAncestorGroups(obj)
        }
      }
      canvas.requestRenderAll()
    }
    storeDisconnect()
    prevRowIndexRef.current = -1
  }, [storeDisconnect])

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

  const applyRow = useCallback(async (row: MergeRow, _cols?: MergeColumn[]) => {
    const canvas = globalFabricCanvas
    if (!canvas) return

    // ANCRAGE des blocs de champs : substitutions + triggerLayout recentrent
    // le groupe à chaque passe → dérive cumulative (le bloc « montait » à
    // chaque changement de ligne). On mémorise la bbox absolue de chaque bloc
    // AVANT la passe et on la ré-ancre après — les déplacements manuels de
    // l'utilisateur restent respectés (le snapshot part de la position courante).
    const groupAnchors = new Map<import('fabric').Group, { left: number; top: number }>()
    for (const obj of collectObjectsDeep(canvas.getObjects())) {
      const g = (obj as FabricObjectWithData).group
      if (obj.data?.templateText && g && !groupAnchors.has(g)) {
        const bb = g.getBoundingRect()
        groupAnchors.set(g, { left: bb.left, top: bb.top })
      }
    }

    for (const obj of collectObjectsDeep(canvas.getObjects())) {
      if (obj.data?.isGrid || obj.data?.isPageBg) continue

      // Résolution texte {{variable}} — IText couvre aussi les Textbox ;
      // les textes des imports PDF sont des IText.
      if (obj instanceof IText) {
        // Auto-capture templateText si pas encore stocké mais texte contient {{}}
        if (!obj.data?.templateText && obj.text && hasPlaceholders(obj.text)) {
          if (!obj.data) obj.data = {}
          obj.data.templateText = obj.text
          const styles = (obj as any).styles
          if (styles && Object.keys(styles).length > 0) {
            obj.data.templateStyles = JSON.parse(JSON.stringify(styles))
          }
        }
        if (obj.data?.templateText) {
          const { formulas, hideLineIfEmpty, formulaConfigs, columns, fieldMap } = useMergeStore.getState()
          const tmpl = obj.data.templateText as string
          const tStyles = obj.data.templateStyles as Record<number, Record<number, Record<string, unknown>>> | undefined
          // Cadre de composition fixe (champ PDF aligné/wrappé) : pas d'auto-fit.
          const fitToZone = obj.data?.fitToZone === true && !!obj.data?.fitZone
          const isSinglePlaceholder = !fitToZone && !obj.data?.mergeFrame && /^\{\{[^}]+\}\}$/.test(tmpl.trim())
          const resolved = resolveText(tmpl, row, formulas, hideLineIfEmpty, formulaConfigs, columns, fieldMap)
          const priceFormat = obj.data.priceFormat as PriceFormatStyle | undefined
          const priceParts = priceFormat ? formatPriceParts(resolved, priceFormat.currency, 2) : null
          if (priceFormat && priceParts) {
            // Bloc « prix » : reformater « entier<devise>,centimes » + styles par partie.
            obj.set('text', priceParts.text)
            ;(obj as any).styles = buildPriceStyles(priceParts.segments, priceFormat)
          } else {
            obj.set('text', resolved)
            // Repositionner les styles des caractères littéraux (%, DT, etc.)
            if (tStyles && Object.keys(tStyles).length > 0) {
              const remapped = remapStyles(tmpl, tStyles, row, formulas, hideLineIfEmpty, formulaConfigs, columns, fieldMap)
              ;(obj as any).styles = remapped
            }
          }

          if (fitToZone) {
            // « Réduire pour tenir dans la zone » : abaisse la police (styles inclus).
            const base = (obj.data!.baseFontSize as number | undefined) ?? obj.fontSize ?? 16
            fitTextToZone(obj, obj.data!.fitZone as FitZone, base)
          } else if (obj instanceof Textbox && isSinglePlaceholder) {
            // Auto-fit largeur pour blocs à placeholder unique (taille adaptée à
            // chaque valeur), SAUF si la valeur se replie sur plusieurs lignes
            // (alors cadre fixe — sinon la description gagne une ligne par save).
            autoFitPlaceholderWidth(obj)
            // Re-appliquer les styles après initDimensions (par précaution)
            if (tStyles && Object.keys(tStyles).length > 0) {
              const remapped = remapStyles(tmpl, tStyles, row, formulas, hideLineIfEmpty, formulaConfigs, columns, fieldMap)
              ;(obj as any).styles = remapped
            }
          }

          obj.setCoords()
          ;(obj as any).dirty = true
          refreshAncestorGroups(obj)
        }
      }

      // Résolution bindings propriétés
      const bindings = obj.data?.bindings as Record<string, string> | undefined
      if (!bindings) continue

      const { columns: storeColumns } = useMergeStore.getState()
      for (const [prop, columnKey] of Object.entries(bindings)) {
        const value = resolveBinding(columnKey, row, storeColumns)
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
      refreshAncestorGroups(obj)
    }

    // Champs vidés par « Supprimer la ligne si vide » : masque + compacte le bloc.
    compactHiddenMergeFields(canvas)

    // Ré-ancre chaque bloc sur sa bbox d'avant la passe (zéro dérive).
    for (const [g, before] of groupAnchors) {
      g.setCoords()
      const after = g.getBoundingRect()
      const dx = before.left - after.left
      const dy = before.top - after.top
      if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) {
        g.set({ left: (g.left ?? 0) + dx, top: (g.top ?? 0) + dy })
        g.setCoords()
      }
    }

    canvas.requestRenderAll()
  }, [loadImage])

  // Synchroniser applyRowRef après chaque render pour éviter dépendance circulaire
  applyRowRef.current = applyRow

  /** Active/désactive « Réduire pour tenir dans la zone » sur un champ texte. */
  const setFitToZone = useCallback((objectId: string, enabled: boolean) => {
    const canvas = globalFabricCanvas
    if (!canvas) return
    const obj = collectObjectsDeep(canvas.getObjects()).find(
      (o) => (o as FabricObjectWithData).data?.id === objectId,
    )
    if (!(obj instanceof IText)) return
    if (!obj.data) obj.data = {}
    if (enabled) {
      // Capture la boîte TELLE QU'AFFICHÉE (avant tout repli d'échelle) = zone,
      // puis replie scaleY dans la police pour une base propre.
      const zoneW = obj.getScaledWidth()
      const zoneH = obj.getScaledHeight()
      const sy = obj.scaleY ?? 1
      obj.set({ fontSize: (obj.fontSize ?? 16) * sy, scaleX: 1, scaleY: 1 })
      if (obj instanceof Textbox) obj.set({ width: zoneW })
      ;(obj as unknown as { initDimensions?: () => void }).initDimensions?.()
      obj.data.baseFontSize = obj.fontSize
      const fz: FitZone = { width: zoneW, height: zoneH }
      // Cadre qui wrappe : exposer une cible en nombre de lignes (éditable, V3).
      if (obj instanceof Textbox) {
        const lh = obj.lineHeight ?? 1.16
        fz.maxLines = Math.max(1, Math.round(zoneH / ((obj.fontSize ?? 16) * lh)))
      }
      obj.data.fitZone = fz
      obj.data.fitToZone = true
    } else {
      obj.data.fitToZone = false
      if (typeof obj.data.baseFontSize === 'number') {
        obj.set({ fontSize: obj.data.baseFontSize as number })
      }
    }
    const { rows: r, currentRowIndex: idx } = useMergeStore.getState()
    if (r[idx]) applyRow(r[idx])
    refreshAncestorGroups(obj)
    canvas.requestRenderAll()
    syncToStore(canvas)
  }, [applyRow])

  /** Ajuste la zone cible explicite (V3) — largeur px et/ou nombre de lignes. */
  const setFitZone = useCallback((objectId: string, patch: { width?: number; lines?: number }) => {
    const canvas = globalFabricCanvas
    if (!canvas) return
    const obj = collectObjectsDeep(canvas.getObjects()).find(
      (o) => (o as FabricObjectWithData).data?.id === objectId,
    )
    if (!(obj instanceof IText) || !obj.data) return
    const zone = (obj.data.fitZone as FitZone | undefined) ?? {
      width: obj.getScaledWidth(),
      height: obj.getScaledHeight(),
    }
    const base = (obj.data.baseFontSize as number | undefined) ?? obj.fontSize ?? 16
    const lh = obj.lineHeight ?? 1.16
    const next: FitZone = { ...zone }
    if (patch.width != null && patch.width > 0) next.width = patch.width
    if (patch.lines != null && patch.lines >= 1) {
      next.maxLines = Math.round(patch.lines)
      next.height = next.maxLines * base * lh
    }
    obj.data.fitZone = next
    const { rows: r, currentRowIndex: idx } = useMergeStore.getState()
    if (r[idx]) applyRow(r[idx])
    refreshAncestorGroups(obj)
    canvas.requestRenderAll()
    syncToStore(canvas)
  }, [applyRow])

  // Réagir aux changements de ligne
  useEffect(() => {
    if (!isConnected || rows.length === 0) return
    if (currentRowIndex === prevRowIndexRef.current) return
    prevRowIndexRef.current = currentRowIndex
    applyRow(rows[currentRowIndex])
  }, [isConnected, currentRowIndex, rows, applyRow])

  // Re-merger immédiatement quand le mapping explicite (fieldMap) change
  const fieldMap = useMergeStore((s) => s.fieldMap)
  useEffect(() => {
    if (!isConnected) return
    const { rows: r, currentRowIndex: idx } = useMergeStore.getState()
    if (r[idx]) applyRow(r[idx])
  }, [fieldMap, isConnected, applyRow])

  // Intercepter l'édition de texte en mode merge
  useEffect(() => {
    const canvas = globalFabricCanvas
    if (!canvas || !isConnected) return

    const handleEditingEntered = (e: { target?: unknown }) => {
      const target = e.target
      if (!(target instanceof IText)) return
      if (target.data?.templateText && !target.data?.originText) {
        target.set('text', target.data.templateText)
        // Restaurer les styles du template pour que handleEditingExited capture les bons indices
        const tStyles = target.data.templateStyles as Record<number, Record<number, Record<string, unknown>>> | undefined
        if (tStyles && Object.keys(tStyles).length > 0) {
          ;(target as any).styles = JSON.parse(JSON.stringify(tStyles))
        }
        canvas.requestRenderAll()
      }
      // bloc IDML balisé (originText présent) : on laisse la valeur affichée (édition de la valeur)
    }

    const handleEditingExited = (e: { target?: unknown }) => {
      const target = e.target
      if (!(target instanceof IText)) return
      const currentText = target.text ?? ''

      // Note : la sync originText en déconnecté est gérée par un effet séparé
      // (syncOriginTextOnEdit) pour ne pas polluer la valeur stable en connecté.

      if (hasPlaceholders(currentText)) {
        // Le texte a des {{}} → mettre à jour le template et capturer les styles actuels
        if (!target.data) target.data = {}
        target.data.templateText = currentText
        // Sauvegarder les styles tels que tapés (dans le template)
        const currentStyles = (target as any).styles as Record<number, Record<number, Record<string, unknown>>>
        if (currentStyles && Object.keys(currentStyles).length > 0) {
          target.data.templateStyles = JSON.parse(JSON.stringify(currentStyles))
        } else {
          delete target.data.templateStyles
        }
        const { formulas, hideLineIfEmpty, formulaConfigs, columns, fieldMap } = useMergeStore.getState()
        const row = rows[currentRowIndex]
        if (row) {
          const resolved = resolveText(currentText, row, formulas, hideLineIfEmpty, formulaConfigs, columns, fieldMap)
          target.set('text', resolved)
          const tStyles = target.data.templateStyles as Record<number, Record<number, Record<string, unknown>>> | undefined
          if (tStyles && Object.keys(tStyles).length > 0) {
            ;(target as any).styles = remapStyles(currentText, tStyles, row, formulas, hideLineIfEmpty, formulaConfigs, columns, fieldMap)
          }
        }
      } else if (target.data?.templateText) {
        // Le texte n'a pas de {{}} mais un template existe →
        // l'utilisateur a peut-être juste changé une propriété (couleur, etc.)
        // On re-résout depuis le template existant sans le supprimer
        const { formulas, hideLineIfEmpty, formulaConfigs, columns, fieldMap } = useMergeStore.getState()
        const row = rows[currentRowIndex]
        const tmpl = target.data.templateText as string
        const tStyles = target.data.templateStyles as Record<number, Record<number, Record<string, unknown>>> | undefined
        if (row) {
          const resolved = resolveText(tmpl, row, formulas, hideLineIfEmpty, formulaConfigs, columns, fieldMap)
          target.set('text', resolved)
          if (tStyles && Object.keys(tStyles).length > 0) {
            ;(target as any).styles = remapStyles(tmpl, tStyles, row, formulas, hideLineIfEmpty, formulaConfigs, columns, fieldMap)
          }
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

  // Sync originText/originStyles en déconnecté — handler TOUJOURS attaché,
  // indépendant de l'état de connexion. Lit isConnected via getState() au
  // moment de l'event pour éviter une closure stale. globalFabricCanvas est
  // lue dans le handler (pas à l'effet mount) : si le canvas n'est pas encore
  // prêt au mount, les events canvas seront attachés dès que le canvas sera
  // disponible lors du prochain render déclenché par projectId.
  useEffect(() => {
    const canvas = globalFabricCanvas
    if (!canvas) return

    const handleSyncOrigin = (e: { target?: unknown }) => {
      const target = e.target
      if (!(target instanceof IText)) return
      const { isConnected: connected } = useMergeStore.getState()
      syncOriginTextOnEdit(
        target as { text?: string; data?: Record<string, unknown>; styles?: unknown },
        connected,
      )
    }

    canvas.on('text:editing:exited', handleSyncOrigin)
    return () => {
      canvas.off('text:editing:exited', handleSyncOrigin)
    }
  }, [projectId])

  return {
    isConnected,
    dataSource,
    columns,
    rows,
    currentRowIndex,
    totalRows: rows.length,
    connectSource,
    disconnectSource,
    nextRow,
    prevRow,
    setCurrentRow,
    applyRow,
    setFitToZone,
    setFitZone,
  }
}
