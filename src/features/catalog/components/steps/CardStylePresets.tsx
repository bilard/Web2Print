// src/features/catalog/components/steps/CardStylePresets.tsx
// Galerie de PRESETS graphiques des fiches : prédéfinis (patchs de formes,
// aperçu-mock des badges) + « Mes presets » (style COMPLET enregistré dans
// users/{uid}/catalogCardPresets — réutilisable sur tous les catalogues).
import { useEffect, useState } from 'react'
import { Save, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { CARD_PRESETS, type CardPreset } from '../../cardPresets'
import { deleteCardPreset, listCardPresets, saveCardPreset, type UserCardPreset } from '../../cardPresetsApi'
import type { CatalogCardStyle } from '../../catalogTypes'

interface Props {
  style: CatalogCardStyle
  /** Preset prédéfini = PATCH (formes seulement — couleurs/dispositions préservées). */
  patch: (p: Partial<CatalogCardStyle>) => void
  /** Preset utilisateur = style COMPLET appliqué tel quel. */
  applyFull: (cs: CatalogCardStyle) => void
}

/** Mini-aperçu d'un preset : mock du badge prix + du sticker (formes réelles). */
function PresetMock({ p }: { p: CardPreset }) {
  const radius = { tag: 3, rounded: 6, pill: 999, square: 0 }[p.patch.priceShape ?? 'tag']
  const stR = { round: 999, rounded: 5, square: 2 }[p.patch.stickerShape ?? 'round']
  return (
    <span className="flex items-center gap-1.5">
      <span style={{ width: 16, height: 16, borderRadius: stR, background: '#ef4444', transform: `rotate(${p.patch.stickerRotate ?? 8}deg)`, display: 'inline-block', flexShrink: 0 }} />
      <span style={{ width: 30, height: 15, borderRadius: radius, background: '#6366f1', transform: `rotate(${p.patch.priceRotate ?? -2}deg) scale(${p.patch.priceScale ?? 1})`, display: 'inline-block', flexShrink: 0 }} />
    </span>
  )
}

export function CardStylePresets({ style, patch, applyFull }: Props) {
  const [mine, setMine] = useState<UserCardPreset[]>([])
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { void listCardPresets().then(setMine).catch(() => undefined) }, [])

  const save = async () => {
    const n = name.trim()
    if (!n) { toast.error('Donnez un nom au preset'); return }
    setBusy(true)
    try {
      await saveCardPreset(n, style)
      setMine(await listCardPresets())
      setName('')
      toast.success(`Preset « ${n} » enregistré`)
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Enregistrement impossible') }
    finally { setBusy(false) }
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-1.5">
        {CARD_PRESETS.map((p) => (
          <button key={p.name} type="button" title={p.desc}
            onClick={() => { patch(p.patch); toast.success(`Style « ${p.name} » appliqué`) }}
            className="flex flex-col items-start gap-1.5 p-2 rounded-md border border-border bg-surface-2 hover:border-indigo-500 text-left">
            <PresetMock p={p} />
            <span className="text-[11px] text-white/70 leading-tight">{p.name}</span>
          </button>
        ))}
      </div>
      {/* Mes presets : style COMPLET (couleurs, typo, formes, dispositions). */}
      {mine.length > 0 && (
        <div className="space-y-1">
          <span className="text-[10px] font-semibold text-white/40 uppercase tracking-wider">Mes presets</span>
          {mine.map((p) => (
            <div key={p.id} className="flex items-center gap-1">
              <button type="button" onClick={() => { applyFull(p.cardStyle); toast.success(`Preset « ${p.name} » appliqué`) }}
                title="Appliquer ce preset (style complet : couleurs, typo, formes, dispositions)"
                className="flex-1 px-2 py-1.5 rounded-md border border-border bg-surface-2 hover:border-indigo-500 text-left text-[11px] text-white/70 truncate">
                {p.name}
              </button>
              <button type="button" onClick={() => { void deleteCardPreset(p.id).then(() => setMine((m) => m.filter((x) => x.id !== p.id))) }}
                title="Supprimer ce preset" className="p-1.5 rounded-md text-white/30 hover:text-red-400 hover:bg-well">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center gap-1">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom du preset…"
          onKeyDown={(e) => { if (e.key === 'Enter') void save() }}
          className="flex-1 min-w-0 px-2 py-1.5 rounded-md bg-well text-[11px] text-white outline-none border border-white/10 focus:border-[#6366f1]" />
        <button type="button" onClick={() => void save()} disabled={busy}
          title="Enregistrer le style ACTUEL (couleurs, typo, formes, dispositions) comme preset réutilisable"
          className="flex items-center gap-1 px-2 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-[#fff] text-[11px] font-medium">
          <Save className="w-3.5 h-3.5" /> Enregistrer
        </button>
      </div>
    </div>
  )
}
