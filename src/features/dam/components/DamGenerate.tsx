import { useWorkspaceUid } from '@/features/access/useWorkspaceUid'
import { useCallback, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sparkles, Loader2, Download, Plus, RotateCcw, Save, Check, Paperclip, X, File as FileIcon, Wand2, MessageCircleQuestion, ZoomIn } from 'lucide-react'
import { toast } from 'sonner'
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage'
import { doc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db, storage } from '../../../lib/firebase/config'
import { useQuota } from '../../access/useAccess'
import { useEditorStore } from '../../../stores/editor.store'
import { useProjectStore } from '../../../stores/project.store'
import { useUIStore } from '../../../stores/ui.store'
import {
  generateImage,
  type ReferenceImage,
  type OutputFormat,
  type ImageSize,
  type ImageAspectRatio,
} from '../../briefs/ai/geminiImageClient'
import {
  improveImagePrompt,
  type ImprovementAnswer,
} from '../../briefs/ai/improveImagePrompt'
import { ImprovePromptDialog } from './ImprovePromptDialog'
import { ImageZoomOverlay } from './ImageZoomOverlay'
import { autoTagAsset } from '../autoTag'
import { t, useTranslation } from '@/lib/i18n'

type AspectRatio = ImageAspectRatio
type Resolution = ImageSize

const ASPECT_RATIOS: { value: AspectRatio; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: '1:1', label: '1:1' },
  { value: '16:9', label: '16:9' },
  { value: '9:16', label: '9:16' },
  { value: '4:3', label: '4:3' },
  { value: '3:4', label: '3:4' },
]

const RESOLUTIONS: { value: Resolution; label: string }[] = [
  { value: '1K', label: '1K' },
  { value: '2K', label: '2K' },
  { value: '4K', label: '4K' },
]

interface GenerateConfig {
  outputFormat: OutputFormat
  temperature: number
  aspectRatio: AspectRatio
  resolution: Resolution
  numberOfImages: number
}

const DEFAULT_CONFIG: GenerateConfig = {
  outputFormat: 'images-text',
  temperature: 1,
  aspectRatio: 'auto',
  resolution: '1K',
  numberOfImages: 1,
}

interface GeneratedImage {
  url: string
  blob: Blob
  /** Prompt brut tapé par l'utilisateur (avant amélioration IA). */
  originalPrompt?: string
  /** Prompt final envoyé à Image IA (après amélioration). */
  improvedPrompt: string
  /** Questions Q&A posées + réponses choisies (mode "Avec questions" uniquement). */
  clarifications?: ImprovementAnswer[]
  /** id du doc dam_assets si l'image a été sauvegardée. */
  savedId?: string
  /** En cours de sauvegarde — désactive le bouton. */
  saving?: boolean
}

interface RefFile {
  id: string
  name: string
  size: number
  mimeType: string
  /** base64 sans préfixe data: */
  data: string
  /** blob URL pour preview (uniquement si image) */
  previewUrl?: string
}

async function readFileAsBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer()
  return arrayBufferToBase64(buf)
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  let binary = ''
  const bytes = new Uint8Array(buf)
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

const isSvgFile = (file: File): boolean =>
  file.type === 'image/svg+xml' || /\.svg$/i.test(file.name)

/** Rastérise un SVG en PNG côté navigateur (Gemini Image n'accepte pas image/svg+xml). */
async function rasterizeSvgToPng(file: File): Promise<{ blob: Blob; base64: string }> {
  const text = await file.text()
  const svgBlob = new Blob([text], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(svgBlob)
  try {
    const img = new Image()
    img.decoding = 'async'
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('SVG image load failed'))
      img.src = url
    })
    let w = img.naturalWidth
    let h = img.naturalHeight
    if (!w || !h) {
      const viewBox = text.match(/viewBox\s*=\s*["']([-\d.\s]+)["']/i)?.[1]
      if (viewBox) {
        const parts = viewBox.trim().split(/[\s,]+/).map(Number)
        if (parts.length === 4 && parts.every(Number.isFinite)) {
          w = parts[2]
          h = parts[3]
        }
      }
    }
    if (!w || !h) {
      w = 1024
      h = 1024
    }
    const MAX_SIDE = 2048
    const scale = Math.min(1, MAX_SIDE / Math.max(w, h))
    const targetW = Math.max(1, Math.round(w * scale))
    const targetH = Math.max(1, Math.round(h * scale))
    const canvas = document.createElement('canvas')
    canvas.width = targetW
    canvas.height = targetH
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error(t('err.noCanvas'))
    ctx.drawImage(img, 0, 0, targetW, targetH)
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('canvas.toBlob failed'))), 'image/png')
    })
    const base64 = arrayBufferToBase64(await blob.arrayBuffer())
    return { blob, base64 }
  } finally {
    URL.revokeObjectURL(url)
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
}

