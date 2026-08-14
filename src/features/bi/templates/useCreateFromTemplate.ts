// Création d'un tableau de bord depuis un modèle. IDEMPOTENTE par construction, et jamais
// silencieuse.
//
// ⚠⚠ L'identifiant du document est DÉTERMINISTE (`templateDocId`) : deux clics — ou deux
// collègues du même espace de travail — retombent sur le même document. La carte le sait
// avant le clic (`existingId`) et propose alors d'OUVRIR, jamais de créer un doublon.
//
// ⚠⚠ Aucune écriture muette : `useWorkspaceUid` vaut `null` tant que l'accès n'est pas
// hydraté, et un clic sans effet se lit comme un bouton cassé (cf. `NewDashboardButton`).
import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import { useAccessStore } from '@/stores/access.store'
import { useAuthStore } from '@/stores/auth.store'
import { useWorkspaceUid } from '@/features/access/useWorkspaceUid'
import { useTranslation } from '@/lib/i18n'
import { useDashboards } from '../hooks/useDashboards'
import { saveDashboard } from '../store/dashboardsStore'
import { buildDashboard, templateDocId } from './index'
import type { DashboardTemplate, TemplateKey } from './types'

export interface TemplateCreation {
  /** Identifiant du tableau de bord déjà créé pour ce modèle, s'il existe. */
  existingId: (tpl: DashboardTemplate) => string | null
  create: (tpl: DashboardTemplate) => Promise<void>
  /** Modèle en cours d'écriture : la carte désactive son bouton le temps de l'aller-retour. */
  busy: TemplateKey | null
}

export function useCreateFromTemplate(onOpen: (id: string) => void): TemplateCreation {
  const { t } = useTranslation()
  const uid = useWorkspaceUid()
  const user = useAuthStore((s) => s.user)
  // ⚠ `accountId` vaut '' quand aucune société n'est rattachée — `??` ne le rattraperait pas.
  const accountId = useAccessStore((s) => s.accountId) || 'default'
  const items = useDashboards()
  const [busy, setBusy] = useState<TemplateKey | null>(null)

  const existingId = useCallback((tpl: DashboardTemplate): string | null => {
    const id = templateDocId(tpl.key)
    return items.some((d) => d.id === id) ? id : null
  }, [items])

  const create = useCallback(async (tpl: DashboardTemplate) => {
    const id = templateDocId(tpl.key)
    // Déjà là : on ouvre. Réécrire écraserait les tuiles que l'utilisateur y a ajoutées.
    if (items.some((d) => d.id === id)) { toast.info(t('bi.tpl.exists')); onOpen(id); return }
    if (!uid || !user) { toast.error(t('bi.save.failed')); return }
    setBusy(tpl.key)
    try {
      const name = t(tpl.nameKey)
      // ⚠ La traduction est INJECTÉE, résolue au clic : les titres de tuiles sont persistés,
      // ils doivent naître dans la langue de lecture du moment (surcharges de compte incluses).
      await saveDashboard(uid, buildDashboard(tpl, {
        accountId, workspaceUid: uid, createdBy: user.uid, now: Date.now(), name, translate: t,
      }))
      toast.success(t('bi.tpl.created', { name }))
      onOpen(id)
    } catch (e) {
      // ⚠ Tout refus est VISIBLE : une écriture rejetée par les règles Firestore échoue
      // sinon en silence, et l'écran laisse croire que le modèle a été créé.
      toast.error(e instanceof Error ? e.message : t('bi.save.failed'))
    } finally {
      setBusy(null)
    }
  }, [accountId, items, onOpen, t, uid, user])

  return { existingId, create, busy }
}
