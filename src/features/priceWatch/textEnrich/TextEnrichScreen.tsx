// Traduire et améliorer les textes de son catalogue, DANS l'app.
//
// ⚠ Cet écran existe parce que le chemin par le workflow ne répondait pas au besoin :
// pour traduire, il fallait poser une carte, régler dix paramètres, relancer la chaîne
// entière, puis exporter un fichier pour voir le résultat. Ici on choisit, on lance, on
// lit l'avant/après dans le tableau — rien d'autre.
//
// Les textes réécrits vivent À CÔTÉ du catalogue, jamais dedans : « Comparer catalogue »
// réécrit le catalogue en bloc et les effacerait sans un mot.
import { useEffect, useMemo, useState } from 'react'
import { Languages, Loader2, RotateCcw, Play } from 'lucide-react'
import { useTranslation, intlLocale } from '@/lib/i18n'
import { toast } from 'sonner'
import { detectLanguage } from '@/features/textEnrich/detectLang'
import { generateJson } from '@/features/ai/llmRouter'
import { EnrichBatchSchema, schemaForLLM } from '@/features/textEnrich/prompt'
import { findViolations } from '@/features/textEnrich/protected'
import type { SourceProduct } from '../catalog/match'
import {
  loadTextRevisions, saveTextRevisions, dropTextRevision, type TextRevision,
} from '../textRevisionsStore'

/** Textes envoyés au modèle en une fois. Au-delà, les réponses se dégradent et une erreur
 *  coûte tout le lot ; en deçà, on paie trop d'allers-retours. */
const BATCH = 20

interface Line {
  product: SourceProduct
  lang: string | null
  revision?: TextRevision
}