export function DamGenerate() {
  const { t } = useTranslation()
  const [prompt, setPrompt] = useState('')
  /** Prompt brut avant la première amélioration IA. Effacé à chaque nouvelle génération ou
   *  remis à zéro quand l'utilisateur édite manuellement le textarea après amélioration. */
  const [originalPrompt, setOriginalPrompt] = useState<string | null>(null)
  /** Q&R remontées par ImprovePromptDialog. Reset en même temps que originalPrompt. */
  const [clarifications, setClarifications] = useState<ImprovementAnswer[] | null>(null)
  const [config, setConfig] = useState<GenerateConfig>(DEFAULT_CONFIG)
  const [generating, setGenerating] = useState(false)
  const [improving, setImproving] = useState(false)
  const [images, setImages] = useState<GeneratedImage[]>([])
  const [error, setError] = useState<string | null>(null)
  const [refs, setRefs] = useState<RefFile[]>([])
  const [dragging, setDragging] = useState(false)
  const [improveDialogOpen, setImproveDialogOpen] = useState(false)
  const [zoomSrc, setZoomSrc] = useState<string | null>(null)
  const refInputRef = useRef<HTMLInputElement>(null)
  const userId = useWorkspaceUid()
  // L'insertion canvas n'a de sens que si un projet d'édition est ouvert.
  const projectId = useEditorStore((s) => s.projectId)
  const canInsertCanvas = !!projectId
  const setPendingDamInsert = useProjectStore((s) => s.setPendingDamInsert)
  const setDamPickerOpen = useUIStore((s) => s.setDamPickerOpen)
  const navigate = useNavigate()
  const quota = useQuota()
  // Quota démo d'assets DAM plein → la génération finirait par une sauvegarde refusée
  // (dam_assets gaté serveur). On bloque en amont avec un message clair.
  const damQuotaFull = quota.isDemo && !quota.canAddDam(1)

  const handleAddRefs = useCallback(async (files: FileList | File[]) => {
    const arr = Array.from(files)
    if (arr.length === 0) return
    const added: RefFile[] = []
    for (const file of arr) {
      try {
        const id = `ref_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
        if (isSvgFile(file)) {
          const { blob, base64 } = await rasterizeSvgToPng(file)
          added.push({
            id,
            name: file.name.replace(/\.svg$/i, '.png'),
            size: blob.size,
            mimeType: 'image/png',
            data: base64,
            previewUrl: URL.createObjectURL(blob),
          })
          continue
        }
        const data = await readFileAsBase64(file)
        const mimeType = file.type || 'application/octet-stream'
        added.push({
          id,
          name: file.name,
          size: file.size,
          mimeType,
          data,
          previewUrl: mimeType.startsWith('image/') ? URL.createObjectURL(file) : undefined,
        })
      } catch (err) {
        console.error('Reading the file failed:', err)
        toast.error(t('dam.gen.readError', { name: file.name }))
      }
    }
    if (added.length > 0) setRefs((prev) => [...prev, ...added])
  }, [])

  /** Capte les images collées (clipboard) et les ajoute aux fichiers de référence.
   *  Le texte du presse-papier suit son comportement par défaut (insertion dans le textarea). */
  const handlePromptPaste = useCallback(
    async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const items = e.clipboardData?.items
      if (!items || items.length === 0) return
      const imageFiles: File[] = []
      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          const file = item.getAsFile()
          if (file) {
            const ext = file.type.split('/')[1] || 'png'
            const named =
              file.name && file.name !== 'image.png'
                ? file
                : new File([file], `pasted-${Date.now()}.${ext}`, { type: file.type })
            imageFiles.push(named)
          }
        }
      }
      if (imageFiles.length > 0) {
        e.preventDefault()
        await handleAddRefs(imageFiles)
        toast.success(
          imageFiles.length === 1
            ? t('dam.gen.pasted')
            : t('dam.gen.pasted.other', { count: imageFiles.length }),
        )
      }
    },
    [handleAddRefs],
  )

  const handleImprovePrompt = useCallback(async () => {
    const current = prompt.trim()
    if (!current || improving || generating) return
    setImproving(true)
    try {
      const imageRefs = refs
        .filter((r) => r.mimeType.startsWith('image/'))
        .map((r) => ({ data: r.data, mimeType: r.mimeType, name: r.name }))
      const improved = await improveImagePrompt(current, imageRefs)
      // Capture le prompt brut avant d'écraser le textarea — uniquement à la
      // première amélioration d'une session (les améliorations successives
      // gardent l'original).
      if (!originalPrompt) setOriginalPrompt(current)
      // Amélioration one-shot → pas de Q&R, on les efface.
      setClarifications(null)
      setPrompt(improved)
      toast.success(
        imageRefs.length > 0
          ? t('dam.gen.improved', { count: imageRefs.length })
          : t('dam.gen.improved.plain'),
      )
    } catch (err) {
      console.error('Improve prompt failed:', err)
      toast.error(err instanceof Error ? err.message : t('tst.dam.improveFailed'))
    } finally {
      setImproving(false)
    }
  }, [prompt, refs, improving, generating, originalPrompt])

  const handleRemoveRef = useCallback((id: string) => {
    setRefs((prev) => {
      const target = prev.find((r) => r.id === id)
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl)
      return prev.filter((r) => r.id !== id)
    })
  }, [])

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim() || generating) return
    setGenerating(true)
    setError(null)

    try {
      const referenceImages: ReferenceImage[] = refs.map((r) => ({
        mimeType: r.mimeType,
        data: r.data,
        label: r.name,
      }))

      const finalPrompt = prompt.trim()
      const results: GeneratedImage[] = []
      for (let i = 0; i < config.numberOfImages; i++) {
        const { blob } = await generateImage(finalPrompt, referenceImages, {
          outputFormat: config.outputFormat,
          imageSize: config.resolution,
          aspectRatio: config.aspectRatio,
        })
        const url = URL.createObjectURL(blob)
        results.push({
          url,
          blob,
          improvedPrompt: finalPrompt,
          originalPrompt: originalPrompt ?? undefined,
          clarifications: clarifications ?? undefined,
        })
      }
      setImages(results)
    } catch (err) {
      console.error('Generation failed:', err)
      setError(err instanceof Error ? err.message : t('dam.gen.error'))
    } finally {
      setGenerating(false)
    }
  }, [prompt, config, refs, generating, originalPrompt, clarifications])

  const handleDownload = useCallback((img: GeneratedImage, index: number) => {
    const a = document.createElement('a')
    a.href = img.url
    a.download = `nano-banana-${Date.now()}-${index + 1}.png`
    a.click()
  }, [])

  /** Sauvegarde dans le DAM (Firebase Storage + Firestore dam_assets) — visible
   *  ensuite dans l'onglet « Mes images ». */
  const handleSave = useCallback(
    async (img: GeneratedImage, index: number) => {
      if (!userId) {
        toast.error(t('dam.gen.signInToSave'))
        return
      }
      if (img.savedId || img.saving) return

      setImages((prev) =>
        prev.map((p, i) => (i === index ? { ...p, saving: true } : p)),
      )

      try {
        const id = `nb_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
        // Path sous users/<uid>/ — déjà couvert par les Storage rules existantes
        // (cf. storage.rules : `match /users/{uid}/{allPaths=**}`).
        const path = `users/${userId}/dam-generated/${id}.png`
        const fileRef = storageRef(storage, path)
        await uploadBytes(fileRef, img.blob, { contentType: 'image/png' })
        const url = await getDownloadURL(fileRef)

        // Récupère width/height depuis le blob pour les métadonnées.
        const dims = await new Promise<{ w: number; h: number }>((resolve) => {
          const i = new Image()
          i.onload = () => resolve({ w: i.naturalWidth, h: i.naturalHeight })
          i.onerror = () => resolve({ w: 0, h: 0 })
          i.src = img.url
        })
        const orientation: 'landscape' | 'portrait' | 'square' =
          dims.w > dims.h ? 'landscape' : dims.h > dims.w ? 'portrait' : 'square'

        await setDoc(doc(db, 'dam_assets', id), {
          sourceProvider: 'nanobana',
          sourceId: id,
          sourceUrl: url,
          thumbnailUrl: url,
          previewUrl: url,
          fullUrl: url,
          width: dims.w,
          height: dims.h,
          photographer: 'Image IA',
          photographerUrl: '',
          description: img.improvedPrompt || prompt.trim(),
          improvedPrompt: img.improvedPrompt || prompt.trim(),
          ...(img.originalPrompt ? { originalPrompt: img.originalPrompt } : {}),
          ...(img.clarifications && img.clarifications.length > 0
            ? { promptClarifications: img.clarifications }
            : {}),
          tags: [],
          color: '#000000',
          orientation,
          addedBy: userId,
          addedAt: serverTimestamp(),
          usageCount: 0,
        })

        // Tagging IA en arrière-plan (best-effort) : tags + couleur dominante.
        void autoTagAsset(id, url)

        setImages((prev) =>
          prev.map((p, i) =>
            i === index ? { ...p, savedId: id, saving: false } : p,
          ),
        )
        toast.success(t('dam.gen.savedToDam'))
      } catch (err) {
        console.error('Save to DAM failed:', err)
        setImages((prev) =>
          prev.map((p, i) => (i === index ? { ...p, saving: false } : p)),
        )
        toast.error(err instanceof Error ? err.message : t('tst.dam.saveFailed'))
      }
    },
    [userId, prompt],
  )

  const handleInsertCanvas = useCallback(
    (img: GeneratedImage) => {
      if (!projectId) {
        toast.error(t('dam.gen.noProject'))
        return
      }
      const damImage = {
        id: `gen-${Date.now()}`,
        sourceProvider: 'nanobana' as const,
        sourceId: '',
        sourceUrl: '',
        thumbnailUrl: img.url,
        previewUrl: img.url,
        fullUrl: img.url,
        width: 1024,
        height: 1024,
        photographer: 'Image IA',
        photographerUrl: '',
        description: img.improvedPrompt || prompt,
        tags: [],
        color: '#000000',
        orientation: 'square' as const,
      }
      // Stocke l'image en pending, ferme la modale DAM si elle est ouverte
      // par-dessus l'éditeur, puis navigue vers /editor/<projectId>. EditorPage
      // l'insère dès que le canvas Fabric est prêt. Si on est déjà sur la bonne
      // route, navigate ne re-monte rien — seule la mutation du store déclenche
      // le useEffect d'insertion.
      setPendingDamInsert(damImage)
      setDamPickerOpen(false)
      navigate(`/editor/${projectId}`)
    },
    [projectId, prompt, setPendingDamInsert, setDamPickerOpen, navigate]
  )

  return (
    <div className="flex h-full">
      {/* Config sidebar */}
      <div className="w-[260px] bg-surface-2 border-r border-white/5 p-4 flex flex-col gap-4 overflow-y-auto shrink-0">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="w-4 h-4 text-indigo-400" />
          <span className="text-xs font-medium text-white/80">{t('dam.gen.title')}</span>
        </div>

        {/* Prompt */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <div className="text-[9px] text-white/40 uppercase tracking-wider">{t('dam.gen.prompt')}</div>
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => setImproveDialogOpen(true)}
                disabled={!prompt.trim() || improving || generating}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider text-indigo-300 hover:text-indigo-200 hover:bg-indigo-500/10 disabled:opacity-30 disabled:cursor-not-allowed transition"
                title={t('dam.gen.improve.help')}
              >
                <MessageCircleQuestion className="w-2.5 h-2.5" />
                {t('dam.gen.withQuestions')}
              </button>
              <button
                type="button"
                onClick={handleImprovePrompt}
                disabled={!prompt.trim() || improving || generating}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider text-indigo-300 hover:text-indigo-200 hover:bg-indigo-500/10 disabled:opacity-30 disabled:cursor-not-allowed transition"
                title={t('dam.gen.rewrite.help')}
              >
                {improving ? (
                  <Loader2 className="w-2.5 h-2.5 animate-spin" />
                ) : (
                  <Wand2 className="w-2.5 h-2.5" />
                )}
                {t(improving ? 'dam.gen.inProgress' : 'dam.gen.improve')}
              </button>
            </div>
          </div>
          <textarea
            value={prompt}
            onChange={(e) => {
              setPrompt(e.target.value)
              // L'utilisateur modifie le textarea après amélioration → on perd
              // la notion d'« avant/après » : on efface l'originalPrompt et les
              // Q&R pour éviter de sauvegarder un couple incohérent.
              if (originalPrompt !== null) setOriginalPrompt(null)
              if (clarifications !== null) setClarifications(null)
            }}
            onPaste={handlePromptPaste}
            placeholder={t('dam.gen.describe')}
            rows={4}
            className="w-full min-h-[96px] bg-[#fff] border border-white/10 rounded-lg px-3 py-2 text-sm text-[#111] placeholder:text-[#111]/40 outline-none focus:border-indigo-500/50 resize-y"
          />
        </div>

        {/* Fichiers de référence */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <div className="text-[9px] text-white/40 uppercase tracking-wider">
              {t('dam.gen.refFiles')}
            </div>
            {refs.length > 0 && (
              <span className="text-[9px] text-white/30 tabular-nums">{refs.length}</span>
            )}
          </div>

          <div
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              if (e.dataTransfer.files?.length) void handleAddRefs(e.dataTransfer.files)
            }}
            className={`rounded-lg border border-dashed p-2 flex flex-col gap-1.5 transition ${
              dragging ? 'border-indigo-400 bg-indigo-500/10' : 'border-white/10 bg-surface-2'
            }`}
          >
            {refs.length > 0 && (
              <ul className="flex flex-col gap-1">
                {refs.map((r) => (
                  <li
                    key={r.id}
                    className="flex items-center gap-2 px-1.5 py-1 rounded bg-white/[0.03] border border-white/5"
                  >
                    {r.previewUrl ? (
                      <button
                        type="button"
                        onClick={() => setZoomSrc(r.previewUrl ?? null)}
                        className="w-7 h-7 rounded bg-white/5 overflow-hidden flex items-center justify-center shrink-0 cursor-zoom-in relative group focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                        title={t('dam.gen.enlarge')}
                      >
                        <img src={r.previewUrl} alt="" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
                          <ZoomIn className="w-3 h-3 text-white" />
                        </div>
                      </button>
                    ) : (
                      <div className="w-7 h-7 rounded bg-white/5 overflow-hidden flex items-center justify-center shrink-0">
                        <FileIcon className="w-3.5 h-3.5 text-white/40" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] text-white/80 truncate">{r.name}</div>
                      <div className="text-[9px] text-white/35">{formatSize(r.size)}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveRef(r.id)}
                      className="p-1 rounded hover:bg-white/10 text-white/40 hover:text-white/80 transition"
                      title={t('dam.gen.remove')}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <button
              type="button"
              onClick={() => refInputRef.current?.click()}
              className="flex items-center justify-center gap-1.5 w-full px-2 py-1.5 rounded text-[10px] text-white/55 hover:text-white/85 hover:bg-white/5 transition"
            >
              <Paperclip className="w-3 h-3" />
              {t(refs.length === 0 ? 'dam.gen.addFiles' : 'dam.gen.addMoreFiles')}
            </button>
          </div>

          <input
            ref={refInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) {
                void handleAddRefs(e.target.files)
                e.target.value = ''
              }
            }}
          />
          <p className="text-[9px] text-white/30 mt-1 leading-snug">
            {t('dam.gen.refFiles.hint')}
          </p>
        </div>

        {/* Output format */}
        <div>
          <div className="text-[9px] text-white/40 uppercase tracking-wider mb-1.5">{t('dam.gen.outputFormat')}</div>
          <div className="flex gap-1">
            <button
              onClick={() => setConfig((c) => ({ ...c, outputFormat: 'images-text' }))}
              className={`flex-1 px-2 py-1.5 rounded text-[10px] transition ${
                config.outputFormat === 'images-text'
                  ? 'bg-indigo-500/20 text-indigo-400'
                  : 'bg-white/5 text-white/50 hover:bg-white/10'
              }`}
            >
              {t('dam.gen.imagesAndText')}
            </button>
            <button
              onClick={() => setConfig((c) => ({ ...c, outputFormat: 'images-only' }))}
              className={`flex-1 px-2 py-1.5 rounded text-[10px] transition ${
                config.outputFormat === 'images-only'
                  ? 'bg-indigo-500/20 text-indigo-400'
                  : 'bg-white/5 text-white/50 hover:bg-white/10'
              }`}
            >
              {t('dam.gen.imagesOnly')}
            </button>
          </div>
        </div>

        {/* Temperature */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <div className="text-[9px] text-white/40 uppercase tracking-wider">{t('dam.gen.temperature')}</div>
            <span className="text-[10px] text-white/50 font-mono">{config.temperature.toFixed(1)}</span>
          </div>
          <input
            type="range"
            min={0}
            max={2}
            step={0.1}
            value={config.temperature}
            onChange={(e) => setConfig((c) => ({ ...c, temperature: parseFloat(e.target.value) }))}
            className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-indigo-500
              [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3
              [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-indigo-500"
          />
          <div className="flex justify-between text-[9px] text-white/20 mt-0.5">
            <span>{t('dam.gen.precise')}</span>
            <span>{t('dam.gen.creative')}</span>
          </div>
        </div>

        {/* Aspect ratio */}
        <div>
          <div className="text-[9px] text-white/40 uppercase tracking-wider mb-1.5">{t('dam.gen.ratio')}</div>
          <div className="flex flex-wrap gap-1">
            {ASPECT_RATIOS.map((ar) => (
              <button
                key={ar.value}
                onClick={() => setConfig((c) => ({ ...c, aspectRatio: ar.value }))}
                className={`px-2 py-1 rounded text-[10px] transition ${
                  config.aspectRatio === ar.value
                    ? 'bg-indigo-500/20 text-indigo-400'
                    : 'bg-white/5 text-white/50 hover:bg-white/10'
                }`}
              >
                {ar.label}
              </button>
            ))}
          </div>
        </div>

        {/* Resolution */}
        <div>
          <div className="text-[9px] text-white/40 uppercase tracking-wider mb-1.5">{t('dam.gen.resolution')}</div>
          <div className="flex gap-1">
            {RESOLUTIONS.map((r) => (
              <button
                key={r.value}
                onClick={() => setConfig((c) => ({ ...c, resolution: r.value }))}
                className={`px-2.5 py-1 rounded text-[10px] transition ${
                  config.resolution === r.value
                    ? 'bg-indigo-500/20 text-indigo-400'
                    : 'bg-white/5 text-white/50 hover:bg-white/10'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {/* Number of images */}
        <div>
          <div className="text-[9px] text-white/40 uppercase tracking-wider mb-1.5">{t('dam.gen.count')}</div>
          <div className="flex gap-1">
            {[1, 2, 4].map((n) => (
              <button
                key={n}
                onClick={() => setConfig((c) => ({ ...c, numberOfImages: n }))}
                className={`px-3 py-1 rounded text-[10px] transition ${
                  config.numberOfImages === n
                    ? 'bg-indigo-500/20 text-indigo-400'
                    : 'bg-white/5 text-white/50 hover:bg-white/10'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {/* Generate button */}
        <button
          onClick={handleGenerate}
          disabled={!prompt.trim() || generating || damQuotaFull}
          title={damQuotaFull ? t('pim.quota.visuals') : undefined}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-indigo-500 text-[#fff] text-sm font-medium hover:bg-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed transition mt-2"
        >
          {generating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              {t('dam.gen.generating')}
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              {t('dam.gen.generate')}
            </>
          )}
        </button>
      </div>

      {/* Result area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {images.length === 0 && !generating && !error && (
          <div className="flex-1 flex flex-col items-center justify-center text-white/20 gap-3">
            <Sparkles className="w-12 h-12" />
            <div className="text-sm">{t('dam.gen.enterPrompt')}</div>
            <div className="text-[10px] text-white/10 max-w-[300px] text-center">
              Powered by Gemini — Image IA
            </div>
          </div>
        )}

        {generating && (
          <div className="flex-1 flex flex-col items-center justify-center text-white/30 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
            <div className="text-sm">{t('dam.gen.generating')}</div>
          </div>
        )}

        {error && (
          <div className="m-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            {error}
          </div>
        )}

        {images.length > 0 && !generating && (
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-xs text-white/50">
                {t(images.length > 1 ? 'dam.gen.imagesGenerated.other' : 'dam.gen.imagesGenerated.one', { count: images.length })}
              </div>
              <button
                onClick={() => {
                  images.forEach((img) => URL.revokeObjectURL(img.url))
                  setImages([])
                }}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] text-white/40 hover:text-white/60 hover:bg-white/5 transition"
              >
                <RotateCcw className="w-3 h-3" />
                Effacer
              </button>
            </div>

            <div className={`grid gap-3 ${images.length === 1 ? 'grid-cols-1 max-w-[600px] mx-auto' : 'grid-cols-2'}`}>
              {images.map((img, i) => (
                <div key={i} className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => setZoomSrc(img.url)}
                    className="group rounded-lg overflow-hidden bg-surface-2 relative cursor-zoom-in focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                    title={t('dam.gen.clickToEnlarge')}
                  >
                    <img
                      src={img.url}
                      alt={`Generated ${i + 1}`}
                      className="w-full object-contain"
                    />
                    <div className="absolute top-2 right-2 p-1.5 rounded-md bg-black/60 text-[#fff]/0 group-hover:text-[#fff]/90 transition pointer-events-none">
                      <ZoomIn className="w-3.5 h-3.5" />
                    </div>
                  </button>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleDownload(img, i)}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white/80 text-xs transition"
                      title={t('dam.gen.downloadPng')}
                    >
                      <Download className="w-3.5 h-3.5" />
                      {t('dam.gen.download')}
                    </button>
                    <button
                      onClick={() => handleSave(img, i)}
                      disabled={img.saving || !!img.savedId}
                      className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition border ${
                        img.savedId
                          ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 cursor-default'
                          : 'bg-white/5 hover:bg-white/10 border-white/10 text-white/80 disabled:opacity-50'
                      }`}
                      title={
                        img.savedId
                          ? t('dam.gen.alreadySaved')
                          : t('dam.gen.saveToDam')
                      }
                    >
                      {img.saving ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : img.savedId ? (
                        <Check className="w-3.5 h-3.5" />
                      ) : (
                        <Save className="w-3.5 h-3.5" />
                      )}
                      {t(img.savedId ? 'dam.gen.savedShort' : img.saving ? 'dam.gen.inProgress' : 'dam.gen.save')}
                    </button>
                    <button
                      onClick={() => handleInsertCanvas(img)}
                      disabled={!canInsertCanvas}
                      className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition ${
                        canInsertCanvas
                          ? 'bg-indigo-500 hover:bg-indigo-600 text-[#fff]'
                          : 'bg-white/5 border border-white/10 text-white/30 cursor-not-allowed'
                      }`}
                      title={
                        canInsertCanvas
                          ? t('dam.gen.insertCanvas')
                          : t('dam.gen.insertCanvas.off')
                      }
                    >
                      <Plus className="w-3.5 h-3.5" />
                      {t('dam.gen.insertEditor')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <ImprovePromptDialog
        open={improveDialogOpen}
        onClose={() => setImproveDialogOpen(false)}
        brief={prompt}
        refs={refs
          .filter((r) => r.mimeType.startsWith('image/'))
          .map((r) => ({ data: r.data, mimeType: r.mimeType, name: r.name }))}
        onImproved={(improved, answers) => {
          if (!originalPrompt) setOriginalPrompt(prompt)
          setClarifications(answers)
          setPrompt(improved)
        }}
      />

      <ImageZoomOverlay
        open={zoomSrc !== null}
        src={zoomSrc ?? ''}
        onClose={() => setZoomSrc(null)}
      />
    </div>
  )
}
