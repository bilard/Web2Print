// Écran « Règles d'appariement » : le pilotage du moteur de veille, à côté des chiffres
// qu'il produit. Les mêmes règles que le node de workflow — même document Firestore —
// pour que régler ici et régler dans le flux soient le même geste.
import { useEffect, useState } from 'react'
import { Info, RotateCcw, Save } from 'lucide-react'
import { usePairingRules } from '../usePairingRules'
import { DEFAULT_PAIRING_RULES, rulesDifferFromDefault, type PairingRules } from '../catalog/pairingRules'
import { RulesWorkbench } from './RulesWorkbench'
import { useTranslation } from '@/lib/i18n'
import { toast } from 'sonner'

const btnCls = 'text-xs rounded px-3 py-1.5 border transition-colors disabled:opacity-40 disabled:cursor-not-allowed'

export function PairingRulesPanel({ watchId }: { watchId: string | null }) {
  const { t } = useTranslation()
  const stored = usePairingRules(watchId)
  const [draft, setDraft] = useState<PairingRules>(DEFAULT_PAIRING_RULES)
  const [saving, setSaving] = useState(false)

  // Le brouillon suit ce qui est ENREGISTRÉ tant qu'on n'a rien touché : un run qui
  // réécrit les règles pendant qu'on regarde l'écran doit se voir.
  useEffect(() => { if (!stored.loading) setDraft(stored.rules) }, [stored.loading, stored.rules])

  const dirty = JSON.stringify(draft) !== JSON.stringify(stored.rules)

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
    <section data-pw-section="rules" className="space-y-2">
      <header className="flex flex-wrap items-start justify-between gap-3">
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

      {/* Clé partagée avec l'éditeur de workflow : même situation, même phrase. */}
      {dirty && <p className="text-xs text-amber-400">{t('wfe.unsaved')}</p>}

      <RulesWorkbench watchId={watchId} rules={draft} onChange={setDraft} baseline={stored.rules} />
    </section>
  )
}
