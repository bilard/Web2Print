interface Props { label: string; catalogName: string }

export function OpenerPage({ label, catalogName }: Props) {
  return (
    <div className="cat-opener">
      <div className="cat-opener-kicker">{catalogName}</div>
      <h2 className="cat-opener-title">{label}</h2>
    </div>
  )
}