export function TextEnrichScreen({ uid, watchId, products, loading }: {
  uid: string
  watchId: string
  products: SourceProduct[]
  loading: boolean
}) {
  const { t, locale } = useTranslation()
  const n = (v: number) => v.toLocaleString(intlLocale(locale))

  const [revisions, setRevisions] = useState<Map<string, TextRevision>>(new Map())
  const [onlyForeign, setOnlyForeign] = useState(true)
  const [prompt, setPrompt] = useState('')
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState(0)
  const [limit, setLimit] = useState(200)
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!uid || !watchId) return
    let alive = true
    loadTextRevisions(uid, watchId)
      .then((m) => { if (alive) setRevisions(m) })
      .catch(() => undefined)
    return () => { alive = false }
  }, [uid, watchId])

  // La langue se détecte sur la DESCRIPTION quand elle existe : un libellé de pièce est
  // souvent trop court et trop technique pour trancher (cf. `detectLanguage`, qui s'abstient).
  const lines = useMemo<Line[]>(() => products.map((p) => ({
    product: p,
    lang: detectLanguage(p.description || p.name).lang,
    revision: revisions.get(p.id),
  })), [products, revisions])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return lines.filter((l) => {
      if (onlyForeign && (l.lang === 'fr' || l.lang == null)) return false
      if (!q) return true
      return `${l.product.name} ${l.product.ref ?? ''} ${l.product.ean ?? ''}`.toLowerCase().includes(q)
    })
  }, [lines, onlyForeign, query])

  // Ce qui reste à faire : les fiches déjà réécrites n'y sont plus. Relancer ne repaie
  // donc jamais deux fois le même texte — c'est ce que le chemin par feuille ne savait
  // pas faire.
  const todo = useMemo(() => shown.filter((l) => !l.revision), [shown])

  const run = async () => {
    const batchList = todo.slice(0, limit)
    if (batchList.length === 0) return
    setRunning(true)
    setDone(0)
    const written: TextRevision[] = []
    try {
      for (let i = 0; i < batchList.length; i += BATCH) {
        const chunk = batchList.slice(i, i + BATCH)
        const items = chunk.map((l) => [
          `--- id=${JSON.stringify(l.product.id)}`,
          l.lang ? `langue détectée : ${l.lang}` : '',
          `nom: ${l.product.name}`,
          l.product.description ? `description: ${l.product.description}` : '',
        ].filter(Boolean).join('\n'))

        const raw = await generateJson({
          task: 'data.textEnrich',
          // La consigne de l'utilisateur passe EN TÊTE, verbatim. Le reste n'est que la
          // tâche et les garde-fous de forme.
          prompt: [
            prompt.trim(),
            prompt.trim() ? '' : undefined,
            'Traduis en français le nom et la description de chaque produit ci-dessous.',
            '',
            'Recopie EXACTEMENT les références, codes article, codes-barres, valeurs chiffrées et unités.',
            'N’ajoute aucune marque absente, n’invente aucune caractéristique.',
            'Réponds avec, pour chaque entrée, le même identifiant et le texte au format « nom | description ».',
            '',
            items.join('\n\n'),
          ].filter((x) => x !== undefined).join('\n'),
          schema: EnrichBatchSchema,
          schemaForLLM: schemaForLLM(true),
          version: 'text-enrich-screen/v1',
        })

        const byId = new Map(chunk.map((l) => [l.product.id, l]))
        for (const r of raw.results) {
          const line = byId.get(r.id)
          // Un identifiant inconnu trahit une liste décalée : on écarte plutôt que de
          // ranger un texte sur le mauvais produit.
          if (!line) continue
          const [name, description] = String(r.text).split('|').map((x) => x.trim())
          if (!name) continue

          // Même vérification que le moteur : une réécriture qui perd une référence ou
          // altère une valeur chiffrée est refusée, pas écrite.
          const before = `${line.product.name} ${line.product.description ?? ''}`
          const after = `${name} ${description ?? ''}`
          const violations = findViolations(before, after, {
            refs: [line.product.ref, line.product.ref2],
            eans: [line.product.ean],
          })
          if (violations.length > 0) continue

          written.push({
            productId: line.product.id,
            name,
            ...(description ? { description } : {}),
            nameSource: line.product.name,
            ...(line.product.description ? { descriptionSource: line.product.description } : {}),
            ...(r.note ? { note: r.note } : {}),
            ...(line.lang ? { lang: line.lang } : {}),
            at: Date.now(),
          })
        }
        setDone(Math.min(i + BATCH, batchList.length))
      }

      if (written.length > 0) {
        await saveTextRevisions(uid, watchId, written)
        setRevisions((prev) => {
          const next = new Map(prev)
          for (const r of written) next.set(r.productId, r)
          return next
        })
      }
      toast.success(t('pwte.doneToast', { count: n(written.length), asked: n(batchList.length) }))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setRunning(false)
    }
  }

  const revert = async (productId: string) => {
    await dropTextRevision(uid, watchId, productId)
    setRevisions((prev) => {
      const next = new Map(prev)
      next.delete(productId)
      return next
    })
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="px-4 py-3 border-b border-white/10 space-y-2.5">
        <div className="flex items-center gap-2">
          <Languages className="w-4 h-4 text-indigo-300" />
          <h2 className="text-sm font-medium text-white">{t('pwte.title')}</h2>
          <span className="text-[11px] text-white/40 tabular-nums">
            {t('pwte.counts', { todo: n(todo.length), done: n(revisions.size), total: n(products.length) })}
          </span>
        </div>

        <textarea
          value={prompt} onChange={(e) => setPrompt(e.target.value)}
          placeholder={t('pwte.promptPlaceholder')} rows={2}
          className="w-full rounded border border-border bg-well px-2 py-1.5 text-xs text-white outline-none focus:border-accent"
        />

        <div className="flex flex-wrap items-center gap-3 text-[11px] text-white/50">
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={onlyForeign} onChange={(e) => setOnlyForeign(e.target.checked)}
              className="h-3.5 w-3.5 accent-accent" />
            {t('pwte.onlyForeign')}
          </label>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('pwte.search')}
            className="h-7 rounded border border-border bg-well px-2 text-xs text-white outline-none focus:border-accent" />
          <label className="flex items-center gap-1.5">
            {t('pwte.limit')}
            <input type="number" min={1} step={100} value={limit}
              onChange={(e) => setLimit(Math.max(1, Number(e.target.value) || 1))}
              className="h-7 w-20 rounded border border-border bg-well px-2 text-xs text-white outline-none focus:border-accent" />
          </label>
          <button type="button" onClick={() => void run()} disabled={running || todo.length === 0}
            className="ml-auto flex items-center gap-1.5 rounded bg-indigo-500/90 px-3 py-1.5 text-[11px] font-medium text-[#fff] hover:bg-indigo-500 disabled:opacity-40">
            {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
            {running
              ? t('pwte.running', { done: n(done), total: n(Math.min(limit, todo.length)) })
              : t('pwte.run', { count: n(Math.min(limit, todo.length)) })}
          </button>
        </div>
      </div>

      {loading ? (
        <p className="py-16 text-center text-white/40 text-sm flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />{t('pwx.lectureDesFichesCollectees')}
        </p>
      ) : shown.length === 0 ? (
        <p className="p-8 text-center text-[12px] text-white/35">{t('pwte.none')}</p>
      ) : (
        <div className="flex-1 min-h-0 overflow-auto">
          {shown.slice(0, 300).map((l) => (
            <div key={l.product.id} className="px-4 py-2.5 border-b border-white/[0.05]">
              <div className="flex items-baseline gap-2 text-[10px] text-white/35">
                {l.product.ref && <span className="tabular-nums">{l.product.ref}</span>}
                {l.lang && (
                  <span className="rounded border border-white/15 px-1 uppercase">{l.lang}</span>
                )}
                {l.revision && (
                  <button type="button" onClick={() => void revert(l.product.id)}
                    className="ml-auto flex items-center gap-1 text-white/35 hover:text-rose-300">
                    <RotateCcw className="w-3 h-3" />{t('pwte.revert')}
                  </button>
                )}
              </div>
              {/* Avant à gauche, après à droite : c'est la comparaison qu'on vient faire,
                  elle ne doit demander aucun clic. */}
              <div className="mt-1 grid gap-3 sm:grid-cols-2">
                <div className="min-w-0">
                  <p className="text-[9px] uppercase tracking-wide text-white/25">{t('pwte.before')}</p>
                  <p className="text-[12px] text-white/70 break-words">{l.product.name}</p>
                  {l.product.description && (
                    <p className="text-[11px] text-white/35 break-words line-clamp-3">{l.product.description}</p>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-[9px] uppercase tracking-wide text-emerald-300/40">{t('pwte.after')}</p>
                  {l.revision ? (
                    <>
                      <p className="text-[12px] text-emerald-100/90 break-words">{l.revision.name}</p>
                      {l.revision.description && (
                        <p className="text-[11px] text-emerald-200/50 break-words line-clamp-3">{l.revision.description}</p>
                      )}
                      {l.revision.note && (
                        <p className="mt-0.5 text-[10px] italic text-white/30 break-words">{l.revision.note}</p>
                      )}
                    </>
                  ) : (
                    <p className="text-[11px] text-white/20">{t('pwte.pending')}</p>
                  )}
                </div>
              </div>
            </div>
          ))}
          {shown.length > 300 && (
            <p className="py-3 text-center text-[11px] text-white/30">
              {t('pwte.truncated', { count: n(shown.length - 300) })}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
