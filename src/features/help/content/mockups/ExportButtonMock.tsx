import { Download } from 'lucide-react'

export function ExportButtonMock() {
  return (
    <button
      type="button"
      className="flex items-center gap-1.5 bg-indigo-500 text-white text-sm font-medium px-3 py-1.5 rounded-lg pointer-events-none"
    >
      <Download className="w-3.5 h-3.5" />
      Exporter
    </button>
  )
}
