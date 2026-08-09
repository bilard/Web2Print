// PAGE « Règles d'appariement » : le pilotage du moteur de veille, sur son propre écran.
//
// ⚠ Ni une section du tableau de bord, ni une modale. Sous les chiffres, elle s'imposait à
// chaque consultation du comparatif alors qu'on n'y vient que pour agir. En modale, elle
// était pire : un formulaire de quatre étages avec son aperçu chiffré ne se pilote pas
// dans une boîte posée au-dessus de l'écran qu'elle recouvre.
//
// Elle remplace donc le tableau de bord dans l'espace du module, avec un retour explicite.
// Le suivi actif, le concurrent mesuré et le brouillon survivent au va-et-vient : c'est
// tout l'intérêt de rester dans le module plutôt que de changer de route.
import { useEffect, useState } from 'react'
import { ArrowLeft, Info, RotateCcw, Save } from 'lucide-react'
import { usePairingRules } from '../usePairingRules'
import { DEFAULT_PAIRING_RULES, rulesDifferFromDefault, type PairingRules } from '../catalog/pairingRules'
import { RulesWorkbench } from './RulesWorkbench'
import { useTranslation } from '@/lib/i18n'
import { toast } from 'sonner'

const btnCls = 'text-xs rounded px-3 py-1.5 border transition-colors disabled:opacity-40 disabled:cursor-not-allowed'

export function PairingRulesPage(
  { watchId, onBack }: { watchId: string | null; onBack: () => void },
) {
  const { t } = useTranslation()
  const stored = usePairingRules(watchId)
  const [draft, setDraft] = useState<PairingRules>(DEFAULT_PAIRING_RULES)
  const [saving, setSaving] = useState(false)

  // Le brouillon suit ce qui est ENREGISTRÉ tant qu'on n'a rien touché : un run qui
  // réécrit les règles pendant qu'on regarde l'écran doit se voir.
  useEffect(() => { if (!stored.loading) setDraft(stored.rules) }, [stored.loading, stored.rules])

  const dirty = JSON.stringify(draft) !== JSON.stringify(stored.rules)

  // Quitter avec un réglage non enregistré l'effacerait sans un mot : sur un formulaire de
  // cette taille, c'est un quart d'heure de travail. On refuse et on le dit.
  const leave = () => {
    if (dirty) { toast.warning(t('pw.rules.closeDirty')); return }
    onBack()
  }

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

  return (
    <div className="space-y-4 pt-8">
      <header className="sticky top-0 z-20 -mx-8 px-8 pt-8 pb-4 bg-background border-b border-white/[0.06] flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <button
            type="button" onClick={leave}
            className="text-xs text-white/50 hover:text-white flex items-center gap-1.5 mb-1.5 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />{t('pw.rules.back')}
          </button>
          <h1 className="text-xl font-semibold text-white">{t('pw.rules.title')}</h1>
          <p className="text-sm text-white/50 max-w-4xl flex items-start gap-1.5">
            {t('pw.rules.introShort')}
            <span title={t('pw.rules.intro')} className="inline-flex shrink-0 cursor-help mt-1">
              <Info className="w-3.5 h-3.5 text-white/25 hover:text-white/60" />
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
        </div>
      </header>

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
  )
}
