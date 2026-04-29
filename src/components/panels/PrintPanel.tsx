import { Scissors, Shield, Target, Download, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { useUIStore } from '@/stores/ui.store'
import { useEditorStore } from '@/stores/editor.store'
import { doc, setDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'

export function PrintPanel() {
  const [saving, setSaving] = useState(false)
  const {
    dpi, bleedMm, safeAreaMm, cropMarkLengthMm, cropMarkOffsetMm,
    showPrintMarks, showSafeArea, showRegistrationMarks,
    setDpi, setBleedMm, setSafeAreaMm, setCropMarkLengthMm, setCropMarkOffsetMm,
    setShowPrintMarks, setShowSafeArea, setShowRegistrationMarks,
  } = useUIStore()

  const { projectId } = useEditorStore()

  const handleSaveSettings = async () => {
    if (!projectId) return
    setSaving(true)
    try {
      await setDoc(doc(db, 'projects', projectId), {
        dpi,
        bleedMm,
        cropMarkLengthMm,
        cropMarkOffsetMm,
        safeAreaMm,
      }, { merge: true })
    } catch (err) {
      console.error('[PrintPanel] Save failed:', err)
    } finally {
      setSaving(false)
    }
  }

  const handleResetDefaults = () => {
    setDpi(300)
    setBleedMm(2)
    setSafeAreaMm(2)
    setCropMarkLengthMm(3.5)
    setCropMarkOffsetMm(1)
    setShowPrintMarks(true)
    setShowSafeArea(true)
    setShowRegistrationMarks(true)
  }

  return (
    <div className="p-3 flex flex-col gap-4">
      {/* ── Boutons d'actions ── */}
      <div className="flex gap-2">
        <button
          onClick={handleSaveSettings}
          className="flex-1 flex items-center justify-center gap-2 bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/50 rounded-md px-2 py-1.5 text-xs text-indigo-300 transition-colors"
          title="Sauvegarder les paramètres (enregistré automatiquement)"
        >
          <Download className="w-3 h-3" />
          <span>Enregistrer</span>
        </button>
        <button
          onClick={handleResetDefaults}
          className="flex-1 flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-md px-2 py-1.5 text-xs text-white/70 transition-colors"
          title="Restaurer les paramètres par défaut"
        >
          <RotateCcw className="w-3 h-3" />
          <span>Défauts</span>
        </button>
      </div>
      {/* ── Résolution ── */}
      <section className="flex flex-col gap-1">
        <label className="text-[10px] text-white/40 uppercase tracking-wider font-semibold">
          Résolution (DPI)
        </label>
        <select
          value={dpi}
          onChange={(e) => setDpi(Number(e.target.value))}
          className="w-full bg-white/5 border border-white/10 rounded-md px-2 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500/50"
        >
          <option value={72}>72 DPI — web</option>
          <option value={150}>150 DPI — numérique léger</option>
          <option value={300}>300 DPI — offset (recommandé)</option>
          <option value={600}>600 DPI — très haute définition</option>
        </select>
      </section>

      {/* ── Fond perdu ── */}
      <section className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <label className="text-[10px] text-white/40 uppercase tracking-wider font-semibold">
            Fond perdu (bleed)
          </label>
          <span className="text-[11px] text-white/80 font-mono tabular-nums">{bleedMm} mm</span>
        </div>
        <input
          type="range"
          min={0}
          max={10}
          step={1}
          value={bleedMm}
          onChange={(e) => setBleedMm(Number(e.target.value))}
          className="w-full accent-indigo-500"
        />
        <div className="flex justify-between text-[9px] text-white/30">
          <span>0</span>
          <span>3 offset</span>
          <span>5 num.</span>
          <span>10</span>
        </div>
      </section>

      {/* ── Traits de coupe ── */}
      <section className="flex flex-col gap-2 pt-2 border-t border-white/5">
        <label className="flex items-center gap-2 text-xs text-white/80 cursor-pointer">
          <input
            type="checkbox"
            checked={showPrintMarks}
            onChange={(e) => setShowPrintMarks(e.target.checked)}
            className="accent-indigo-500"
          />
          <Scissors className="w-3 h-3 text-white/50" />
          <span>Afficher traits de coupe &amp; bleed</span>
        </label>

        {showPrintMarks && (
          <div className="flex flex-col gap-2 pl-5">
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-white/40">Longueur trait</span>
                <span className="text-[10px] text-white/60 font-mono tabular-nums">{cropMarkLengthMm} mm</span>
              </div>
              <input
                type="range"
                min={2}
                max={10}
                step={0.5}
                value={cropMarkLengthMm}
                onChange={(e) => setCropMarkLengthMm(Number(e.target.value))}
                className="w-full accent-indigo-500"
              />
            </div>
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-white/40">Décalage depuis le bleed</span>
                <span className="text-[10px] text-white/60 font-mono tabular-nums">{cropMarkOffsetMm} mm</span>
              </div>
              <input
                type="range"
                min={0}
                max={10}
                step={0.5}
                value={cropMarkOffsetMm}
                onChange={(e) => setCropMarkOffsetMm(Number(e.target.value))}
                className="w-full accent-indigo-500"
              />
            </div>
          </div>
        )}
      </section>

      {/* ── Zone de sécurité ── */}
      <section className="flex flex-col gap-2 pt-2 border-t border-white/5">
        <label className="flex items-center gap-2 text-xs text-white/80 cursor-pointer">
          <input
            type="checkbox"
            checked={showSafeArea}
            onChange={(e) => setShowSafeArea(e.target.checked)}
            className="accent-indigo-500"
          />
          <Shield className="w-3 h-3 text-white/50" />
          <span>Afficher zone de sécurité</span>
        </label>

        {showSafeArea && (
          <div className="flex flex-col gap-1 pl-5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-white/40">Marge intérieure</span>
              <span className="text-[10px] text-white/60 font-mono tabular-nums">{safeAreaMm} mm</span>
            </div>
            <input
              type="range"
              min={0}
              max={20}
              step={0.5}
              value={safeAreaMm}
              onChange={(e) => setSafeAreaMm(Number(e.target.value))}
              className="w-full accent-indigo-500"
            />
          </div>
        )}
      </section>

      {/* ── Hirondelles ── */}
      <section className="flex flex-col gap-2 pt-2 border-t border-white/5">
        <label className="flex items-center gap-2 text-xs text-white/80 cursor-pointer">
          <input
            type="checkbox"
            checked={showRegistrationMarks}
            onChange={(e) => setShowRegistrationMarks(e.target.checked)}
            className="accent-indigo-500"
          />
          <Target className="w-3 h-3 text-white/50" />
          <span>Afficher repères de montage</span>
        </label>
      </section>
    </div>
  )
}
