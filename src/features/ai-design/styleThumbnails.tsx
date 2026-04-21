export const STYLE_THUMBNAILS: Record<string, React.ReactNode> = {
  corporate: (
    <svg viewBox="0 0 80 60" className="w-full h-full">
      <rect width="80" height="60" fill="#1a3a5c" />
      <rect x="8" y="8" width="64" height="12" fill="#4a90e2" />
      <rect x="8" y="24" width="30" height="28" fill="#0f2438" />
      <rect x="42" y="24" width="30" height="28" fill="#0f2438" />
    </svg>
  ),
  minimaliste: (
    <svg viewBox="0 0 80 60" className="w-full h-full">
      <rect width="80" height="60" fill="#ffffff" />
      <rect x="10" y="10" width="60" height="8" fill="#000000" />
      <circle cx="20" cy="40" r="8" fill="#000000" />
      <rect x="35" y="35" width="30" height="18" fill="#f0f0f0" stroke="#000000" strokeWidth="1" />
    </svg>
  ),
  bold: (
    <svg viewBox="0 0 80 60" className="w-full h-full">
      <rect width="80" height="60" fill="#1a1a1a" />
      <rect x="8" y="8" width="64" height="15" fill="#ff6b35" />
      <circle cx="25" cy="40" r="12" fill="#ffa500" />
      <rect x="45" y="32" width="25" height="20" fill="#ff4444" />
    </svg>
  ),
  elegant: (
    <svg viewBox="0 0 80 60" className="w-full h-full">
      <rect width="80" height="60" fill="#0f0f0f" />
      <line x1="8" y1="15" x2="72" y2="15" stroke="#d4af37" strokeWidth="1" />
      <text x="40" y="30" textAnchor="middle" fill="#d4af37" fontSize="10" fontWeight="bold">
        ELEGANCE
      </text>
      <line x1="8" y1="45" x2="72" y2="45" stroke="#d4af37" strokeWidth="1" />
    </svg>
  ),
  playful: (
    <svg viewBox="0 0 80 60" className="w-full h-full">
      <rect width="80" height="60" fill="#fff5e6" />
      <circle cx="15" cy="15" r="8" fill="#ff6b9d" />
      <circle cx="45" cy="20" r="10" fill="#4ecdc4" />
      <circle cx="65" cy="18" r="7" fill="#ffe66d" />
      <rect x="20" y="40" width="40" height="12" rx="6" fill="#95e1d3" />
    </svg>
  ),
  retro: (
    <svg viewBox="0 0 80 60" className="w-full h-full">
      <rect width="80" height="60" fill="#d4a574" />
      <rect x="8" y="8" width="64" height="44" fill="#8b5a3c" />
      <circle cx="20" cy="20" r="4" fill="#e8c4a0" />
      <rect x="35" y="15" width="30" height="30" fill="#c9a872" opacity="0.6" />
    </svg>
  ),
}

export const STYLE_DESCRIPTIONS: Record<string, string> = {
  corporate: 'Professional & corporate look',
  minimaliste: 'Clean & minimalist design',
  bold: 'Bold & eye-catching',
  elegant: 'Refined & elegant',
  playful: 'Fun & colorful',
  retro: 'Vintage & retro vibes',
}
