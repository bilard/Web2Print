// Une ligne de section du plan : hiérarchie visuelle par niveau, teintée par la
// COULEUR DU CHAPITRE (sélecteur sur la ligne d'univers — texte + fond dégressifs
// sur chaque niveau), densité de grille (UNIVERS seulement — flux continu ;
// « Aléatoire » = densité variée page à page), et TOUS les produits du nœud en
// LISTE compacte (réf + nom tronqué, petit texte — jamais la description),
// cliquables pour marquer ou retirer une vedette. ACCORDÉON à tous les niveaux
// (chevron + clic sur l'intitulé) : l'état de pli vit dans SectionsCard — replier
// un nœud masque ses SOUS-LIGNES et sa liste de produits.
import { ChevronRight } from 'lucide-react'
import { CATALOG_GRIDS, type CatalogDensity, type CatalogSectionPlan, type CatalogTreeNode } from '../../catalogTypes'
import { subtreeProductCount } from '../../catalogTree'
import { LEVEL_STYLES } from './levelStyles'
import { t } from '@/lib/i18n'

const RANDOM_ID = 'random'
/** Alphas hex du fond de ligne par niveau (couleur du chapitre, dégressive). */
const ROW_ALPHA: Record<1 | 2 | 3, string> = { 1: '2E', 2: '1A', 3: '0D' }

interface PlanSectionRowProps {
  node: CatalogTreeNode
  section: CatalogSectionPlan
  products: { id: string; name: string; ref: string }[]
  /** Couleur effective du chapitre parent (override utilisateur ?? palette). */
  chapterColor: string
  onDensity: (density: CatalogDensity) => void
  onToggleFeatured: (rowId: string) => void
  /** Ligne d'univers seulement : changer la couleur du chapitre. */
  onColor?: (color: string) => void
  /** Produit actuellement affiché dans l'aperçu de la fiche. */
  previewId?: string | null
  /** 👁 sur la puce : afficher CE produit dans l'aperçu (test du rendu réel). */
  onPreview?: (rowId: string) => void
  /** Accordéon (état porté par SectionsCard) : nœud déplié + bascule. */
  open: boolean
  onToggle: () => void
  /** Le nœud a des sous-lignes visibles dans la carte (chevron même sans produit direct). */
  hasChildren: boolean
}

export function PlanSectionRow({ node, section, products, chapterColor, onDensity, onToggleFeatured, onColor, previewId, onPreview, open, onToggle, hasChildren }: PlanSectionRowProps) {
  const densityValue = section.randomDensity ? RANDOM_ID : String(section.productsPerPage)
  const st = LEVEL_STYLES[node.level]
  const count = subtreeProductCount(node)
  const foldable = products.length > 0 || hasChildren
  return (
    <div className="px-3 py-2 border-b border-border last:border-b-0 space-y-2"
      style={{ paddingLeft: (node.level - 1) * 24 + 12, background: `${chapterColor}${ROW_ALPHA[node.level]}` }}>
      <div className="flex items-center gap-3">
        {foldable ? (
          <ChevronRight className={`w-3.5 h-3.5 -mx-0.5 shrink-0 transition-transform ${open ? 'rotate-90' : ''}`}
            style={{ color: chapterColor }} />
        ) : (
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: chapterColor }} />
        )}
        <div className={`flex-1 min-w-0 flex items-baseline gap-2 ${foldable ? 'cursor-pointer select-none' : ''}`}
          onClick={foldable ? onToggle : undefined}
          title={foldable ? (open ? 'Replier cette section' : 'Déplier cette section') : undefined}>
          <span className={`truncate ${st.text}`} style={{ color: chapterColor }}>{node.label}</span>
          <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold tabular-nums text-[#fff]"
            style={{ background: chapterColor }}>
            {count}
          </span>
        </div>
        {node.level === 1 && onColor && (
          <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground shrink-0" title="Couleur du chapitre (chemin de fer, bandeaux, ouvertures)">
            Couleur
            <input type="color" value={chapterColor} onChange={(e) => onColor(e.target.value)}
              className="w-8 h-7 rounded-md bg-surface-2 cursor-pointer" />
          </label>
        )}
        {node.level === 1 && (
          <select value={densityValue}
            onChange={(e) => onDensity(e.target.value === RANDOM_ID ? 'random' : Number(e.target.value) as CatalogDensity)}
            className="w-28 px-2 py-1.5 rounded-md bg-surface-2 text-xs text-white outline-none focus:ring-1 focus:ring-indigo-600 shrink-0">
            {CATALOG_GRIDS.map((g) => <option key={g} value={g}>{g}/page</option>)}
            <option value={RANDOM_ID}>{t('cat.random')}</option>
          </select>
        )}
      </div>

      {products.length > 0 && open && (
        <div className="flex flex-col max-h-28 overflow-y-auto pl-5">
          {products.map((f) => {
            const active = section.featuredIds.includes(f.id)
            const previewed = previewId === f.id
            return (
              <div key={f.id}
                className={`flex items-center rounded ${active ? 'text-[#fff]' : 'text-muted-foreground hover:bg-well'} ${previewed ? 'ring-1 ring-indigo-500' : ''}`}
                style={active ? { background: chapterColor } : undefined}>
                <button type="button" onClick={() => onToggleFeatured(f.id)} title={`${f.name} — cliquer : vedette on/off`}
                  className="flex-1 min-w-0 flex items-center gap-1.5 px-1.5 py-0.5 text-left hover:text-white">
                  {active && <span className="shrink-0">★</span>}
                  {f.ref && <span className="shrink-0 text-[10px] tabular-nums opacity-70">{f.ref}</span>}
                  <span className="truncate text-[11px]">{f.name}</span>
                </button>
                {onPreview && (
                  <button type="button" onClick={() => onPreview(f.id)} title={t('cat.plan.previewProduct')}
                    className={`shrink-0 px-1.5 text-xs hover:text-white ${previewed ? 'text-indigo-400' : ''}`}>
                    👁
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
