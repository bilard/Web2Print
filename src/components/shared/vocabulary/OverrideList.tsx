import { useState } from 'react'
import { Languages, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { useTranslation, catalogText, type TranslationKey } from '@/lib/i18n'
import { useI18nOverridesStore } from '@/stores/i18nOverrides.store'
import { useVocabularyEditor } from '@/features/i18n/useVocabularyEditor'

interface OverrideRowProps {
  entryKey: TranslationKey
  value: string
  businessContext: string
}

function OverrideRow({ entryKey, value, businessContext }: OverrideRowProps) {
  const { t, locale } = useTranslation()
  const { canEdit, translating, setLabel, translateToActiveLocales } = useVocabularyEditor()
  const [draft, setDraft] = useState(value)

  return (
    <div className="flex items-start gap-2 py-2 border-b border-white/5 last:border-0">
      <div className="flex flex-col min-w-0 flex-1 gap-1">
        <span className="text-[10px] font-mono text-white/25 truncate" title={entryKey}>
          {entryKey}
        </span>
        {/* Texte d'ORIGINE : sans lui, on relit son propre mot sans savoir
            lequel il a remplacé — donc sans pouvoir juger s'il est encore juste. */}
        <span className="text-[10px] text-white/30 truncate" title={catalogText(locale, entryKey)}>
          {t('i18n.overrides.was', { text: catalogText(locale, entryKey) })}
        </span>
        <input
          value={draft}
          disabled={!canEdit}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => { if (draft !== value) void setLabel(entryKey, locale, draft.trim()) }}
          className="bg-well border border-white/10 rounded px-2 py-1 text-[12px] text-white focus:border-indigo-500 outline-none"
        />
      </div>
      <button
        type="button"
        disabled={!canEdit || translating}
        onClick={() => void translateToActiveLocales(entryKey, draft.trim(), businessContext)}
        title={t('i18n.edit.translate')}
        className="mt-4 p-1 rounded text-white/40 hover:text-white/80 disabled:opacity-30"
      >
        <Languages className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        disabled={!canEdit}
        onClick={() => void setLabel(entryKey, locale, null)}
        title={t('i18n.edit.reset')}
        className="mt-4 p-1 rounded text-white/40 hover:text-white/80 disabled:opacity-30"
      >
        <RotateCcw className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

/**
 * Libellés déjà réécrits dans la langue affichée.
 *
 * La liste ne montre QUE les surcharges, jamais les 4 000+ clés du catalogue :
 * on ne parcourt pas un catalogue pour trouver le mot qui gêne, on le désigne
 * là où il gêne (Alt+clic), et cet écran sert ensuite à le relire, le corriger
 * et le propager aux autres langues.
 */
export function OverrideList({ businessContext }: { businessContext: string }) {
  const { t, locale } = useTranslation()
  const { canEdit, translating, translateToActiveLocales } = useVocabularyEditor()
  const overrides = useI18nOverridesStore((s) => s.overrides[locale])
  const entries = Object.entries(overrides ?? {}) as [TranslationKey, string][]

  async function translateAll() {
    let done = 0
    // En série et non en parallèle : chaque libellé est un appel LLM, et les
    // écritures Firestore visent le MÊME document par langue — les paralléliser
    // ferait s'écraser les unes les autres (dernier arrivé, seul survivant).
    for (const [key, value] of entries) {
      if (await translateToActiveLocales(key, value, businessContext)) done++
    }
    toast.success(t('i18n.bulk.done', { count: done, total: entries.length }))
  }

  if (entries.length === 0) {
    return (
      <section className="flex flex-col gap-1">
        <h3 className="text-[12px] font-semibold text-white/70">{t('i18n.overrides.title')}</h3>
        <p className="text-[11px] text-white/40">{t('i18n.overrides.empty')}</p>
      </section>
    )
  }

  return (
    <section className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <h3 className="text-[12px] font-semibold text-white/70">
          {t('i18n.overrides.titleCount', { count: entries.length, locale: locale.toUpperCase() })}
        </h3>
        <button
          type="button"
          disabled={!canEdit || translating}
          onClick={() => void translateAll()}
          className="flex items-center gap-1 px-2 py-1 rounded-md bg-white/[0.06] text-white/70 text-[11px] disabled:opacity-40"
        >
          <Languages className="w-3 h-3" />
          {translating ? t('i18n.edit.translating') : t('i18n.bulk.translateAll')}
        </button>
      </div>
      <p className="text-[11px] text-white/35 mb-1">{t('i18n.overrides.desc')}</p>
      <div className="bg-white/[0.02] border border-white/5 rounded-lg px-3 max-h-[320px] overflow-y-auto">
        {entries.map(([key, value]) => (
          <OverrideRow key={key} entryKey={key} value={value} businessContext={businessContext} />
        ))}
      </div>
    </section>
  )
}
