// Bloc « Modèles » du plan catalogue : appliquer / enregistrer / supprimer un modèle
// réutilisable (thème + grille par défaut, sans données).
import { useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { listCatalogTemplates, saveCatalogTemplate, deleteCatalogTemplate, type CatalogTemplate } from '../../catalogTemplatesApi'
import type { CatalogGrid, CatalogPlan } from '../../catalogTypes'
import { mergedPageStyle } from '../pages/catalogCss'
import { t } from '@/lib/i18n'

/** Entrée fixe de la liste : active les couleurs PAR CHAPITRE (palette du chemin de fer). */
const CHAPTER_DEFAULT_ID = '__chapter-colors__'

interface TemplatesBarProps {
  plan: CatalogPlan
  setPlan: (plan: CatalogPlan) => void
  fieldClass: string
}

function majorityGrid(plan: CatalogPlan): CatalogGrid {
  const counts = new Map<CatalogGrid, number>()
  for (const s of plan.sections) counts.set(s.productsPerPage, (counts.get(s.productsPerPage) ?? 0) + 1)
  let best: CatalogGrid = 4
  let bestCount = 0
  for (const [grid, count] of counts) {
    if (count > bestCount) { best = grid; bestCount = count }
  }
  return best
}

export function TemplatesBar({ plan, setPlan, fieldClass }: TemplatesBarProps) {
  const [templates, setTemplates] = useState<CatalogTemplate[]>([])
  const [newName, setNewName] = useState('')

  const reload = () => {
    listCatalogTemplates().then(setTemplates).catch((e: unknown) => toast.error(e instanceof Error ? e.message : 'Échec du chargement des modèles'))
  }

  useEffect(() => { reload() }, [])

  // Le modèle appliqué reste AFFICHÉ (persisté dans plan.appliedTemplate, par nom
  // — survit au changement de page/étape). Sans modèle, l'entrée « Défaut »
  // reflète l'état couleurs-par-chapitre.
  const selectedValue = plan.appliedTemplate
    ? (templates.find((t) => t.name === plan.appliedTemplate)?.id ?? '')
    : mergedPageStyle(plan.pageStyle).chapterColors ? CHAPTER_DEFAULT_ID : ''

  const applyTemplate = (id: string) => {
    if (id === CHAPTER_DEFAULT_ID) {
      // Pas un modèle enregistré : applique la couleur de chaque chapitre au
      // bandeau et aux ouvertures (comme le chemin de fer).
      setPlan({ ...plan, appliedTemplate: '', pageStyle: { ...mergedPageStyle(plan.pageStyle), chapterColors: true } })
      return
    }
    const t = templates.find((tpl) => tpl.id === id)
    if (!t) return
    setPlan({
      ...plan, theme: t.theme, appliedTemplate: t.name,
      // Modèles antérieurs sans cardStyle/pageStyle : on conserve le style courant.
      ...(t.cardStyle ? { cardStyle: t.cardStyle } : {}),
      ...(t.pageStyle ? { pageStyle: t.pageStyle } : {}),
      sections: plan.sections.map((s) => ({ ...s, productsPerPage: t.defaultGrid })),
    })
  }

  const handleSave = () => {
    if (!newName.trim()) return
    saveCatalogTemplate(newName.trim(), plan.theme, majorityGrid(plan), plan.cardStyle, plan.pageStyle)
      .then(() => {
        toast.success('Modèle enregistré')
        setPlan({ ...plan, appliedTemplate: newName.trim() })
        setNewName('')
        reload()
      })
      .catch((e: unknown) => toast.error(e instanceof Error ? e.message : 'Échec de l\'enregistrement'))
  }

  const handleDelete = () => {
    if (!selectedValue || selectedValue === CHAPTER_DEFAULT_ID) return
    deleteCatalogTemplate(selectedValue)
      .then(() => { toast.success('Modèle supprimé'); setPlan({ ...plan, appliedTemplate: '' }); reload() })
      .catch((e: unknown) => toast.error(e instanceof Error ? e.message : 'Échec de la suppression'))
  }

  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <select value={selectedValue} onChange={(e) => applyTemplate(e.target.value)} aria-label={t('cat.tpl.mine')} className={fieldClass}>
          <option value="">{t('cat.tpl.apply')}</option>
          <option value={CHAPTER_DEFAULT_ID}>{t('cat.tpl.chapterDefault')}</option>
          {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <button type="button" onClick={handleDelete} disabled={!selectedValue || selectedValue === CHAPTER_DEFAULT_ID}
          className="p-2 rounded-md text-muted-foreground hover:text-red-400 disabled:opacity-40" title={t('cat.tpl.delete')}>
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
      <div className="flex items-center gap-2">
        {/* Autocomplétion sur les noms existants : l'enregistrement est un upsert
            par nom — retrouver un modèle à mettre à jour sans le retaper. */}
        <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={t('cat.tpl.namePlaceholder')}
          list="catalog-template-names" className={fieldClass} />
        <datalist id="catalog-template-names">
          {templates.map((t) => <option key={t.id} value={t.name} />)}
        </datalist>
        <button type="button" onClick={handleSave} disabled={!newName.trim()}
          className="shrink-0 px-3 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-[#fff] text-xs font-medium">
          Enregistrer comme modèle
        </button>
      </div>
    </section>
  )
}
