// Sélecteur de la SOURCE qui alimente les tuiles, à côté du titre du tableau de bord.
//
// ⚠⚠ Ce bandeau parle de ce qui ALIMENTE les tuiles (`demanded`), pas de ce que la liste
// affiche : un tableau de veille rouvert lit son catalogue pendant plusieurs secondes alors
// que la liste, elle, repart sur la source sélectionnée. Sans cette distinction, l'écran
// resterait sur des squelettes sans un mot — l'écran figé sans explication qu'on refuse.
// ⚠ Aucun `<select>` natif (spec lot 2, D5) : le popover maison `BiPicker` (motif
// `AiProviderCard`, fermeture au clic extérieur) sert tous les sélecteurs du module.
// ⚠ La source « Produits (PIM) » se double d'un choix de BASE (`PimDbPicker`) : dix bases
// existent, et la seule entrée « Produits (PIM) » désignait implicitement la feuille ouverte
// dans un autre module.
import { Database } from 'lucide-react'
import { useTranslation } from '@/lib/i18n'
import { BiPicker } from './BiPicker'
import { PimDbPicker, PimDbStatus } from './PimDbPicker'
import { SourceStatus, Warning } from './SourceStatus'
import { getSource } from '../registry/sources'
import { WATCH_SOURCES } from '../registry/watch.source'
import { pimSource } from '../registry/pim.source'
import { useWatchSelection, type WatchContext } from '../hooks/useWatchData'
import type { SourceId } from '../types'

/** Sources proposées, de la moins coûteuse à la plus lourde — c'est l'ordre de lecture. */
const OFFERED: SourceId[] = [pimSource.id, ...WATCH_SOURCES.map((s) => s.id)]
const WATCH_IDS: SourceId[] = WATCH_SOURCES.map((s) => s.id)

/** La source PIM est-elle en jeu — choisie, ou déjà réclamée par une tuile posée ? */
const pimInvolved = (sourceId: SourceId, demanded: SourceId[]) =>
  sourceId === pimSource.id || demanded.includes(pimSource.id)

// ⚠ Non exportée : elle ne sert qu'ici (convention du projet, cf. `npm run dead`).
interface SourcePickerProps {
  /** Ce que `useWatchLoader` sait du suivi actif : ses concurrents, la liste des suivis. */
  context: WatchContext
  /** Sources RÉELLEMENT citées par les tuiles posées — ce que l'écran est en train de lire. */
  demanded: SourceId[]
  /** Source des NOUVELLES tuiles. Les tuiles déjà posées gardent la leur (elle est persistée). */
  sourceId: SourceId
  onSourceChange: (id: SourceId) => void
  /** Base du module « Données » retenue par le tableau de bord (`sourceDbId`). */
  dbId?: string
  /** Feuille de construction (`sourceSheetName`) : celle sur laquelle retomber au chargement. */
  sheetName?: string
  /** Persiste le choix de base. Absent = tableau non modifiable, le sélecteur disparaît. */
  onDbChange?: (dbId?: string, dbName?: string) => void
  /** ⚠ `false` quand l'état est rendu AILLEURS (`SourceStatusList`). Le bandeau supérieur est
   *  une LIGNE : la phrase du lot 3 y prend toute la largeur et renvoie les boutons au rang
   *  suivant — vu en recette. L'état va alors dans la barre transversale, qui a la place. */
  withStatus?: boolean
}

export function SourcePicker({
  context, demanded, sourceId, onSourceChange, dbId, sheetName, onDbChange, withStatus = true,
}: SourcePickerProps) {
  const { t } = useTranslation()
  const { setWatchId, setSiteId } = useWatchSelection()
  // Sources de veille concernées : celles qui alimentent des tuiles, plus celle qu'on vient
  // de choisir (elle n'alimente encore rien, mais son état se prépare sous les yeux).
  const shown = WATCH_IDS.filter((id) => demanded.includes(id) || id === sourceId)
  const needsSite = shown.includes('watch.site')

  const sourceOptions = OFFERED.map((id) => ({ id, label: t(getSource(id).labelKey) }))
  const watchOptions = context.watches.map((w) => ({ id: w.watchId, label: w.label || w.watchId }))
  const siteOptions = context.sites.map((s) => ({ id: s.siteId, label: s.domain }))

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-end gap-2">
        <Database className="w-3.5 h-3.5 text-white/30 mb-1.5 shrink-0" />
        <BiPicker
          label={t('bi.source.picker')} value={sourceId} options={sourceOptions}
          // ⚠ L'identifiant vient de `OFFERED`, donc du registre : jamais une chaîne libre.
          onChange={(id) => { const s = OFFERED.find((x) => x === id); if (s) onSourceChange(s) }}
        />
        {/* ⚠⚠ Monté seulement quand le PIM est en jeu : c'est lui qui porte le CHARGEMENT de
            la base, et un tableau de veille n'a aucune raison d'en lire une. */}
        {onDbChange && pimInvolved(sourceId, demanded) && (
          <PimDbPicker dbId={dbId} sheetName={sheetName} onChange={onDbChange} />
        )}
        {shown.length > 0 && (
          <BiPicker
            label={t('bi.source.watch')} value={context.watchId ?? ''} options={watchOptions}
            onChange={setWatchId}
          />
        )}
        {/* ⚠⚠ Un seul concurrent en mémoire à la fois : le sélecteur en DÉSIGNE un, il n'en
            précharge aucun autre (plusieurs Mo par site, cf. `useSiteExplorer`). */}
        {needsSite && (siteOptions.length > 0 ? (
          <BiPicker
            label={t('bi.source.pickSite')} value={context.siteId ?? ''} options={siteOptions}
            onChange={setSiteId}
          />
        ) : <span className="text-[11px] text-white/35 mb-1">{t('bi.source.noSite')}</span>)}
      </div>
      {withStatus && (
        <SourceStatusList context={context} demanded={demanded} sourceId={sourceId} dbName={undefined} />
      )}
    </div>
  )
}

/**
 * Ce que les sources CONCERNÉES sont en train de faire — l'avancement d'un chargement lourd,
 * ou ce qui empêche de mesurer.
 *
 * ⚠ Rendu à part du sélecteur : ce sont des PHRASES, et le bandeau supérieur est une ligne.
 */
export function SourceStatusList({ context, demanded, sourceId, dbName }: {
  context: WatchContext
  demanded: SourceId[]
  sourceId: SourceId
  /** Nom de la base RETENUE par le tableau (`sourceDbName`), pour nommer un avertissement. */
  dbName: string | undefined
}) {
  const { t } = useTranslation()
  const shown = WATCH_IDS.filter((id) => demanded.includes(id) || id === sourceId)
  const pim = pimInvolved(sourceId, demanded) ? <PimDbStatus storedName={dbName} /> : null
  if (shown.length === 0) return pim
  // ⚠ Aucun suivi : le dire, avec le geste à faire. Sans cela, l'écran n'offre qu'un
  // sélecteur de suivi vide, ce qui se lit comme une panne.
  if (!context.watchId) return <>{pim}<Warning text={t('bi.watch.noWatch')} /></>
  return (
    <>
      {pim}
      {shown.map((id) => <SourceStatus key={id} sourceId={id} sites={context.sites} />)}
      {/* ⚠ Dite UNE fois, et seulement quand PLUSIEURS sources alimentent le tableau : c'est
          là qu'« isolément » veut dire quelque chose. Répétée par source, elle occupait deux
          lignes du bandeau pour la même information. */}
      {shown.length > 1 && (
        <span className="text-[11px] text-white/30">{t('bi.source.serverNeeded')}</span>
      )}
    </>
  )
}
