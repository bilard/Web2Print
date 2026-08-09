// functions/src/priceWatch/textEnrich/revisePlans.ts
// ⚠ COPIE de src/features/workflows/registry/catalogTextReviseTypes.ts (bundles séparés :
// `functions/` est hermétique, `rootDir: "src"`). Toute modification là-bas doit être
// reportée ici — cf. textReviseParity.test.ts.
// Les plans de « Traduire et améliorer les fiches ». Types SEULS — dans leur propre module
// et non dans celui du composant : un type exporté depuis un module de composant est la
// cause récurrente des dépendances circulaires de ce projet.

/** Les deux textes que le catalogue relu porte. C'est « Comparer catalogue » qui décide
 *  quelle colonne de la feuille alimente lequel. */
export type ReviseField = 'name' | 'description'

/** Traduire, ou réécrire pour vendre. */
export type ReviseKind = 'translate' | 'improve'

/**
 * Une opération sur un champ.
 *
 * ⚠ Deux plans sur le MÊME champ sont la manière normale de travailler ici : traduire
 * puis améliorer, dans le même passage et le même appel. C'est ce que la carte « Enrichir
 * les textes » interdisait — ses unités sont identifiées par `produit::champ` et calculées
 * toutes d'avance, si bien que le second plan repartait du texte d'origine.
 */
export interface RevisePlan {
  enabled: boolean
  field: ReviseField
  kind: ReviseKind
  /** Consigne PROPRE à cette opération, recopiée telle quelle. */
  prompt: string
}

/** Les plans, ramenés à ce que le prompt attend : par champ, deux opérations et leurs
 *  consignes. Les plans désactivés sortent, l'ordre de la liste est conservé. */
export function plansToFieldTasks(plans: RevisePlan[]): {
  name: { translate: boolean; improve: boolean; translatePrompt: string; improvePrompt: string }
  description: { translate: boolean; improve: boolean; translatePrompt: string; improvePrompt: string }
} {
  const empty = () => ({ translate: false, improve: false, translatePrompt: '', improvePrompt: '' })
  const out = { name: empty(), description: empty() }
  for (const p of plans) {
    if (!p.enabled) continue
    const target = out[p.field]
    if (!target) continue
    if (p.kind === 'translate') { target.translate = true; target.translatePrompt = p.prompt ?? '' }
    else { target.improve = true; target.improvePrompt = p.prompt ?? '' }
  }
  return out
}

/** Les plans par défaut : traduire les deux textes, ce que veut faire tout le monde au
 *  premier passage. L'amélioration s'ajoute d'un clic, avec sa consigne. */
export const DEFAULT_REVISE_PLANS: RevisePlan[] = [
  { enabled: true, field: 'name', kind: 'translate', prompt: '' },
  { enabled: true, field: 'description', kind: 'translate', prompt: '' },
]
