import { useEffect, useRef, useState } from 'react'
import { Languages, RotateCcw, Check, X } from 'lucide-react'
import { useTranslation, translate, type TranslationKey } from '@/lib/i18n'
import { useI18nOverridesStore } from '@/stores/i18nOverrides.store'
import { useVocabularyEditor } from '@/features/i18n/useVocabularyEditor'
import type { LabelTarget } from '@/features/i18n/useLabelEditor'

const WIDTH = 340

interface LabelEditPopoverProps {
  target: LabelTarget
  onClose: () => void
}

/** Position clampée dans la fenêtre : un libellé cliqué en bas à droite ne doit
 *  pas ouvrir son éditeur hors écran. */
function clampedPosition(x: number, y: number): { left: number; top: number } {
  const left = Math.min(Math.max(8, x), window.innerWidth - WIDTH - 8)
  const top = Math.min(Math.max(8, y + 12), window.innerHeight - 260)
  return { left, top }
}

/** Réécriture d'un libellé désigné par Alt+clic. */
export function LabelEditPopover({ target, onClose }: LabelEditPopoverProps) {
  const { t, locale } = useTranslation()
  const { canEdit, translating, setLabel, translateToActiveLocales } = useVocabularyEditor()
  const activeLocales = useI18nOverridesStore((s) => s.activeLocales)
  const [selectedKey, setSelectedKey] = useState<TranslationKey>(target.keys[0])
  const [value, setValue] = useState(() => translate(locale, target.keys[0]))
  const [saving, setSaving] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  // Changer de clé candidate recharge le texte de CETTE clé : deux écrans
  // partagent le même mot mais peuvent déjà en avoir divergé.
  useEffect(() => setValue(translate(locale, selectedKey)), [selectedKey, locale])

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    // Clic hors du popover = abandon. `mousedown` et non `click` : le Alt+clic
    // qui désigne un AUTRE libellé doit fermer celui-ci avant que le nouveau ne
    // s'ouvre, sinon les deux se disputent la même position à l'écran.
    function onDown(e: MouseEvent) {
      if (!boxRef.current?.contains(e.target as Node)) onClose()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [onClose])

  const isOverridden = useI18nOverridesStore(
    (s) => s.overrides[locale]?.[selectedKey] !== undefined,
  )
  const otherLocales = activeLocales.filter((l) => l !== locale)

  async function handleSave() {
    setSaving(true)
    const ok = await setLabel(selectedKey, locale, value.trim())
    setSaving(false)
    if (ok) onClose()
  }

  async function handleTranslate() {
    // On enregistre avant de traduire : c'est le texte VALIDÉ qui part au modèle,
    // pas celui d'origine.
    if (!(await setLabel(selectedKey, locale, value.trim()))) return
    const n = await translateToActiveLocales(selectedKey, value.trim())
    if (n > 0) onClose()
  }

  const { left, top } = clampedPosition(target.x, target.y)

  return (
    <div
      ref={boxRef}
      role="dialog"
      aria-label={t('i18n.edit.title')}
      style={{ left, top, width: WIDTH }}
      className="fixed z-[9999] bg-surface border border-white/10 rounded-xl shadow-2xl p-3 flex flex-col gap-2.5"
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-white/70">{t('i18n.edit.title')}</span>
        <button type="button" onClick={onClose} aria-label={t('i18n.edit.close')}
          className="text-white/40 hover:text-white/80">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {target.keys.length > 1 && (
        <label className="flex flex-col gap-1">
          <span className="text-[10px] text-white/40">{t('i18n.edit.whichKey')}</span>
          <select
            value={selectedKey}
            onChange={(e) => setSelectedKey(e.target.value as TranslationKey)}
            className="bg-well border border-white/10 rounded-md px-2 py-1 text-[11px] font-mono text-white/80"
          >
            {target.keys.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </label>
      )}
      {target.keys.length === 1 && (
        <span className="text-[10px] font-mono text-white/30 truncate" title={selectedKey}>
          {selectedKey}
        </span>
      )}

      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={3}
        autoFocus
        className="bg-well border border-white/10 rounded-md px-2 py-1.5 text-[12px] text-white resize-y focus:border-indigo-500 outline-none"
      />

      {target.source !== 'text' && (
        <span className="text-[10px] text-white/35">
          {t('i18n.edit.fromAttribute', { attr: target.source })}
        </span>
      )}

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={handleSave}
          disabled={!canEdit || saving}
          className="flex items-center gap-1 px-2 py-1 rounded-md bg-indigo-500 text-[#fff] text-[11px] font-medium disabled:opacity-40"
        >
          <Check className="w-3 h-3" />{t('i18n.edit.save')}
        </button>
        <button
          type="button"
          onClick={handleTranslate}
          disabled={!canEdit || translating || otherLocales.length === 0}
          title={t('i18n.edit.translateHint', { langs: otherLocales.join(', ').toUpperCase() })}
          className="flex items-center gap-1 px-2 py-1 rounded-md bg-white/[0.06] text-white/70 text-[11px] disabled:opacity-40"
        >
          <Languages className="w-3 h-3" />
          {translating ? t('i18n.edit.translating') : t('i18n.edit.translate')}
        </button>
        {isOverridden && (
          <button
            type="button"
            onClick={async () => { await setLabel(selectedKey, locale, null); onClose() }}
            title={t('i18n.edit.reset')}
            className="ml-auto flex items-center gap-1 px-2 py-1 rounded-md text-white/45 hover:text-white/80 text-[11px]"
          >
            <RotateCcw className="w-3 h-3" />
          </button>
        )}
      </div>

      {!canEdit && <span className="text-[10px] text-amber-400/80">{t('i18n.edit.noPermission')}</span>}
    </div>
  )
}
