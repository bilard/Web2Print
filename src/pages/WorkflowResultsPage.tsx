import { useParams } from 'react-router-dom'
import { useI18nVersion } from '@/lib/i18n'
import { WorkflowResultsScreen } from '@/features/workflows/results/WorkflowResultsScreen'

export default function WorkflowResultsPage() {
  // Vocabulaire du compte : abonne tout le sous-arbre (cf. useI18nVersion).
  useI18nVersion()
  const { id } = useParams<{ id: string }>()
  if (!id) return null
  return <WorkflowResultsScreen workflowId={id} />
}
