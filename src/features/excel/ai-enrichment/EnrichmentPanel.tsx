import { useEffect, useState, useRef, useCallback } from 'react'
import {
  Sparkles, Loader2, RefreshCw, ExternalLink, Zap, Check, AlertCircle, ImageIcon, Globe, Save, Plus, X,
  Code2, ChevronDown, Copy, FileDown, ListOrdered,
} from 'lucide-react'
import { VendorFieldOrderModal } from '@/features/scraping-templates/VendorFieldOrderModal'
import { useExcelStore } from '@/stores/excel.store'
import { useEnrichmentStore } from './enrichmentStore'
import { useProductEnrichment, type EnrichmentInput } from './useProductEnrichment'
import { useMatchingTemplate } from '@/features/scraping-templates/useMatchingTemplate'
import type { ScrapingTemplate } from '@/features/scraping-templates/types'
import { useSaveEnrichedProduct } from './useSaveEnrichedProduct'
import { deserializeEnrichedFromRow } from './deserializeEnriched'
import type { EnrichedProduct } from './types'
import type { LlmRequestInfo } from '@/features/ai/llmRouter'

interface Props {
  input: EnrichmentInput
}

/** Grille d'images avec expand/collapse — affiche 6 par défaut, toutes au clic.
 *  Chaque tuile expose un bouton supprimer (X) au hover. */
function ImageGrid({ images, onRemove }: { images: string[]; onRemove?: (url: string) => void }) {
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? images : images.slice(0, 6)
  return (
    <>
      <div className="grid grid-cols-3 gap-1.5">
        {visible.map((url, i) => (
          <div
            key={i}
            className="group relative aspect-square rounded-md overflow-hidden bg-white/5 border border-white/[0.06] hover:border-indigo-400/40 transition-colors"
          >
            <a href={url} target="_blank" rel="noreferrer" className="block w-full h-full">
              <img
                src={url}
                alt=""
                className="w-full h-full object-contain p-1"
                onError={(e) => {
                  ;(e.target as HTMLImageElement).style.display = 'none'
                }}
              />
            </a>
            {onRemove && (
              <button
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  onRemove(url)
                }}
                className="absolute top-1 right-1 w-5 h-5 flex items-center justify-center rounded-full bg-black/70 text-white/80 opacity-0 group-hover:opacity-100 hover:bg-red-500/80 hover:text-white transition-all"
                title="Supprimer cette image"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        ))}
      </div>
      {images.length > 6 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-1.5 text-[10px] text-indigo-400 hover:text-indigo-300 transition-colors flex items-center gap-1"
        >
          <ChevronDown className={`w-3 h-3 transition-transform ${expanded ? 'rotate-180' : ''}`} />
          {expanded ? 'Réduire' : `Voir les ${images.length} images`}
        </button>
      )}
    </>
  )
}

