import { Fragment, useState } from 'react'
import { Eye, EyeOff, Type, Square, ImageIcon, Circle, Search, ChevronRight, ChevronDown } from 'lucide-react'
import { useRetailPromoStore } from './retailPromo.store'
import { extractPromoFields } from './promoMapping'
import { toCardData } from './promoCardData'
import type { PromoBlockId, RetailCardData } from './promoCardTypes'
import { type TranslationKey, t } from '@/lib/i18n'

type IconKind = 'block' | 'text' | 'image' | 'badge'
interface LayerNode { id: PromoBlockId; labelKey: TranslationKey; isText: boolean; icon: IconKind; children?: LayerNode[] }

// Arbre des calques par GROUPE (conteneur déco → ses sous-éléments), reflétant
// la structure de la carte. Ordre haut → bas.
const TREE: LayerNode[] = [
  { id: 'header', labelKey: 'rp.layer.header', isText: false, icon: 'block', children: [
    { id: 'category', labelKey: 'rp.layer.category', isText: true, icon: 'text' },
    { id: 'name', labelKey: 'rp.layer.name', isText: true, icon: 'text' },
    { id: 'brand', labelKey: 'rp.layer.brand', isText: true, icon: 'text' },
    { id: 'description', labelKey: 'rp.layer.description', isText: true, icon: 'text' },
  ] },
  { id: 'image', labelKey: 'rp.layer.image', isText: false, icon: 'image', children: [
    { id: 'badge', labelKey: 'rp.layer.badge', isText: false, icon: 'badge' },
  ] },
  { id: 'price', labelKey: 'rp.layer.price', isText: false, icon: 'block', children: [
    { id: 'priceLabel', labelKey: 'rp.layer.priceLabel', isText: true, icon: 'text' },
    { id: 'priceWas', labelKey: 'rp.layer.priceWas', isText: true, icon: 'text' },
    { id: 'unitPrice', labelKey: 'rp.layer.unitPrice', isText: true, icon: 'text' },
    { id: 'priceNow', labelKey: 'rp.layer.priceNow', isText: true, icon: 'text' },
  ] },
  { id: 'footer', labelKey: 'rp.layer.footer', isText: true, icon: 'text' },
  { id: 'details', labelKey: 'rp.layer.details', isText: false, icon: 'block' },
]

const flatten = (nodes: LayerNode[]): LayerNode[] => nodes.flatMap((n) => [n, ...(n.children ? flatten(n.children) : [])])
const ALL = flatten(TREE)
const GROUP_IDS = TREE.filter((n) => n.children?.length).map((n) => n.id)

const Icon = ({ k }: { k: IconKind }) =>
  k === 'text' ? <Type className="h-3.5 w-3.5" /> : k === 'image' ? <ImageIcon className="h-3.5 w-3.5" /> : k === 'badge' ? <Circle className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />

/** Panneau Calques : ARBRE par groupe (bandeau → sous-éléments). Chaque calque
 *  montre la valeur réelle du produit affiché (même source que l'aperçu) pour
 *  distinguer d'un coup d'œil deux blocs de même type. */
