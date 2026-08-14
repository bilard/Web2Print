// Le tableau de bord de la collecte : un cadran par concurrent, lu d'un coup d'œil.
//
// ⚠ Ce que l'écran ne disait PAS : « est-ce que ça avance maintenant ? ». Il n'affichait
// que des cumuls — 1 800 fiches, 89 p/min depuis le début — identiques qu'un site collecte
// à plein régime ou soit arrêté depuis vingt minutes. Ici, chaque cadran montre le RÉGIME
// (fiches/min sur les dernières 90 s), l'avancement du balayage, et un témoin de vie.
import { Gauge } from 'lucide-react'
import { useLiveRates } from './useLiveRates'
import { duration } from '../dashboard/format'
import { intlLocale, useTranslation } from '@/lib/i18n'
import type { HarvestMeta } from '../dashboard/opsMetrics'
import type { LiveRate } from './liveRates'

/** Témoin de vie : la couleur dit l'état, le texte dit depuis quand. */
/**
 * Trois états, portés par un LISERÉ latéral — pas par le fond.
 *
 * ⚠ Un voile de couleur sur le fond sombre de l'application vire au kaki : l'émeraude
 * teintait la carte entière en vert olive, et l'ambre en brun. Sur un tableau de bord où
 * quatre cartes se touchent, ces aplats sales sautaient aux yeux avant l'information.
 * Le fond reste donc neutre et thémable ; la couleur se concentre sur un trait de deux
 * pixels, le témoin et le compteur — assez pour lire l'état à un mètre, sans salir.
 */
const PULSE: Record<LiveRate['pulse'], { dot: string; text: string; edge: string }> = {
  live: { dot: 'bg-emerald-400 animate-pulse', text: 'text-emerald-300', edge: 'border-l-emerald-400' },
  slow: { dot: 'bg-amber-400', text: 'text-amber-300', edge: 'border-l-amber-400/70' },
  idle: { dot: 'bg-white/25', text: 'text-white/35', edge: 'border-l-white/10' },
}

