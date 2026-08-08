// Fenêtre « Règles d'appariement » : le pilotage du moteur de veille, ISOLÉ.
//
// ⚠ Elle vivait en bas du tableau de bord, sous les chiffres. Deux raisons de l'en sortir :
// c'est un réglage, pas une lecture — on n'y vient que pour agir, alors qu'elle
// s'imposait à chaque consultation du comparatif ; et l'arbre à quatre étages plus son
// aperçu occupaient plus de hauteur que tout le reste de l'écran réuni.
//
// Une modale et non une route : on règle en revenant vérifier ses chiffres, et une
// navigation ferait perdre le suivi actif, le concurrent mesuré et le brouillon en cours.
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Info, RotateCcw, Save, X } from 'lucide-react'
import { usePairingRules } from '../usePairingRules'
import { DEFAULT_PAIRING_RULES, rulesDifferFromDefault, type PairingRules } from '../catalog/pairingRules'
import { RulesWorkbench } from './RulesWorkbench'
import { useTranslation } from '@/lib/i18n'
import { toast } from 'sonner'

const btnCls = 'text-xs rounded px-3 py-1.5 border transition-colors disabled:opacity-40 disabled:cursor-not-allowed'

export function PairingRulesPanel(
  { watchId, onClose }: { watchId: string | null; onClose: () => void },
) {
  const { t } = useTranslation()
  const stored = usePairingRules(watchId)
  const [draft, setDraft] = useState<PairingRules>(DEFAULT_PAIRING_RULES)
  const [saving, setSaving] = useState(false)

  // Le brouillon suit ce qui est ENREGISTRÉ tant qu'on n'a rien touché : un run qui
  // réécrit les règles pendant qu'on regarde l'écran doit se voir.
  useEffect(() => { if (!stored.loading) setDraft(stored.rules) }, [stored.loading, stored.rules])

  const dirty = JSON.stringify(draft) !== JSON.stringify(stored.rules)

  // Échap ferme — sauf si un réglage non enregistré serait perdu en silence.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (dirty) { toast.warning(t('pw.rules.closeDirty')); return }
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dirty, onClose, t])

  const save = async () => {
    setSaving(true)
    try {
      await stored.save(draft)
      toast.success(t('pw.rules.saved'))
    } catch (e) {
      toast.error(t('pw.rules.saveFailed', { message: e instanceof Error ? e.message : String(e) }))
    } finally {
      setSaving(false)
    }
  }

  return createPortal(
    // ⚠ Le clic sur le fond ne ferme PAS quand il y a un brouillon : sur un formulaire de
    // cette taille, un clic à côté effacerait un quart d'heure de réglage sans un mot.
    <div
      className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-start justify-center p-4 sm:p-8 overflow-auto"
      onClick={() => (dirty ? toast.warning(t('pw.rules.closeDirty')) : onClose())}
    >
      <div
        // ⚠ Ancrée EN HAUT, pas centrée verticalement. Centrée, elle se déplaçait de
        // quelques pixels à chaque fois que son contenu changeait de hauteur — l'arrivée
        // des poids mesurés, l'aperçu qui apparaît — et un champ se dérobait sous le
        // curseur au moment du clic. Constaté en la pilotant : trois clics manqués de suite.
        className="w-full max-w-[1400px] bg-surface-2 rounded-lg border border-white/10 relative"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="sticky top-0 z-10 bg-background px-5 py-3 border-b border-white/10 flex flex-wrap items-start justify-between gap-3 rounded-t-lg">
          <div>
            <h2 className="text-sm font-semibold text-white">{t('pw.rules.title')}</h2>
            <p className="text-[11px] text-white/45 max-w-3xl flex items-center gap-1.5">
              {t('pw.rules.introShort')}
              <span title={t('pw.rules.intro')} className="inline-flex shrink-0 cursor-help">
                <Info className="w-3 h-3 text-white/25 hover:text-white/60" />
              </span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Clé partagée avec l'éditeur de workflow : même situation, même phrase. */}
            {dirty && <span className="text-xs text-amber-400">{t('wfe.unsaved')}</span>}
            {/* Le retour aux défauts est un BOUTON et non un discours : c'est la sortie de
                secours quand un réglage a fait plus de mal que de bien.
                ⚠ Il REMPLIT le formulaire, il n'enregistre pas — d'où la condition sur ce
                qui est STOCKÉ. La juger sur le brouillon grisait le bouton dès le clic,
                alors que le document gardait encore les réglages : la remise à zéro avait
                l'air prise en compte sans l'être. */}
            <button
              type="button" onClick={() => setDraft(DEFAULT_PAIRING_RULES)}
              disabled={!rulesDifferFromDefault(stored.rules) && !dirty}
              className={`${btnCls} border-white/10 text-white/60 hover:text-white hover:border-white/25`}
            >
              <RotateCcw className="w-3 h-3 inline mr-1" />{t('pw.rules.resetForm')}
            </button>
            <button
              type="button" onClick={save} disabled={!dirty || saving}
              className={`${btnCls} border-[#6366f1] bg-[#6366f1]/20 text-white hover:bg-[#6366f1]/30`}
            >
              <Save className="w-3 h-3 inline mr-1" />{saving ? t('pw.rules.saving') : t('pw.rules.save')}
            </button>
            <button
              type="button" onClick={() => (dirty ? toast.warning(t('pw.rules.closeDirty')) : onClose())}
              title={t('pw.audit.close')}
              className="p-1.5 rounded bg-well border border-white/10 text-white/60 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </header>

        <div className="p-5 space-y-2">
          {stored.fromDefaults && !stored.loading && (
            <p className="text-[11px] text-white/35">{t('pw.rules.neverSet')}</p>
          )}
          {stored.updatedAt != null && (
            <p className="text-[11px] text-white/35">
              {t('pw.rules.lastWrite', {
                when: new Date(stored.updatedAt).toLocaleString(),
                by: stored.updatedBy === 'node' ? t('pw.rules.byNode') : t('pw.rules.byScreen'),
              })}
            </p>
          )}
          <RulesWorkbench watchId={watchId} rules={draft} onChange={setDraft} baseline={stored.rules} />
        </div>
      </div>
    </div>,
    document.body,
  )
}
