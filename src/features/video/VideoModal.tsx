import { useRef, useState } from 'react'
import { Film, X, Loader2, Sparkles, AlertTriangle, HelpCircle, Square, Image as ImageIcon, Eraser } from 'lucide-react'
import { toast } from 'sonner'
import { useGenerateVideo, type GenerateVideoSource } from './useGenerateVideo'
import { useRenderProgress } from './useRenderProgress'
import { RenderProgress } from './RenderProgress'
import { VideoResult } from './VideoResult'
import { AspectPicker, type AspectChoice, type CustomDims } from './AspectPicker'
import { DurationPicker, type DurationChoice, resolveDurationSec } from './DurationPicker'
import { HyperframesPlayer } from './HyperframesPlayer'
import { FileDropzone } from './FileDropzone'
import { VideoPromptLibrary } from './VideoPromptLibrary'
import { useVideoPromptLibrary, type VideoPrompt } from './useVideoPromptLibrary'
import { useEnrichComposition } from './useEnrichComposition'
import { useAuthStore } from '@/stores/auth.store'
import type { AspectFormat } from './types'
import { detectAspect } from './types'
import type { StyleConfig } from './promptToStyleConfig'
import type { Composition } from './promptToComposition'

interface VideoModalProps {
  onClose: () => void
  source?: GenerateVideoSource
}

interface ResultState {
  /** Identifiant local de l'animation (généré côté client). Sert au filename
   *  ZIP et de clé de sauvegarde DAM. */
  id: string
  aspect: AspectFormat
  /** Mode standalone : composition multi-scènes Gemini. */
  composition?: Composition
  /** Mode canvas : SVG capturé. */
  svg?: string
  styleConfig?: StyleConfig
  width?: number
  height?: number
  durationSec?: number
  caption?: string
  brand?: string
  prompt?: string
}

interface LivePreviewState {
  svg?: string
  composition?: Composition
  aspect: AspectFormat
  styleConfig?: StyleConfig
  brand?: string
  caption?: string
  prompt?: string
  /** Dimensions exactes de la vidéo cible (mode canvas) — la preview les utilise
   *  pour adopter le ratio canvas plutôt que le bucket aspect. */
  width?: number
  height?: number
  /** Durée choisie par l'utilisateur — propagée au HyperframesPlayer pour
   *  que la preview live respecte aussi la durée (et pas juste le ZIP). */
  durationSec?: number
}

function FieldLabel({
  children,
  hint,
  optional,
  htmlFor,
}: {
  children: React.ReactNode
  hint?: string
  optional?: boolean
  htmlFor?: string
}) {
  return (
    <div className="flex items-center justify-between mb-2">
      <label
        htmlFor={htmlFor}
        className="flex items-center gap-1.5 text-xs font-semibold text-white/60 uppercase tracking-wider"
      >
        <span>{children}</span>
        {hint && (
          <span title={hint} className="text-white/30 hover:text-white/60 cursor-help">
            <HelpCircle className="w-3 h-3" />
          </span>
        )}
      </label>
      {optional && <span className="text-[10px] text-white/30">Optionnel</span>}
    </div>
  )
}

function buildCombinedPrompt(parts: {
  topic: string
  audience?: string
  goal?: string
  tone?: string
  freeform?: string
}): string {
  const segments: string[] = []
  if (parts.topic) segments.push(`[Sujet]\n${parts.topic.trim()}`)
  if (parts.audience?.trim()) segments.push(`[Audience]\n${parts.audience.trim()}`)
  if (parts.goal?.trim()) segments.push(`[Objectif]\n${parts.goal.trim()}`)
  if (parts.tone?.trim()) segments.push(`[Ton]\n${parts.tone.trim()}`)
  if (parts.freeform?.trim()) segments.push(`[Instructions libres]\n${parts.freeform.trim()}`)
  return segments.join('\n\n')
}

function mapCustomToAspect(custom: CustomDims): AspectFormat {
  return detectAspect(custom.width, custom.height)
}

