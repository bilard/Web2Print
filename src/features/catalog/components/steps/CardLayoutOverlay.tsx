// src/features/catalog/components/steps/CardLayoutOverlay.tsx
// Overlay d'édition de la disposition libre : glisse chaque objet (data-object-id)
// et redimensionne via 8 poignées — tout stocké en % de la carte (dynamique).
import { useLayoutEffect, useMemo, useState, type RefObject, type PointerEvent as ReactPointerEvent } from 'react'
import type { CardBox, CardObjectId, CatalogCardStyle } from '../../catalogTypes'
import { CARD_OBJECT_IDS } from '../../catalogTypes'
import { FLOW_CHAIN, freeLayoutBox, isMagnetized } from '../pages/freeLayout'
import { OBJ_LABEL } from './CardStyleTypo'

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
  /** Carte LARGE (repli 2 colonnes FREE_WIDE_LAYOUT) — même base que le rendu de la carte. */
  wide?: boolean
  onChange: (id: CardObjectId, box: CardBox) => void
  /** Notifie l'objet sélectionné (clic/drag) — pour mettre en évidence le curseur correspondant côté panneau. */
  onSelect?: (id: CardObjectId | null) => void
  /** Sélection contrôlée par le parent : passer null DÉSÉLECTIONNE (clic hors aperçu, ✕ du panneau). */
  selected?: CardObjectId | null
}

