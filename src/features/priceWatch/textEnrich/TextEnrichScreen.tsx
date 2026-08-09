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
import { Languages, Loader2 } from 'lucide-react'
import { useTranslation, intlLocale } from '@/lib/i18n'
import { toast } from 'sonner'
import { detectLanguage } from '@/features/textEnrich/detectLang'
import { generateJson } from '@/features/ai/llmRouter'
import { ScreenBatchSchema, screenSchemaForLLM, buildScreenPrompt } from './screenPrompt'
import { TextEnrichFilters, type DoneFilter } from './TextEnrichFilters'
import { TextEnrichRow } from './TextEnrichRow'
import { rejectionParts, type RejectionPart } from './violationSummary'
import { chunkByVolume } from './chunkByVolume'
import { findViolations } from '@/features/textEnrich/protected'
import { searchCatalog } from '../explorer/catalogList'
import { isUnderPath } from '../explorer/taxonomyTree'
import { langBreakdown } from './langBreakdown'
import type { SourceProduct } from '../catalog/match'
import {
  loadTextRevisions, saveTextRevisions, dropTextRevision, type TextRevision,
} from '../textRevisionsStore'

/** Plafond de SORTIE. Le défaut du routeur (8192) suffit à une extraction, pas à une
 *  réécriture : ici la réponse pèse au moins autant que l'entrée, plus la note explicative
 *  de chaque fiche. Trop bas, la sortie est tronquée en silence et le JSON devient
 *  invalide — l'écran reste alors à « 0 / 10 » sans rien dire. */
const MAX_OUTPUT_TOKENS = 16000

interface Line {
  product: SourceProduct
  lang: string | null
  revision?: TextRevision
}

