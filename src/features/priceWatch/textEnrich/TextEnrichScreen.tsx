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
import { Languages, Loader2, RotateCcw, ExternalLink } from 'lucide-react'
import { useTranslation, intlLocale } from '@/lib/i18n'
import { toast } from 'sonner'
import { detectLanguage } from '@/features/textEnrich/detectLang'
import { generateJson } from '@/features/ai/llmRouter'
import { ScreenBatchSchema, screenSchemaForLLM, buildScreenPrompt } from './screenPrompt'
import { TextEnrichFilters } from './TextEnrichFilters'
import { rejectionParts, type RejectionPart } from './violationSummary'
import { findViolations } from '@/features/textEnrich/protected'
import { searchCatalog } from '../explorer/catalogList'
import { langBreakdown } from './langBreakdown'
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

export function TextEnrichScreen({ uid, watchId, products, loading, query }: {
  uid: string
  watchId: string
  products: SourceProduct[]
  loading: boolean
  /** La saisie du bandeau. ⚠ UNE seule recherche à l'écran : un champ propre à ce
   *  panneau laissait taper une référence en haut sans rien voir changer ici. */
  query: string
}) {
  const { t, locale } = useTranslation()
  const n = (v: number) => v.toLocaleString(intlLocale(locale))

  const [revisions, setRevisions] = useState<Map<string, TextRevision>>(new Map())
  const [onlyForeign, setOnlyForeign] = useState(true)
  /** Langue isolée par un clic sur sa pastille. `undefined` = pas de filtre par langue ;
   *  `null` = les fiches dont la langue n'a pas été tranchée. */
  const [pickedLang, setPickedLang] = useState<string | null | undefined>(undefined)
  /** Ce qu'on demande au modèle. Traduire seul ne suffisait pas : l'écran s'appelle
   *  « Traduire ET améliorer », et rien ne permettait d'améliorer. */
  const [modes, setModes] = useState({ translate: true, improve: false })
  /** Filtre sur le TEXTE DE VENTE : ce champ est le sujet de l'écran, or une fiche qui
   *  n'en a pas ne peut pas être traduite — elle encombre la liste sans rien à traiter. */
  const [saleText, setSaleText] = useState<'all' | 'with' | 'without'>('all')
  /** Pourquoi une fiche n'a rien donné, par produit. Vide tant qu'on n'a rien lancé —
   *  ces refus étaient invisibles, et « pas encore traduit » ne disait pas s'il fallait
   *  relancer ou si la réponse avait été rejetée. */
  const [rejected, setRejected] = useState<Map<string, RejectionPart[]>>(new Map())
  const [prompt, setPrompt] = useState('')
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState(0)
  // ⚠ La saisie est gardée TELLE QUELLE, en texte. Corriger à chaque frappe rendait le
  // champ intapable : commencer « 5 » pour 500 devenait 10 sous les doigts, et le vider
  // était impossible. Le plancher ne s'applique plus à la frappe — seulement au sens :
  // un champ vide ou nul désactive le bouton, il ne réécrit rien.
  const [limitText, setLimitText] = useState('200')
  /** 0 (ou champ vide) = TOUT ce qui reste à traiter — même sens que sur la carte de
   *  workflow. Sans cette valeur, « tout traduire » demandait de saisir un nombre plus
   *  grand que son catalogue, donc de le connaître, et de le refaire à chaque ajout. */
  const rawLimit = Math.max(0, Math.trunc(Number(limitText)) || 0)

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

  const searching = query.trim() !== ''
  const shown = useMemo(() => {
    // ⚠ Une recherche EXPLICITE l'emporte sur le filtre de langue. Chercher une référence
    // et ne rien voir parce que la fiche est déjà en français se lit comme « ce produit
    // n'existe pas » — alors qu'on vient précisément vérifier son état.
    if (searching) {
      const found = new Set(searchCatalog(products, query).map((p) => p.id))
      return lines.filter((l) => found.has(l.product.id))
    }
    // Une langue choisie l'emporte sur « seulement les textes non français » : on vient
    // de cliquer « DE 1 240 », on veut ces 1 240 fiches, pas leur intersection avec autre chose.
    const bySale = (l: Line) => {
      // « Vide » couvre aussi le texte qui RECOPIE le nom : ce n'est pas un argumentaire,
      // c'est le libellé une deuxième fois, et le traduire ne produit rien de neuf.
      const has = !!l.product.description
        && l.product.description.trim().toLowerCase() !== l.product.name.trim().toLowerCase()
      return saleText === 'all' || (saleText === 'with' ? has : !has)
    }
    if (pickedLang !== undefined) return lines.filter((l) => l.lang === pickedLang && bySale(l))
    return lines.filter((l) => !(onlyForeign && (l.lang === 'fr' || l.lang == null)) && bySale(l))
  }, [lines, products, onlyForeign, query, searching, pickedLang, saleText])

  // Ventilation calculée sur TOUT le catalogue, jamais sur la liste filtrée : sinon
  // choisir « DE » ferait disparaître les autres pastilles, et on ne pourrait plus revenir.
  const tallies = useMemo(() => langBreakdown(lines.map((l) => l.lang)), [lines])

  // Ce qui reste à faire : les fiches déjà réécrites n'y sont plus. Relancer ne repaie
  // donc jamais deux fois le même texte — c'est ce que le chemin par feuille ne savait
  // pas faire.
  const todo = useMemo(() => shown.filter((l) => !l.revision), [shown])
  const limit = rawLimit > 0 ? rawLimit : todo.length

  const run = async () => {
    const batchList = todo.slice(0, limit)
    if (batchList.length === 0) return
    setRunning(true)
    setDone(0)
    let kept = 0
    let refused = 0
    let silent = 0
    const reasons = new Map<string, RejectionPart[]>()
    try {
      for (let i = 0; i < batchList.length; i += BATCH) {
        const chunk = batchList.slice(i, i + BATCH)
        const raw = await generateJson({
          task: 'data.textEnrich',
          prompt: buildScreenPrompt(chunk.map((l) => ({
            id: l.product.id, name: l.product.name,
            ...(l.product.description ? { description: l.product.description } : {}),
            lang: l.lang,
          })), prompt, modes),
          schema: ScreenBatchSchema,
          schemaForLLM: screenSchemaForLLM,
          version: 'text-enrich-screen/v2',
        })

        const written: TextRevision[] = []
        const byId = new Map(chunk.map((l) => [l.product.id, l]))
        const answered = new Set<string>()
        for (const r of raw.results) {
          const line = byId.get(r.id)
          // Un identifiant inconnu trahit une liste décalée : on écarte plutôt que de
          // ranger un texte sur le mauvais produit.
          if (!line) continue
          answered.add(line.product.id)
          const name = String(r.name ?? '').trim()
          const description = String(r.description ?? '').trim()
          if (!name) continue

          // Même vérification que le moteur : une réécriture qui perd une référence ou
          // altère une valeur chiffrée est refusée, pas écrite.
          const before = `${line.product.name} ${line.product.description ?? ''}`
          const after = `${name} ${description ?? ''}`
          const violations = findViolations(before, after, {
            refs: [line.product.ref, line.product.ref2],
            eans: [line.product.ean],
          })
          if (violations.length > 0) {
            // Refus MOTIVÉ : la garde protège les références et les cotes, mais son
            // verdict doit se lire sur la fiche — sinon le module a simplement l'air
            // de ne pas marcher.
            reasons.set(line.product.id, rejectionParts(violations))
            refused++
            continue
          }

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

        // Le modèle a ignoré ces fiches : ni écrites, ni refusées. Sans ce décompte,
        // elles se confondent avec les refus et on cherche une cause qui n'existe pas.
        silent += chunk.length - answered.size

        // ⚠ Sauvegarde À CHAQUE LOT, pas à la fin : une erreur au dixième lot jetait les
        // neuf premiers, déjà payés au modèle.
        if (written.length > 0) {
          await saveTextRevisions(uid, watchId, written)
          kept += written.length
          setRevisions((prev) => {
            const next = new Map(prev)
            for (const r of written) next.set(r.productId, r)
            return next
          })
        }
        setRejected((prev) => new Map([...prev, ...reasons]))
        setDone(Math.min(i + BATCH, batchList.length))
      }
      toast.success(t('pwte.doneToast', {
        count: n(kept), asked: n(batchList.length), refused: n(refused), silent: n(silent),
      }))
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

        <TextEnrichFilters
          tallies={tallies} pickedLang={pickedLang} onPickLang={setPickedLang}
          onlyForeign={onlyForeign} onOnlyForeign={setOnlyForeign} searching={searching}
          saleText={saleText} onSaleText={setSaleText}
          modes={modes} onModes={setModes}
          limitText={limitText} onLimitText={setLimitText}
          running={running} done={done} count={Math.min(limit, todo.length)}
          canRun={!running && todo.length > 0 && (modes.translate || modes.improve)}
          onRun={() => void run()}
        />
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
                {l.product.url && (
                  <a href={l.product.url} target="_blank" rel="noreferrer"
                    className="flex items-center gap-1 text-white/35 hover:text-indigo-300"
                    title={t('pwte.openProduct')}>
                    <ExternalLink className="w-3 h-3" />{t('pwte.openProduct')}
                  </a>
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
                  {/* Les deux champs sont NOMMÉS : sans étiquette, deux lignes de texte se
                      lisent comme un titre et son sous-titre, alors que la seconde est le
                      texte de vente — le champ que l'écran est censé traiter. */}
                  <p className="text-[9px] uppercase tracking-wide text-white/20">{t('pwte.field.name')}</p>
                  <p className="text-[12px] text-white/70 break-words">{l.product.name}</p>
                  <p className="mt-1 text-[9px] uppercase tracking-wide text-white/20">{t('pwte.field.saleText')}</p>
                  {l.product.description
                    ? <p className="text-[11px] text-white/35 break-words line-clamp-3">{l.product.description}</p>
                    : <p className="text-[11px] italic text-white/20">{t('pwte.field.empty')}</p>}
                </div>
                <div className="min-w-0">
                  <p className="text-[9px] uppercase tracking-wide text-emerald-300/40">{t('pwte.after')}</p>
                  {l.revision ? (
                    <>
                      <p className="text-[9px] uppercase tracking-wide text-white/20">{t('pwte.field.name')}</p>
                      <p className="text-[12px] text-emerald-100/90 break-words">{l.revision.name}</p>
                      <p className="mt-1 text-[9px] uppercase tracking-wide text-white/20">{t('pwte.field.saleText')}</p>
                      {l.revision.description
                        ? <p className="text-[11px] text-emerald-200/50 break-words line-clamp-3">{l.revision.description}</p>
                        : <p className="text-[11px] italic text-white/20">{t('pwte.field.empty')}</p>}
                      {l.revision.note && (
                        <p className="mt-0.5 text-[10px] italic text-white/30 break-words">{l.revision.note}</p>
                      )}
                    </>
                  ) : rejected.get(l.product.id)?.length ? (
                    <div className="space-y-0.5">
                      <p className="text-[11px] text-amber-300/80">{t('pwte.rejected')}</p>
                      {rejected.get(l.product.id)?.map((r, i) => (
                        <p key={i} className="text-[10px] text-amber-200/50 break-words">
                          {t(r.key, { token: r.token })}
                        </p>
                      ))}
                    </div>
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
