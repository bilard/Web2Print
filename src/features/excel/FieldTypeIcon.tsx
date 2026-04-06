import {
  Type, AlignLeft, FileText, ListChecks, CircleCheck,
  CalendarDays, Hash, Phone, Link, Mail, Clock,
  DollarSign, Star, Percent, ArrowUpRight, CheckSquare,
  ListOrdered, Barcode, Calculator, Image,
} from 'lucide-react'
import type { FieldTypeId } from './types'

const iconMap: Record<FieldTypeId, React.ComponentType<{ className?: string }>> = {
  text: Type,
  text_long: AlignLeft,
  text_rich: FileText,
  select_multiple: ListChecks,
  select_single: CircleCheck,
  date: CalendarDays,
  number: Hash,
  phone: Phone,
  url: Link,
  email: Mail,
  duration: Clock,
  currency: DollarSign,
  rating: Star,
  percent: Percent,
  link_record: ArrowUpRight,
  checkbox: CheckSquare,
  auto_number: ListOrdered,
  barcode: Barcode,
  formula: Calculator,
  image: Image,
}

interface Props {
  type?: FieldTypeId
  fieldType?: FieldTypeId
  className?: string
}

export function FieldTypeIcon({ type, fieldType, className = 'w-4 h-4' }: Props) {
  const Icon = iconMap[type ?? fieldType ?? 'text'] ?? Type
  return <Icon className={className} />
}
