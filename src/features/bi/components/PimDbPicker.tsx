// Choisir LA BASE du module « Données » qui alimente le tableau de bord.
//
// ⚠⚠ Vu chez l'utilisateur : dix bases (Catalogue_GSB_2026, Démo castorama, Makita…) et une
// seule entrée « Produits (PIM) » qui désignait, sans le dire, la feuille ouverte AILLEURS.
// Le tableau de bord désigne désormais la sienne, la retient (`sourceDbId`) et la charge.
//
// ⚠ Rien ne se charge tant qu'aucune tuile ne réclame la source PIM — ou tant que
// l'utilisateur n'a pas choisi une base, ce qui EST une demande explicite : sans cela, la
// première tuile serait impossible à construire (aucune colonne à proposer).
import { useState } from 'react'
import { useTranslation } from '@/lib/i18n'
import { BiPicker } from './BiPicker'
import { Loading, Warning } from './SourceStatus'
import { usePimDbList, usePimDbLoader, usePimDbState } from '../hooks/usePimDatabases'

/** Valeur du sélecteur quand aucune base n'est retenue : la feuille ouverte, comme avant. */
const ACTIVE_SHEET = ''

export function PimDbPicker({ dbId, sheetName, wantedByTiles, onChange }: {
  /** Base retenue par le tableau de bord (`sourceDbId`), `undefined` si aucune. */
  dbId: string | undefined
  /** Feuille de construction (`sourceSheetName`) : celle sur laquelle retomber au chargement. */
  sheetName: string | undefined
  /** Une tuile posée réclame-t-elle déjà la source PIM ? */
  wantedByTiles: boolean
  /** `undefined` efface le choix et rend la main à la feuille ouverte. */
  onChange: (dbId?: string, dbName?: string) => void
}) {
  const { t } = useTranslation()
  const { items, loading } = usePimDbList()
  // ⚠ Le choix explicite VAUT demande : il autorise le chargement d'une base qu'aucune tuile
  // ne réclame encore. L'état est local au tableau affiché (`BiBoard` remonte à chaque
  // changement de tableau), donc il ne survit pas à un changement de tableau de bord.
  const [picked, setPicked] = useState(false)
  usePimDbLoader({ dbId, sheetName, list: items, listLoading: loading, wanted: wantedByTiles || picked })

  const options = [
    { id: ACTIVE_SHEET, label: t('bi.db.activeSheet') },
    ...items.map((f) => ({ id: f.docId, label: t('bi.db.option', { name: f.name, rows: f.rows }) })),
  ]

  return (
    <BiPicker
      label={t('bi.db.picker')} value={dbId ?? ACTIVE_SHEET} options={options}
      onChange={(id) => {
        setPicked(true)
        const db = items.find((f) => f.docId === id)
        onChange(db?.docId, db?.name)
      }}
    />
  )
}

/**
 * Ce que le chargement de la base est en train de faire — des PHRASES, rendues là où il y a
 * la place (la barre transversale), jamais dans le bandeau qui est une ligne.
 *
 * ⚠⚠ Une base de plusieurs dizaines de milliers de lignes se lit en plusieurs secondes : le
 * dire, avec son nom et sa volumétrie, est la différence entre « ça charge » et « c'est figé ».
 */
export function PimDbStatus({ storedName }: { storedName: string | undefined }) {
  const { t } = useTranslation()
  const data = usePimDbState()

  if (data.state === 'loading') {
    return <Loading text={data.name
      ? t('bi.db.loading', { name: data.name, rows: data.rows })
      : t('bi.db.listing')} />
  }
  if (data.message) {
    // La base nommée par le TABLEAU : la liste, elle, ne la contient peut-être plus.
    const text = data.message.kind === 'key' ? t(data.message.key, data.message.params) : data.message.text
    return <Warning text={storedName ? `${storedName} — ${text}` : text} />
  }
  return null
}
