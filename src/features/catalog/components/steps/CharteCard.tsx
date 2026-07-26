// Carte « Charte & éléments joints » de l'étape Prompt : joignez PDF de charte,
// logo ou visuels de marque → palette + typos extraites AUTOMATIQUEMENT
// (moteur créatif : la charte pilote le plan IA et peut s'appliquer au thème).
import { useMemo, useRef, useState } from 'react'
import { Link2, Loader2, Palette, Paperclip, X } from 'lucide-react'
import { toast } from 'sonner'
import { useCatalogStore } from '@/stores/catalog.store'
import { EMPTY_CHARTE, charteToThemePatch, extractCharteFromFile } from '../../charte/extractCharte'
import { analyzeInspirationUrl } from '../../charte/inspiration'

export function CharteCard() {
  const charte = useCatalogStore((s) => s.charte)
  const setCharte = useCatalogStore((s) => s.setCharte)
  const plan = useCatalogStore((s) => s.plan)
  const setPlan = useCatalogStore((s) => s.setPlan)
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)
  // Source d'INSPIRATION par URL (Dribbble, Behance, image directe…) : le visuel
  // est analysé par la Vision LLM → palette + brief de design dans la charte.
  const [inspUrl, setInspUrl] = useState('')
  const [inspBusy, setInspBusy] = useState(false)
  // SUJET de chaque couleur : quels objets du catalogue elle impacte — directives
  // explicites des consignes (« FOND DE PAGE : #hex ») + répartition dérivée
  // (charteToThemePatch : accent, fond, bandeau, encres), affiché sous la pastille.
  const colorRoles = useMemo(() => {
    const map = new Map<string, string[]>()
    const add = (hex: string | undefined, label: string) => {
      if (!hex) return
      const k = hex.toLowerCase()
      const arr = map.get(k) ?? []
      if (!arr.includes(label)) arr.push(label)
      map.set(k, arr)
    }
    const notes = charte?.notes ?? ''
    const last = (re: RegExp) => [...notes.matchAll(re)].pop()?.[1]?.toLowerCase()
    add(last(/FOND DE PAGE[^:#]*:\s*(#[0-9a-f]{6})/gi), 'Fond de page')
    add(last(/FOND DES FICHES[^:#]*:\s*(#[0-9a-f]{6})/gi), 'Fond des fiches')
    if (charte) {
      const p = charteToThemePatch(charte)
      add(p.accent, 'Accent')
      add(p.pageBg, 'Fond de page')
      add(p.headerBg, 'Bandeau')
      add(p.ink, 'Texte')
      add(p.headerInk, 'Texte bandeau')
    }
    return map
  }, [charte])
  const analyzeInspiration = async () => {
    if (!inspUrl.trim()) return
    setInspBusy(true)
    try {
      const next = await analyzeInspirationUrl(inspUrl, charte ?? EMPTY_CHARTE)
      setCharte(next)
      setInspUrl('')
      toast.success('Inspiration analysée — « Générer le plan (IA) » reproduira ce look')
    } catch (e) {
      toast.error(`Analyse impossible (${String((e as Error).message).slice(0, 90)})`)
    } finally {
      setInspBusy(false)
    }
  }

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
      {/* Source d'inspiration : URL d'un design de référence à REPRODUIRE. */}
      <div className="flex items-center gap-2">
        <div className="flex-1 flex items-center gap-1.5 px-2.5 rounded-md bg-surface-2 border border-border focus-within:border-indigo-500">
          <Link2 className="w-3.5 h-3.5 text-white/30 shrink-0" />
          <input value={inspUrl} onChange={(e) => setInspUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void analyzeInspiration() }}
            placeholder="Source d'inspiration (URL Dribbble, Behance, image…)"
            className="w-full py-1.5 bg-transparent text-xs text-white outline-none placeholder:text-white/25" />
        </div>
        <button type="button" onClick={() => void analyzeInspiration()} disabled={inspBusy || !inspUrl.trim()}
          title="Récupère le visuel de la page et fait analyser sa mise en page par la Vision IA"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs border border-indigo-500 text-indigo-300 hover:bg-indigo-600 hover:text-[#fff] disabled:opacity-40">
          {inspBusy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Analyser
        </button>
      </div>
      {charte && charte.colors.length > 0 && (
        <div className="flex items-start gap-2 flex-wrap">
          {charte.colors.map((c) => {
            const roles = colorRoles.get(c.toLowerCase())
            return (
              <span key={c} className="flex flex-col items-center gap-0.5 min-w-0">
                <span title={`${c}${roles ? ' — ' + roles.join(' + ') : ''}`}
                  className="w-6 h-6 rounded-md border border-white/15 shrink-0" style={{ background: c }} />
                {roles && (
                  <span className="text-[9px] leading-tight text-white/45 text-center max-w-[64px]">
                    {roles.join(' · ')}
                  </span>
                )}
              </span>
            )
          })}
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
      {/* Consignes AGRANDIES + scrollables (le brief d'inspiration est long) —
          redimensionnable verticalement à la poignée. */}
      <textarea value={charte?.notes ?? ''} rows={9}
        onChange={(e) => setCharte({ ...(charte ?? EMPTY_CHARTE), notes: e.target.value })}
        placeholder="Consignes créa (graphique & structure) : ton, interdits, hiérarchie des pages, densité…"
        className="w-full px-3 py-2 rounded-md bg-surface-2 text-xs leading-relaxed text-white outline-none focus:ring-1 focus:ring-indigo-600 resize-y overflow-y-auto min-h-[120px] max-h-[50vh]" />
    </section>
  )
}
