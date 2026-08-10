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
import { revisionKeyOf } from './revisionLookup'
import { originTextOf } from './originText'
import { opsOf } from './revisionOps'
import { completeOriginText, isTruncated, madeOnTruncatedSource, originForDisplay } from './fullSaleText'
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
  /** Sous quel identifiant la réécriture est rangée. ⚠ Pas toujours celui du produit :
   *  la carte de workflow clefe sur la RÉFÉRENCE. Sans lui, « Annuler » supprimerait un
   *  document qui n'existe pas et la ligne resterait affichée comme traitée. */
  revisionId?: string
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
  const lines = useMemo<Line[]>(() => products.map((p) => {
    // ⚠ Trois clés essayées, pas une : ce qu'on réécrit ICI est rangé sous l'identifiant
    // du catalogue, ce que la CARTE de workflow réécrit est rangé sous la référence
    // article. Dans le cas normal les deux coïncident ; le repli couvre les catalogues
    // dont l'identité retombe sur le code-barres.
    const key = revisionKeyOf(revisions, p)
    const revision = key ? revisions.get(key) : undefined
    return {
      product: p,
      // ⚠ Sur le texte D'ORIGINE, jamais sur le texte courant : une fois traduite, la fiche
      // porte du français et le détecteur répondrait « fr ». Elle sortirait alors de sa
      // propre pastille et de la portée « langue étrangère » — c'est ce qui faisait
      // afficher « Rien à traiter » sous le filtre « Traduits ».
      lang: detectLanguage(originTextOf(p, revision)).lang,
      ...(key ? { revisionId: key, revision } : {}),
    }
  }), [products, revisions])

  const searching = query.trim() !== ''
  /** On RELIT du travail fait, on ne compose pas une file. */
  const reviewing = doneFilter === 'translated' || doneFilter === 'improved'
  const shown = useMemo(() => {
    // La famille choisie borne TOUT ce qui suit : traduire « les courroies » veut dire
    // les courroies, quel que soit le filtre de langue ou la recherche par-dessus.
    const inPath = (l: Line) => path.length === 0 || isUnderPath(l.product.taxo ?? [], path)
    // ⚠ Les fiches d'avant le champ `ops` se classent par leur LANGUE D'ORIGINE : sans
    // cela, elles tombaient hors de « Traduits » ET d'« Améliorés », et l'écran répondait
    // « Rien à traiter » sur des fiches traduites, visibles juste en dessous.
    const byDone = (l: Line) => {
      if (doneFilter === 'all') return true
      if (doneFilter === 'todo') return !l.revision
      if (!l.revision) return false
      const ops = opsOf(l.revision, l.lang)
      return doneFilter === 'translated' ? ops.translate : ops.improve
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
    // ⚠ La portée compose la FILE — ce qui reste à faire. Demander « les traduits », c'est
    // demander une RELECTURE : la borner à « langue étrangère reconnue » n'a aucun sens et
    // rendait l'écran vide sur un catalogue pourtant traduit à 30 %.
    const inScope = (l: Line) =>
      scope === 'all' || reviewing ? true
        : scope === 'foreignPlus' ? l.lang !== 'fr'
          : !!l.lang && l.lang !== 'fr'
    return lines.filter((l) => inScope(l) && bySale(l) && inPath(l) && byDone(l))
  }, [lines, products, scope, query, searching, pickedLang, saleText, path, doneFilter, reviewing])

  // Fiches dont le texte de vente a été COUPÉ à l'écriture du catalogue ET dont aucun
  // exemplaire entier ne subsiste ailleurs. Compté sur ce qui est affiché : c'est là qu'on
  // le constate, et c'est ce nombre qui dit si l'action corrective vaut la peine.
  //
  // ⚠ Les fiches RÉPARABLES (la carte de workflow a gardé la cellule entière de la feuille)
  // en sortent : le bandeau demandait de relancer « Comparer catalogue » pour des textes que
  // l'écran affiche et retraduit déjà entiers.
  const truncated = useMemo(
    () => shown.filter((l) => originForDisplay(l.product, l.revision).truncated).length,
    [shown],
  )

  // Ventilation calculée sur TOUT le catalogue, jamais sur la liste filtrée : sinon
  // choisir « DE » ferait disparaître les autres pastilles, et on ne pourrait plus revenir.
  const tallies = useMemo(() => langBreakdown(lines.map((l) => l.lang)), [lines])

  // Ce qui reste à faire POUR CE QUI EST DEMANDÉ. Relancer ne repaie jamais deux fois le
  // même travail — c'est ce que le chemin par feuille ne savait pas faire.
  //
  // ⚠⚠ « Déjà réécrite » ne veut pas dire « plus rien à faire ». La file écartait toute
  // fiche portant une révision, quelle que soit l'opération cochée : une fiche traduite
  // hier ne pouvait donc PLUS être améliorée, et « traduire puis améliorer » en deux temps
  // était impossible ici — alors que c'est le geste normal, et que la carte de workflow,
  // elle, le fait en deux vagues. On regarde donc ce qui est demandé et ce qui manque.
  //
  // ⚠ Les fiches REFUSÉES sortent de la file. Sans ça, chaque relance reprenait les mêmes
  // deux cents en tête de liste, se faisait refuser pour la même raison, et n'avançait
  // jamais d'une ligne — en repayant le modèle à chaque tour. Elles restent affichées avec
  // leur motif ; c'est la file qui les saute, pas l'écran qui les cache.
  //
  // ⚠⚠ Une réécriture faite sur un texte COUPÉ repasse, quoi qu'elle porte comme opérations.
  // Le catalogue a longtemps enregistré les descriptions sous un plafond de 300 caractères :
  // les fiches traitées à cette époque portent une traduction amputée, et « déjà traduite »
  // les écartait pour toujours. Elles ne repassent QUE si le texte entier existe quelque
  // part (cf. `madeOnTruncatedSource`) — sinon chaque relance repaierait la même coupe.
  const todo = useMemo(
    () => shown.filter((l) => {
      if (rejected.has(l.product.id)) return false
      if (!l.revision) return true
      if (madeOnTruncatedSource(l.product, l.revision)) return true
      const done = opsOf(l.revision, l.lang)
      return (modes.translate && !done.translate) || (modes.improve && !done.improve)
    }),
    [shown, rejected, modes],
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
    // ⚠ Le texte SOUMIS est le dernier en date, pas celui du catalogue : améliorer une
    // fiche déjà traduite doit partir de la traduction, sinon on réécrit l'allemand — et
    // on écrase la traduction par une reformulation de l'original.
    //
    // ⚠⚠ …SAUF s'il est COUPÉ. Repartir d'un moignon reproduit la coupe à l'identique, run
    // après run : c'est ce qui gravait « …, Revolution 2300 (single line), R… » dans le
    // catalogue. On reprend alors le texte d'origine ENTIER — la cellule de la feuille, que
    // la carte de workflow a conservée — quitte à retraduire depuis l'allemand.
    const current = (l: Line) => {
      const latest = l.revision?.description ?? l.product.description
      const whole = isTruncated(latest) ? completeOriginText(l.product, l.revision) : undefined
      return {
        name: l.revision?.name ?? l.product.name,
        description: whole ?? latest,
      }
    }
    const chunks = chunkByVolume(batchList, (l) => {
      const c = current(l)
      return c.name.length + (c.description?.length ?? 0)
    })
    let processed = 0
    try {
      for (const chunk of chunks) {
        const raw = await generateJson({
          task: 'data.textEnrich',
          prompt: buildScreenPrompt(chunk.map((l) => {
            const c = current(l)
            return {
              id: l.product.id, name: c.name,
              ...(c.description ? { description: c.description } : {}),
              lang: l.lang,
            }
          }), prompt, modes),
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
          const cur = current(line)
          const before = `${cur.name} ${cur.description ?? ''}`
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
            // ⚠ L'original est le PREMIER connu, jamais la passe précédente : une
            // amélioration posée sur une traduction ne doit pas faire passer la traduction
            // pour le texte d'origine — c'est vers l'allemand que le retour arrière ramène.
            nameSource: line.revision?.nameSource ?? line.product.name,
            // ⚠ Un original COUPÉ cède la place au texte entier retrouvé : c'est vers lui
            // que « Annuler » doit ramener, pas vers le moignon de 300 caractères qu'on
            // vient précisément de remplacer.
            ...((d) => (d ? { descriptionSource: d } : {}))(
              completeOriginText(line.product, line.revision)
              ?? line.revision?.descriptionSource ?? line.product.description,
            ),
            ...(r.note ? { note: r.note } : {}),
            // Ce qui a été fait sur cette fiche, CUMULÉ : une amélioration ne doit pas
            // effacer la trace de la traduction qui l'a précédée.
            ops: ((was) => ({
              ...(was.translate || modes.translate ? { translate: true } : {}),
              ...(was.improve || modes.improve ? { improve: true } : {}),
            }))(opsOf(line.revision, line.lang)),
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

        {/* ⚠ UN bandeau, pas un avertissement par fiche : répété sur trois cents lignes,
            il devenait du bruit qu'on cesse de lire — alors qu'il désigne la seule action
            qui règle le problème. */}
        {truncated > 0 && (
          <p className="rounded border border-amber-500/25 bg-amber-500/[0.07] px-2.5 py-1.5 text-[11px] leading-snug text-amber-200/90">
            {t('pwte.truncatedSource.banner', { count: n(truncated) })}
          </p>
        )}

        <TextEnrichFilters
          tallies={tallies} pickedLang={pickedLang} onPickLang={setPickedLang}
          scope={scope} onScope={setScope} searching={searching} reviewing={reviewing}
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
              imagePrefix={imagePrefix} onRevert={() => void revert(l.revisionId ?? l.product.id)} />
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
