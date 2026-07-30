import { X, ArrowDownToLine, ArrowUpFromLine, Loader2 } from 'lucide-react'
import { useBrandKit } from '@/features/brandkit/useBrandKit'
import { usePaletteStore } from '@/stores/palette.store'
import { PropertySection } from '@/components/shared/panel'
import { toast } from 'sonner'
import { useTranslation } from '@/lib/i18n'

interface BrandKitSectionProps {
  /** Persiste la palette projet après import (savePaletteToFirestore du panneau). */
  onProjectPaletteChange: () => void
}

/**
 * Kit de marque global (par utilisateur, inter-projets) dans le panneau Palette :
 * pastilles de couleurs partagées + import bidirectionnel projet ↔ kit.
 */
export function BrandKitSection({ onProjectPaletteChange }: BrandKitSectionProps) {
  const { t } = useTranslation()
  const { colors, addColors, removeColor } = useBrandKit()
  const projectColors = usePaletteStore((s) => s.colors)
  const addColor = usePaletteStore((s) => s.addColor)

  const importIntoProject = () => {
    if (!colors?.length) return
    const known = new Set(projectColors.map((c) => c.color.toLowerCase()))
    const fresh = colors.filter((c) => !known.has(c.color.toLowerCase()))
    fresh.forEach((c) => addColor(c.color, c.name))
    if (fresh.length > 0) onProjectPaletteChange()
    toast.success(fresh.length > 0 ? t('tst.bk.colorsAdded', { count: fresh.length }) : t('brandKit.allPresent'))
  }

  const captureFromProject = () => {
    if (projectColors.length === 0) {
      toast.warning(t('brandKit.noColour'))
      return
    }
    addColors(projectColors.map((c) => ({ color: c.color, name: c.name })))
    toast.success(t('brandKit.captured'))
  }

  return (
    <PropertySection
      title={t('brandKit.title')}
      tourId="palette-brandkit"
      help={t('brandKit.help')}
    >
      {colors === null ? (
        <div className="flex justify-center py-2">
          <Loader2 className="w-4 h-4 text-white/20 animate-spin" />
        </div>
      ) : colors.length === 0 ? (
        <p className="text-[10px] text-white/20 italic py-1">
          Kit vide — capturez la palette d'un projet pour le constituer.
        </p>
      ) : (
        <div className="flex flex-wrap gap-1.5 py-1">
          {colors.map((c) => (
            <span key={c.color} className="relative group" title={`${c.name} — ${c.color}`}>
              <span
                className="block w-6 h-6 rounded-full border border-white/15"
                style={{ backgroundColor: c.color }}
              />
              <button
                onClick={() => removeColor(c.color)}
                aria-label={`Retirer ${c.name} du kit`}
                className="absolute -top-1 -right-1 hidden group-hover:flex w-3.5 h-3.5 items-center justify-center rounded-full bg-surface border border-white/20 text-white/60 hover:text-red-400"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="flex gap-1.5 mt-2">
        <button
          onClick={importIntoProject}
          disabled={!colors?.length}
          className="flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded bg-white/5 hover:bg-white/10 disabled:opacity-40 text-[10px] text-white/60 transition-colors"
          title={t('brandKit.import')}
        >
          <ArrowDownToLine className="w-3 h-3" /> Vers le projet
        </button>
        <button
          onClick={captureFromProject}
          className="flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-[10px] text-white/60 transition-colors"
          title={t('brandKit.capture')}
        >
          <ArrowUpFromLine className="w-3 h-3" /> Depuis le projet
        </button>
      </div>
    </PropertySection>
  )
}