export function EnrichmentPanel({ input }: Props) {
  const storeKey = `${input.sheetName}::${input.rowId}`
  const entry = useEnrichmentStore((s) => s.entries[storeKey])
  const logs = useEnrichmentStore((s) => s.logs[storeKey] ?? [])
  const scrapeCache = useEnrichmentStore((s) => s.scrapeCache[storeKey])
  const hiddenGroups = useEnrichmentStore((s) => s.hiddenGroups[storeKey])
  const setData = useEnrichmentStore((s) => s.setData)
  const { enrich, reset, running } = useProductEnrichment()
  const { save, isSaved, saving, error: saveError } = useSaveEnrichedProduct()

  // Rehydration depuis la feuille Excel : si la ligne a déjà des cellules ai_*
  // persistées (depuis Firestore), on reconstruit l'objet EnrichedProduct et
  // on alimente le store d'enrichissement — le panneau bascule alors en "done".
  useEffect(() => {
    if (entry?.data) return // déjà chargé en mémoire
    if (entry?.progress.status === 'searching'
      || entry?.progress.status === 'scraping'
      || entry?.progress.status === 'reasoning') return // enrichissement en cours
    const state = useExcelStore.getState()
    const sheet = state.sheets[state.activeSheetIndex]
    const row = sheet?.rows.find((r) => r._id === input.rowId)
    const restored = deserializeEnrichedFromRow(row)
    if (restored) {
      console.log('[enrichment] rehydrating from sheet row', input.rowId)
      setData(input.sheetName, input.rowId, restored.product)
      if (restored.llmRequest) {
        useEnrichmentStore.getState().setLlmRequest(input.sheetName, input.rowId, restored.llmRequest)
      }
    }
  }, [input.sheetName, input.rowId, entry?.data, entry?.progress.status, setData])

  const status = entry?.progress.status ?? 'idle'
  const data = entry?.data ?? null
  const error = entry?.error ?? null
  const llmRequest = entry?.llmRequest ?? null
  const saved = isSaved(input.rowId)

  const launch = (mode: 'auto' | 'template' = 'auto') => {
    void enrich({ ...input, mode })
  }
  const redo = (mode: 'auto' | 'template' = 'auto') => {
    reset(input.sheetName, input.rowId)
    void enrich({ ...input, mode })
  }
  const onSave = () => {
    if (data) void save(input.rowId, data)
  }
  const updateData = useCallback(
    (patch: Partial<EnrichedProduct>) => {
      if (!data) return
      setData(input.sheetName, input.rowId, { ...data, ...patch })
    },
    [data, setData, input.sheetName, input.rowId],
  )

  // Template match pour ce produit. Le hook écoute les invalidations de
  // cache global, donc les sauvegardes depuis n'importe où (modal ou panneau
  // Source) déclenchent automatiquement un refetch.
  const matchedTemplate = useMatchingTemplate({
    url: input.knownUrl ?? null,
    brand: input.brand ?? null,
    title: input.title ?? null,
  })
  const [orderModalOpen, setOrderModalOpen] = useState(false)

  const isLoading =
    running || status === 'searching' || status === 'scraping' || status === 'reasoning'
  const isError = status === 'error' && !!error
  const isDone = !isLoading && !isError && !!data
  const isIdle = !isLoading && !isError && !isDone

  // Métadonnées du modèle LLM ou mode scraping (affichées en haut à droite quand isDone)
  const isManufacturerScrape = isDone && data && !data.llmProvider && data.scrapingProvider?.includes('Fabricant')
  const llmMeta = isDone && data
    ? isManufacturerScrape
      ? { label: 'Scraping pur', title: `Données extraites directement du site fabricant (${data.scrapingProvider}) — aucune IA utilisée` }
      : {
          label: data.llmModel ?? data.llmProvider ?? 'Claude Opus 4.6',
          title: data.llmProvider
            ? `Raisonnement LLM via ${data.llmProvider}${data.llmModel ? ` (${data.llmModel})` : ''}`
            : 'Raisonnement LLM via Claude Opus 4.6 (par défaut — provider exact non enregistré pour cette entrée)',
        }
    : null

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-[#111113]">
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="border-b border-white/[0.06] bg-gradient-to-r from-indigo-500/[0.06] to-fuchsia-500/[0.04] shrink-0">
        {/* Row 1 : titre + actions */}
        <div className="flex items-center justify-between gap-3 px-4 pt-2.5 pb-1.5">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div className="w-5 h-5 rounded-md bg-gradient-to-br from-indigo-400/25 to-fuchsia-400/15 flex items-center justify-center border border-indigo-400/30 shrink-0">
              <Sparkles className="w-3 h-3 text-indigo-300" />
            </div>
            <span className="text-[11px] font-semibold text-white/80 uppercase tracking-wider shrink-0">
              Enrichi par IA
            </span>
          </div>
          {isDone && (
            <div className="flex items-center gap-2 shrink-0">
              {llmMeta && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] font-semibold text-white/35 uppercase tracking-wider shrink-0">
                    Modèle
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium tracking-normal border ${
                      isManufacturerScrape
                        ? 'bg-emerald-500/10 text-emerald-300/90 border-emerald-500/20'
                        : 'bg-indigo-500/10 text-indigo-300/90 border-indigo-500/20'
                    }`}
                    title={llmMeta.title}
                  >
                    {isManufacturerScrape ? <Globe className="w-2.5 h-2.5" /> : <Sparkles className="w-2.5 h-2.5" />}
                    {llmMeta.label}
                  </span>
                </div>
              )}
              <div className="h-4 w-px bg-white/10" />
              <button
                onClick={onSave}
                disabled={saving || saved}
                title={saveError ?? undefined}
                className={`inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-md transition-colors ${
                  saved
                    ? 'text-emerald-400/90 bg-emerald-500/10 cursor-default'
                    : 'text-white/70 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] disabled:opacity-50'
                }`}
              >
                {saved ? (
                  <>
                    <Check className="w-3 h-3" />
                    Sauvegardé
                  </>
                ) : saving ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Sauvegarde…
                  </>
                ) : (
                  <>
                    <Save className="w-3 h-3" />
                    Sauvegarder
                  </>
                )}
              </button>
              <RegenerateMenu onRedo={redo} matchedTemplate={matchedTemplate} />
            </div>
          )}
        </div>

        {/* Row 2 : sources scrapées (groupe unique, aligné avec le titre) */}
        {isDone && data && (() => {
          const scrapingTool = data.scrapingProvider ?? 'Jina'

          const hostFromUrl = (u: string | null | undefined): string | null => {
            if (!u) return null
            try {
              return new URL(u).hostname.replace(/^www\./, '')
            } catch {
              const m = String(u).match(/^(?:https?:\/\/)?([^/?#\s]+)/i)
              return m ? m[1].replace(/^www\./, '') : null
            }
          }
          let primaryUrl: string | null = data.sourceUrl ?? null
          if (!primaryUrl && data.additionalSources?.length) {
            primaryUrl = data.additionalSources.find((u) => !!u) ?? null
          }
          const primaryHost = hostFromUrl(primaryUrl)
          const extraHosts = (data.additionalSources ?? [])
            .map(hostFromUrl)
            .filter((h): h is string => !!h && h !== primaryHost)
          const uniqueExtra = Array.from(new Set(extraHosts))

          if (import.meta.env.DEV) {
            console.log('[enrichment-badges]', {
              sourceUrl: data.sourceUrl,
              additionalSources: data.additionalSources,
              primaryUrl,
              primaryHost,
              uniqueExtra,
            })
          }

          return (
            <div className="flex items-center gap-3 px-4 pb-2 pt-0.5 min-w-0 flex-wrap">
              {/* ── Groupe SOURCE ──────────────────────────────────── */}
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-[9px] font-semibold text-white/35 uppercase tracking-wider shrink-0">
                  Source
                </span>
                <span
                  className="inline-flex items-center justify-center w-4 h-4 rounded bg-orange-500/10 border border-orange-500/20 text-orange-300/90 shrink-0"
                  title={`Outil de scraping : ${scrapingTool}`}
                >
                  <Globe className="w-2.5 h-2.5" />
                </span>
                {primaryHost ? (
                  <a
                    href={primaryUrl ?? undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium normal-case tracking-normal bg-amber-500/10 text-amber-200/90 border border-amber-500/20 hover:bg-amber-500/20 hover:text-amber-100 transition-colors truncate max-w-[160px]"
                    title={`Source principale : ${primaryUrl}`}
                  >
                    {primaryHost}
                  </a>
                ) : (
                  <span
                    className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium text-white/35 bg-white/[0.03] border border-white/10"
                    title="Aucune URL source n'est enregistrée pour cette ligne. Relance l'enrichissement pour la capturer."
                  >
                    source inconnue
                  </span>
                )}
                {uniqueExtra.map((host, i) => {
                  const url = (data.additionalSources ?? []).find((u) => hostFromUrl(u) === host)
                  return (
                    <a
                      key={`${host}-${i}`}
                      href={url ?? undefined}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium normal-case tracking-normal bg-white/[0.03] text-white/55 border border-white/[0.08] hover:bg-white/[0.08] hover:text-white/80 transition-colors truncate max-w-[160px]"
                      title={`Source additionnelle : ${url}`}
                    >
                      {host}
                    </a>
                  )
                })}
                {matchedTemplate && (
                  <button
                    onClick={() => setOrderModalOpen(true)}
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium text-white/55 bg-white/[0.03] border border-white/[0.08] hover:bg-indigo-500/10 hover:text-indigo-200 hover:border-indigo-400/30 transition-colors"
                    title={`Réordonner les champs affichés pour ${matchedTemplate.vendorDomain}`}
                  >
                    <ListOrdered className="w-2.5 h-2.5" />
                    Ordre des champs
                  </button>
                )}
              </div>
            </div>
          )
        })()}
      </div>

      {/* ── Body (scrollable) ────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {isIdle && <IdleState onLaunch={(mode) => launch(mode)} canSearch={hasSearchableData(input)} input={input} matchedTemplate={matchedTemplate} />}
        {isLoading && <LoadingState status={status} message={entry?.progress.message ?? ''} logs={logs} />}
        {isError && <ErrorState error={error!} onRetry={launch} onRetryWithUrl={(url) => {
          reset(input.sheetName, input.rowId)
          void enrich({ ...input, knownUrl: url })
        }} />}
        {isDone && data && (
          <DoneState
            data={data}
            llmRequest={llmRequest}
            onUpdate={updateData}
            scrapeCache={scrapeCache}
            hiddenGroups={hiddenGroups}
            templateFieldOrder={
              matchedTemplate?.vendorFieldOrder && matchedTemplate.vendorFieldOrder.length > 0
                ? matchedTemplate.vendorFieldOrder
                : matchedTemplate?.fields.map((f) => f.field)
            }
          />
        )}
      </div>
      {orderModalOpen && matchedTemplate && (
        <VendorFieldOrderModal
          matchedTemplate={matchedTemplate}
          enriched={data}
          onClose={() => setOrderModalOpen(false)}
          onSaved={() => { /* refetch auto via invalidationListeners */ }}
        />
      )}
    </div>
  )
}

// ── Idle ──────────────────────────────────────────────────────────────────

function RegenerateMenu({ onRedo, matchedTemplate }: { onRedo: (mode: 'auto' | 'template') => void; matchedTemplate: ScrapingTemplate | null }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])
  // Si pas de template, le bouton relance direct en AUTO.
  if (!matchedTemplate) {
    return (
      <button
        onClick={() => onRedo('auto')}
        className="inline-flex items-center gap-1 text-[10px] text-white/40 hover:text-white/80 transition-colors px-2 py-1 rounded-md hover:bg-white/5"
      >
        <RefreshCw className="w-3 h-3" />
        Re-générer
      </button>
    )
  }
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1 text-[10px] text-white/40 hover:text-white/80 transition-colors px-2 py-1 rounded-md hover:bg-white/5"
      >
        <RefreshCw className="w-3 h-3" />
        Re-générer
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-64 bg-[#1a1a1a] border border-white/10 rounded-lg shadow-xl z-10 overflow-hidden">
          <button
            onClick={() => { setOpen(false); onRedo('auto') }}
            className="w-full px-3 py-2 flex items-start gap-2 text-left hover:bg-indigo-500/10 transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5 text-indigo-300 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-semibold text-white/90">Mode AUTO</div>
              <div className="text-[10px] text-white/40 leading-snug">Recherche web + extraction + synthèse IA</div>
            </div>
          </button>
          <div className="h-px bg-white/[0.06]" />
          <button
            onClick={() => { setOpen(false); onRedo('template') }}
            className="w-full px-3 py-2 flex items-start gap-2 text-left hover:bg-emerald-500/10 transition-colors"
          >
            <svg className="w-3.5 h-3.5 text-emerald-300 mt-0.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 8v13H3V8" /><path d="M1 3h22v5H1z" /><path d="M10 12h4" /></svg>
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-semibold text-white/90">Mode TEMPLATE</div>
              <div className="text-[10px] text-emerald-300/80 leading-snug truncate">📐 {matchedTemplate.name}</div>
              <div className="text-[9px] text-white/30 leading-snug">Extraction déterministe, sans IA</div>
            </div>
          </button>
        </div>
      )}
    </div>
  )
}

/** Y a-t-il assez de données identifiantes pour lancer une recherche ?
 *  Accepte : titre OU référence/SKU OU marque. */
function hasSearchableData(input: EnrichmentInput): boolean {
  return !!(input.title?.trim() || input.reference?.trim() || input.sku?.trim() || input.brand?.trim())
}

function IdleState({ onLaunch, canSearch, input, matchedTemplate }: { onLaunch: (mode: 'auto' | 'template') => void; canSearch: boolean; input: EnrichmentInput; matchedTemplate: ScrapingTemplate | null }) {
  const signals = [
    input.title?.trim() && 'titre',
    (input.reference?.trim() || input.sku?.trim()) && 'réf',
    input.brand?.trim() && 'marque',
    input.description?.trim() && 'description',
    input.category?.trim() && 'catégorie',
  ].filter(Boolean) as string[]
  return (
    <div className="h-full flex flex-col items-center justify-center px-6 py-10 text-center">
      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500/15 to-fuchsia-500/10 border border-indigo-500/20 flex items-center justify-center mb-4">
        <Sparkles className="w-6 h-6 text-indigo-400" />
      </div>
      <h3 className="text-[13px] font-semibold text-white/80 mb-2">Enrichissement en live</h3>
      <p className="text-[11px] text-white/40 leading-relaxed max-w-[280px] mb-5">
        Génère une fiche produit complète depuis les données source.
        {matchedTemplate ? (
          <span className="block mt-2 text-emerald-300/80">
            📐 Template <b>{matchedTemplate.name}</b> disponible pour ce fournisseur.
          </span>
        ) : input.brand ? (
          <span className="block mt-2 text-white/30 text-[10px]">
            Aucun template pour <b>{input.brand}</b> — crée-en un depuis{' '}
            <b>Dashboard → Templates scraping</b> pour éviter les hallucinations IA sur ce fournisseur.
          </span>
        ) : null}
      </p>
      {signals.length > 0 && (
        <p className="text-[10px] text-white/40 mb-3">
          Signaux utilisés : <span className="text-white/60">{signals.join(' · ')}</span>
        </p>
      )}
      <div className="flex flex-col gap-2 w-full max-w-[280px]">
        <button
          type="button"
          onClick={() => onLaunch('auto')}
          disabled={!canSearch}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-indigo-500 to-fuchsia-500 text-white text-[12px] font-semibold shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/40 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
        >
          <Sparkles className="w-3.5 h-3.5" />
          Mode AUTO (recherche + IA)
        </button>
        {matchedTemplate && (
          <button
            type="button"
            onClick={() => onLaunch('template')}
            disabled={!canSearch}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-[12px] font-semibold shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/40 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 8v13H3V8" /><path d="M1 3h22v5H1z" /><path d="M10 12h4" /></svg>
            Mode TEMPLATE ({matchedTemplate.name})
          </button>
        )}
      </div>
      {!canSearch && (
        <p className="text-[10px] text-amber-400/80 mt-3">
          Il faut au moins un titre, une référence/SKU ou une marque pour lancer la recherche.
        </p>
      )}
    </div>
  )
}

// ── Loading ───────────────────────────────────────────────────────────────

function LoadingState({ status, message, logs }: { status: string; message: string; logs: string[] }) {
  const steps: { id: 'searching' | 'scraping' | 'reasoning'; label: string; icon: React.ElementType }[] = [
    { id: 'searching', label: 'Recherche', icon: Globe },
    { id: 'scraping', label: 'Extraction', icon: Zap },
    { id: 'reasoning', label: 'Synthèse IA', icon: Sparkles },
  ]
  const currentIdx = steps.findIndex((s) => s.id === status)
  const logsEndRef = useRef<HTMLDivElement>(null)

  // Progression globale : 0 → 100 en easing-out sur la durée typique totale.
  const [activePct, setActivePct] = useState(0)
  useEffect(() => {
    setActivePct(0)
    if (currentIdx < 0) return
    const startedAt = Date.now()
    const typicalDurationMs = status === 'searching' ? 6000 : status === 'scraping' ? 25000 : 15000
    const id = setInterval(() => {
      const elapsed = Date.now() - startedAt
      const pct = Math.min(95, Math.round(95 * (1 - Math.exp(-elapsed / (typicalDurationMs * 0.4)))))
      setActivePct(pct)
    }, 250)
    return () => clearInterval(id)
  }, [currentIdx, status])

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs.length])

  // Progression globale : done steps = 100, active = activePct, pending = 0
  const globalPct = currentIdx < 0 ? 0 : Math.round(((currentIdx * 100) + activePct) / steps.length)

  return (
    <div className="h-full flex flex-col px-5 py-5">
      {/* Header : titre + pct global */}
      <div className="flex items-baseline justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
          </span>
          <span className="text-[12px] font-semibold text-white/85">Enrichissement en cours</span>
        </div>
        <span className="text-[11px] font-mono tabular-nums text-indigo-200/80">{globalPct}%</span>
      </div>

      {/* Barre de progression globale */}
      <div className="h-1 w-full rounded-full bg-white/[0.06] overflow-hidden mb-5">
        <div
          className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 transition-[width] duration-300 shadow-[0_0_8px_rgba(129,140,248,0.6)]"
          style={{ width: `${globalPct}%` }}
        />
      </div>

      {/* Timeline horizontale compacte */}
      <div className="relative flex items-start justify-between mb-5">
        {/* Ligne de fond qui connecte les étapes */}
        <div className="absolute top-3.5 left-[12%] right-[12%] h-[2px] bg-white/[0.06] -z-0" />
        {steps.map((step, i) => {
          const done = currentIdx === -1 ? false : i < currentIdx
          const active = i === currentIdx
          const Icon = step.icon
          return (
            <div key={step.id} className="relative z-10 flex flex-col items-center gap-1.5 flex-1">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition-all ${
                  active
                    ? 'bg-gradient-to-br from-indigo-500 to-fuchsia-500 shadow-lg shadow-indigo-500/40 ring-4 ring-indigo-500/20'
                    : done
                      ? 'bg-emerald-500/90 shadow-sm shadow-emerald-500/30'
                      : 'bg-white/[0.06] border border-white/10'
                }`}
              >
                {active ? (
                  <Loader2 className="w-3.5 h-3.5 text-white animate-spin" />
                ) : done ? (
                  <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />
                ) : (
                  <Icon className="w-3 h-3 text-white/30" />
                )}
              </div>
              <span
                className={`text-[10px] font-medium text-center tracking-wide ${
                  active ? 'text-white/90' : done ? 'text-emerald-300/70' : 'text-white/30'
                }`}
              >
                {step.label}
              </span>
            </div>
          )
        })}
      </div>

      {/* Message actif */}
      {message && (
        <p className="text-[11px] text-white/50 text-center leading-relaxed">{message}</p>
      )}

      {/* Logs temps réel */}
      {logs.length > 0 && (
        <div className="mt-4 flex-1 min-h-[320px] max-h-[60vh] overflow-y-auto rounded-lg bg-black/40 border border-white/[0.06] p-2.5">
          <div className="flex items-center gap-1.5 mb-2">
            <Code2 className="w-3 h-3 text-white/20" />
            <span className="text-[9px] font-semibold text-white/25 uppercase tracking-wider">Logs</span>
          </div>
          <div className="space-y-0.5 font-mono">
            {logs.map((entry, i) => {
              const isSuccess = entry.startsWith('✓') || entry.startsWith('★')
              const isWarning = entry.startsWith('✗') || entry.includes('échoué') || entry.includes('invalidé') || entry.includes('insuffisant')
              return (
                <div
                  key={i}
                  className={`text-[10px] leading-relaxed px-1.5 py-0.5 rounded ${
                    isSuccess
                      ? 'text-emerald-400/70'
                      : isWarning
                        ? 'text-amber-400/70'
                        : 'text-white/35'
                  }`}
                >
                  <span className="text-white/15 select-none mr-1.5">{String(i + 1).padStart(2, '0')}</span>
                  {entry}
                </div>
              )
            })}
            <div ref={logsEndRef} />
          </div>
        </div>
      )}
    </div>
  )
}

