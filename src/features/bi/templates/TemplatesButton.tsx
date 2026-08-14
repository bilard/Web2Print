// Le bouton « Modèles » : les trois modèles restent atteignables même quand des tableaux de
// bord existent déjà. Popover maison, fermé au clic extérieur — aucun menu natif dans le
// module (spec lot 2, D5).
//
// ⚠ AUTONOME et sans opinion sur son emplacement : il se pose à côté de la création vierge,
// sans toucher au bandeau.
import { useEffect, useRef, useState } from 'react'
import { LayoutTemplate } from 'lucide-react'
import { useTranslation } from '@/lib/i18n'
import { TemplateGallery } from './TemplateGallery'

export function TemplatesButton({ onOpen }: { onOpen: (id: string) => void }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button
        type="button" onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 text-xs bg-well border border-white/10 hover:border-white/20 text-white rounded-lg px-3 py-1.5 transition-colors"
      >
        <LayoutTemplate className="w-3.5 h-3.5" />{t('bi.tpl.browse')}
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-[min(46rem,calc(100vw-3rem))] bg-surface border border-white/10 rounded-xl shadow-xl p-3">
          {/* ⚠ Le popover se referme sur l'ouverture : garder la galerie ouverte au-dessus du
              tableau qu'on vient d'afficher masquerait le résultat du clic. */}
          <TemplateGallery compact onOpen={(id) => { setOpen(false); onOpen(id) }} />
        </div>
      )}
    </div>
  )
}
