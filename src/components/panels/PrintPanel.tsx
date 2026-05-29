import { Scissors, Shield, Target, Download, RotateCcw, Square, FolderPlus, Save, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { useUIStore } from '@/stores/ui.store'
import { useEditorStore } from '@/stores/editor.store'
import { doc, setDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { usePrintPresets, type PrintPresetParams } from '@/features/print/usePrintPresets'
import { applyPrintDefaults } from '@/features/print/printDefaults'

/**
 * Panneau "Repères et fonds perdus" — vocabulaire InDesign.
 *
 * Sections :
 *   - Résolution (DPI)
 *   - Fond perdu (bleed)
 *   - Repères d'impression : Traits de coupe / Repères de fond perdu / Repères de montage
 *   - Zone de sécurité
 *
 * Pour chaque type de repère : taille (quand applicable), épaisseur, couleur.
 */
export function PrintPanel() {
  const [saving, setSaving] = useState(false)
  const [selectedPresetId, setSelectedPresetId] = useState<string>('')
  const { presets, savePreset, updatePreset, deletePreset } = usePrintPresets()
  const {
    dpi, bleedMm, safeAreaMm, cropMarkLengthMm, cropMarkOffsetMm,
    showPrintMarks, showSafeArea, showRegistrationMarks,
    cropStroke, cropColor, bleedStroke, bleedColor,
    regRadiusMm, regStroke, regColor, regOffsetMm,
    safeStroke, safeColor, safeDash, safeGap,
    setDpi, setBleedMm, setSafeAreaMm, setCropMarkLengthMm, setCropMarkOffsetMm,
    setShowPrintMarks, setShowSafeArea, setShowRegistrationMarks,
    setCropStroke, setCropColor, setBleedStroke, setBleedColor,
    setRegRadiusMm, setRegStroke, setRegColor, setRegOffsetMm,
    setSafeStroke, setSafeColor, setSafeDash, setSafeGap,
  } = useUIStore()

  const projectId = useEditorStore((s) => s.projectId)

  const handleSaveSettings = async () => {
    if (!projectId) return
    setSaving(true)
    try {
      await setDoc(doc(db, 'projects', projectId), {
        dpi, bleedMm, cropMarkLengthMm, cropMarkOffsetMm, safeAreaMm,
        cropStroke, cropColor, bleedStroke, bleedColor,
        regRadiusMm, regStroke, regColor, regOffsetMm,
        safeStroke, safeColor, safeDash, safeGap,
      }, { merge: true })
      toast.success('Paramètres d\'impression enregistrés ✓')
    } catch (err) {
      console.error('[PrintPanel] Save failed:', err)
      toast.error('Erreur lors de l\'enregistrement')
    } finally {
      setSaving(false)
    }
  }

  /** Snapshot des params courants du store pour les sauver dans un preset. */
  const collectCurrentParams = (): PrintPresetParams => ({
    dpi, bleedMm, safeAreaMm, cropMarkLengthMm, cropMarkOffsetMm,
    showPrintMarks, showSafeArea, showRegistrationMarks,
    cropStroke, cropColor, bleedStroke, bleedColor,
    regRadiusMm, regStroke, regColor, regOffsetMm,
    safeStroke, safeColor, safeDash, safeGap,
  })

  /** Applique tous les params d'un preset au store. */
  const applyPreset = (presetId: string) => {
    const p = presets.find((x) => x.id === presetId)
    if (!p) return
    setDpi(p.dpi)
    setBleedMm(p.bleedMm)
    setSafeAreaMm(p.safeAreaMm)
    setCropMarkLengthMm(p.cropMarkLengthMm)
    setCropMarkOffsetMm(p.cropMarkOffsetMm)
    setShowPrintMarks(p.showPrintMarks)
    setShowSafeArea(p.showSafeArea)
    setShowRegistrationMarks(p.showRegistrationMarks)
    setCropStroke(p.cropStroke); setCropColor(p.cropColor)
    setBleedStroke(p.bleedStroke); setBleedColor(p.bleedColor)
    setRegRadiusMm(p.regRadiusMm); setRegStroke(p.regStroke); setRegColor(p.regColor); setRegOffsetMm(p.regOffsetMm)
    setSafeStroke(p.safeStroke); setSafeColor(p.safeColor)
    setSafeDash(p.safeDash); setSafeGap(p.safeGap)
  }

  const handleSelectPreset = (id: string) => {
    setSelectedPresetId(id)
    if (id) applyPreset(id)
  }

  const handleSaveAsNew = async () => {
    const name = window.prompt('Nom de la famille de paramètres :', 'Mon preset')
    if (!name || !name.trim()) return
    const id = await savePreset(name.trim(), collectCurrentParams())
    if (id) {
      setSelectedPresetId(id)
      toast.success(`Famille « ${name.trim()} » créée ✓`)
    } else {
      toast.error('Erreur lors de la création')
    }
  }

  const handleUpdatePreset = async () => {
    if (!selectedPresetId) return
    const ok = await updatePreset(selectedPresetId, collectCurrentParams())
    if (ok) toast.success('Famille mise à jour ✓')
    else toast.error('Erreur lors de la mise à jour')
  }

  const handleDeletePreset = async () => {
    if (!selectedPresetId) return
    const preset = presets.find((p) => p.id === selectedPresetId)
    if (!window.confirm(`Supprimer la famille « ${preset?.name ?? ''} » ?`)) return
    const ok = await deletePreset(selectedPresetId)
    if (ok) {
      setSelectedPresetId('')
      toast.success('Famille supprimée ✓')
    } else {
      toast.error('Erreur lors de la suppression')
    }
  }

  const handleResetDefaults = () => {
    applyPrintDefaults()
  }

  return (
    <div className="p-3 flex flex-col gap-4">
      {/* ── Famille de paramètres (presets réutilisables entre projets) ── */}
      <section className="flex flex-col gap-1.5">
        <label className="text-[10px] text-white/40 uppercase tracking-wider font-semibold">
          Famille de paramètres
        </label>
        <div className="flex gap-1">
          <select
            value={selectedPresetId}
            onChange={(e) => handleSelectPreset(e.target.value)}
            className="flex-1 min-w-0 bg-white/5 border border-white/10 rounded-md px-2 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500/50"
            title="Sélectionner une famille de paramètres"
          >
            <option value="">— Personnalisé —</option>
            {presets.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <button
            onClick={handleSaveAsNew}
            className="flex items-center justify-center bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/50 rounded-md w-7 h-7 text-indigo-300 transition-colors"
            title="Créer une nouvelle famille de paramètres"
          >
            <FolderPlus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleUpdatePreset}
            disabled={!selectedPresetId}
            className="flex items-center justify-center bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed border border-white/10 rounded-md w-7 h-7 text-white/70 transition-colors"
            title="Mettre à jour la famille sélectionnée avec les valeurs actuelles"
          >
            <Save className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleDeletePreset}
            disabled={!selectedPresetId}
            className="flex items-center justify-center bg-white/5 hover:bg-red-500/20 hover:border-red-500/50 hover:text-red-300 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-white/5 disabled:hover:text-white/70 border border-white/10 rounded-md w-7 h-7 text-white/70 transition-colors"
            title="Supprimer la famille sélectionnée"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </section>

      {/* ── Actions ── */}
      <div className="flex gap-2">
        <button
          onClick={handleSaveSettings}
          disabled={saving}
          className="flex-1 flex items-center justify-center gap-2 bg-indigo-500/20 hover:bg-indigo-500/30 disabled:opacity-50 border border-indigo-500/50 rounded-md px-2 py-1.5 text-xs text-indigo-300 transition-colors"
          title="Sauvegarder les paramètres"
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

      {/* ═══ REPÈRES D'IMPRESSION ═══ */}
      <section className="flex flex-col gap-3 pt-3 border-t border-white/5">
        <h3 className="text-[10px] text-white/40 uppercase tracking-wider font-semibold">
          Repères d'impression
        </h3>

        {/* Traits de coupe */}
        <MarkGroup
          icon={<Scissors className="w-3 h-3" />}
          label="Traits de coupe"
          enabled={showPrintMarks}
          onToggle={setShowPrintMarks}
        >
          <SliderControl
            label="Longueur du trait"
            value={cropMarkLengthMm}
            min={2} max={10} step={0.5} unit="mm"
            onChange={setCropMarkLengthMm}
          />
          <SliderControl
            label="Décalage depuis le bleed"
            value={cropMarkOffsetMm}
            min={0} max={3} step={0.5} unit="mm"
            onChange={setCropMarkOffsetMm}
          />
          <SliderControl
            label="Épaisseur"
            value={cropStroke}
            min={0.25} max={3} step={0.25} unit="px"
            onChange={setCropStroke}
          />
          <ColorControl label="Couleur" value={cropColor} onChange={setCropColor} />
        </MarkGroup>

        {/* Repères de fond perdu (= rect bleed, lié au toggle traits de coupe) */}
        <MarkGroup
          icon={<Square className="w-3 h-3" />}
          label="Repères de fond perdu"
          enabled={showPrintMarks}
          onToggle={setShowPrintMarks}
          subLabel="(rectangle de fond perdu)"
        >
          <SliderControl
            label="Épaisseur"
            value={bleedStroke}
            min={0.25} max={3} step={0.25} unit="px"
            onChange={setBleedStroke}
          />
          <ColorControl label="Couleur" value={bleedColor} onChange={setBleedColor} />
        </MarkGroup>

        {/* Repères de montage (hirondelles) */}
        <MarkGroup
          icon={<Target className="w-3 h-3" />}
          label="Repères de montage"
          enabled={showRegistrationMarks}
          onToggle={setShowRegistrationMarks}
          subLabel="(hirondelles)"
        >
          <SliderControl
            label="Taille (rayon)"
            value={regRadiusMm}
            min={1} max={8} step={0.5} unit="mm"
            onChange={setRegRadiusMm}
          />
          <SliderControl
            label="Décalage (position)"
            value={regOffsetMm}
            min={-10} max={30} step={0.5} unit="mm"
            onChange={setRegOffsetMm}
          />
          <SliderControl
            label="Épaisseur"
            value={regStroke}
            min={0.25} max={3} step={0.25} unit="px"
            onChange={setRegStroke}
          />
          <ColorControl label="Couleur" value={regColor} onChange={setRegColor} />
        </MarkGroup>
      </section>

      {/* ═══ ZONE DE SÉCURITÉ ═══ */}
      <section className="flex flex-col gap-3 pt-3 border-t border-white/5">
        <h3 className="text-[10px] text-white/40 uppercase tracking-wider font-semibold">
          Zone de sécurité
        </h3>

        <MarkGroup
          icon={<Shield className="w-3 h-3" />}
          label="Afficher la zone de sécurité"
          enabled={showSafeArea}
          onToggle={setShowSafeArea}
        >
          <SliderControl
            label="Marge intérieure"
            value={safeAreaMm}
            min={0} max={20} step={0.5} unit="mm"
            onChange={setSafeAreaMm}
          />
          <SliderControl
            label="Épaisseur"
            value={safeStroke}
            min={0.25} max={3} step={0.25} unit="px"
            onChange={setSafeStroke}
          />
          <SliderControl
            label="Longueur tiret"
            value={safeDash}
            min={1} max={20} step={0.5} unit="px"
            onChange={setSafeDash}
          />
          <SliderControl
            label="Espacement tirets"
            value={safeGap}
            min={1} max={20} step={0.5} unit="px"
            onChange={setSafeGap}
          />
          <ColorControl label="Couleur" value={safeColor} onChange={setSafeColor} />
        </MarkGroup>
      </section>
    </div>
  )
}

interface MarkGroupProps {
  icon: React.ReactNode
  label: string
  subLabel?: string
  enabled: boolean
  onToggle: (v: boolean) => void
  children: React.ReactNode
}

function MarkGroup({ icon, label, subLabel, enabled, onToggle, children }: MarkGroupProps) {
  return (
    <div className="flex flex-col gap-2">
      <label className="flex items-center gap-2 text-xs text-white/80 cursor-pointer">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onToggle(e.target.checked)}
          className="accent-indigo-500"
        />
        <span className="text-white/50">{icon}</span>
        <span>{label}</span>
        {subLabel && <span className="text-[10px] text-white/30">{subLabel}</span>}
      </label>
      {enabled && (
        <div className="flex flex-col gap-2 pl-5">
          {children}
        </div>
      )}
    </div>
  )
}

interface SliderControlProps {
  label: string
  value: number
  min: number
  max: number
  step: number
  unit: string
  onChange: (v: number) => void
}

function SliderControl({ label, value, min, max, step, unit, onChange }: SliderControlProps) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-white/40">{label}</span>
        <span className="text-[10px] text-white/60 font-mono tabular-nums">
          {value} {unit}
        </span>
      </div>
      <input
        type="range"
        min={min} max={max} step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-indigo-500"
      />
    </div>
  )
}

interface ColorControlProps {
  label: string
  value: string
  onChange: (v: string) => void
}

function ColorControl({ label, value, onChange }: ColorControlProps) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[10px] text-white/40">{label}</span>
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] text-white/60 font-mono tabular-nums uppercase">
          {value}
        </span>
        <label className="relative cursor-pointer">
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
          <span
            className="block w-6 h-6 rounded border border-white/20"
            style={{ backgroundColor: value }}
          />
        </label>
      </div>
    </div>
  )
}