// ── Error ─────────────────────────────────────────────────────────────────

function ErrorState({ error, onRetry, onRetryWithUrl }: {
  error: string
  onRetry: () => void
  onRetryWithUrl: (url: string) => void
}) {
  const [manualUrl, setManualUrl] = useState('')
  const isSearchError = /search|recherche|credits|cr[eé]dits|insufficient/i.test(error)

  return (
    <div className="h-full flex flex-col items-center justify-center px-6 py-10 text-center">
      <div className="w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/25 flex items-center justify-center mb-4">
        <AlertCircle className="w-5 h-5 text-red-400" />
      </div>
      <h3 className="text-[13px] font-semibold text-white/80 mb-2">Échec de l'enrichissement</h3>
      <p className="text-[11px] text-white/50 leading-relaxed max-w-[280px] mb-4">{error}</p>

      {isSearchError && (
        <div className="w-full max-w-[320px] mb-4">
          <p className="text-[10px] text-white/40 mb-2">
            Collez l'URL de la page produit pour enrichir sans recherche :
          </p>
          <div className="flex gap-1.5">
            <input
              type="url"
              value={manualUrl}
              onChange={(e) => setManualUrl(e.target.value)}
              placeholder="https://www.marque.fr/produit..."
              className="flex-1 px-2.5 py-1.5 rounded-md bg-white/[0.06] border border-white/[0.12] text-[11px] text-white/80 placeholder:text-white/25 focus:outline-none focus:border-indigo-500/50"
            />
            <button
              type="button"
              disabled={!manualUrl.startsWith('http')}
              onClick={() => onRetryWithUrl(manualUrl.trim())}
              className="px-2.5 py-1.5 rounded-md bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 text-[11px] font-medium hover:bg-indigo-500/30 transition-colors disabled:opacity-30 disabled:cursor-not-allowed whitespace-nowrap"
            >
              Enrichir
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={onRetry}
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-white/[0.06] border border-white/[0.12] text-white/80 text-[11px] font-medium hover:bg-white/[0.1] transition-colors"
      >
        <RefreshCw className="w-3 h-3" />
        Réessayer
      </button>
    </div>
  )
}

// ── Done ──────────────────────────────────────────────────────────────────

function DoneState({
  data,
  llmRequest,
  onUpdate,
  scrapeCache,
  hiddenGroups,
  templateFieldOrder,
}: {
  data: NonNullable<ReturnType<typeof useEnrichmentStore.getState>['entries'][string]>['data']
  llmRequest: LlmRequestInfo | null
  onUpdate: (patch: Partial<EnrichedProduct>) => void
  scrapeCache?: { sourcesScrapped?: string[] }
  hiddenGroups?: { specifications: string[]; advantages: string[] }
  templateFieldOrder?: string[]
}) {
  if (!data) return null

  const hiddenSpecs = hiddenGroups?.specifications ?? []
  const hiddenAdv = hiddenGroups?.advantages ?? []
  const hiddenSpecsSet = new Set(hiddenSpecs)
  const hiddenAdvSet = new Set(hiddenAdv)
  const visibleSpecsCount = data.specifications.filter((s) => !hiddenSpecsSet.has(s.group ?? '')).length
  const visibleAdvantagesCount = data.advantages.filter((a) => !hiddenAdvSet.has(a.group ?? '')).length

  // Mapping nom-de-champ-template → clé de section du panneau.
  // Permet de respecter l'ordre des champs défini par l'utilisateur dans le template.
  const FIELD_TO_SECTION: Record<string, string> = {
    title: 'title',
    description: 'description',
    advantages: 'advantages',
    images: 'images',
    documents: 'documents',
    variants: 'variants', variantes: 'variants', Variantes: 'variants', references: 'variants',
    specifications: 'specifications', specs: 'specifications',
  }
  const DEFAULT_ORDER = ['images', 'description', 'advantages', 'specifications', 'variants', 'custom', 'documents']

  const sectionOrder: string[] = []
  if (templateFieldOrder && templateFieldOrder.length > 0) {
    const seen = new Set<string>()
    for (const fieldName of templateFieldOrder) {
      const section = FIELD_TO_SECTION[fieldName]
      if (section && !seen.has(section)) { sectionOrder.push(section); seen.add(section) }
      else if (!section && !seen.has(`custom:${fieldName}`)) {
        sectionOrder.push(`custom:${fieldName}`)
        seen.add(`custom:${fieldName}`)
      }
    }
    for (const s of DEFAULT_ORDER) {
      if (!seen.has(s)) {
        if (s === 'custom') {
          const customKeys = Object.keys(data.customFields ?? {})
          for (const k of customKeys) {
            if (!seen.has(`custom:${k}`)) sectionOrder.push(`custom:${k}`)
          }
        } else {
          sectionOrder.push(s)
        }
      }
    }
  } else {
    sectionOrder.push(...DEFAULT_ORDER)
  }

  return (
    <div>
      {/* Debug LLM : prompt + paramètres envoyés */}
      {llmRequest && <LlmRequestPanel request={llmRequest} />}

      {/* Sections ordonnées selon le template (si template match) ou ordre par défaut.
          L'ordre `images` est lui-même géré dans la boucle, ce qui permet à
          `vendorFieldOrder` de le déplacer à n'importe quelle position. */}
      {sectionOrder.map((sectionKey) => {
        if (sectionKey === 'images') return (
          <div key="images" className="px-4 pt-3 pb-3 border-b border-white/[0.04]">
            <p className="text-[10px] font-semibold text-white/30 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <ImageIcon className="w-3 h-3" />
              {data.images.length > 0
                ? `Images trouvées (${data.images.length})`
                : 'Aucune image trouvée'}
            </p>
            {data.images.length > 0 ? (
              <ImageGrid
                images={data.images}
                onRemove={(url) => onUpdate({ images: data.images.filter((u) => u !== url) })}
              />
            ) : (
              <p className="text-[11px] text-white/35 leading-relaxed">
                Le scraping n'a pas détecté d'images produit exploitables. Essayez{' '}
                <span className="text-white/60">Re-générer</span> pour relancer la recherche.
              </p>
            )}
          </div>
        )
        if (sectionKey === 'description') return (
          <div key="description" className="px-4 pt-3 pb-3 border-b border-white/[0.04]">
            <p className="text-[10px] font-semibold text-white/30 uppercase tracking-wider mb-2">
              Description enrichie
            </p>
            <EditableText
              value={data.description}
              onChange={(v) => onUpdate({ description: v })}
              multiline
              placeholder="Ajouter une description…"
              className="text-[12.5px] text-white/75 leading-relaxed"
            />
          </div>
        )
        if (sectionKey === 'advantages') return (
          <div key="advantages" className="px-4 pt-3 pb-3 border-b border-white/[0.04]">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-semibold text-white/30 uppercase tracking-wider flex items-center gap-1.5">
                <Zap className="w-3 h-3 text-amber-400/60" />
                Points forts
              </p>
              <button
                onClick={() => onUpdate({ advantages: [...data.advantages, { text: '' }] })}
                className="text-[10px] text-white/40 hover:text-white/80 transition-colors inline-flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-white/5"
              >
                <Plus className="w-3 h-3" /> Ajouter
              </button>
            </div>
            {visibleAdvantagesCount === 0 ? (
              <p className="text-[11px] text-white/30 italic">
                {data.advantages.length === 0 ? 'Aucun point fort' : 'Tous les groupes sont cachés'}
              </p>
            ) : (
              <AdvantageGroupList advantages={data.advantages} hiddenGroups={hiddenAdv} onUpdate={onUpdate} data={data} />
            )}
          </div>
        )
        if (sectionKey === 'specifications') return (
          <div key="specifications" className="px-4 pt-3 pb-3 border-b border-white/[0.04]">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-semibold text-white/30 uppercase tracking-wider">
                Spécifications clés
              </p>
              <button
                onClick={() => onUpdate({ specifications: [...data.specifications, { name: '', value: '' }] })}
                className="text-[10px] text-white/40 hover:text-white/80 transition-colors inline-flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-white/5"
              >
                <Plus className="w-3 h-3" /> Ajouter
              </button>
            </div>
            {visibleSpecsCount === 0 ? (
              <p className="text-[11px] text-white/30 italic">
                {data.specifications.length === 0 ? 'Aucune spécification' : 'Tous les groupes sont cachés'}
              </p>
            ) : (
              <SpecGroupAccordions specifications={data.specifications} hiddenGroups={hiddenSpecs} onUpdate={onUpdate} data={data} />
            )}
          </div>
        )
        if (sectionKey === 'variants') return data.variants && data.variants.length > 0 ? (
          <div key="variants" className="px-4 pt-3 pb-3 border-b border-white/[0.04]">
            <p className="text-[10px] font-semibold text-white/30 uppercase tracking-wider mb-2">
              Variantes ({data.variants.length})
            </p>
            <VariantTable variants={data.variants} />
          </div>
        ) : null
        // Champ custom individuel (template-specific)
        if (sectionKey.startsWith('custom:')) {
          const fieldName = sectionKey.slice(7)
          const value = data.customFields?.[fieldName]
          if (!value) return null
          return (
            <div key={sectionKey} className="px-4 pt-3 pb-3 border-b border-white/[0.04]">
              <p className="text-[10px] text-indigo-300/70 font-semibold uppercase tracking-wider mb-1">{fieldName}</p>
              {Array.isArray(value) ? (
                <ul className="space-y-0.5">
                  {value.map((v, i) => (
                    <li key={i} className="text-[12px] text-white/75 leading-relaxed">• {v}</li>
                  ))}
                </ul>
              ) : (
                <span className="text-[12px] text-white/75 leading-relaxed whitespace-pre-line block">{value}</span>
              )}
            </div>
          )
        }
        if (sectionKey === 'documents') return data.documents.length > 0 ? (
        <div className="px-4 pt-3 pb-3 border-b border-white/[0.04]">
          <p className="text-[10px] font-semibold text-white/30 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <FileDown className="w-3 h-3" />
            Documents ({data.documents.length})
          </p>
          <div className="flex flex-col gap-1">
            {data.documents.map((raw, i) => {
              // Support format "titre##url" pour afficher le bon nom
              const hasTitle = raw.includes('##')
              const displayName = hasTitle ? raw.split('##')[0] : (raw.split('/').pop()?.split('?')[0] ?? raw)
              const href = hasTitle ? raw.split('##').slice(1).join('##') : raw
              return (
                <a
                  key={i}
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-white/[0.03] border border-white/[0.06] hover:border-indigo-400/40 hover:bg-indigo-500/5 transition-colors text-[11px] text-white/60 hover:text-white/90 truncate"
                >
                  <FileDown className="w-3 h-3 shrink-0 text-red-400/60" />
                  <span className="truncate">{decodeURIComponent(displayName)}</span>
                  <ExternalLink className="w-3 h-3 shrink-0 ml-auto text-white/20" />
                </a>
              )
            })}
          </div>
        </div>
        ) : null
        return null
      })}

      {/* Source URL */}
      {data.sourceUrl && (
        <div className="px-4 pt-3 pb-4">
          <p className="text-[10px] font-semibold text-white/30 uppercase tracking-wider mb-2">
            Source
          </p>
          <a
            href={data.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 p-2.5 rounded-lg border border-white/[0.07] bg-white/[0.025] hover:bg-white/[0.05] hover:border-white/[0.12] transition-colors group"
          >
            <Globe className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            <span className="text-[11px] text-white/60 truncate flex-1">
              {data.sourceUrl.replace(/^https?:\/\//, '')}
            </span>
            <ExternalLink className="w-3 h-3 text-white/30 group-hover:text-white/60 shrink-0" />
          </a>
          {data.additionalSources.length > 0 && (
            <details className="mt-2">
              <summary className="text-[10px] text-white/30 cursor-pointer hover:text-white/50">
                + {data.additionalSources.length} autres résultats
              </summary>
              <div className="mt-1.5 space-y-1">
                {data.additionalSources.map((url, i) => (
                  <a
                    key={i}
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="block text-[10px] text-white/40 hover:text-indigo-300 truncate"
                  >
                    {url.replace(/^https?:\/\//, '')}
                  </a>
                ))}
              </div>
            </details>
          )}
          {scrapeCache?.sourcesScrapped && scrapeCache.sourcesScrapped.length > 1 && (
            <details className="mt-2">
              <summary className="text-xs text-neutral-400 cursor-pointer hover:text-neutral-200">
                {scrapeCache.sourcesScrapped.length} sources scrapées
              </summary>
              <ul className="mt-1 space-y-1">
                {scrapeCache.sourcesScrapped.map((url, i) => (
                  <li key={i} className="text-xs text-neutral-500 truncate">
                    <a href={url} target="_blank" rel="noreferrer" className="hover:text-indigo-400">
                      {url}
                    </a>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  )
}

// ── LLM request debug panel ───────────────────────────────────────────────

function LlmRequestPanel({ request }: { request: LlmRequestInfo }) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<'prompt' | 'params' | 'schema'>('prompt')
  const [copied, setCopied] = useState<'prompt' | 'params' | 'schema' | null>(null)

  const userMessage = request.messages.find((m) => m.role === 'user')?.content ?? ''
  const promptChars = userMessage.length
  const promptWords = userMessage.trim().split(/\s+/).filter(Boolean).length

  const paramsJson = JSON.stringify(
    {
      provider: request.provider,
      endpoint: request.endpoint,
      model: request.model,
      temperature: request.temperature,
      max_tokens: request.max_tokens,
      tool_choice: request.tool_name
        ? { type: 'tool', name: request.tool_name }
        : undefined,
      task: request.task,
      version: request.version,
    },
    null,
    2,
  )

  const schemaJson = request.input_schema
    ? JSON.stringify(request.input_schema, null, 2)
    : '(aucun schéma)'

  const copy = (kind: 'prompt' | 'params' | 'schema', value: string) => {
    void navigator.clipboard.writeText(value)
    setCopied(kind)
    setTimeout(() => setCopied((c) => (c === kind ? null : c)), 1200)
  }

  const tabs: { id: 'prompt' | 'params' | 'schema'; label: string }[] = [
    { id: 'prompt', label: 'Prompt' },
    { id: 'params', label: 'Paramètres' },
    { id: 'schema', label: 'Schéma tool' },
  ]

  const content =
    tab === 'prompt' ? userMessage : tab === 'params' ? paramsJson : schemaJson
  const copyKey: 'prompt' | 'params' | 'schema' = tab

  return (
    <div className="border-b border-white/[0.04]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-4 pt-3 pb-2.5 hover:bg-white/[0.015] transition-colors group"
      >
        <Code2 className="w-3 h-3 text-violet-400/70 shrink-0" />
        <p className="text-[10px] font-semibold text-white/30 uppercase tracking-wider flex-1 text-left">
          Requête LLM — prompt & paramètres
        </p>
        <span className="text-[9px] font-mono text-white/35 px-1.5 py-0.5 rounded bg-white/[0.03] border border-white/[0.06]">
          {request.model}
        </span>
        <span className="text-[9px] text-white/35 tabular-nums">
          {promptWords} mots · {promptChars} car.
        </span>
        <ChevronDown
          className={`w-3 h-3 text-white/40 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="px-4 pb-3">
          {/* Onglets */}
          <div className="flex items-center gap-0.5 mb-2 p-0.5 rounded-md bg-white/[0.03] border border-white/[0.06] w-fit">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`text-[10px] font-medium px-2 py-1 rounded transition-colors ${
                  tab === t.id
                    ? 'bg-violet-500/15 text-violet-200 border border-violet-400/25'
                    : 'text-white/50 hover:text-white/80 border border-transparent'
                }`}
              >
                {t.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => copy(copyKey, content)}
              title="Copier le contenu"
              className="ml-1 inline-flex items-center gap-1 text-[10px] text-white/50 hover:text-white/85 px-1.5 py-1 rounded hover:bg-white/[0.05] transition-colors"
            >
              {copied === copyKey ? (
                <>
                  <Check className="w-3 h-3 text-emerald-400" />
                  Copié
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" />
                  Copier
                </>
              )}
            </button>
          </div>

          {/* Contenu */}
          <pre className="text-[10.5px] leading-relaxed font-mono text-white/65 whitespace-pre-wrap break-words bg-black/40 border border-white/[0.05] rounded-md p-2.5 max-h-[280px] overflow-y-auto">
            {content || '(vide)'}
          </pre>
        </div>
      )}
    </div>
  )
}

// ── Advantage groups ──────────────────────────────────────────────────────

/** Couleurs d'accent pour les groupes d'avantages (cycle) */
const ADVANTAGE_GROUP_COLORS = [
  { border: 'border-amber-500/20', bg: 'bg-amber-500/[0.06]', text: 'text-amber-400/70' },
  { border: 'border-teal-500/20', bg: 'bg-teal-500/[0.06]', text: 'text-teal-400/70' },
  { border: 'border-violet-500/20', bg: 'bg-violet-500/[0.06]', text: 'text-violet-400/70' },
  { border: 'border-rose-500/20', bg: 'bg-rose-500/[0.06]', text: 'text-rose-400/70' },
  { border: 'border-sky-500/20', bg: 'bg-sky-500/[0.06]', text: 'text-sky-400/70' },
]

function AdvantageGroupList({
  advantages,
  hiddenGroups = [],
  onUpdate,
  data,
}: {
  advantages: EnrichedProduct['advantages']
  hiddenGroups?: string[]
  onUpdate: (patch: Partial<EnrichedProduct>) => void
  data: EnrichedProduct
}) {
  const hiddenSet = new Set(hiddenGroups)
  // Regrouper par group (conserver l'ordre d'apparition + globalIdx réel)
  const groups: Array<{ name: string | undefined; items: Array<{ adv: typeof advantages[0]; globalIdx: number }> }> = []
  const groupMap = new Map<string | undefined, number>()
  advantages.forEach((adv, globalIdx) => {
    const key = adv.group || undefined
    if (hiddenSet.has(adv.group ?? '')) return
    if (groupMap.has(key)) {
      groups[groupMap.get(key)!].items.push({ adv, globalIdx })
    } else {
      groupMap.set(key, groups.length)
      groups.push({ name: key, items: [{ adv, globalIdx }] })
    }
  })

  const hasGroups = groups.some(g => g.name)

  // Si pas de groupes, afficher en liste plate classique
  if (!hasGroups) {
    return (
      <ul className="space-y-1.5">
        {advantages.map((b, i) => (
          <li key={i} className="group flex items-start gap-2 text-[12px] text-white/70 leading-relaxed">
            <Check className="mt-[2px] w-3.5 h-3.5 text-emerald-400/70 shrink-0" />
            <EditableText
              value={b.text}
              onChange={(v) => {
                const next = [...data.advantages]
                next[i] = { ...next[i], text: v }
                onUpdate({ advantages: next })
              }}
              multiline
              placeholder="Point fort…"
              className="flex-1 text-[12px] text-white/70 leading-relaxed"
            />
            <button
              onClick={() => onUpdate({ advantages: data.advantages.filter((_, idx) => idx !== i) })}
              className="opacity-0 group-hover:opacity-100 text-white/30 hover:text-red-400 transition-all shrink-0"
              title="Supprimer"
            >
              <X className="w-3 h-3" />
            </button>
          </li>
        ))}
      </ul>
    )
  }

  // Affichage groupé
  return (
    <div className="space-y-2">
      {groups.map((grp, gi) => {
        const color = grp.name ? ADVANTAGE_GROUP_COLORS[gi % ADVANTAGE_GROUP_COLORS.length] : null
        return (
          <div key={gi} className={`rounded-lg ${color ? `border ${color.border}` : ''} overflow-hidden`}>
            {grp.name && (
              <div className={`px-3 py-1.5 ${color!.bg}`}>
                <p className={`text-[10px] font-bold uppercase tracking-wider ${color!.text}`}>
                  {grp.name}
                </p>
              </div>
            )}
            <ul className={`space-y-1 ${grp.name ? 'px-3 py-2' : ''}`}>
              {grp.items.map(({ adv, globalIdx }) => (
                <li key={globalIdx} className="group flex items-start gap-2 text-[12px] text-white/70 leading-relaxed">
                  <Check className="mt-[2px] w-3.5 h-3.5 text-emerald-400/70 shrink-0" />
                  <EditableText
                    value={adv.text}
                    onChange={(v) => {
                      const next = [...data.advantages]
                      next[globalIdx] = { ...next[globalIdx], text: v }
                      onUpdate({ advantages: next })
                    }}
                    multiline
                    placeholder="Point fort…"
                    className="flex-1 text-[12px] text-white/70 leading-relaxed"
                  />
                  <button
                    onClick={() => onUpdate({ advantages: data.advantages.filter((_, idx) => idx !== globalIdx) })}
                    className="opacity-0 group-hover:opacity-100 text-white/30 hover:text-red-400 transition-all shrink-0"
                    title="Supprimer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </div>
  )
}

// ── Spec groups accordion ─────────────────────────────────────────────────

/** Couleurs d'accent par index de groupe (cycle) */
const GROUP_COLORS = [
  { border: 'border-indigo-500/30', bg: 'bg-indigo-500/[0.07]', text: 'text-indigo-400/80', chevron: 'text-indigo-400/50' },
  { border: 'border-emerald-500/30', bg: 'bg-emerald-500/[0.07]', text: 'text-emerald-400/80', chevron: 'text-emerald-400/50' },
  { border: 'border-amber-500/30', bg: 'bg-amber-500/[0.07]', text: 'text-amber-400/80', chevron: 'text-amber-400/50' },
  { border: 'border-rose-500/30', bg: 'bg-rose-500/[0.07]', text: 'text-rose-400/80', chevron: 'text-rose-400/50' },
  { border: 'border-cyan-500/30', bg: 'bg-cyan-500/[0.07]', text: 'text-cyan-400/80', chevron: 'text-cyan-400/50' },
  { border: 'border-purple-500/30', bg: 'bg-purple-500/[0.07]', text: 'text-purple-400/80', chevron: 'text-purple-400/50' },
]

function SpecGroupAccordions({
  specifications,
  hiddenGroups = [],
  onUpdate,
  data,
}: {
  specifications: EnrichedProduct['specifications']
  hiddenGroups?: string[]
  onUpdate: (patch: Partial<EnrichedProduct>) => void
  data: EnrichedProduct
}) {
  const hiddenSet = new Set(hiddenGroups)
  // Tous les groupes ouverts par défaut
  const [openGroups, setOpenGroups] = useState<Set<number>>(() => new Set())
  const [initialized, setInitialized] = useState(false)

  // Regrouper les specs par group (conserver l'ordre d'apparition + globalIdx réel)
  const groups: Array<{ name: string | undefined; specs: Array<{ spec: typeof specifications[0]; globalIdx: number }> }> = []
  const groupMap = new Map<string | undefined, number>()
  specifications.forEach((spec, globalIdx) => {
    const key = spec.group || undefined
    if (hiddenSet.has(spec.group ?? '')) return
    if (groupMap.has(key)) {
      groups[groupMap.get(key)!].specs.push({ spec, globalIdx })
    } else {
      groupMap.set(key, groups.length)
      groups.push({ name: key, specs: [{ spec, globalIdx }] })
    }
  })

  // Initialiser tous les groupes comme ouverts au premier rendu
  useEffect(() => {
    if (!initialized && groups.length > 0) {
      setOpenGroups(new Set(groups.map((_, i) => i)))
      setInitialized(true)
    }
  }, [groups.length, initialized])

  const toggleGroup = (idx: number) => {
    setOpenGroups((prev) => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  return (
    <div className="space-y-1.5">
      {groups.map((grp, gi) => {
        const isOpen = openGroups.has(gi)
        const color = grp.name ? GROUP_COLORS[gi % GROUP_COLORS.length] : null
        return (
          <div key={gi} className={`rounded-lg border overflow-hidden ${color ? color.border : 'border-white/[0.08]'}`}>
            {grp.name ? (
              <button
                onClick={() => toggleGroup(gi)}
                className={`w-full flex items-center justify-between px-3 py-2 ${color!.bg} transition-colors hover:brightness-125`}
              >
                <span className={`text-[10px] font-bold uppercase tracking-wider ${color!.text}`}>
                  {grp.name}
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] text-white/25">{grp.specs.length}</span>
                  <ChevronDown className={`w-3.5 h-3.5 ${color!.chevron} transition-transform duration-200 ${isOpen ? '' : '-rotate-90'}`} />
                </div>
              </button>
            ) : null}
            {(isOpen || !grp.name) && (
              <div>
                {grp.specs.map(({ spec: s, globalIdx: i }, localIdx) => (
                  <div
                    key={i}
                    className={`group flex items-stretch min-h-[30px] ${
                      localIdx % 2 === 0 ? 'bg-white/[0.02]' : 'bg-transparent'
                    } ${localIdx > 0 || grp.name ? 'border-t border-white/[0.04]' : ''}`}
                  >
                    <div className="w-[45%] px-3 py-1.5 border-r border-white/[0.05] shrink-0 flex items-center">
                      <EditableText
                        value={s.name}
                        onChange={(v) => {
                          const next = [...data.specifications]
                          next[i] = { ...next[i], name: v }
                          onUpdate({ specifications: next })
                        }}
                        placeholder="Nom"
                        className="w-full text-[11px] text-white/45 leading-snug"
                      />
                    </div>
                    <div className="flex-1 px-3 py-1.5 flex items-center gap-1">
                      <EditableText
                        value={s.value}
                        onChange={(v) => {
                          const next = [...data.specifications]
                          next[i] = { ...next[i], value: v }
                          onUpdate({ specifications: next })
                        }}
                        placeholder="Valeur"
                        className="flex-1 text-[11.5px] text-white/80 leading-snug font-medium"
                      />
                      <button
                        onClick={() => {
                          const next = data.specifications.filter((_, idx) => idx !== i)
                          onUpdate({ specifications: next })
                        }}
                        className="opacity-0 group-hover:opacity-100 text-white/30 hover:text-red-400 transition-all shrink-0"
                        title="Supprimer"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Variant table ────────────────────────────────────────────────────────

function VariantTable({ variants }: { variants: EnrichedProduct['variants'] }) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null)

  // Séparer propriétés "tableau" (partagées par toutes/plupart des variantes, courtes)
  // des specs détaillées (propres à chaque variante, nombreuses)
  const allKeys: string[] = []
  const keySet = new Set<string>()
  for (const v of variants) {
    for (const k of Object.keys(v.properties)) {
      if (!keySet.has(k)) { keySet.add(k); allKeys.push(k) }
    }
  }
  const activeKeys = allKeys.filter(k => variants.some(v => v.properties[k]?.trim()))

  // Colonnes "discriminantes" = présentes chez >50% des variantes ET nom court (<20 car)
  // Specs détaillées = le reste (spécifiques par variante)
  const threshold = Math.max(1, Math.floor(variants.length * 0.5))
  const tableKeys = activeKeys.filter(k => {
    const count = variants.filter(v => v.properties[k]?.trim()).length
    return count >= threshold && k.length < 25
  })
  // Limiter le tableau à 6 colonnes max pour rester lisible
  const displayTableKeys = tableKeys.slice(0, 6)

  // Pour chaque variante, les specs détaillées (pas dans les colonnes du tableau)
  const getDetailSpecs = (v: typeof variants[0]) => {
    const tableKeySet = new Set(displayTableKeys)
    return Object.entries(v.properties)
      .filter(([k, val]) => !tableKeySet.has(k) && val?.trim())
      .map(([k, val]) => ({ name: k, value: val }))
  }
  const hasDetails = variants.some(v => getDetailSpecs(v).length > 0)

  /** Supprime le préfixe du nom de colonne dans la valeur de la cellule.
   *  Ex: colonne "Couleur" + valeur "Couleur Noir" → "Noir"
   *      colonne "Libellé" + valeur "Libellé 1m caniv..." → "1m caniv..."
   *      colonne "Emb." + valeur "Emb." → "—" (valeur = juste le header)
   */
  const stripHeaderPrefix = (colName: string, val: string | undefined): string => {
    if (!val?.trim()) return ''
    const v = val.trim()
    // Normaliser pour la comparaison (ignorer accents, casse, ponctuation finale)
    const normCol = colName.replace(/[.\s]+$/g, '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    const normVal = v.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    if (normVal.startsWith(normCol)) {
      const rest = v.slice(colName.replace(/[.\s]+$/g, '').length).replace(/^[\s.:;,\-–—]+/, '').trim()
      return rest || ''
    }
    return v
  }

  return (
    <div className="rounded-lg border border-white/[0.08] overflow-x-auto">
      <table className="w-full text-[10px]">
        <thead>
          <tr className="bg-white/[0.04] border-b border-white/[0.06]">
            {hasDetails && (
              <th className="w-6 px-1 py-2" />
            )}
            <th className="px-2.5 py-2 text-left text-[9px] font-bold text-white/40 uppercase tracking-wider whitespace-nowrap">
              Réf.
            </th>
            <th className="px-2.5 py-2 text-left text-[9px] font-bold text-white/40 uppercase tracking-wider">
              Libellé
            </th>
            {displayTableKeys.map(k => (
              <th key={k} className="px-2.5 py-2 text-left text-[9px] font-bold text-white/40 uppercase tracking-wider whitespace-nowrap">
                {k}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {variants.map((v, i) => {
            const details = getDetailSpecs(v)
            const isExpanded = expandedIdx === i
            const colSpan = 2 + displayTableKeys.length + (hasDetails ? 1 : 0)
            return (
              <>
                <tr
                  key={`row-${i}`}
                  className={`${
                    i % 2 === 0 ? 'bg-white/[0.015]' : 'bg-transparent'
                  } border-t border-white/[0.04] hover:bg-white/[0.04] transition-colors ${details.length > 0 ? 'cursor-pointer' : ''}`}
                  onClick={() => details.length > 0 && setExpandedIdx(isExpanded ? null : i)}
                >
                  {hasDetails && (
                    <td className="w-6 px-1 py-1.5 text-center text-white/30">
                      {details.length > 0 && (
                        <ChevronDown className={`w-3 h-3 inline transition-transform ${isExpanded ? 'rotate-0' : '-rotate-90'}`} />
                      )}
                    </td>
                  )}
                  <td className="px-2.5 py-1.5 whitespace-nowrap font-semibold text-indigo-400/80">
                    {stripHeaderPrefix('Référence', v.reference) || stripHeaderPrefix('Réf', v.reference) || v.reference}
                  </td>
                  <td className="px-2.5 py-1.5 text-white/60 max-w-[200px] truncate" title={v.label}>
                    {stripHeaderPrefix('Libellé', v.label) || v.label}
                  </td>
                  {displayTableKeys.map(k => {
                    const cleaned = stripHeaderPrefix(k, v.properties[k])
                    return (
                      <td key={k} className="px-2.5 py-1.5 text-white/50 whitespace-nowrap">
                        {cleaned || '—'}
                      </td>
                    )
                  })}
                </tr>
                {isExpanded && details.length > 0 && (
                  <tr key={`detail-${i}`} className="bg-white/[0.03]">
                    <td colSpan={colSpan} className="px-4 py-2">
                      <div className="grid grid-cols-2 gap-x-6 gap-y-0.5 text-[9px]">
                        {details.map((s, si) => {
                          const cleanedVal = stripHeaderPrefix(s.name, s.value)
                          return (
                            <div key={si} className="flex justify-between gap-2 py-0.5 border-b border-white/[0.04]">
                              <span className="text-white/40">{s.name}</span>
                              <span className="text-white/70 text-right font-medium">{cleanedVal || s.value}</span>
                            </div>
                          )
                        })}
                      </div>
                    </td>
                  </tr>
                )}
              </>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Editable text (inline) ────────────────────────────────────────────────

function EditableText({
  value,
  onChange,
  multiline = false,
  placeholder = '',
  className = '',
}: {
  value: string
  onChange: (next: string) => void
  multiline?: boolean
  placeholder?: string
  className?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!editing) setDraft(value)
  }, [value, editing])

  useEffect(() => {
    if (!editing) return
    const el = multiline ? textareaRef.current : inputRef.current
    if (!el) return
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
    if (el instanceof HTMLTextAreaElement) {
      el.style.height = 'auto'
      el.style.height = `${el.scrollHeight}px`
    }
  }, [editing, multiline])

  const commit = () => {
    setEditing(false)
    if (draft !== value) onChange(draft)
  }
  const cancel = () => {
    setEditing(false)
    setDraft(value)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      cancel()
    } else if (e.key === 'Enter' && !multiline) {
      e.preventDefault()
      commit()
    } else if (e.key === 'Enter' && multiline && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      commit()
    }
  }

  if (editing) {
    const baseCls = `w-full bg-white/[0.04] border border-indigo-400/40 rounded px-1.5 py-1 outline-none focus:border-indigo-400 ${className}`
    return multiline ? (
      <textarea
        ref={textareaRef}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value)
          e.target.style.height = 'auto'
          e.target.style.height = `${e.target.scrollHeight}px`
        }}
        onBlur={commit}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        rows={1}
        style={{ resize: 'none', overflow: 'hidden' }}
        className={baseCls}
      />
    ) : (
      <input
        ref={inputRef}
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className={baseCls}
      />
    )
  }

  const isEmpty = !value || value.trim() === ''
  return (
    <span
      onClick={() => setEditing(true)}
      className={`cursor-text hover:bg-white/[0.03] rounded px-1 -mx-1 transition-colors ${
        multiline ? 'block whitespace-pre-line' : 'inline-block'
      } ${className} ${isEmpty ? 'text-white/25 italic' : ''}`}
      title="Cliquer pour éditer"
    >
      {isEmpty ? placeholder || 'Cliquer pour éditer…' : value}
    </span>
  )
}