export function CardLayoutOverlay({ cardRef, style, wide = false, onChange, onSelect, selected }: Props) {
  const boxOf = (id: CardObjectId) => freeLayoutBox(id, style, wide)
  const [sel, setSel] = useState<CardObjectId | null>(null)
  // Mode LIAISON : le prochain clic sur un autre bloc le désigne comme CIBLE du bloc sélectionné.
  const [linking, setLinking] = useState(false)
  // Désélection PILOTÉE par le parent (clic hors aperçu, ✕ du panneau).
  useLayoutEffect(() => {
    if (selected === null) { setSel(null); setLinking(false) }
  }, [selected])
  const [tick, setTick] = useState(0) // incrémenté après drag/resize → force le recalcul des rects (dépendance du useMemo ci-dessous)
  useLayoutEffect(() => { setTick((t) => t + 1) }, [style])
  // Changement de VUE (verticale ↔ pleine largeur) : tout se replace → on
  // DÉSÉLECTIONNE (sinon le cadre/poignées restent figés sur l'ancienne position).
  useLayoutEffect(() => { setSel(null); setLinking(false); onSelect?.(null) }, [wide])

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
      // Si la cible (ou sa chaîne) est déjà liée au bloc sélectionné, lier =
      // INVERSER la liaison : on coupe le lien qui reboucle (jamais de cycle,
      // sinon chaque bloc se soude à l'autre et les positions divergent).
      const seen = new Set<CardObjectId>()
      let cur: CardObjectId | undefined = id
      while (cur && !seen.has(cur)) {
        seen.add(cur)
        const b2 = boxOf(cur)
        if (b2.link === sel) {
          const r = rectOf(cur)
          // link:null (pas undefined) : la clé doit SURVIVRE à stripUndefined pour
          // masquer un lien par défaut (unité→réf) au rechargement.
          onChange(cur, { ...b2, link: null, lx: 0, ly: 0, ...(r ? { x: r1(r.left), y: r1(r.top) } : {}) })
          break
        }
        cur = b2.link ?? undefined
      }
      onChange(sel, { ...boxOf(sel), link: id, lx: 0, ly: 0, ax: 'l', ay: 't' })
      setLinking(false)
      return
    }
    setLinking(false)
    e.preventDefault(); e.stopPropagation(); setSel(id); onSelect?.(id)
    const b = boxOf(id)
    const { w, h } = cardPx()
    const sx = e.clientX, sy = e.clientY
    // Bloc LIÉ : le glisser ajuste son DÉCALAGE par rapport au point de soudure —
    // la liaison est CONSERVÉE (il continue de suivre sa cible).
    if (b.link) {
      const lx0 = b.lx ?? 0, ly0 = b.ly ?? 0
      let last = { lx: lx0, ly: ly0 }
      const moveLinked = (ev: PointerEvent) => {
        last = { lx: r1(lx0 + ((ev.clientX - sx) / w) * 100), ly: r1(ly0 + ((ev.clientY - sy) / h) * 100) }
        onChange(id, { ...b, ...last })
      }
      const upLinked = () => {
        window.removeEventListener('pointermove', moveLinked); window.removeEventListener('pointerup', upLinked)
        // SNAP : lâché près du point de soudure → recollé NET (contrainte ferme).
        if (Math.abs(last.lx) < 2.5 && Math.abs(last.ly) < 2.5 && (last.lx !== 0 || last.ly !== 0)) onChange(id, { ...b, lx: 0, ly: 0 })
        setTick((t) => t + 1)
      }
      window.addEventListener('pointermove', moveLinked); window.addEventListener('pointerup', upLinked)
      return
    }
    // Glisser un bloc ANCRÉ (droite/bas/centre) le repasse en placement classique
    // gauche/haut, en partant de sa position VISIBLE (rect DOM) — prévisible, et
    // jamais de position « écart au bord » impossible (bloc sorti par le haut).
    // Pour ré-ancrer : palette d'ancrage (rail gauche de l'aperçu).
    const r0 = rectOf(id)
    const bx = (b.ax ?? 'l') !== 'l' && r0 ? r1(r0.left) : b.x
    const by = (b.ay ?? 't') !== 't' && r0 ? r1(r0.top) : b.y
    const move = (ev: PointerEvent) => {
      onChange(id, { ...b, ax: 'l', ay: 't', x: clamp(r1(bx + ((ev.clientX - sx) / w) * 100), 0, 100), y: clamp(r1(by + ((ev.clientY - sy) / h) * 100), 0, 100) })
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
    const b = boxOf(sel)
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

  // RELATIONS entre blocs — LISIBLES : pas de fil qui traverse la fiche, mais
  // des ÉTIQUETTES appariées par COULEUR (une couleur par parent) : l'enfant
  // porte « → suit X », le parent porte « Parent ».
  const links = CARD_OBJECT_IDS.flatMap((id) => {
    const b = boxOf(id)
    const from = rects[id]
    const to = b.link ? rects[b.link] : null
    return b.link && from && to ? [{ id, target: b.link, from, to }] : []
  })
  const LINK_COLORS = ['#6366f1', '#06b6d4', '#f59e0b', '#ec4899', '#22c55e']
  const parentColor = new Map<CardObjectId, string>()
  for (const l of links) if (!parentColor.has(l.target)) parentColor.set(l.target, LINK_COLORS[parentColor.size % LINK_COLORS.length])

  const selRect = sel ? rects[sel] : null
  // Aimantation PAR BLOC : bouton 🧲 sur le bloc texte sélectionné (chaîne de flux).
  const selMagnet = sel && FLOW_CHAIN.includes(sel) ? isMagnetized(boxOf(sel), style) : null
  // PARENT D'AIMANT du bloc sélectionné : le bloc de flux directement AU-DESSUS
  // (chevauchement horizontal, bord bas le plus proche) — révélé à la sélection
  // pour qu'on voie qui colle sous qui, même sans liaison explicite.
  const magnetParent = (() => {
    if (!sel || !selRect || !selMagnet) return null
    let best: { id: CardObjectId; bottom: number } | null = null
    for (const id of FLOW_CHAIN) {
      if (id === sel) continue
      const r = rects[id]
      if (!r) continue
      const bottom = r.top + r.height
      const overlapH = r.left < selRect.left + selRect.width && selRect.left < r.left + r.width
      if (overlapH && bottom <= selRect.top + 1 && (!best || bottom > best.bottom)) best = { id, bottom }
    }
    return best?.id ?? null
  })()
  const toggleMagnet = () => {
    if (!sel) return
    const b = boxOf(sel)
    onChange(sel, { ...b, m: !isMagnetized(b, style) })
  }
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 20 }}>
      {/* ÉTIQUETTES de relation appariées par couleur (aucun trait sur la fiche) :
          « → suit X » sur l'enfant · « Parent » sur la cible, même teinte. */}
      {links.map(({ id, target, from }) => (
        <span key={`lnk-${id}`} style={{ position: 'absolute', left: `${from.left}%`, top: `${from.top}%`,
          transform: 'translateY(-55%)', zIndex: 23, pointerEvents: 'none', whiteSpace: 'nowrap',
          padding: '1px 7px', borderRadius: 999, fontSize: 9, fontWeight: 800, letterSpacing: .2,
          background: parentColor.get(target), color: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.35)' }}>
          → suit {OBJ_LABEL[target]}
        </span>
      ))}
      {/* Parent d'AIMANT du bloc sélectionné : étiquette sur le bloc du dessus. */}
      {magnetParent && rects[magnetParent] && (
        <span style={{ position: 'absolute', left: `${rects[magnetParent]!.left}%`, top: `${rects[magnetParent]!.top}%`,
          transform: 'translateY(-55%)', zIndex: 23, pointerEvents: 'none', whiteSpace: 'nowrap',
          padding: '1px 7px', borderRadius: 999, fontSize: 9, fontWeight: 800, letterSpacing: .2,
          background: '#6366f1', color: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.35)' }}>
          🧲 Aimanté sous · {OBJ_LABEL[magnetParent]}
        </span>
      )}
      {[...parentColor.entries()].map(([pid, color]) => {
        const r = rects[pid]
        return r ? (
          <span key={`par-${pid}`} style={{ position: 'absolute', left: `${r.left + r.width}%`, top: `${r.top}%`,
            transform: 'translate(-100%, -55%)', zIndex: 23, pointerEvents: 'none', whiteSpace: 'nowrap',
            padding: '1px 7px', borderRadius: 999, fontSize: 9, fontWeight: 800, letterSpacing: .2,
            background: color, color: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.35)' }}>
            ◉ Parent · {OBJ_LABEL[pid]}
          </span>
        ) : null
      })}
      {CARD_OBJECT_IDS.map((id) => {
        const r = rects[id]
        if (!r) return null
        const link = boxOf(id).link
        // Bloc d'une relation (enfant OU parent) : contour teinté de SA couleur.
        const relColor = link ? parentColor.get(link) : parentColor.get(id)
        return (
          <div key={id} onPointerDown={(e) => startDrag(e, id)}
            title={link ? `${OBJ_LABEL[id]} — lié à « ${OBJ_LABEL[link]} » (parent)` : OBJ_LABEL[id]}
            style={{ position: 'absolute', left: `${r.left}%`, top: `${r.top}%`, width: `${r.width}%`, height: `${r.height}%`, cursor: 'move',
              outline: sel === id ? '2px solid #6366f1'
                : id === magnetParent ? '2px solid rgba(99,102,241,.75)'
                : relColor ? `2px dashed ${relColor}` : '1px dashed rgba(99,102,241,.4)' }} />
        )
      })}
      {sel && selRect && (
        <div style={{ position: 'absolute', left: `${selRect.left}%`, top: `calc(${selRect.top}% - 24px)`, zIndex: 22, display: 'inline-flex', gap: 4 }}>
          {/* ROTATION du bloc (contenu compris) — pour TOUS les blocs, par variante. */}
          <label onPointerDown={(e) => e.stopPropagation()}
            title="Rotation du bloc (°) — tourne le bloc et son contenu"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 6px', borderRadius: 999,
              fontSize: 10, fontWeight: 700, border: '1px solid #6366f1', background: '#fff', color: '#6366f1' }}>
            ↻
            <input type="number" min={-180} max={180} step={1} value={boxOf(sel).r ?? 0}
              onChange={(e) => onChange(sel, { ...boxOf(sel), r: Math.max(-180, Math.min(180, Number(e.target.value) || 0)) })}
              style={{ width: 34, border: 'none', outline: 'none', background: 'transparent', color: '#6366f1', fontSize: 10, fontWeight: 700 }} />
            °
          </label>
          {selMagnet != null && (<>
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
              const b = boxOf(sel)
              if (b.link) {
                // Délier SANS faire sauter le bloc : sa position visuelle devient sa
                // position posée. link:null (persistant) masque le lien par défaut.
                const r = rectOf(sel)
                onChange(sel, { ...b, link: null, lx: 0, ly: 0, ...(r ? { x: r1(r.left), y: r1(r.top) } : {}) })
              } else setLinking((v) => !v)
            }}
            title={boxOf(sel).link
              ? 'Lié : soudé à droite de sa cible, la suit partout (cliquer pour délier)'
              : linking ? 'Cliquez maintenant le bloc CIBLE dans l\'aperçu' : 'Lier ce bloc à un autre (soudé à sa droite)'}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 999,
              fontSize: 10, fontWeight: 700, cursor: 'pointer', border: '1px solid #6366f1',
              background: boxOf(sel).link ? '#6366f1' : linking ? '#eef2ff' : '#fff',
              color: boxOf(sel).link ? '#fff' : '#6366f1' }}>
            🔗 {boxOf(sel).link ? 'Lié ✕' : linking ? 'Cliquez la cible…' : 'Lier à…'}
          </button>
          </>)}
          {/* Bloc lié mais DÉCALÉ du point de soudure : recoller net (contrainte ferme). */}
          {(() => {
            const b = boxOf(sel)
            return b.link && ((b.lx ?? 0) !== 0 || (b.ly ?? 0) !== 0) ? (
              <button type="button" onPointerDown={(e) => { e.preventDefault(); e.stopPropagation() }}
                onClick={() => onChange(sel, { ...b, lx: 0, ly: 0 })}
                title="Recoller au point de soudure (annule le décalage du glisser)"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 999,
                  fontSize: 10, fontWeight: 700, cursor: 'pointer', border: '1px solid #6366f1', background: '#fff', color: '#6366f1' }}>
                ⟲ Recoller
              </button>
            ) : null
          })()}
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
