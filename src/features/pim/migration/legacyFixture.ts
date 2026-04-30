import type { ExcelSheet } from '@/features/excel/types'

export function makeLegacyDoc(sheets: ExcelSheet[]) {
  return {
    docId: 'legacy_abc',
    fileName: 'Castorama',
    path: ['Distribution'],
    sheets,
  }
}

export const sampleSheets: ExcelSheet[] = [
  {
    name: 'nicoll.fr',
    columns: [
      { key: 'sku', label: 'SKU', fieldType: 'text', detectedType: 'text', isPrimary: true, width: 100 },
      { key: 'name', label: 'Nom', fieldType: 'text', detectedType: 'text', isPrimary: false, width: 200 },
      { key: 'price', label: 'Prix', fieldType: 'currency', detectedType: 'currency', isPrimary: false, width: 80 },
    ],
    rows: [
      { _id: 'r1', sku: 'NIC-001', name: 'Tube PVC 32', price: 4.5 },
      { _id: 'r2', sku: 'NIC-002', name: 'Coude 90°', price: 1.2 },
    ],
    taxonomy: [],
  },
  {
    name: 'fr.milwaukeetool.eu',
    columns: [
      { key: 'sku', label: 'SKU', fieldType: 'text', detectedType: 'text', isPrimary: true, width: 100 },
      { key: 'name', label: 'Nom', fieldType: 'text', detectedType: 'text', isPrimary: false, width: 200 },
    ],
    rows: [
      { _id: 'r3', sku: 'MIL-4933', name: 'Visseuse M18' },
      { _id: 'r4', sku: 'NIC-001', name: 'Aussi vendu' }, // SKU collision avec nicoll
    ],
    taxonomy: [],
  },
]
