// Aperçu du mail composé par la consigne, SANS envoi.
//
// ⚠ Raison d'être : une consigne se calibre en lisant ce qu'elle produit. Sans aperçu, le
// seul moyen de juger était de lancer le flux entier et d'attendre le mail — donc de ne
// jamais corriger une consigne avant le lendemain matin.
//
// ⚠⚠ Un aperçu COÛTE un appel au modèle, sur les clés de l'utilisateur. Le bouton le dit,
// et rien ne se déclenche sans un clic : pas d'aperçu automatique à la frappe.
import { useState } from 'react'
import { Eye, Loader2, X } from 'lucide-react'
import { getWorkspaceUid } from '@/features/access/useWorkspaceUid'
import { stableId } from '@/features/priceWatch/core'
import { DEFAULT_WATCH_ID } from '@/features/priceWatch/paths'
import { loadPriceEvents } from '@/features/priceWatch/reportStore'
import { eventsOfLastRun } from '@/features/priceWatch/priceEvents'
import { useWorkflowStore } from '../persistence/workflow.store'
import { loadStoredReport } from './priceWatchReport'
import { composeReportHtml } from './priceWatchComposer'
import { useTranslation } from '@/lib/i18n'

export function PriceWatchReportPreview({ prompt, watchIdRaw }: {
  prompt: string
  /** Champ « Suivi » de la carte, tel que saisi — vide = celui du flux ouvert. */
  watchIdRaw: string
}) {
  const { t } = useTranslation()
  const [html, setHtml] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [provider, setProvider] = useState<string | null>(null)

  const run = async () => {
    setBusy(true); setError(null); setHtml(null); setProvider(null)
    try {
      const uid = getWorkspaceUid()
      // Même dérivation que le node : sans saisie, le suivi est celui du flux OUVERT —
      // l'aperçu doit viser exactement la source que le run visera.
      const wfId = useWorkflowStore.getState().current?.id
      const watchId = stableId(watchIdRaw.trim() || wfId || DEFAULT_WATCH_ID)
      const report = uid ? await loadStoredReport(uid, watchId) : null
      if (!report) { setError(t('pw.compose.preview.noReport')); return }
      const moves = eventsOfLastRun(await loadPriceEvents(uid!, watchId).catch(() => []))
      const out = await composeReportHtml(report, prompt.trim(), moves, (i) => setProvider(i.model))
      // `composeReportHtml` rend `null` sur échec — le run retomberait sur le rapport
      // standard, mais en aperçu il faut le DIRE plutôt que d'afficher une page blanche.
      if (!out) { setError(t('pw.compose.preview.failed')); return }
      setHtml(out)
    } catch (e) {
      setError(e instanceof Error ? e.message : t('pw.compose.preview.failed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <button
          type="button" onClick={run} disabled={busy || prompt.trim().length === 0}
          className="text-[11px] rounded px-2 py-1 border border-indigo-400/30 bg-indigo-500/10 text-indigo-200
            hover:bg-indigo-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors
            flex items-center gap-1"
        >
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Eye className="w-3 h-3" />}
          {t('pw.compose.preview.button')}
        </button>
        <span className="text-[10px] text-white/35">{t('pw.compose.preview.cost')}</span>
        {provider && <span className="text-[10px] text-white/30 truncate">{provider}</span>}
      </div>

      {error && <p className="text-[11px] text-rose-300/90">{error}</p>}

      {html && (
        <div className="rounded border border-white/10 overflow-hidden">
          <div className="flex items-center gap-2 px-2 py-1 bg-well">
            <span className="text-[10px] text-white/45 flex-1">{t('pw.compose.preview.title')}</span>
            <button type="button" onClick={() => setHtml(null)} className="text-white/40 hover:text-white">
              <X className="w-3 h-3" />
            </button>
          </div>
          {/* ⚠ En IFRAME cloisonnée (`sandbox` sans `allow-scripts`) : ce HTML sort d'un
              modèle, il ne doit ni exécuter de script, ni voir la page, ni imposer ses
              styles au panneau. C'est aussi plus fidèle — un mail s'affiche seul. */}
          <iframe
            title={t('pw.compose.preview.title')} srcDoc={html} sandbox=""
            className="w-full h-80 bg-[#fff]"
          />
        </div>
      )}
    </div>
  )
}
