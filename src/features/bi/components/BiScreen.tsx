// Écran du module « Dashboard BI ». Assemblage seulement : le calcul vit dans le moteur,
// la mise en page dans `useLayoutDraft`, la persistance dans le store.
//
// ⚠⚠ `useLayoutDraft` ne resynchronise JAMAIS son `initial` (état de montage figé). L'abonnement
// `useDashboards` étant asynchrone, et le sélecteur permettant de changer de tableau de bord en
// cours de session, il faut un remontage FORCÉ à chaque changement de tableau de bord — sinon la
// mise en page reste celle du précédent. `BiBoard` porte seule le hook et est montée ici avec
// `key={current.id}` : changer d'id démonte/remonte le composant, `useState(initial)` repart donc
// bien de la mise en page du tableau de bord fraîchement sélectionné.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useDashboards } from '../hooks/useDashboards'
import { useWorkspaceUid } from '@/features/access/useWorkspaceUid'
import { useCan } from '@/features/access/useAccess'
import { BiBoard } from './BiBoard'
import { NewDashboardButton } from './NewDashboardButton'
import { useTranslation } from '@/lib/i18n'

export function BiScreen() {
  const { t } = useTranslation()
  const uid = useWorkspaceUid()
  const canEdit = useCan('bi.edit')
  const items = useDashboards()
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [width, setWidth] = useState(1200)
  const boxRef = useRef<HTMLDivElement>(null)

  const current = useMemo(
    () => items.find((d) => d.id === currentId) ?? items[0] ?? null,
    [items, currentId],
  )

  // La grille exige une largeur en pixels : on la mesure et on la suit.
  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // « E » bascule le mode, sauf pendant une saisie — et jamais sans le droit d'édition : le
  // bouton de `BiToolbar` est déjà cadenassé par `canEdit`, le raccourci clavier doit l'être
  // À L'IDENTIQUE, sous peine de faire apparaître les poignées de déplacement (et tenter des
  // écritures vouées au refus Firestore) pour un rôle consultation seule.
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

  // ⚠ Le `ref` de mesure vit sur un conteneur monté dans TOUS les cas (écran vide inclus) :
  // un `ref` porté seulement par la branche « tableaux de bord présents » resterait `null`
  // tant que la liste (abonnement ASYNCHRONE `useDashboards`) n'a pas rendu son premier
  // élément — l'effet `ResizeObserver` (déps `[]`, ne re-tente jamais) aurait déjà bail
  // silencieusement, et `width` resterait figé au repli `1200` toute la session.
  return (
    <div className="space-y-4" ref={boxRef}>
      {items.length === 0 ? (
        <div className="py-8 text-center space-y-3">
          <p className="text-sm text-white/45">{t('bi.screen.empty')}</p>
          {canEdit && <NewDashboardButton onCreated={setCurrentId} />}
        </div>
      ) : current ? (
        <BiBoard
          key={current.id}
          current={current}
          items={items}
          uid={uid}
          width={width}
          editing={editing}
          onToggleEdit={() => setEditing((v) => !v)}
          canEdit={canEdit}
          onSelect={setCurrentId}
          headerAction={canEdit ? <NewDashboardButton onCreated={setCurrentId} /> : undefined}
        />
      ) : null}
    </div>
  )
}
