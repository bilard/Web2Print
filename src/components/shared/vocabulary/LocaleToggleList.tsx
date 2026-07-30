import { Check, Lock } from 'lucide-react'
import { useTranslation, COMPILED_LOCALES, CATALOG_SIZE } from '@/lib/i18n'
import { ALL_LOCALES, LOCALE_ENDONYM, type Locale } from '@/stores/locale.store'
import { useI18nOverridesStore } from '@/stores/i18nOverrides.store'
import { useVocabularyEditor } from '@/features/i18n/useVocabularyEditor'

/** Nombre de clés surchargées par langue — mesure l'avancement d'une langue. */
function useOverrideCount(locale: Locale): number {
  return useI18nOverridesStore((s) => Object.keys(s.overrides[locale] ?? {}).length)
}

function LocaleRow({ locale, total }: { locale: Locale; total: number }) {
  const { t } = useTranslation()
  const { canEdit, setLocaleActive } = useVocabularyEditor()
  const active = useI18nOverridesStore((s) => s.activeLocales.includes(locale))
  const count = useOverrideCount(locale)
  const compiled = COMPILED_LOCALES.includes(locale)
  // Le français est la langue de REPLI de la résolution : la désactiver
  // laisserait les clés non traduites sans filet.
  const locked = locale === 'fr'

  return (
    <div className="flex items-center gap-3 py-2 border-b border-white/5 last:border-0">
      <button
        type="button"
        role="switch"
        aria-checked={active}
        aria-label={LOCALE_ENDONYM[locale]}
        disabled={!canEdit || locked}
        onClick={() => setLocaleActive(locale, !active)}
        className={`w-8 h-[18px] rounded-full shrink-0 transition-colors relative disabled:opacity-40 ${
          active ? 'bg-indigo-500' : 'bg-white/10'
        }`}
      >
        <span
          className={`absolute top-[2px] w-3.5 h-3.5 rounded-full bg-[#fff] transition-all ${
            active ? 'left-[16px]' : 'left-[2px]'
          }`}
        />
      </button>

      <div className="flex flex-col min-w-0 flex-1">
        <span className="text-[12px] text-white/80 flex items-center gap-1.5">
          {LOCALE_ENDONYM[locale]}
          <span className="text-[10px] font-mono text-white/25">{locale}</span>
          {locked && <Lock className="w-2.5 h-2.5 text-white/25" aria-label={t('i18n.locales.locked')} />}
        </span>
        <span className="text-[10px] text-white/35">
          {compiled ? (
            <span className="inline-flex items-center gap-1 text-emerald-400/70">
              <Check className="w-2.5 h-2.5" />{t('i18n.locales.translated')}
            </span>
          ) : (
            t('i18n.locales.partial', { count, total })
          )}
        </span>
      </div>
    </div>
  )
}

/**
 * Langues servies par le compte.
 *
 * ⚠️ Deux natures de langue coexistent, et l'écran doit le dire : `fr` et `en`
 * ont un catalogue COMPLET livré avec l'application ; les autres ne sont
 * peuplées que par le vocabulaire du compte et retombent sur le français pour
 * tout le reste. Activer l'italien ne rend donc pas l'application italienne —
 * il ouvre le chantier. Sans ce repère, on active une langue et on croit à un
 * bug en voyant le reste en français.
 */
export function LocaleToggleList() {
  const { t } = useTranslation()
  return (
    <section className="flex flex-col gap-1">
      <h3 className="text-[12px] font-semibold text-white/70">{t('i18n.locales.title')}</h3>
      <p className="text-[11px] text-white/40 mb-1">{t('i18n.locales.desc')}</p>
      <div className="bg-white/[0.02] border border-white/5 rounded-lg px-3">
        {ALL_LOCALES.map((locale) => (
          <LocaleRow key={locale} locale={locale} total={CATALOG_SIZE} />
        ))}
      </div>
    </section>
  )
}

