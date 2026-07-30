import { Languages } from 'lucide-react'
import { useLocaleStore, ALL_LOCALES, LOCALE_ENDONYM, type Locale } from '@/stores/locale.store'
import { useI18nOverridesStore } from '@/stores/i18nOverrides.store'
import { useTranslation } from '@/lib/i18n'

interface LocaleSwitcherProps {
  className?: string
  /**
   * Variante d'une seule pastille pour la sidebar REPLIÉE (56 px de large) :
   * affiche la langue active et bascule au clic. Le groupe complet ne tient pas
   * dans cette largeur — il déborderait au lieu de se réduire.
   */
  compact?: boolean
}

/**
 * Bascule entre les langues ACTIVÉES par le compte. Persiste la préférence.
 *
 * ⚠️ Les noms de langue affichés sont des ENDONYMES (« Deutsch », pas
 * « Allemand ») : un nom de langue ne se traduit pas dans un sélecteur de
 * langue, sinon un germanophone perdu dans une interface française ne
 * reconnaîtrait pas la sienne.
 */
export function LocaleSwitcher({ className = '', compact = false }: LocaleSwitcherProps) {
  const locale = useLocaleStore((s) => s.locale)
  const setLocale = useLocaleStore((s) => s.setLocale)
  const activeLocales = useI18nOverridesStore((s) => s.activeLocales)
  const { t } = useTranslation()

  // Ordre stable (celui de ALL_LOCALES) quelle que soit l'ordre de saisie côté
  // réglages, et repli sur la langue courante si le compte n'a rien activé.
  const locales = ALL_LOCALES.filter((l) => activeLocales.includes(l))
  const shown: readonly Locale[] = locales.length > 0 ? locales : [locale]

  if (compact) {
    const index = shown.indexOf(locale)
    const next = shown[(index + 1) % shown.length] ?? locale
    const hint = `${t('locale.label')} — ${LOCALE_ENDONYM[next]}`
    return (
      <button
        type="button"
        onClick={() => setLocale(next)}
        title={hint}
        aria-label={hint}
        className={`px-1 py-0.5 rounded text-[10px] font-semibold tracking-wide text-white/25 hover:text-white/60 hover:bg-white/[0.04] transition-colors ${className}`}
      >
        {locale.toUpperCase()}
      </button>
    )
  }

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <Languages className="w-3.5 h-3.5 text-white/40" aria-hidden />
      <div role="group" aria-label={t('locale.label')} className="flex rounded-md bg-white/5 p-0.5">
        {shown.map((code) => (
          <button
            key={code}
            type="button"
            onClick={() => setLocale(code)}
            aria-pressed={locale === code}
            title={LOCALE_ENDONYM[code]}
            className={`px-1.5 py-0.5 text-[11px] font-medium rounded transition-colors ${
              locale === code ? 'bg-indigo-500 text-[#fff]' : 'text-white/50 hover:text-white/80'
            }`}
          >
            {code.toUpperCase()}
          </button>
        ))}
      </div>
    </div>
  )
}
