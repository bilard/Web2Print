// Panneau de config du node « Règles d'appariement » : le MÊME atelier que l'écran de la
// veille — arbre de décision, poids réels mesurés sur un concurrent au choix, aperçu
// avant/après.
//
// ⚠ Il remplace le rendu générique du `configSchema` (qui est donc vide, comme pour
// « Sites sources »). Une liste de cases à cocher ne pouvait pas dire ce qui décide avant
// quoi : les trois étages du moteur sont hiérarchiques, un réglage amont rendant un
// réglage aval sans objet.
import { useMemo } from 'react'
import { useWorkflowStore } from '../persistence/workflow.store'
import { deriveWatchId } from '@/features/priceWatch/sourceSites'
import { usePairingRules } from '@/features/priceWatch/usePairingRules'
import { RulesWorkbench } from '@/features/priceWatch/rules/RulesWorkbench'
import { configToRules, rulesToConfig, type PairingRulesConfig as Cfg } from '@/features/priceWatch/pairingRulesConfig'
import type { PairingRules } from '@/features/priceWatch/catalog/pairingRules'
import { t } from '@/lib/i18n'

export function PairingRulesConfigPanel({ config, onChange }: {
  config: Cfg
  onChange: (next: Cfg) => void
  availableColumns?: string[]
}) {
  const workflowId = useWorkflowStore((s) => s.current?.id)
  // Même dérivation qu'au runtime : mesurer sur un AUTRE suivi que celui où les règles
  // s'appliqueront donnerait des poids qui ne veulent rien dire.
  const watchId = deriveWatchId(config.watchId, workflowId ?? undefined)
  // Règles ENREGISTRÉES pour ce suivi : c'est la référence à laquelle comparer la config
  // du node — « voici ce que ce node changera quand il tournera ».
  const stored = usePairingRules(watchId)

  const rules = useMemo(() => configToRules(config), [config])
  const setRules = (next: PairingRules) => onChange({ ...config, ...rulesToConfig(next) })

  return (
    <div className="space-y-3">
      <label className="block space-y-1">
        <span className="text-xs text-white/70 block">{t('node.pairing-rules.watchId.label')}</span>
        <input
          type="text" value={config.watchId}
          onChange={(e) => onChange({ ...config, watchId: e.target.value })}
          placeholder={watchId}
          className="bg-well text-white text-sm rounded px-2 py-1.5 w-full border border-white/10 focus:outline-none focus:border-white/25"
        />
        <span className="text-[11px] text-white/40 block leading-snug">
          {t('node.pairing-rules.watchId.help')}
        </span>
      </label>

      {/* Ce que le node fera de ces réglages : les ÉCRIRE pour le suivi. Le dire ici évite
          de chercher pourquoi rien ne change avant d'avoir lancé le flux. */}
      <p className="text-[11px] text-white/40 leading-snug">
        {stored.fromDefaults
          ? t('node.pairing-rules.storedDefaults', { watchId })
          : t('node.pairing-rules.storedExists', { watchId })}
      </p>

      <RulesWorkbench watchId={watchId} rules={rules} onChange={setRules} baseline={stored.rules} />
    </div>
  )
}
