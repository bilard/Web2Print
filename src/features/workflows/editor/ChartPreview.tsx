// Aperçu interactif d'un ChartSpec dans le panneau « Aperçu données ». Importé en
// lazy par DataPreviewPanel pour ne pas embarquer chart.js dans le chunk éditeur.
import { Chart } from 'react-chartjs-2'
import 'chart.js/auto'
import { toChartJsConfig, type ChartSpec } from '../registry/chartSpec'
import { useTranslation } from '@/lib/i18n'

export default function ChartPreview({ spec }: { spec: ChartSpec }) {
  const { t } = useTranslation()
  const { type, data, options } = toChartJsConfig(spec, { responsive: true })
  if (spec.labels.length === 0) {
    return <div className="text-xs text-neutral-500 italic px-2 py-3 text-center">{t('wfe.emptyChart')}</div>
  }
  return (
    <div className="flex-1 min-h-0 p-2">
      <Chart type={type as any} data={data as any} options={options as any} />
    </div>
  )
}