export function TextEnrichScreen({ uid, watchId, products, loading, query, path, imagePrefix }: {
  uid: string
  watchId: string
  products: SourceProduct[]
  loading: boolean
  /** La saisie du bandeau. ⚠ UNE seule recherche à l'écran : un champ propre à ce
   *  panneau laissait taper une référence en haut sans rien voir changer ici. */
  query: string
  /** Famille choisie dans l'arbre de gauche. ⚠ C'est un PÉRIMÈTRE, pas un filtre de plus :
   *  il s'applique avant tout le reste, y compris à une recherche explicite — sinon
   *  l'arbre est un contrôle qui ne pilote rien depuis cet écran. */
  path: string[]
  /** Préfixe des visuels réglé sur la source : les ERP n'y stockent qu'un nom de fichier. */
  imagePrefix?: string
}) {
  const { t, locale } = useTranslation()
  const n = (v: number) => v.toLocaleString(intlLocale(locale))

  const [revisions, setRevisions] = useState<Map<string, TextRevision>>(new Map())
  /** Ce qu'on met dans la file. ⚠ « Seulement les textes non français » écartait AUSSI
   *  les indéterminés — 81 117 fiches sur 115 814, soit 70 % du catalogue, hors de toute
   *  file et hors du compteur « à traiter », sans que rien ne le dise. Le détecteur
   *  s'abstient dès qu'un texte est court, technique ou à l'encodage cassé : son silence
   *  ne veut pas dire « déjà en français ». Les trois portées sont donc explicites. */
  const [scope, setScope] = useState<'foreign' | 'foreignPlus' | 'all'>('foreign')
  /** Langue isolée par un clic sur sa pastille. `undefined` = pas de filtre par langue ;
   *  `null` = les fiches dont la langue n'a pas été tranchée. */
  const [pickedLang, setPickedLang] = useState<string | null | undefined>(undefined)
  /** Ce qu'on demande au modèle. Traduire seul ne suffisait pas : l'écran s'appelle
   *  « Traduire ET améliorer », et rien ne permettait d'améliorer. */
  const [modes, setModes] = useState({ translate: true, improve: false })
  /** Filtre sur le TEXTE DE VENTE : ce champ est le sujet de l'écran, or une fiche qui
   *  n'en a pas ne peut pas être traduite — elle encombre la liste sans rien à traiter. */
  const [saleText, setSaleText] = useState<'all' | 'with' | 'without'>('all')
  /** Ce qu'on veut RELIRE. Traduire et réécrire se lisaient de la même façon dans la
   *  colonne APRÈS, alors qu'on ne les relit pas pareil : une traduction se vérifie, une
   *  réécriture se juge. */
  const [doneFilter, setDoneFilter] = useState<DoneFilter>('all')
  /** Pourquoi une fiche n'a rien donné, par produit. Vide tant qu'on n'a rien lancé —
   *  ces refus étaient invisibles, et « pas encore traduit » ne disait pas s'il fallait
   *  relancer ou si la réponse avait été rejetée. */
  const [rejected, setRejected] = useState<Map<string, RejectionPart[]>>(new Map())
  const [prompt, setPrompt] = useState('')
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState(0)
  /** Ce qui est déjà tombé pendant le run. Le bouton seul affichait « 0 / 200 » pendant
   *  toute la durée du premier lot : rien ne distinguait un traitement en cours d'un
   *  écran figé. */
  const [live, setLive] = useState({ kept: 0, refused: 0 })
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
    // La famille choisie borne TOUT ce qui suit : traduire « les courroies » veut dire
    // les courroies, quel que soit le filtre de langue ou la recherche par-dessus.
    const inPath = (l: Line) => path.length === 0 || isUnderPath(l.product.taxo ?? [], path)
    // ⚠ Les fiches d'avant le champ `ops` comptent comme traitées, jamais comme traduites
    // NI comme améliorées : les ranger d'office dans l'une des deux serait une invention.
    const byDone = (l: Line) => {
      if (doneFilter === 'all') return true
      if (doneFilter === 'todo') return !l.revision
      if (!l.revision) return false
      return doneFilter === 'translated' ? !!l.revision.ops?.translate : !!l.revision.ops?.improve
    }
    // ⚠ Une recherche EXPLICITE l'emporte sur le filtre de langue. Chercher une référence
    // et ne rien voir parce que la fiche est déjà en français se lit comme « ce produit
    // n'existe pas » — alors qu'on vient précisément vérifier son état.
    if (searching) {
      const found = new Set(searchCatalog(products, query).map((p) => p.id))
      return lines.filter((l) => found.has(l.product.id) && inPath(l) && byDone(l))
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
    if (pickedLang !== undefined) return lines.filter((l) => l.lang === pickedLang && bySale(l) && inPath(l) && byDone(l))
    const inScope = (l: Line) =>
      scope === 'all' ? true
        : scope === 'foreignPlus' ? l.lang !== 'fr'
          : !!l.lang && l.lang !== 'fr'
    return lines.filter((l) => inScope(l) && bySale(l) && inPath(l) && byDone(l))
  }, [lines, products, scope, query, searching, pickedLang, saleText, path, doneFilter])

  // Ventilation calculée sur TOUT le catalogue, jamais sur la liste filtrée : sinon
  // choisir « DE » ferait disparaître les autres pastilles, et on ne pourrait plus revenir.
  const tallies = useMemo(() => langBreakdown(lines.map((l) => l.lang)), [lines])

  // Ce qui reste à faire : les fiches déjà réécrites n'y sont plus. Relancer ne repaie
  // donc jamais deux fois le même texte — c'est ce que le chemin par feuille ne savait
  // pas faire.
  // ⚠ Les fiches REFUSÉES sortent de la file. Sans ça, chaque relance reprenait les mêmes
  // deux cents en tête de liste, se faisait refuser pour la même raison, et n'avançait
  // jamais d'une ligne — en repayant le modèle à chaque tour. Elles restent affichées avec
  // leur motif ; c'est la file qui les saute, pas l'écran qui les cache.
  const todo = useMemo(
    () => shown.filter((l) => !l.revision && !rejected.has(l.product.id)),
    [shown, rejected],
  )
  const limit = rawLimit > 0 ? rawLimit : todo.length

  const run = async () => {
    const batchList = todo.slice(0, limit)
    if (batchList.length === 0) return
    setRunning(true)
    setDone(0)
    setLive({ kept: 0, refused: 0 })
    let kept = 0
    let refused = 0
    let silent = 0
    const reasons = new Map<string, RejectionPart[]>()
    // Le poids d'une fiche, tel qu'il part au modèle.
    const chunks = chunkByVolume(batchList, (l) => l.product.name.length + (l.product.description?.length ?? 0))
    let processed = 0
    try {
      for (const chunk of chunks) {
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
          maxTokens: MAX_OUTPUT_TOKENS,
          // ⚠ Un fournisseur qui tombe et cède la main au suivant doit se VOIR : sans ça,
          // un quota épuisé se manifeste par un écran qui n'avance pas, et on cherche la
          // panne dans le module.
          onProviderFailed: ({ provider, error }) => {
            toast.warning(t('pwte.providerFailed', { provider, message: error.message.slice(0, 120) }))
          },
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
            // Ce qui a été demandé, pour que l'écran puisse le montrer séparément.
            ops: { ...(modes.translate ? { translate: true } : {}), ...(modes.improve ? { improve: true } : {}) },
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
        processed += chunk.length
        setLive({ kept, refused })
        setDone(processed)
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
    <div className="flex-1 min-w-0 min-h-0 flex flex-col">
      <div className="px-4 py-3 border-b border-white/10 space-y-2.5">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
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
          scope={scope} onScope={setScope} searching={searching}
          saleText={saleText} onSaleText={setSaleText}
          doneFilter={doneFilter} onDoneFilter={setDoneFilter}
          modes={modes} onModes={setModes}
          limitText={limitText} onLimitText={setLimitText}
          running={running} done={done} count={Math.min(limit, todo.length)}
          canRun={!running && todo.length > 0 && (modes.translate || modes.improve)}
          onRun={() => void run()}
        />

        {/* Progression VISIBLE. Le compteur du bouton ne bouge qu'à la fin d'un lot de
            vingt : entre deux, plus rien ne bougeait à l'écran et l'attente ressemblait
            à une panne. La barre avance, et le détail dit ce qui tombe. */}
        {running && (
          <div className="space-y-1" role="status" aria-live="polite">
            <div className="h-1 w-full overflow-hidden rounded bg-white/[0.06]">
              <div className="h-full bg-indigo-400/80 transition-[width] duration-500"
                style={{ width: `${Math.round((done / Math.max(1, Math.min(limit, todo.length))) * 100)}%` }} />
            </div>
            <p className="flex items-center gap-2 text-[10px] text-white/40">
              <Loader2 className="w-3 h-3 animate-spin text-indigo-300" />
              {t('pwte.progress', {
                done: n(done), total: n(Math.min(limit, todo.length)),
                kept: n(live.kept), refused: n(live.refused),
              })}
            </p>
          </div>
        )}
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
            <TextEnrichRow key={l.product.id} product={l.product} lang={l.lang}
              revision={l.revision} rejection={rejected.get(l.product.id)}
              imagePrefix={imagePrefix} onRevert={() => void revert(l.product.id)} />
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
