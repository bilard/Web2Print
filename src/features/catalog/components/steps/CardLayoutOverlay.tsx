// src/features/catalog/components/steps/CardLayoutOverlay.tsx
// Overlay d'édition de la disposition libre : glisse chaque objet (data-object-id)
// et redimensionne via 8 poignées — tout stocké en % de la carte (dynamique).
import { useLayoutEffect, useMemo, useState, type RefObject, type PointerEvent as ReactPointerEvent } from 'react'
import type { CardBox, CardObjectId, CatalogCardStyle } from '../../catalogTypes'
import { CARD_OBJECT_IDS } from '../../catalogTypes'
import { FLOW_CHAIN, freeLayoutBox, isMagnetized } from '../pages/freeLayout'

type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
const dirX = (h: Handle) => (h.includes('e') ? 1 : h.includes('w') ? -1 : 0)
const dirY = (h: Handle) => (h.includes('s') ? 1 : h.includes('n') ? -1 : 0)
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const r1 = (v: number) => Math.round(v * 10) / 10

interface Rect { left: number; top: number; width: number; height: number }

interface Props {
  cardRef: RefObject<HTMLDivElement | null>
  style: CatalogCardStyle
  onChange: (id: CardObjectId, box: CardBox) => void
  /** Notifie l'objet sélectionné (clic/drag) — pour mettre en évidence le curseur correspondant côté panneau. */
  onSelect?: (id: CardObjectId | null) => void
}