/** Mappe un aspect stocké (3 valeurs concrètes) vers le picker (qui accepte
 *  aussi 'auto' et 'custom'). On retombe sur le concret pour préselectionner. */
function aspectChoiceFromFormat(aspect?: AspectFormat | null): AspectChoice {
  if (aspect === 'square' || aspect === 'portrait' || aspect === 'landscape') return aspect
  return 'auto'
}

export function VideoModal({ onClose, source = 'canvas' }: VideoModalProps) {
  const isStandalone = source === 'standalone'
  const [topic, setTopic] = useState('')
  const [audience, setAudience] = useState('')
  const [goal, setGoal] = useState('')
  const [tone, setTone] = useState('')
  const [brand, setBrand] = useState('')
  const [caption, setCaption] = useState('')
  const [freeform, setFreeform] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [aspect, setAspect] = useState<AspectChoice>('auto')
  const [custom, setCustom] = useState<CustomDims>({ width: 1080, height: 1080 })
  const [duration, setDuration] = useState<DurationChoice>(10)
  const [customDurationSec, setCustomDurationSec] = useState<number>(10)

  const [result, setResult] = useState<ResultState | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [lastAspect, setLastAspect] = useState<AspectFormat>('square')
  const [preview, setPreview] = useState<LivePreviewState | null>(null)
  /** ID du prompt qu'on rejoue/édite — sert à `touchPrompt` (lastUsedAt) plutôt
   *  que de réécrire un nouveau doc à chaque rejeu. */
  const [editingPromptId, setEditingPromptId] = useState<string | null>(null)

  const progress = useRenderProgress()
  const promptLib = useVideoPromptLibrary()
  const enrich = useEnrichComposition()
  const authUser = useAuthStore((s) => s.user)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  /** AbortController de la mutation en cours. handleStop l'aborte pour couper
   *  réellement la requête HTTP /render (sinon Cloud Run continue de tourner). */
  const abortRef = useRef<AbortController | null>(null)

  const mutation = useGenerateVideo({
    onStep: (s) => {
      progress.update(s)
      if (s.aspect) setLastAspect(s.aspect)
      const currentDurationSec = resolveDurationSec(duration, customDurationSec)
      if (s.composition && s.aspect) {
        setPreview((prev) => ({
          composition: s.composition!,
          aspect: s.aspect!,
          styleConfig: prev?.styleConfig,
          brand: brand.trim() || undefined,
          caption: caption.trim() || undefined,
          prompt: buildCombinedPrompt({ topic, audience, goal, tone, freeform }) || undefined,
          width: s.width ?? prev?.width,
          height: s.height ?? prev?.height,
          durationSec: currentDurationSec,
        }))
      } else if (s.svg && s.aspect) {
        setPreview((prev) => ({
          svg: s.svg!,
          aspect: s.aspect!,
          styleConfig: s.styleConfig ?? prev?.styleConfig,
          brand: brand.trim() || undefined,
          caption: caption.trim() || undefined,
          prompt: buildCombinedPrompt({ topic, audience, goal, tone, freeform }) || undefined,
          width: s.width ?? prev?.width,
          height: s.height ?? prev?.height,
          durationSec: currentDurationSec,
        }))
      } else if (s.styleConfig) {
        setPreview((prev) => (prev ? { ...prev, styleConfig: s.styleConfig } : prev))
      }
    },
  })
  const generating = mutation.isPending

  const resolveAspect = (): AspectFormat | undefined => {
    if (aspect === 'auto') return undefined
    if (aspect === 'custom') return mapCustomToAspect(custom)
    return aspect
  }

  /** Persiste le prompt dans la bibliothèque (fire-and-forget). Si on rejoue
   *  un prompt existant, on bump juste son `lastUsedAt`. */
  const persistPromptInLibrary = (resolvedAspect: AspectFormat | undefined, durationSec: number) => {
    if (!topic.trim()) return
    if (editingPromptId) {
      void promptLib.touchPrompt(editingPromptId)
      return
    }
    void promptLib.savePrompt({
      topic,
      audience,
      goal,
      tone,
      freeform,
      brand,
      caption,
      aspect: resolvedAspect,
      targetDurationSec: durationSec,
    })
  }

  const handleGenerate = () => {
    if (!topic.trim()) {
      toast.error('Décris d\'abord ce que cette vidéo doit expliquer')
      return
    }
    setResult(null)
    setSaveState('idle')
    setErrorMsg(null)
    setPreview(null)
    progress.reset()

    const combinedPrompt = buildCombinedPrompt({ topic, audience, goal, tone, freeform })
    const resolved = resolveAspect()
    const durationSec = resolveDurationSec(duration, customDurationSec)
    persistPromptInLibrary(resolved, durationSec)

    abortRef.current = new AbortController()

    mutation.mutate(
      {
        caption: caption.trim() || undefined,
        brand: brand.trim() || undefined,
        prompt: combinedPrompt || undefined,
        topic: topic.trim() || undefined,
        audience: audience.trim() || undefined,
        goal: goal.trim() || undefined,
        tone: tone.trim() || undefined,
        files: files.length ? files : undefined,
        aspect: resolved,
        customWidth: aspect === 'custom' ? custom.width : undefined,
        customHeight: aspect === 'custom' ? custom.height : undefined,
        targetDurationSec: durationSec,
        source,
        signal: abortRef.current.signal,
      },
      {
        onSuccess: (res) => {
          setResult({
            id: res.id,
            aspect: res.aspect,
            composition: res.composition,
            svg: res.svg,
            styleConfig: res.styleConfig,
            width: res.width,
            height: res.height,
            durationSec: res.durationSec,
            caption: caption.trim() || undefined,
            brand: brand.trim() || undefined,
            prompt: combinedPrompt || undefined,
          })
          toast.success('Animation prête — preview + ZIP HTML disponibles')
        },
        onError: (err) => {
          if (err instanceof DOMException && err.name === 'AbortError') return
          setErrorMsg(err.message)
          toast.error(err.message)
        },
      },
    )
  }

  const handleRegenerate = () => {
    setResult(null)
    setSaveState('idle')
    setErrorMsg(null)
    setPreview(null)
    progress.reset()
  }

  const hasContentToClear =
    !!topic || !!audience || !!goal || !!tone || !!brand || !!caption || !!freeform ||
    files.length > 0 ||
    aspect !== 'auto' || duration !== 10 ||
    !!editingPromptId

  const handleClear = () => {
    setTopic('')
    setAudience('')
    setGoal('')
    setTone('')
    setBrand('')
    setCaption('')
    setFreeform('')
    setFiles([])
    setAspect('auto')
    setCustom({ width: 1080, height: 1080 })
    setDuration(10)
    setCustomDurationSec(10)
    setEditingPromptId(null)
    setResult(null)
    setSaveState('idle')
    setErrorMsg(null)
    setPreview(null)
    progress.reset()
    toast.info('Formulaire effacé')
  }

  /** Annule la génération en cours.
   *  1) Abort le fetch() vers /render (Cloud Run reçoit une connexion fermée
   *     et peut interrompre son rendu Puppeteer). Sans ça, Cloud Run continuait
   *     et nous bloquait à 250 s+ même après "Stop".
   *  2) reset() jette la mutation côté React Query — pas d'onSuccess/onError. */
  const handleStop = () => {
    abortRef.current?.abort(new DOMException('Annulé par l\'utilisateur', 'AbortError'))
    abortRef.current = null
    mutation.reset()
    progress.reset()
    setPreview(null)
    setErrorMsg(null)
    toast.info('Génération annulée')
  }

  /** Lance Nano Banana 2 sur les scènes de la composition courante pour ajouter
   *  des images photo-réalistes en background. Une fois enrichie, on émet
   *  directement le nouveau result (pas besoin de relancer un rendu — la
   *  composition est self-contained et la preview consomme `imageUrl`). */
  const handleEnrich = () => {
    if (!preview?.composition) {
      toast.error('Aucune composition à enrichir')
      return
    }
    const resolved = resolveAspect() ?? preview.aspect
    enrich.enrich(
      {
        composition: preview.composition,
        aspect: resolved,
        topic: topic.trim() || undefined,
        brand: brand.trim() || undefined,
      },
      {
        onSuccess: (enriched) => {
          setPreview((prev) => (prev ? { ...prev, composition: enriched } : prev))
          // Mise à jour directe du result si déjà émis (sinon il sera émis avec
          // la composition enrichie au prochain cycle). Plus de relance Cloud
          // Run — l'animation HTML consomme `imageUrl` directement.
          setResult((prev) => (prev ? { ...prev, composition: enriched } : prev))
          const ok = enriched.scenes.filter((s) => s.imageUrl).length
          toast.success(`${ok}/${enriched.scenes.length} images générées — preview mise à jour`)
        },
        onError: (err) => {
          toast.error(err.message)
        },
      },
    )
  }

  /** Préremplit le formulaire depuis un prompt sauvé. Si `autoRun` est vrai,
   *  déclenche aussi la génération immédiatement (action "Rejouer"). */
  const applyPrompt = (p: VideoPrompt, autoRun: boolean) => {
    setTopic(p.topic ?? '')
    setAudience(p.audience ?? '')
    setGoal(p.goal ?? '')
    setTone(p.tone ?? '')
    setFreeform(p.freeform ?? '')
    setBrand(p.brand ?? '')
    setCaption(p.caption ?? '')
    setAspect(aspectChoiceFromFormat(p.aspect))
    if (typeof p.targetDurationSec === 'number' && p.targetDurationSec > 0) {
      const ts = p.targetDurationSec
      if (ts === 5 || ts === 10 || ts === 15 || ts === 30) {
        setDuration(ts)
      } else {
        setDuration('custom')
        setCustomDurationSec(ts)
      }
    }
    setEditingPromptId(p.id)
    setResult(null)
    setSaveState('idle')
    setErrorMsg(null)
    setPreview(null)
    progress.reset()
    if (autoRun) {
      // Laisse React batcher les setState puis génère avec les valeurs fraîches.
      // On appelle la mutation directement avec les valeurs du prompt pour ne
      // pas dépendre du re-render qui n'a pas encore eu lieu.
      const resolved =
        p.aspect === 'square' || p.aspect === 'portrait' || p.aspect === 'landscape'
          ? p.aspect
          : undefined
      void promptLib.touchPrompt(p.id)
      mutation.mutate(
        {
          topic: (p.topic ?? '').trim() || undefined,
          audience: p.audience?.trim() || undefined,
          goal: p.goal?.trim() || undefined,
          tone: p.tone?.trim() || undefined,
          brand: p.brand?.trim() || undefined,
          caption: p.caption?.trim() || undefined,
          prompt: buildCombinedPrompt({
            topic: p.topic ?? '',
            audience: p.audience ?? undefined,
            goal: p.goal ?? undefined,
            tone: p.tone ?? undefined,
            freeform: p.freeform ?? undefined,
          }),
          aspect: resolved,
          targetDurationSec:
            typeof p.targetDurationSec === 'number' ? p.targetDurationSec : undefined,
          source,
        },
        {
          onSuccess: (res) => {
            setResult({
              id: res.id,
              aspect: res.aspect,
              composition: res.composition,
              svg: res.svg,
              styleConfig: res.styleConfig,
              width: res.width,
              height: res.height,
              durationSec: res.durationSec,
              caption: p.caption ?? undefined,
              brand: p.brand ?? undefined,
              prompt:
                buildCombinedPrompt({
                  topic: p.topic ?? '',
                  audience: p.audience ?? undefined,
                  goal: p.goal ?? undefined,
                  tone: p.tone ?? undefined,
                  freeform: p.freeform ?? undefined,
                }) || undefined,
            })
            toast.success('Animation rejouée — preview + ZIP HTML disponibles')
          },
          onError: (err) => {
            if (err instanceof DOMException && err.name === 'AbortError') return
            setErrorMsg(err.message)
            toast.error(err.message)
          },
        },
      )
    } else {
      toast.info('Prompt chargé — édite puis clique Générer')
    }
  }

  const inResultMode = !!result && !generating
  /** Mode "preview/génération" : rendu en cours OU composition de preview prête.
   *  Quand actif, la colonne droite affiche la preview au lieu de la
   *  bibliothèque, et la grille passe en 1fr|1fr. */
  const previewMode =
    !inResultMode &&
    (generating || !!(preview && (preview.svg || preview.composition)))

  const previewPanel = previewMode ? (
    <div className="flex flex-col gap-3 border-t lg:border-t-0 lg:border-l border-white/5 bg-[#141414]/40 p-5 min-h-[60vh] lg:min-h-0 overflow-y-auto">
      {generating && (
        <div className="shrink-0">
          <RenderProgress
            capture={progress.capture}
            extract={progress.extract}
            compose={progress.compose}
            logs={progress.logs}
            now={progress.now}
          />
        </div>
      )}

      {preview?.composition && (
        <button
          type="button"
          onClick={handleEnrich}
          disabled={enrich.enriching}
          className="shrink-0 flex items-center justify-center gap-2 bg-fuchsia-500/15 hover:bg-fuchsia-500/25 disabled:opacity-50 disabled:cursor-not-allowed border border-fuchsia-500/40 text-fuchsia-200 text-xs font-semibold px-3 py-2.5 rounded-lg transition-colors"
          title="Génère 1 image photo IA par scène et les affiche en Ken Burns en background"
        >
          {enrich.enriching ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <ImageIcon className="w-3.5 h-3.5" />
          )}
          {enrich.enriching && enrich.progress
            ? `Enrichissement Nano Banana 2 — ${enrich.progress.done}/${enrich.progress.total}`
            : 'Enrichir avec images IA (Nano Banana 2)'}
        </button>
      )}

      {preview && (preview.svg || preview.composition) && (
        <div className="flex flex-col gap-2 flex-1 min-h-0">
          <div className="flex items-center gap-2 text-[10px] text-indigo-300/80 uppercase tracking-wider font-semibold shrink-0">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
            Aperçu animation
          </div>
          <HyperframesPlayer
            aspect={preview.aspect}
            svg={preview.svg}
            composition={preview.composition}
            brand={preview.brand}
            caption={preview.caption}
            prompt={preview.prompt}
            styleConfig={preview.styleConfig}
            width={preview.width}
            height={preview.height}
            durationSec={preview.durationSec}
            autoPlay
            className="flex-1 min-h-0"
          />
        </div>
      )}
    </div>
  ) : null

  return (
    <div className="fixed inset-0 z-50 bg-[#0a0a0a]/95 backdrop-blur-sm flex flex-col">
      <div className="sticky top-0 z-30 flex items-center justify-between px-5 py-3 border-b border-white/10 bg-[#141414] shrink-0 shadow-sm">
        <div className="flex items-center gap-2">
          <Film className="w-4 h-4 text-indigo-400" />
          <h2 className="font-semibold text-white text-sm">
            {inResultMode ? 'Animation prête' : 'Générer une animation'}
          </h2>
        </div>
        <button
          onClick={onClose}
          className="text-white/30 hover:text-white transition-colors p-1.5 rounded hover:bg-white/5"
          aria-label="Fermer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Body grid : formulaire | (preview pendant génération OU bibliothèque sinon).
          En mode preview/génération, la 2e colonne passe à 1fr pour donner toute
          la place à la preview et la bibliothèque est masquée. */}
      <div
        className={`flex-1 grid grid-cols-1 min-h-0 bg-[#1a1a1a] ${
          previewMode ? 'lg:grid-cols-2' : 'lg:grid-cols-[1fr_360px]'
        }`}
      >
        {/* Colonne formulaire */}
        <div className="overflow-y-auto">
          <div className="w-[90%] mx-auto p-5 flex flex-col gap-4">
            {inResultMode ? (
              <VideoResult
                animationId={result.id}
                aspect={result.aspect}
                composition={result.composition}
                svg={result.svg}
                styleConfig={result.styleConfig}
                width={result.width}
                height={result.height}
                durationSec={result.durationSec}
                caption={result.caption}
                brand={result.brand}
                prompt={result.prompt}
                onRegenerate={handleRegenerate}
              />
            ) : (
              <>
                {/* La preview/progress est rendue dans la colonne droite
                    (`previewPanel`) pendant la génération, pour libérer toute la
                    hauteur du formulaire et masquer la bibliothèque. */}
                <div className="bg-white/3 border border-white/5 rounded-xl p-3">
                  <p className="text-xs text-white/50 leading-relaxed">
                    {isStandalone ? (
                      <>
                        Composition multi-scènes (<span className="text-white/80">hook → visual → cta</span>) générée par
                        Gemini selon ton brief. Livraison ≈ 5 s : <span className="text-white/80">HTML/CSS/JS</span> +
                        aperçu live, ZIP téléchargeable et sauvegardable dans le DAM.
                      </>
                    ) : (
                      <>
                        Export <span className="text-white/80">SVG éditable</span> de la page courante,
                        puis animation GSAP par élément. Livraison ≈ 5 s :
                        <span className="text-white/80"> HTML/CSS/JS</span> + aperçu live.
                      </>
                    )}
                  </p>
                </div>

                {/* Pickers groupés en grille pour réduire l'espace vertical
                    et garder des chips à taille lisible (avant : chips étirés
                    à toute la largeur du modal). */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <AspectPicker
                    value={aspect}
                    onChange={setAspect}
                    custom={custom}
                    onCustomChange={setCustom}
                  />

                  <DurationPicker
                    value={duration}
                    onChange={setDuration}
                    customSec={customDurationSec}
                    onCustomSecChange={setCustomDurationSec}
                  />
                </div>

                <div>
                  <FieldLabel
                    htmlFor="topic"
                    hint="Plus c'est précis, plus le rythme et la palette s'aligneront sur le sujet."
                  >
                    Que doit présenter cette vidéo ?
                  </FieldLabel>
                  <textarea
                    id="topic"
                    value={topic}
                    onChange={(e) => {
                      setTopic(e.target.value)
                      if (editingPromptId) setEditingPromptId(null)
                    }}
                    disabled={generating}
                    rows={4}
                    placeholder="Décris ce que tu présentes, pourquoi c'est important, et les éléments clés. Plus c'est précis, mieux ça sera."
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-indigo-500/60 focus:outline-none disabled:opacity-50 resize-y"
                  />
                </div>

                <div>
                  <FieldLabel
                    htmlFor="audience"
                    optional
                    hint="Décris le rôle, le niveau d'expertise et ce qui compte pour eux."
                  >
                    À qui s'adresse cette vidéo ?
                  </FieldLabel>
                  <textarea
                    id="audience"
                    value={audience}
                    onChange={(e) => setAudience(e.target.value)}
                    disabled={generating}
                    rows={2}
                    placeholder="Leur rôle, leur niveau d'expérience, ce qui compte pour eux."
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-indigo-500/60 focus:outline-none disabled:opacity-50 resize-y"
                  />
                </div>

                <div>
                  <FieldLabel
                    htmlFor="goal"
                    optional
                    hint="Vendre, former, sensibiliser, lancer un produit, etc."
                  >
                    Quel est l'objectif ?
                  </FieldLabel>
                  <textarea
                    id="goal"
                    value={goal}
                    onChange={(e) => setGoal(e.target.value)}
                    disabled={generating}
                    rows={2}
                    placeholder="Vends-tu un service, formes-tu une équipe ou autre ?"
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-indigo-500/60 focus:outline-none disabled:opacity-50 resize-y"
                  />
                </div>

                <div>
                  <FieldLabel
                    htmlFor="tone"
                    optional
                    hint="Cinématique, énergique, sobre, ludique, premium…"
                  >
                    Y a-t-il un ton particulier ?
                  </FieldLabel>
                  <textarea
                    id="tone"
                    value={tone}
                    onChange={(e) => setTone(e.target.value)}
                    disabled={generating}
                    rows={2}
                    placeholder="Utilise ce champ si tu veux un ton de voix précis."
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-indigo-500/60 focus:outline-none disabled:opacity-50 resize-y"
                  />
                </div>

                <div>
                  <FieldLabel
                    htmlFor="caption"
                    optional
                    hint="Texte d'accroche affiché en gros bas de cadre, mot par mot."
                  >
                    Caption
                  </FieldLabel>
                  <input
                    id="caption"
                    type="text"
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    disabled={generating}
                    placeholder="ex. Soldes -30%"
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-indigo-500/60 focus:outline-none disabled:opacity-50"
                  />
                </div>

                <div>
                  <FieldLabel
                    htmlFor="freeform"
                    optional
                    hint="Interprétées par Gemini en palette, rythme et intensité."
                  >
                    Instructions libres
                  </FieldLabel>
                  <textarea
                    id="freeform"
                    value={freeform}
                    onChange={(e) => setFreeform(e.target.value)}
                    disabled={generating}
                    rows={2}
                    placeholder="ex. Rythme énergique, transitions punchy, palette néon"
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-indigo-500/60 focus:outline-none disabled:opacity-50 resize-y"
                  />
                </div>

                <FileDropzone files={files} onChange={setFiles} disabled={generating} />

                {errorMsg && !generating && (
                  <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-3 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                    <p className="text-xs text-red-300/90 break-words">{errorMsg}</p>
                  </div>
                )}

                <div className="flex items-stretch gap-2 sticky bottom-0 bg-[#1a1a1a] pt-2 -mx-5 px-5 pb-1">
                  <button
                    onClick={handleGenerate}
                    disabled={generating}
                    className="flex-1 flex items-center justify-center gap-2 bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium px-3 py-2.5 rounded-lg transition-colors"
                  >
                    {generating ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5" />
                    )}
                    Générer l'animation
                  </button>
                  {!generating && (
                    <button
                      onClick={handleClear}
                      disabled={!hasContentToClear}
                      className="flex items-center justify-center gap-1.5 bg-white/5 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed border border-white/10 text-white/70 hover:text-white text-sm font-medium px-3 py-2.5 rounded-lg transition-colors"
                      title="Effacer tous les champs du formulaire"
                    >
                      <Eraser className="w-3.5 h-3.5" />
                      Effacer
                    </button>
                  )}
                  {generating && (
                    <button
                      onClick={handleStop}
                      className="flex items-center justify-center gap-1.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-300 hover:text-red-200 text-sm font-medium px-3 py-2.5 rounded-lg transition-colors"
                      title="Annuler la génération en cours"
                    >
                      <Square className="w-3.5 h-3.5 fill-current" />
                      Stop
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Colonne 2 : preview pendant génération, sinon bibliothèque.
            La bibliothèque est cachée pendant la génération pour libérer la
            place, comme demandé. */}
        {previewMode ? (
          previewPanel
        ) : (
          <div className="hidden lg:block min-h-0">
            <VideoPromptLibrary
              prompts={promptLib.prompts}
              loading={promptLib.loading}
              onReplay={(p) => applyPrompt(p, true)}
              onEdit={(p) => applyPrompt(p, false)}
              onDelete={promptLib.deletePrompt}
              onRename={promptLib.renamePrompt}
            />
          </div>
        )}
      </div>
    </div>
  )
}
