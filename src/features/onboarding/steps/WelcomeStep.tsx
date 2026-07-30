import { Sparkles, KeyRound, Cpu, Plug, Compass } from 'lucide-react'
import { type TranslationKey, t } from '@/lib/i18n'

// ⚠️ CLÉS, pas `t()` : ce tableau est évalué au CHARGEMENT du module.
const ITEMS: { icon: typeof KeyRound; labelKey: TranslationKey; descKey: TranslationKey }[] = [
  { icon: KeyRound, labelKey: 'ob.aiKeys', descKey: 'ob.aiKeys.desc' },
  { icon: Cpu, labelKey: 'ob.cascade', descKey: 'ob.cascade.desc' },
  { icon: Plug, labelKey: 'ob.connectors', descKey: 'ob.connectors.desc' },
  { icon: Compass, labelKey: 'ob.tour', descKey: 'ob.tour.desc' },
]

export function WelcomeStep() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500/30 to-fuchsia-500/20 flex items-center justify-center shrink-0">
          <Sparkles className="w-6 h-6 text-indigo-300" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-white">{t('ob.welcome')}</h3>
          <p className="text-xs text-white/50">{t('ob.introFull')}</p>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {ITEMS.map(({ icon: Icon, labelKey, descKey }) => (
          <div key={labelKey} className="flex items-center gap-3 bg-white/[0.03] rounded-xl p-3">
            <Icon className="w-4 h-4 text-indigo-300 shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-medium text-white/80">{t(labelKey)}</p>
              <p className="text-[11px] text-white/40">{t(descKey)}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
