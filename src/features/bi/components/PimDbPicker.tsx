// Ce que le chargement de la base produits est en train de faire.
//
// ⚠ Le CHOIX de la base a déménagé dans `BiDatasetPicker` : il ne faisait qu'une moitié de
// la décision (« quelle base »), l'autre moitié — « ce tableau lit le PIM » — vivant dans un
// second sélecteur, sans lien apparent. Ici ne reste que l'état.
import { useTranslation } from '@/lib/i18n'
import { Loading, Warning } from './SourceStatus'
import { usePimDbState } from '../hooks/usePimDatabases'

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
