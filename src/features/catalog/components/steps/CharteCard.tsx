// src/features/catalog/components/steps/CharteCard.tsx
// Carte « Charte & éléments joints » de l'étape Prompt : joignez PDF de charte,
// logo ou visuels de marque → palette + typos extraites AUTOMATIQUEMENT
// (moteur créatif : la charte pilote le plan IA et peut s'appliquer au thème).
import { useRef, useState } from 'react'
import { Loader2, Palette, Paperclip, X } from 'lucide-react'
import { toast } from 'sonner'
import { useCatalogStore } from '@/stores/catalog.store'
import { EMPTY_CHARTE, charteToThemePatch, extractCharteFromFile } from '../../charte/extractCharte'

export function CharteCard() {
  const charte = useCatalogStore((s) => s.charte)
  const setCharte = useCatalogStore((s) => s.setCharte)
  const plan = useCatalogStore((s) => s.plan)
  const setPlan = useCatalogStore((s) => s.setPlan)
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return
    setBusy(true)
    try {
      let next = charte ?? EMPTY_CHARTE
      for (const f of Array.from(files)) next = await extractCharteFromFile(f, next)
      setCharte(next)
      toast.success(`Charte extraite : ${next.colors.length} couleurs${next.fonts.length ? `, ${next.fonts.length} typos` : ''}`)
    } catch (e) {
      toast.error(`Extraction impossible (${String((e as Error).message).slice(0, 80)})`)
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const applyToTheme = () => {
    if (!plan || !charte) return
    const patch = charteToThemePatch(charte)
    setPlan({ ...plan, theme: { ...plan.theme, ...patch } })
    toast.success('Palette de la charte appliquée au thème')
  }

  return (
    <section className="rounded-lg border border-border bg-surface p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
          <Palette className="w-4 h-4 text-indigo-400" /> Charte & éléments joints
        </h2>
        {charte && (charte.files.length > 0 || charte.colors.length > 0) && (
          <button type="button" onClick={() => setCharte(null)} title="Retirer la charte"
            className="p-1.5 rounded-md text-white/40 hover:text-white hover:bg-well">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Joignez votre charte (PDF), logo ou visuels : palette et typos sont extraites
        automatiquement et PILOTENT la génération du plan (avec vos consignes ci-dessous).
      </p>
      <div className="flex items-center gap-2 flex-wrap">
        <button type="button" onClick={() => inputRef.current?.click()} disabled={busy}
          className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-border bg-surface-2 text-xs text-white hover:border-indigo-500 disabled:opacity-50">
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Paperclip className="w-3.5 h-3.5" />}
          Joindre PDF / logo / visuel
        </button>
        <input ref={inputRef} type="file" multiple accept="application/pdf,image/*" className="hidden"
          onChange={(e) => void onFiles(e.target.files)} />
        {charte?.files.map((f) => (
          <span key={f} className="px-2 py-0.5 rounded-full bg-well text-[10px] text-white/50 truncate max-w-[160px]">{f}</span>
        ))}
      </div>
      {charte && charte.colors.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          {charte.colors.map((c) => (
            <span key={c} title={c} className="w-6 h-6 rounded-md border border-white/15 shrink-0" style={{ background: c }} />
          ))}
          <button type="button" onClick={applyToTheme} disabled={!plan}
            title={plan ? 'Répartit la palette dans le thème (accent, bandeau, fond, encre)' : 'Générez d’abord un plan'}
            className="ml-1 px-2.5 py-1 rounded-md text-[11px] border border-indigo-500 text-indigo-300 hover:bg-indigo-600 hover:text-[#fff] disabled:opacity-40">
            Appliquer au thème
          </button>
        </div>
      )}
      {charte && charte.fonts.length > 0 && (
        <p className="text-[11px] text-white/50">
          Typos détectées : <b className="text-white/80">{charte.fonts.join(' · ')}</b>
          <span className="text-white/35"> — chargez les fichiers via « Mes polices » (Aperçu → Fond de page) pour les utiliser telles quelles.</span>
        </p>
      )}
      <textarea value={charte?.notes ?? ''} rows={2}
        onChange={(e) => setCharte({ ...(charte ?? EMPTY_CHARTE), notes: e.target.value })}
        placeholder="Consignes créa (graphique & structure) : ton, interdits, hiérarchie des pages, densité…"
        className="w-full px-3 py-2 rounded-md bg-surface-2 text-xs text-white outline-none focus:ring-1 focus:ring-indigo-600 resize-none" />
    </section>
  )
}
