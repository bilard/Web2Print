// Écran du module « Dashboard BI ». Assemblage seulement : le calcul vit dans le moteur,
// la mise en page dans `useLayoutDraft`, la persistance dans le store.
//
// ⚠⚠ `useLayoutDraft` ne resynchronise JAMAIS son `initial` (état de montage figé). L'abonnement
// `useDashboards` étant asynchrone, et l'écran permettant de changer de tableau de bord ET de
// page en cours de session, il faut un remontage FORCÉ à chaque changement de l'un ou de
// l'autre — sinon la mise en page reste celle du précédent. `BiBoard` porte seule le hook et
// est montée ici avec `key={`${id}:${pageId}`}` : changer l'un des deux démonte/remonte le
// composant, et `useState(initial)` repart bien de la mise en page fraîchement désignée.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useDashboards } from '../hooks/useDashboards'
import { useWorkspaceUid } from '@/features/access/useWorkspaceUid'
import { useCan } from '@/features/access/useAccess'
import { BiBoard } from './BiBoard'
import { BoardActionsMenu } from './BoardActionsMenu'
import { NewDashboardButton } from './NewDashboardButton'
import { TemplateGallery } from '../templates/TemplateGallery'
import { TemplatesButton } from '../templates/TemplatesButton'
import { useTranslation } from '@/lib/i18n'
import type { DashboardPage } from '../types'

export function BiScreen() {
  const { t } = useTranslation()
  const uid = useWorkspaceUid()
  const canEdit = useCan('bi.edit')
  const items = useDashboards()
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [pageId, setPageId] = useState<string | null>(null)
  // ⚠⚠ Page ajoutée mais pas encore revenue de la base. Sans elle, le clic sur « + » semble
  // ne rien faire : l'onglet neuf n'existe pas dans `current.pages`, le repli renvoie sur la
  // première page, et la nouvelle apparaît d'un coup une seconde plus tard. C'est le même
  // décalage que `usePendingTiles` corrige pour les tuiles.
  const [pendingPage, setPendingPage] = useState<DashboardPage | null>(null)
  const [editing, setEditing] = useState(false)

  const current = useMemo(
    () => items.find((d) => d.id === currentId) ?? items[0] ?? null,
    [items, currentId],
  )
  // Les pages du document, PLUS celle qu'on vient d'ajouter tant que l'écho ne l'a pas
  // ramenée. Dès qu'il arrive, la page en attente disparaît d'elle-même du composé.
  const pages = useMemo(() => {
    const base = current?.pages ?? []
    const stillMissing = pendingPage && !base.some((p) => p.id === pendingPage.id)
    return stillMissing ? [...base, pendingPage] : base
  }, [current, pendingPage])
  // ⚠ Repli sur la PREMIÈRE page : `pageId` peut désigner une page d'un autre tableau (on
  // vient d'en changer) ou une page supprimée ailleurs. Un `null` figerait l'écran.
  const page = useMemo(
    () => pages.find((p) => p.id === pageId) ?? pages[0] ?? null,
    [pages, pageId],
  )

  // Une page ajoutée s'affiche TOUT DE SUITE : les deux états dans le même gestionnaire,
  // React les regroupe en un seul rendu.
  const onPageCreated = useCallback((p: DashboardPage) => { setPendingPage(p); setPageId(p.id) }, [])

  // ⚠⚠ Le tableau supprimé était peut-être celui qu'on regardait : l'écran désigne le
  // SUIVANT tout de suite, sans attendre l'écho de la base. Le repli `items[0]` de `current`
  // finirait par y arriver, mais entre-temps `currentId` désignerait un document mort et la
  // page affichée serait celle d'un tableau qui n'existe plus.
  const onDeleted = useCallback(() => {
    setCurrentId(items.find((d) => d.id !== current?.id)?.id ?? null)
    setPageId(null)
    setPendingPage(null)
  }, [items, current])

  // « E » bascule le mode, sauf pendant une saisie — et jamais sans le droit d'édition : le
  // segment de `BiModeSwitch` est déjà cadenassé par `canEdit`, le raccourci clavier doit
  // l'être À L'IDENTIQUE, sous peine de faire apparaître les poignées de déplacement (et
  // tenter des écritures vouées au refus Firestore) pour un rôle consultation seule.
  // ⚠ `canEdit` est dans les dépendances À DESSEIN : `useAccessInit` hydrate les permissions de
  // façon ASYNCHRONE, `canEdit` vaut donc `false` au tout premier rendu puis peut devenir `true`
  // ensuite. Un tableau `[]` figerait la fermeture sur ce premier `false` et désactiverait le
  // raccourci en permanence, même pour un éditeur légitime.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!canEdit) return
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.metaKey || e.ctrlKey) return
      if (e.key === 'e' || e.key === 'E') setEditing((v) => !v)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [canEdit])

  // Un droit d'édition révoqué en cours de session (rôle changé par un admin, écouteur temps
  // réel de `useAccessInit`) doit faire retomber l'écran en consultation immédiatement — sinon
  // les poignées resteraient visibles pour un rôle qui vient de perdre le droit de les utiliser.
  useEffect(() => {
    if (!canEdit) setEditing(false)
  }, [canEdit])

  // ⚠ `h-full` + `min-h-0` : l'écran occupe la hauteur offerte par la page et répartit
  // lui-même bandeau / centre / pied. Sans `min-h-0`, le centre refuserait de rétrécir et
  // c'est la PAGE qui s'allongerait, emportant les onglets de pages hors de vue.
  return (
    <div className="h-full min-h-0 flex flex-col bg-background">
      {items.length === 0 ? (
        // ⚠⚠ L'écran vide offre les MODÈLES en premier, et la création vierge en second, plus
        // discrète. Vu chez l'utilisateur : six tableaux « Sans titre » vides, créés l'un après
        // l'autre sans comprendre quoi en faire. Un bouton qui crée du VIDE ne peut pas être le
        // geste le plus visible d'un module qui n'a encore rien à montrer.
        <div className="flex-1 overflow-auto p-8">
          <TemplateGallery onOpen={setCurrentId} canEdit={canEdit} />
          {canEdit && (
            <div className="mt-8 pt-6 border-t border-white/[0.06] flex flex-col items-center gap-2.5">
              <p className="text-[12px] text-white/30">{t('bi.screen.orBlank')}</p>
              <NewDashboardButton onCreated={setCurrentId} />
            </div>
          )}
        </div>
      ) : current && page ? (
        <BiBoard
          key={`${current.id}:${page.id}`}
          current={current}
          page={page}
          pages={pages}
          items={items}
          uid={uid}
          editing={editing}
          onToggleEdit={() => setEditing((v) => !v)}
          canEdit={canEdit}
          onSelect={setCurrentId}
          onSelectPage={setPageId}
          onPageCreated={onPageCreated}
          headerAction={(
            <div className="flex items-center gap-2">
              <TemplatesButton onOpen={setCurrentId} canEdit={canEdit} />
              {canEdit && <NewDashboardButton onCreated={setCurrentId} />}
              <BoardActionsMenu
                board={current} uid={uid} canEdit={canEdit}
                onDuplicated={(id) => { setCurrentId(id); setPageId(null) }}
                onDeleted={onDeleted}
              />
            </div>
          )}
        />
      ) : null}
    </div>
  )
}