export function CardLayoutOverlay({ cardRef, style, onChange, onSelect }: Props) {
  const [sel, setSel] = useState<CardObjectId | null>(null)
  // Mode LIAISON : le prochain clic sur un autre bloc le désigne comme CIBLE du bloc sélectionné.
  const [linking, setLinking] = useState(false)
  const [tick, setTick] = useState(0) // incrémenté après drag/resize → force le recalcul des rects (dépendance du useMemo ci-dessous)
  useLayoutEffect(() => { setTick((t) => t + 1) }, [style])

  const rectOf = (id: CardObjectId): Rect | null => {
    const card = cardRef.current
    const el = card?.querySelector<HTMLElement>(`[data-object-id="${id}"]`)
    if (!card || !el) return null
    const cr = card.getBoundingClientRect(), er = el.getBoundingClientRect()
    if (!cr.width || !cr.height) return null
    return { left: ((er.left - cr.left) / cr.width) * 100, top: ((er.top - cr.top) / cr.height) * 100, width: (er.width / cr.width) * 100, height: (er.height / cr.height) * 100 }
  }
  // Rects (en %) de tous les objets, recalculés à chaque changement de style ou après drag/resize (tick).
  const rects = useMemo(() => {
    const map: Partial<Record<CardObjectId, Rect>> = {}
    for (const id of CARD_OBJECT_IDS) {
      const r = rectOf(id)
      if (r) map[id] = r
    }
    return map
  }, [tick, style])

  const cardPx = () => { const c = cardRef.current?.getBoundingClientRect(); return { w: c?.width || 1, h: c?.height || 1 } }

  const startDrag = (e: ReactPointerEvent, id: CardObjectId) => {
    // Mode liaison actif : ce clic désigne la CIBLE (soudure à sa droite), pas une sélection.
    if (linking && sel && id !== sel) {
      e.preventDefault(); e.stopPropagation()
      onChange(sel, { ...freeLayoutBox(sel, style), link: id, ax: 'l', ay: 't' })
      setLinking(false)
      return
    }
    setLinking(false)
    e.preventDefault(); e.stopPropagation(); setSel(id); onSelect?.(id)
    const b = freeLayoutBox(id, style)
    const { w, h } = cardPx()
    // Glisser un bloc ANCRÉ (droite/bas/centre) le repasse en placement classique
    // gauche/haut, en partant de sa position VISIBLE (rect DOM) — prévisible.
    const r0 = rectOf(id)
    const bx = (b.ax ?? 'l') !== 'l' && r0 ? r1(r0.left) : b.x
    const by = (b.ay ?? 't') !== 't' && r0 ? r1(r0.top) : b.y
    const sx = e.clientX, sy = e.clientY
    const move = (ev: PointerEvent) => {
      // Glisser rompt liaison et ancrages : placement manuel gauche/haut.
      onChange(id, { ...b, ax: 'l', ay: 't', link: undefined, x: clamp(r1(bx + ((ev.clientX - sx) / w) * 100), 0, 100), y: clamp(r1(by + ((ev.clientY - sy) / h) * 100), 0, 100) })
    }
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); setTick((t) => t + 1) }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }

  // Resize = LARGEUR + HAUTEUR indépendantes (en % de la carte). Poignées E/O →
  // largeur, N/S → hauteur, coins → les deux. Les poignées O/N déplacent aussi
  // l'origine (x/y) pour que l'arête OPPOSÉE reste fixe (comportement attendu).
  const resize = (e: ReactPointerEvent, hnd: Handle) => {
    e.preventDefault(); e.stopPropagation()
    if (!sel) return
    const el = cardRef.current?.querySelector<HTMLElement>(`[data-object-id="${sel}"]`)
    if (!el) return
    const b = freeLayoutBox(sel, style)
    const { w: cardW, h: cardH } = cardPx()
    const er = el.getBoundingClientRect()
    const startW = b.w ?? r1((er.width / cardW) * 100)   // largeur de départ (%)
    const startH = b.h ?? r1((er.height / cardH) * 100)  // hauteur de départ (%)
    const dx = dirX(hnd), dy = dirY(hnd)
    const sx = e.clientX, sy = e.clientY
    const move = (ev: PointerEvent) => {
      const ddx = ((ev.clientX - sx) / cardW) * 100
      const ddy = ((ev.clientY - sy) / cardH) * 100
      const next: CardBox = { ...b }
      delete next.sc  // on passe au modèle largeur/hauteur : plus d'échelle uniforme
      if (dx > 0) next.w = clamp(r1(startW + ddx), 4, 100)
      else if (dx < 0) { next.w = clamp(r1(startW - ddx), 4, 100); next.x = clamp(r1(b.x + (startW - next.w)), 0, 100) }
      if (dy > 0) next.h = clamp(r1(startH + ddy), 2, 100)
      else if (dy < 0) { next.h = clamp(r1(startH - ddy), 2, 100); next.y = clamp(r1(b.y + (startH - next.h)), 0, 100) }
      onChange(sel, next)
    }
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); setTick((t) => t + 1) }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }

  const selRect = sel ? rects[sel] : null
  // Aimantation PAR BLOC : bouton 🧲 sur le bloc texte sélectionné (chaîne de flux).
  const selMagnet = sel && FLOW_CHAIN.includes(sel) ? isMagnetized(freeLayoutBox(sel, style), style) : null
  const toggleMagnet = () => {
    if (!sel) return
    const b = freeLayoutBox(sel, style)
    onChange(sel, { ...b, m: !isMagnetized(b, style) })
  }
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 20 }}>
      {CARD_OBJECT_IDS.map((id) => {
        const r = rects[id]
        if (!r) return null
        return (
          <div key={id} onPointerDown={(e) => startDrag(e, id)} title={id}
            style={{ position: 'absolute', left: `${r.left}%`, top: `${r.top}%`, width: `${r.width}%`, height: `${r.height}%`, cursor: 'move', outline: sel === id ? '2px solid #6366f1' : '1px dashed rgba(99,102,241,.4)' }} />
        )
      })}
      {sel && selRect && selMagnet != null && (
        <div style={{ position: 'absolute', left: `${selRect.left}%`, top: `calc(${selRect.top}% - 24px)`, zIndex: 22, display: 'inline-flex', gap: 4 }}>
          <button type="button" onPointerDown={(e) => { e.preventDefault(); e.stopPropagation() }} onClick={toggleMagnet}
            title={selMagnet
              ? 'Aimanté : collé au bloc texte du dessus selon son contenu (cliquer pour détacher)'
              : 'Libre : reste exactement où vous le posez (cliquer pour aimanter)'}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 999,
              fontSize: 10, fontWeight: 700, cursor: 'pointer', border: '1px solid #6366f1',
              background: selMagnet ? '#6366f1' : '#fff', color: selMagnet ? '#fff' : '#6366f1' }}>
            🧲 {selMagnet ? 'Aimanté' : 'Libre'}
          </button>
          {/* LIAISON entre blocs : soude ce bloc à DROITE d'un autre (il le suit partout). */}
          <button type="button" onPointerDown={(e) => { e.preventDefault(); e.stopPropagation() }}
            onClick={() => {
              const b = freeLayoutBox(sel, style)
              if (b.link) onChange(sel, { ...b, link: undefined })
              else setLinking((v) => !v)
            }}
            title={freeLayoutBox(sel, style).link
              ? 'Lié : soudé à droite de sa cible, la suit partout (cliquer pour délier)'
              : linking ? 'Cliquez maintenant le bloc CIBLE dans l\'aperçu' : 'Lier ce bloc à un autre (soudé à sa droite)'}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 999,
              fontSize: 10, fontWeight: 700, cursor: 'pointer', border: '1px solid #6366f1',
              background: freeLayoutBox(sel, style).link ? '#6366f1' : linking ? '#eef2ff' : '#fff',
              color: freeLayoutBox(sel, style).link ? '#fff' : '#6366f1' }}>
            🔗 {freeLayoutBox(sel, style).link ? 'Lié ✕' : linking ? 'Cliquez la cible…' : 'Lier à…'}
          </button>
        </div>
      )}
      {sel && selRect && HANDLES.map((hnd) => {
        const cx = selRect.left + (dirX(hnd) < 0 ? 0 : dirX(hnd) > 0 ? selRect.width : selRect.width / 2)
        const cy = selRect.top + (dirY(hnd) < 0 ? 0 : dirY(hnd) > 0 ? selRect.height : selRect.height / 2)
        return (
          <div key={hnd} onPointerDown={(e) => resize(e, hnd)}
            style={{ position: 'absolute', left: `calc(${cx}% - 6px)`, top: `calc(${cy}% - 6px)`, width: 12, height: 12, background: '#fff', border: '2px solid #6366f1', borderRadius: '50%', cursor: 'pointer', zIndex: 21 }} />
        )
      })}
    </div>
  )
}