export function PromoLayersPanel() {
  const { config, selectedKey, setSelectedKey, setHidden, rawRows, rawColumns, fieldMap, currentIndex, textOverride, customFields } = useRetailPromoStore()
  const [q, setQ] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set(GROUP_IDS)) // groupes repliés par défaut

  // Carte du produit courant (sans surcharges) + surcharges texte par fiche.
  const safe = rawRows.length ? Math.min(currentIndex, rawRows.length - 1) : 0
  const row = rawRows[safe]
  const card: RetailCardData | null = row
    ? toCardData(
        extractPromoFields(row, rawColumns, fieldMap, customFields),
        { now: config.styles?.priceNow?.euroSep, was: config.styles?.priceWas?.euroSep },
        customFields,
      )
    : null
  const tov = textOverride[safe] ?? {}

  // Valeur affichée d'un calque (déco-conteneurs = vide). Reflète l'aperçu, surcharges incluses.
  const blockValue = (id: PromoBlockId): string => {
    if (!card) return ''
    switch (id) {
      case 'category': return tov.category ?? card.category ?? ''
      case 'name': return tov.name ?? card.name ?? ''
      case 'brand': return tov.brand ?? [card.brand, card.ref, card.ean].filter(Boolean).join(' · ')
      case 'description': return tov.description ?? card.description ?? ''
      case 'priceLabel': return tov.priceLabel ?? 'Prix promo'
      case 'priceWas': return card.priceWas ?? ''
      case 'priceNow': return card.priceNow ?? ''
      case 'unitPrice': return card.unitPrice ?? ''
      case 'footer': return [card.enseigne, card.validite, card.mentions].filter(Boolean).join(' — ')
      case 'badge': return card.remiseLabel ?? ''
      case 'details': return card.details.join(' · ')
      case 'image': {
        const u = card.imageUrl
        if (!u) return ''
        if (u.startsWith('data:') || u.startsWith('blob:')) return 'Image intégrée'
        if (/drive\.google|googleusercontent/.test(u)) return 'Image Drive'
        const file = u.split('?')[0].split(/[/\\]/).pop() || ''
        return /^(view|preview|edit)$/i.test(file) ? 'Image' : file
      }
      default: return '' // header, price : conteneurs déco sans texte propre
    }
  }

  const needle = q.toLowerCase().trim()
  const matches = (n: LayerNode) => t(n.labelKey).toLowerCase().includes(needle) || blockValue(n.id).toLowerCase().includes(needle)

  // Accordéon : un seul groupe ouvert à la fois. `collapsed` = groupes fermés.
  // Ouvrir id → fermer tous les autres ; recliquer le groupe ouvert → tout fermé.
  const toggle = (id: string) => setCollapsed((s) =>
    s.has(id) ? new Set(GROUP_IDS.filter((g) => g !== id)) : new Set(GROUP_IDS))

  const renderRow = (n: LayerNode, depth: number, hasChildren: boolean, open: boolean) => {
    const hidden = !!config.hidden?.[n.id]
    const active = selectedKey === n.id
    const value = blockValue(n.id)
    return (
      <div key={n.id} onClick={() => { setSelectedKey(n.id); if (hasChildren) toggle(n.id) }} style={{ paddingLeft: 8 + depth * 16 }}
        className={`flex cursor-pointer items-center gap-1.5 rounded py-1.5 pr-2 text-sm ${active ? 'bg-[#6366f1]/20 text-white' : 'text-white/70 hover:bg-white/5'}`}>
        {hasChildren
          ? <button onClick={(e) => { e.stopPropagation(); toggle(n.id) }} className="shrink-0 text-white/40 hover:text-white" title={t(open ? 'ui.collapse' : 'ui.expand')}>
              {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </button>
          : <span className="w-3.5 shrink-0" />}
        <span className="text-white/40"><Icon k={n.icon} /></span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate">{t(n.labelKey)}</span>
            {n.isText && <span className="text-[10px] font-bold text-[#818cf8]">Aa</span>}
          </div>
          {value && <div className="truncate text-[11px] leading-tight text-white/40" title={value}>{value}</div>}
        </div>
        <button onClick={(e) => { e.stopPropagation(); setHidden(n.id, !hidden) }} className="shrink-0 text-white/40 hover:text-white" title={hidden ? t('rp.afficher') : t('rp.masquer')}>
          {hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </button>
      </div>
    )
  }

  const renderTree = (n: LayerNode, depth: number) => {
    const hasChildren = !!n.children?.length
    const open = !collapsed.has(n.id)
    return (
      <Fragment key={n.id}>
        {renderRow(n, depth, hasChildren, open)}
        {hasChildren && open && n.children!.map((c) => renderTree(c, depth + 1))}
      </Fragment>
    )
  }

  return (
    <aside className="flex min-h-0 w-56 flex-1 flex-col rounded-xl border border-white/10 bg-surface">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-white">{t('rp.calques')}</h3>
        <button onClick={() => setCollapsed(new Set(GROUP_IDS))}
          className="text-xs text-white/40 hover:text-white" title={t('rp.toutReplier')}>{ALL.length}</button>
      </div>
      <div className="px-3 py-2">
        <div className="flex items-center gap-2 rounded border border-white/10 bg-well px-2 py-1">
          <Search className="h-3.5 w-3.5 text-white/30" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('rp.rechercherNomValeur')} className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/25" />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {needle
          ? ALL.filter(matches).map((n) => renderRow(n, 0, false, false))
          : TREE.map((n) => renderTree(n, 0))}
      </div>
    </aside>
  )
}
