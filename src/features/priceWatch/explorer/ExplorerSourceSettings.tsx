// Réglages de la jointure F1, repliés derrière un bouton. Ils occupaient une ligne
// pleine largeur au-dessus de la liste : de l'information de mise en route, relue une
// fois puis subie à chaque consultation. Elle est ici à la demande, et le bouton porte
// une pastille quand quelque chose mérite vraiment l'œil (catalogue vide ou tronqué).
import { useEffect, useRef, useState } from 'react'
import { SlidersHorizontal, AlertTriangle } from 'lucide-react'
import { ExplorerSourceLink, type SourceCatalogFacts } from './ExplorerSourceLink'
import type { SourceExtrasIndex } from './sourceExtras'
import type { SourceDbOption } from './useSourceSheet'
import { useTranslation } from '@/lib/i18n'

export function ExplorerSourceSettings(props: {
  facts: SourceCatalogFacts
  databases: SourceDbOption[]
  dbId: string
  onPickDb: (id: string) => void
  loading: boolean
  sheets: { name: string; rows: number }[]
  sheetIndex: number
  onPickSheet: (i: number) => void
  extras: SourceExtrasIndex
  imagePrefix: string
  onImagePrefix: (v: string) => void
  productUrl: string
  onProductUrl: (v: string) => void
  /** Aucun catalogue source persisté : « Comparer catalogue » n'a jamais abouti. */
  absent: boolean
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const alert = props.absent || props.facts.partial || props.facts.products === 0

  // Fermeture au clic extérieur et à Échap : un panneau flottant qui reste ouvert
  // recouvre la première ligne de la liste, juste en dessous.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="relative" ref={box}>
      <button type="button" onClick={() => setOpen((o) => !o)} title={t('pwx.srcSettings.title')}
        className={`bg-well text-xs rounded px-2.5 py-2 border flex items-center gap-1.5 transition-colors shrink-0 ${
          open ? 'text-white border-white/25' : 'text-white/55 border-white/10 hover:text-white hover:border-white/25'
        }`}>
        <SlidersHorizontal className="w-3.5 h-3.5" />
        {alert && <AlertTriangle className="w-3 h-3 text-amber-400" />}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-40 w-[620px] max-w-[85vw] rounded-md border border-white/10 bg-surface-2 shadow-2xl p-3 space-y-2">
          <div className="text-[10px] uppercase tracking-wider text-white/35">{t('pwx.srcSettings.title')}</div>
          <ExplorerSourceLink {...props} />
          {props.absent && (
            <p className="text-[11px] text-amber-400/80 flex items-center gap-1.5">
              <AlertTriangle className="w-3 h-3 shrink-0" />
              {t('pwx.catalogueSourceAbsentLancez')}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
