import { useParams } from 'react-router-dom'
import { WorkflowResultsScreen } from '@/features/workflows/results/WorkflowResultsScreen'

export default function WorkflowResultsPage() {
  const { id } = useParams<{ id: string }>()
  if (!id) return null
  return <WorkflowResultsScreen workflowId={id} />
}
