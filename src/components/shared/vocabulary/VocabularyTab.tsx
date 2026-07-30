import { useState } from 'react'
import { Pencil, Info } from 'lucide-react'
import { toast } from 'sonner'
import { useTranslation } from '@/lib/i18n'
import { useI18nOverridesStore } from '@/stores/i18nOverrides.store'
import { useVocabularyEditor } from '@/features/i18n/useVocabularyEditor'
import { saveBusinessContext } from '@/features/i18n/accountI18nApi'
import { LocaleToggleList } from './LocaleToggleList'
import { OverrideList } from './OverrideList'

/**
 * « Langues & vocabulaire » — l'écran où un compte accorde l'application à son
 * métier.
 *
 * Deux réglages de nature différente y cohabitent volontairement : quelles
 * LANGUES le compte sert, et quels MOTS il emploie dans chacune. Les séparer
 * ferait perdre le lien : renommer un mot n'a d'intérêt que si l'on peut le
 * propager aux langues qu'on a activées, et activer une langue sans catalogue
 * n'a de sens que si l'on peut la remplir mot à mot.
 */
export function VocabularyTab() {
  const { t } = useTranslation()
  const { canEdit } = useVocabularyEditor()
  const editing = useI18nOverridesStore((s) => s.editing)
  const setEditing = useI18nOverridesStore((s) => s.setEditing)
  const accountId = useI18nOverridesStore((s) => s.accountId)
  const storedContext = useI18nOverridesStore((s) => s.businessContext)
  const setStoredContext = useI18nOverridesStore((s) => s.setBusinessContext)
  const [context, setContext] = useState(storedContext)

  async function persistContext() {
    if (!accountId || context === storedContext) return
    setStoredContext(context)
    try {
      await saveBusinessContext(accountId, context)
    } catch (e) {
      setStoredContext(storedContext)
      toast.error(t('i18n.edit.saveFailed'))
      console.warn('[VocabularyTab] contexte métier:', e)
    }
  }

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <section className="flex flex-col gap-2">
        <h3 className="text-[12px] font-semibold text-white/70">{t('i18n.mode.title')}</h3>
        <p className="text-[11px] text-white/40">{t('i18n.mode.desc')}</p>
        <button
          type="button"
          disabled={!canEdit}
          onClick={() => setEditing(!editing)}
          className={`self-start flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors disabled:opacity-40 ${
            editing
              ? 'bg-indigo-500 text-[#fff]'
              : 'bg-white/[0.06] text-white/70 hover:text-white'
          }`}
        >
          <Pencil className="w-3.5 h-3.5" />
          {editing ? t('i18n.mode.on') : t('i18n.mode.off')}
        </button>
        {!canEdit && (
          <span className="flex items-center gap-1.5 text-[11px] text-amber-400/80">
            <Info className="w-3 h-3" />{t('i18n.edit.noPermission')}
          </span>
        )}
      </section>

      <LocaleToggleList />

      <section className="flex flex-col gap-1.5">
        <h3 className="text-[12px] font-semibold text-white/70">{t('i18n.context.title')}</h3>
        <p className="text-[11px] text-white/40">{t('i18n.context.desc')}</p>
        <input
          value={context}
          disabled={!canEdit}
          onChange={(e) => setContext(e.target.value)}
          onBlur={() => void persistContext()}
          placeholder={t('i18n.context.placeholder')}
          className="bg-well border border-white/10 rounded-md px-2.5 py-1.5 text-[12px] text-white focus:border-indigo-500 outline-none"
        />
      </section>

      <OverrideList businessContext={storedContext} />
    </div>
  )
}
