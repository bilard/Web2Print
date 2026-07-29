import { Languages } from 'lucide-react'
import { useLocaleStore, type Locale } from '@/stores/locale.store'
import { useTranslation } from '@/lib/i18n'

const LOCALES: readonly Locale[] = ['fr', 'en'] as const

interface LocaleSwitcherProps {
  className?: string
}

/** Bascule FR / EN (anglais britannique). Persiste la préférence via le store. */
export function LocaleSwitcher({ className = '' }: LocaleSwitcherProps) {
  const locale = useLocaleStore((s) => s.locale)
  const setLocale = useLocaleStore((s) => s.setLocale)
  const { t } = useTranslation()

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <Languages className="w-3.5 h-3.5 text-white/40" aria-hidden />
      <div role="group" aria-label={t('locale.label')} className="flex rounded-md bg-white/5 p-0.5">
        {LOCALES.map((code) => (
          <button
            key={code}
            type="button"
            onClick={() => setLocale(code)}
            aria-pressed={locale === code}
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