/** « 12 s », « 4 min », « 2 h » — l'âge, pas une durée de travail. */
function ago(ms: number | null): string {
  if (ms == null) return '—'
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s} s`
  const m = Math.round(s / 60)
  return m < 60 ? `${m} min` : `${Math.round(m / 60)} h`
}

/** Aiguille du compte-tours. Échelle bornée : au-delà, l'aiguille reste au fond — ce qui
 *  compte à ce régime n'est plus la valeur exacte mais le fait qu'il est élevé. */
const FULL_SCALE = 150

function Dial({ value, tone }: { value: number; tone: string }) {
  const pct = Math.min(100, Math.round((value / FULL_SCALE) * 100))
  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-white/[0.08]">
      <div className={`h-full transition-[width] duration-700 ${tone}`} style={{ width: `${pct}%` }} />
    </div>
  )
}

/** Au-delà, un site n'appartient plus au suivi courant : c'est un reste d'ancien essai.
 *  ⚠ Vingt cadrans s'affichaient — castorama, amazon, cdiscount… — noyant les quatre
 *  concurrents du flux. Un tableau de bord qui montre tout ne montre rien. */
const STALE_SITE_MS = 24 * 60 * 60 * 1000

export function LiveGauges({ meta, matchedBySite, cyclesBySite }: {
  meta: Map<string, HarvestMeta>
  /** Appariés par siteId, issus du dernier « Comparer » (`report.byCompetitor`).
   *  ⚠ C'est un INSTANTANÉ, pas un flux : il ne bouge qu'en fin de run, quand la
   *  comparaison tourne. L'afficher à côté du régime évite d'attendre en vain qu'il
   *  monte pendant la collecte. */
  matchedBySite: Map<string, number>
  /**
   * Cycles de balayage bouclés par site, et durée moyenne de l'un d'eux.
   *
   * ⚠ Vient du COCKPIT (`opsMetrics`), jamais de `meta.harvestSweeps` : ce compteur brut
   * n'est incrémenté qu'à la réouverture du balayage suivant, donc un site qui vient de
   * finir — et attend la relance calendaire — s'afficherait à ×0 pendant des jours.
   */
  cyclesBySite: Map<string, { done: number; cycleMs: number | null }>
}) {
  const { t, locale } = useTranslation()
  const rates = useLiveRates(meta)
  const n = (v: number) => v.toLocaleString(intlLocale(locale))
  // « ×3 » seul ne se comprend pas ; l'infobulle dit ce qui est compté, en combien de temps,
  // et si ce site attend la relance du cycle suivant.
  const cycleTitle = (siteId: string, waiting: boolean) => {
    const c = cyclesBySite.get(siteId)
    const parts = [t('ops.gauges.cyclesTitle', { n: c?.done ?? 0 })]
    if (c?.cycleMs) parts.push(t('ops.gauges.cycleDuration', { d: duration(c.cycleMs) }))
    if (waiting) parts.push(t('ops.gauges.cycleWaiting'))
    return parts.join(' · ')
  }

  // Les sites COCHÉS d'abord, en ordre alphabétique ; les autres ensuite, même ordre.
  // Le classement par régime avait l'air malin et ne l'était pas : les cadrans changeaient
  // de place à chaque battement, et on cherchait un site en le suivant des yeux au lieu de
  // le lire. Une position stable vaut mieux qu'un palmarès.
  const now = Date.now()
  const rows = [...meta.entries()]
    .filter(([siteId, m]) => (m.productCount ?? 0) + (m.pageCount ?? 0) > 0
      // Du suivi COURANT : soit il a travaillé dans les dernières vingt-quatre heures,
      // soit le dernier « Comparer » l'a retenu. Les deux manquent = il n'est plus au flux.
      // Un site COCHÉ a toujours sa place : il fait partie du flux, même au repos. Un site
      // décoché n'apparaît que s'il a travaillé récemment ou compte dans le dernier
      // comparatif — sinon c'est un reste d'essai, pas un concurrent suivi.
      && (m.enabled !== false
        || now - Math.max(m.harvestBeatAt ?? 0, m.lastPassAt ?? 0) < STALE_SITE_MS
        || matchedBySite.has(siteId)))
    .sort(([, ma], [, mb]) => {
      const active = (m: HarvestMeta) => (m.enabled !== false ? 0 : 1)
      return active(ma) - active(mb)
        || (ma.domain ?? '').localeCompare(mb.domain ?? '', undefined, { sensitivity: 'base' })
    })
  if (rows.length === 0) return null

  return (
    <div className="bg-surface rounded-lg p-4" data-pw-section="live-gauges">
      <div className="flex items-baseline gap-2 mb-3">
        <Gauge className="w-4 h-4 text-indigo-400 shrink-0 self-center" />
        <h3 className="text-sm font-semibold text-white">{t('ops.gauges.title')}</h3>
        <span className="text-[11px] text-white/40">{t('ops.gauges.window')}</span>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {rows.map(([siteId, m], k) => {
          const r = rates.get(siteId)!
          const tone = PULSE[r.pulse]
          const progress = Math.round((m.harvestProgress ?? 0) * 100)
          const matched = matchedBySite.get(siteId)
          const cycles = cyclesBySite.get(siteId)?.done ?? 0
          // Balayage bouclé, en attente que les retardataires finissent : le marqueur du mode
          // cycle est postérieur à la dernière passe réelle (même règle que `siteStatus`).
          const cycleWaiting = (m.cycleWaitingAt ?? 0) > (m.lastPassAt ?? 0)
          // Le fond porte l'état : vert en collecte, ambre au ralenti, neutre à l'arrêt.
          // Les sites au repos restent lisibles sans attirer l'œil.
          const active = m.enabled !== false
          // ⚠ Frontière EXPLICITE, sur toute la largeur de la grille. Les deux groupes
          // étaient déjà triés mais se suivaient sans rupture : rien ne disait où
          // s'arrêtaient les concurrents du flux et où commençaient les sites au repos.
          const opensGroup = k === 0 || (rows[k - 1][1].enabled !== false) !== active
          return (
            <div key={siteId} className="contents">
              {opensGroup && (
                <div className={`col-span-full flex items-center gap-2 ${k === 0 ? '' : 'mt-3'}`}>
                  <span className={`text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap ${
                    active ? 'text-emerald-300/80' : 'text-white/30'
                  }`}>
                    {active ? t('ops.gauges.groupActive') : t('ops.gauges.groupInactive')}
                    <span className="ml-1.5 tabular-nums opacity-70">
                      {rows.filter(([, x]) => (x.enabled !== false) === active).length}
                    </span>
                  </span>
                  <span className={`h-px flex-1 ${active ? 'bg-emerald-400/20' : 'bg-white/10'}`} />
                </div>
              )}
            {/* Fond selon l'APPARTENANCE (au flux ou au repos), liseré selon l'ACTIVITÉ :
                deux informations distinctes, deux canaux visuels distincts. */}
            {/*
              Deux rendus, parce qu'il y a deux choses à montrer.

              ⚠ Un site AU REPOS n'a pas de régime : afficher « 0 · MESURE EN COURS… » et
              une aiguille vide sur douze cartes remplit l'écran de zéros qui se lisent
              comme autant de pannes, et noie les quatre concurrents qui travaillent. Il se
              réduit donc à une ligne dense : ce qu'il a en réserve, où il en est, ce qu'il
              rapporte. Trois fois moins haut, et rien d'inventé.

              ⚠ À l'inverse, la carte qui TRAVAILLE doit se voir au premier regard, pas se
              deviner : un liseré de deux pixels et un halo diffus se perdaient dans une
              grille de seize cartes. Bord épais, anneau franc, fond teinté et ombre portée
              qui la décolle — quitte à être appuyé, puisque c'est la seule qu'on cherche.
            */}
            {r.pulse === 'idle' ? (
              <div className={`flex items-center gap-2 rounded-lg border-l-2 px-3 py-2 text-[11px] ${tone.edge} ${
                active ? 'bg-surface-2/60' : 'bg-well/60'
              }`}>
                <span className="w-1.5 h-1.5 rounded-full bg-white/20 shrink-0" />
                <span className="text-white/55 truncate">{m.domain ?? siteId}</span>
                <span className="ml-auto tabular-nums text-amber-300/60 shrink-0">{n(m.productCount ?? 0)}</span>
                <span className="tabular-nums text-white/30 shrink-0 w-10 text-right">{progress} %</span>
                {/* CYCLES bouclés par ce site — le compte que l'écran ne donnait nulle part.
                    Un ✓ quand le balayage courant est fini et attend la relance. */}
                <span className={`tabular-nums shrink-0 w-9 text-right ${cycles > 0 ? 'text-indigo-300/80' : 'text-white/25'}`}
                  title={cycleTitle(siteId, cycleWaiting)}>
                  ×{cycles}{cycleWaiting ? ' ✓' : ''}
                </span>
                <span className={`tabular-nums shrink-0 w-12 text-right ${matched ? 'text-emerald-300/70' : 'text-white/25'}`}
                  title={t('ops.gauges.matched')}>
                  {matched == null ? '—' : n(matched)}
                </span>
              </div>
            ) : (
            <div className={`rounded-lg px-3 py-2.5 transition-all ${
              r.pulse === 'live'
                ? 'border-l-4 border-l-emerald-400 ring-2 ring-emerald-400/40 bg-emerald-950/25 shadow-lg shadow-emerald-500/10'
                : `border-l-2 ${tone.edge} ${active ? 'bg-surface-2' : 'bg-well opacity-70'}`
            }`}>
              <div className="flex items-center gap-2 mb-2">
                <span className={`w-2 h-2 rounded-full shrink-0 ${tone.dot}`} />
                <span className={`truncate ${r.pulse === 'live' ? 'text-[13px] text-white font-semibold' : 'text-[12px] text-white/80'}`}>
                  {m.domain ?? siteId}
                </span>
                {r.pulse === 'live' && (
                  // Badge PLEIN, pas un contour : sur fond sombre, un contour fin se lit de
                  // moins loin qu'un aplat.
                  <span className="shrink-0 text-[9px] font-bold uppercase tracking-wide text-[#062b1c] bg-emerald-400 rounded-full px-1.5 py-px">
                    {t('ops.gauges.running')}
                  </span>
                )}
                <span className={`ml-auto text-[10px] tabular-nums shrink-0 ${tone.text}`}
                  title={t('ops.gauges.sinceTitle')}>
                  {ago(r.sinceChangeMs)}
                </span>
              </div>

              {/* LE compte-tours : le seul chiffre qui répond à « ça avance ? ». En jaune,
                  comme tous les volumes de cet écran. */}
              <div className="flex items-baseline gap-1.5">
                <span className={`font-bold tabular-nums ${
                  r.productsPerMin > 0 ? 'text-2xl text-amber-300' : 'text-lg text-white/30'
                }`}>
                  {n(r.productsPerMin)}
                </span>
                {/* ⚠ « 0 fiches/min » sur une carte qui travaille se lit comme une panne.
                    Au démarrage d'une passe, il n'y a simplement pas encore deux mesures
                    pour faire une pente : on le DIT, au lieu d'afficher un zéro muet. */}
                <span className="text-[10px] uppercase tracking-wide text-white/35">
                  {r.pulse === 'live' && r.productsPerMin === 0 ? t('ops.gauges.warmup') : t('ops.gauges.perMin')}
                </span>
                <span className="ml-auto text-[10px] tabular-nums text-white/40">
                  {t('ops.gauges.pages', { count: n(r.pagesPerMin) })}
                </span>
              </div>
              <div className="mt-1.5"><Dial value={r.productsPerMin} tone={r.productsPerMin > 0 ? 'bg-amber-400/80' : 'bg-white/10'} /></div>

              {/* Jauge de niveau : où en est le balayage, et ce qui est déjà en réservoir. */}
              <div className="mt-2.5 flex items-center gap-2">
                <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/[0.08]">
                  <div className="h-full bg-indigo-400/70 transition-[width] duration-700" style={{ width: `${progress}%` }} />
                </div>
                <span className="text-[10px] tabular-nums text-white/45 shrink-0">{progress} %</span>
                {/* Cycles bouclés par CE site : « 63 % » ne dit pas si c'est le premier
                    balayage ou le vingt-troisième. */}
                <span className={`text-[10px] tabular-nums shrink-0 ${cycles > 0 ? 'text-indigo-300/80' : 'text-white/25'}`}
                  title={cycleTitle(siteId, cycleWaiting)}>
                  ×{cycles}{cycleWaiting ? ' ✓' : ''}
                </span>
                <span className="text-[10px] tabular-nums text-amber-300/80 shrink-0"
                  title={t('ops.gauges.indexedTitle')}>
                  {n(m.productCount ?? 0)}
                </span>
              </div>

              {/* APPARIÉS — le chiffre qui décide de la valeur du site. En vert, comme
                  partout où il apparaît. « — » quand la comparaison n'a pas encore tourné :
                  un zéro laisserait croire à un échec d'appariement. */}
              <div className="mt-2 flex items-baseline gap-1.5 border-t border-white/5 pt-2">
                <span className="text-[10px] uppercase tracking-wide text-white/35">{t('ops.gauges.matched')}</span>
                <span className={`text-sm font-semibold tabular-nums ${matched ? 'text-emerald-300' : 'text-white/30'}`}>
                  {matched == null ? '—' : n(matched)}
                </span>
              </div>
            </div>
            )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
