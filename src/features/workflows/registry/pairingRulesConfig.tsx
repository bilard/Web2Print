// Panneau de config du node « Règles d'appariement ».
//
// ⚠ L'atelier (arbre à quatre étages, poids mesurés, aperçu chiffré, listes de paires) ne
// tient PAS dans le panneau latéral de l'éditeur de workflow — quatre cents pixels. Et il
// ne s'y replie pas tout seul : les points de rupture Tailwind se calculent sur la largeur
// de la FENÊTRE, pas du conteneur. Sur un écran large, `sm:` s'applique donc à l'intérieur
// du panneau étroit, et les trois colonnes de la liste des paires s'écrasent jusqu'à
// afficher une lettre par ligne.
//
// Le panneau garde donc l'essentiel — le suivi visé, ce que le node fera, un résumé du
// réglage — et l'atelier s'ouvre en MODALE, où il a la largeur qu'il lui faut. C'est
// l'inverse du choix fait dans le module « Veille tarifaire », où les règles occupent une
// page : là-bas l'espace existe, ici il n'existe pas.
import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, CircleDot, Loader2, RotateCcw, SlidersHorizontal, X } from 'lucide-react'
import { useWorkflowStore } from '../persistence/workflow.store'
import { deriveWatchId } from '@/features/priceWatch/sourceSites'
import { usePairingRules } from '@/features/priceWatch/usePairingRules'
import { RulesWorkbench } from '@/features/priceWatch/rules/RulesWorkbench'
import { configToRules, rulesToConfig, type PairingRulesConfig as Cfg } from '@/features/priceWatch/pairingRulesConfig'
import { DEFAULT_PAIRING_RULES, MATCH_EVIDENCES, rulesDifferFromDefault, type PairingRules } from '@/features/priceWatch/catalog/pairingRules'
import { intlLocale, t, useTranslation } from '@/lib/i18n'

/** Ce que le réglage change, en une ligne — pour juger sans ouvrir. */
function summaryOf(rules: PairingRules): string {
  if (!rulesDifferFromDefault(rules)) return t('node.pairing-rules.summaryDefault')
  const parts: string[] = []
  const off = MATCH_EVIDENCES.filter((e) => !rules.evidence[e]).length
  if (off > 0) parts.push(t('node.pairing-rules.summaryEvidenceOff', { count: off }))
  if (!rules.familyVeto) parts.push(t('node.pairing-rules.summaryNoFamilyVeto'))
  if (rules.unifyDirectedVetoes) parts.push(t('node.pairing-rules.summaryUnified'))
  const extra = Object.keys(rules.extraFamilies).length
  if (extra > 0) parts.push(t('node.pairing-rules.summaryExtraFamilies', { count: extra }))
  return parts.length > 0 ? parts.join(' · ') : t('node.pairing-rules.summaryTuned')
}

export function PairingRulesConfigPanel({ config, onChange }: {
  config: Cfg
  onChange: (next: Cfg) => void
  availableColumns?: string[]
}) {
  const { locale } = useTranslation()
  const workflowId = useWorkflowStore((s) => s.current?.id)
  // ⚠ Statut d'enregistrement REPRIS de l'en-tête de l'éditeur, pas réinventé : la fenêtre
  // recouvre justement le badge qui le portait, et rien n'y disait si le réglage était
  // parti en base. Sur un formulaire qu'on quitte d'un clic sur le fond, c'est la seule
  // chose qui distingue « c'est enregistré » de « je viens de tout perdre ».
  const dirty = useWorkflowStore((s) => s.dirty)
  const saving = useWorkflowStore((s) => s.saving)
  const lastSavedAt = useWorkflowStore((s) => s.lastSavedAt)
  // Même dérivation qu'au runtime : mesurer sur un AUTRE suivi que celui où les règles
  // s'appliqueront donnerait des poids qui ne veulent rien dire.
  const watchId = deriveWatchId(config.watchId, workflowId ?? undefined)
  // Règles ENREGISTRÉES pour ce suivi : c'est la référence à laquelle comparer la config
  // du node — « voici ce que ce node changera quand il tournera ».
  const stored = usePairingRules(watchId)
  const [open, setOpen] = useState(false)

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

      <button
        type="button" onClick={() => setOpen(true)}
        className="w-full flex items-center justify-center gap-2 text-xs rounded px-3 py-2 border
          border-[#6366f1]/40 bg-[#6366f1]/10 text-white hover:bg-[#6366f1]/20 transition-colors"
      >
        <SlidersHorizontal className="w-3.5 h-3.5" />
        {t('node.pairing-rules.openWorkbench')}
      </button>
      <p className="text-[11px] text-white/40 leading-snug">
        {t('node.pairing-rules.currentSummary', { summary: summaryOf(rules) })}
      </p>

      {open && createPortal(
        // Fermeture libre : contrairement à l'écran de la veille, il n'y a pas de brouillon
        // à perdre — chaque changement va directement dans la config du node, que
        // l'enregistrement automatique du workflow persiste.
        <div
          className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-start justify-center p-4 sm:p-8 overflow-auto"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-[1400px] bg-surface-2 rounded-lg border border-white/10"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="sticky top-0 z-10 bg-background px-5 py-3 border-b border-white/10 flex items-start justify-between gap-3 rounded-t-lg">
              <div>
                <h2 className="text-sm font-semibold text-white">{t('pw.rules.title')}</h2>
                <p className="text-[11px] text-white/45">{t('node.pairing-rules.dialogNote', { watchId })}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {saving ? (
                  <span className="text-xs text-white/50 flex items-center gap-1.5">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> {t('wfe.saving')}
                  </span>
                ) : dirty ? (
                  <span className="text-xs text-amber-400 flex items-center gap-1.5" title={t('wfe.unsaved')}>
                    <CircleDot className="w-3.5 h-3.5" /> {t('wfe.unsaved.label')}
                  </span>
                ) : (
                  <span
                    className="text-xs text-emerald-400 flex items-center gap-1.5"
                    title={lastSavedAt
                      ? t('wfe.savedAt', { time: new Date(lastSavedAt).toLocaleTimeString(intlLocale(locale)) })
                      : t('wfe.upToDate')}
                  >
                    <Check className="w-3.5 h-3.5" /> {t('wfe.savedShort')}
                  </span>
                )}
                {/* La sortie de secours manquait ici : le node pouvait être réglé sans
                    moyen de revenir à l'état d'origine autrement qu'en remettant chaque
                    champ à la main. Contrairement à l'écran de la veille, elle applique
                    DIRECTEMENT — il n'y a pas de brouillon dans un panneau de node. */}
                <button
                  type="button" onClick={() => setRules(DEFAULT_PAIRING_RULES)}
                  disabled={!rulesDifferFromDefault(rules)}
                  className="text-xs rounded px-3 py-1.5 border border-white/10 text-white/60
                    hover:text-white hover:border-white/25 transition-colors
                    disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <RotateCcw className="w-3 h-3 inline mr-1" />{t('node.pairing-rules.resetToDefault')}
                </button>
                <button
                  type="button" onClick={() => setOpen(false)} title={t('pw.audit.close')}
                  className="p-1.5 rounded bg-well border border-white/10 text-white/60 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </header>
            <div className="p-5">
              <RulesWorkbench watchId={watchId} rules={rules} onChange={setRules} baseline={stored.rules} />
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
