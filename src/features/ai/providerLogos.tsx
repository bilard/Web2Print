// src/features/ai/providerLogos.tsx
// Logos SVG inline des providers IA et connecteurs, partagés entre SettingsPanel,
// le wizard d'onboarding (cascade) et les lignes connecteurs extraites.

export const FirebaseLogo = () => (
  <svg viewBox="0 0 256 351" className="w-3.5 h-3.5 shrink-0" aria-hidden="true">
    <path fill="#FFC24A" d="M0 282.998l2.123-2.6L102.527 89.32l.212-2.018L58.78 4.341C55.097-2.586 44.802-.845 43.572 6.896L0 282.998z"/>
    <path fill="#FFA712" d="M2.86 281.317L4.581 277.992 102.422 88.638 58.546 4.262C54.9-2.595 46.169-.749 44.94 6.93L2.86 281.317z"/>
    <path fill="#F4BD62" d="M135.005 150.38l32.955-33.75-32.965-62.93c-3.127-5.969-11.866-5.954-14.962.022L102.42 88.6v2.86l32.585 58.92z"/>
    <path fill="#FFA50E" d="M134.795 150.272l32.057-32.829-32.056-61.075c-3.043-5.804-10.67-6.348-13.673-.522L102.6 92.703l-.296 1.005 32.491 56.564z"/>
    <path fill="#F6820C" d="M0 282.998l.962-.968 3.496-1.42 128.477-128 1.628-4.431-32.05-61.074L0 282.998z"/>
    <path fill="#FDE068" d="M139.121 347.551l116.275-64.847L222.27 77.678c-1.039-6.398-8.888-8.927-13.468-4.34L0 282.998l115.608 64.548a24.126 24.126 0 0 0 23.513.005"/>
    <path fill="#FCCA3F" d="M254.354 282.16L221.402 78.117c-1.03-6.35-7.558-8.94-12.103-4.4L1.29 282.6l114.339 63.908a23.943 23.943 0 0 0 23.334.006L254.354 282.16z"/>
    <path fill="#EEAB37" d="M139.12 345.64a24.126 24.126 0 0 1-23.512-.005L.931 282.015l-.93.983 115.607 64.548a24.126 24.126 0 0 0 23.513.005l116.275-64.847-.285-1.752-115.99 64.689z"/>
  </svg>
)

export const GeminiLogo = () => (
  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 shrink-0" aria-hidden="true">
    <path fill="url(#gemini-g)" d="M12 0c.6 6 5.4 10.8 11.4 11.4v1.2C17.4 13.2 12.6 18 12 24c-.6-6-5.4-10.8-11.4-11.4v-1.2C6.6 10.8 11.4 6 12 0z"/>
    <defs>
      <linearGradient id="gemini-g" x1="0" y1="0" x2="24" y2="24">
        <stop offset="0%" stopColor="#4796E1"/>
        <stop offset="50%" stopColor="#9168C0"/>
        <stop offset="100%" stopColor="#E84B7D"/>
      </linearGradient>
    </defs>
  </svg>
)

export const ClaudeLogo = () => (
  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 shrink-0" aria-hidden="true">
    <path
      fill="#D97757"
      d="M12 2.4c.4 3.7 2.5 5.8 6.2 6.2l.4.04v.7l-.4.04c-3.7.4-5.8 2.5-6.2 6.2l-.04.4-.7-.04-.04-.4c-.4-3.7-2.5-5.8-6.2-6.2l-.4-.04v-.7l.4-.04c3.7-.4 5.8-2.5 6.2-6.2l.04-.4.7.04.04.4z"
    />
  </svg>
)

export const OpenAILogo = () => (
  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 shrink-0" aria-hidden="true">
    <path
      fill="#FFFFFF"
      d="M22.28 9.82a5.98 5.98 0 0 0-.52-4.91 6.05 6.05 0 0 0-6.51-2.9A6 6 0 0 0 4.98 4.18a5.98 5.98 0 0 0-3.99 2.9 6.05 6.05 0 0 0 .74 7.1 5.98 5.98 0 0 0 .52 4.92 6.05 6.05 0 0 0 6.51 2.9 5.98 5.98 0 0 0 4.51 2.01 6.05 6.05 0 0 0 5.77-4.18 5.98 5.98 0 0 0 3.99-2.9 6.05 6.05 0 0 0-.74-7.1zm-9.02 12.6a4.48 4.48 0 0 1-2.88-1.04l.14-.08 4.78-2.76a.78.78 0 0 0 .39-.68v-6.74l2.02 1.17a.07.07 0 0 1 .04.06v5.58a4.5 4.5 0 0 1-4.5 4.49zM3.6 18.51a4.48 4.48 0 0 1-.54-3l.14.08 4.78 2.76a.78.78 0 0 0 .79 0L14.61 15v2.34a.08.08 0 0 1-.03.06l-4.83 2.79a4.5 4.5 0 0 1-6.15-1.65zm-1.26-10.4a4.48 4.48 0 0 1 2.34-1.97V12.36a.78.78 0 0 0 .39.68l5.84 3.37-2.02 1.17a.07.07 0 0 1-.07 0l-4.83-2.8a4.5 4.5 0 0 1-1.65-6.15zm16.6 3.86l-5.84-3.39 2.02-1.16a.07.07 0 0 1 .07 0l4.83 2.79a4.5 4.5 0 0 1-.68 8.12v-5.69a.78.78 0 0 0-.4-.67zm2.01-3.02l-.14-.09-4.77-2.78a.78.78 0 0 0-.79 0L9.39 9v-2.34a.07.07 0 0 1 .03-.06l4.83-2.78a4.5 4.5 0 0 1 6.69 4.66zM8.29 12.85L6.27 11.69a.07.07 0 0 1-.04-.06V6.05a4.5 4.5 0 0 1 7.38-3.46l-.14.08-4.78 2.76a.78.78 0 0 0-.39.68zm1.1-2.36L12 8.97l2.6 1.5v3l-2.6 1.5-2.6-1.5z"
    />
  </svg>
)

export const DeepSeekLogo = () => (
  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 shrink-0" aria-hidden="true">
    <path
      fill="#4D6BFE"
      d="M22.4 5.32c-.21-.1-.3.09-.42.18-.05.04-.08.08-.13.13-.36.39-.78.65-1.36.62-.85-.05-1.57.22-2.21.87-.13-.79-.58-1.27-1.26-1.57-.36-.16-.72-.31-.97-.65-.18-.24-.23-.51-.32-.78-.05-.16-.11-.33-.3-.36-.21-.03-.29.14-.37.29-.34.62-.47 1.3-.46 1.99.04 1.55.69 2.78 1.99 3.66.15.1.18.21.14.35-.09.31-.19.61-.29.92-.06.2-.16.24-.37.16-.74-.31-1.39-.78-1.95-1.34-.95-.93-1.81-1.95-2.89-2.78-.25-.2-.5-.38-.77-.55-1.13-1.1.41-2 .77-2.13.37-.13.13-.59-1.06-.58-1.19 0-2.27.4-3.66.93-.2.08-.41.14-.62.19-1.21-.23-2.46-.28-3.77-.13-2.46.27-4.42 1.43-5.86 3.42C-.13 9.16-.39 11.69.34 14.31c.77 2.76 2.43 4.83 5.04 6.16 2.7 1.38 5.61 1.45 8.5.59 2.6-.78 4.6-2.42 5.93-4.84.07.04.14.07.21.11 1.18.66 1.51 2.17.71 3.27-.06.08-.13.15-.06.26.06.09.16.05.24.04.45-.05.78-.3 1.08-.62.86-.92 1.07-2.04.94-3.24-.07-.69-.36-1.32-.36-2.02 0-.62.11-1.16.59-1.57.45-.39.94-.46 1.42-.66.57-.24 1.07-.57 1.41-1.13.04-.07.08-.14.06-.23-.01-.13-.13-.16-.21-.18-.29-.07-.55-.18-.81-.29-.27-.11-.45-.36-.43-.65zM11.4 19.85c-3.55 0-6.43-2.92-6.43-6.51s2.88-6.51 6.43-6.51c3.55 0 6.43 2.92 6.43 6.51s-2.88 6.51-6.43 6.51zm.06-9.75c-1.74 0-3.16 1.41-3.16 3.16s1.42 3.16 3.16 3.16c1.74 0 3.16-1.41 3.16-3.16s-1.42-3.16-3.16-3.16zm0 4.97c-.99 0-1.81-.81-1.81-1.81s.81-1.81 1.81-1.81c.99 0 1.81.81 1.81 1.81s-.81 1.81-1.81 1.81z"
    />
  </svg>
)

export const KimiLogo = () => (
  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 shrink-0" aria-hidden="true">
    <circle cx="12" cy="12" r="10" fill="#1F1F1F" />
    <path
      fill="#FFFFFF"
      d="M7.5 7.75h2v3.4l3.4-3.4h2.55l-3.55 3.55 3.7 4.95H13l-2.7-3.7-.8.8v2.9h-2v-8.5zm9 0h2v8.5h-2z"
    />
  </svg>
)

export const GLMLogo = () => (
  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 shrink-0" aria-hidden="true">
    <rect x="2" y="2" width="20" height="20" rx="5" fill="#3859FF" />
    <path
      fill="#FFFFFF"
      d="M7 7.5h9l-6.4 6.4H15V16.5H7l6.4-6.4H7z"
    />
  </svg>
)

export const OpenRouterLogo = () => (
  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 shrink-0" aria-hidden="true">
    <circle cx="12" cy="12" r="10" fill="#6366f1" />
    <path
      fill="#FFFFFF"
      d="M5 12h6.5l-2.4-2.4 1.4-1.4L15 12l-4.5 4.5-1.4-1.4L11.5 12.7H5v-.7zm9 0h5"
      strokeWidth="1.5"
      stroke="#FFFFFF"
    />
    <circle cx="19.5" cy="12" r="1.5" fill="#FFFFFF" />
  </svg>
)

export const QwenLogo = () => (
  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 shrink-0" aria-hidden="true">
    <path
      fill="#615CED"
      d="M12 2.25 4.5 6.5v8.5L12 19.25 19.5 15V6.5L12 2.25zm0 2.31 5.5 3.12-5.5 3.12-5.5-3.12L12 4.56zM6 9.39l5 2.84v6.27L6 15.66V9.39zm12 0v6.27l-5 2.84v-6.27l5-2.84z"
    />
  </svg>
)

export const JinaLogo = () => (
  <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0 text-amber-400" fill="currentColor" aria-hidden="true">
    <path d="M12 2a10 10 0 100 20 10 10 0 000-20zm0 3a2 2 0 110 4 2 2 0 010-4zm0 14a7.5 7.5 0 01-5.5-2.4c.3-1.8 2.6-3.1 5.5-3.1s5.2 1.3 5.5 3.1A7.5 7.5 0 0112 19z"/>
  </svg>
)

export const GoogleVisionLogo = () => (
  <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0 text-emerald-400" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
  </svg>
)

export const RemoveBgLogo = () => (
  <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0 text-blue-400" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="3" width="18" height="18" rx="3" />
    <path d="M9 3v18M3 9h6M3 15h6" strokeDasharray="2 2" opacity="0.4" />
    <circle cx="15" cy="12" r="4" fill="currentColor" stroke="none" />
  </svg>
)

export const HiggsfieldLogo = () => (
  <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0 text-indigo-400" fill="currentColor" aria-hidden="true">
    <path d="M12 2l2.4 5.6L20 8l-4 4 1 6-5-2.8L7 18l1-6-4-4 5.6-.4L12 2z" />
  </svg>
)

export const FirecrawlLogo = () => (
  <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0 text-orange-400" fill="currentColor" aria-hidden="true">
    <path d="M13.5 2c-.3 0-.5.2-.6.4-1 2.7-2.5 4.4-4.3 6-1.6 1.4-3.6 3.2-3.6 6.6 0 3.5 2.6 7 7 7s7-3.5 7-7.7c0-2-.7-3.7-1.4-5-.9-1.6-1.8-3-1.6-5.1 0-.5-.4-.9-.9-.9-1.4 0-1.6 1-1.6 1.8-.7-1.5-1-2.5-1-3.1z M11 12c1 1 2 1.5 2 3 0 1-.8 2-2 2s-2-1-2-2c0-1.5 1-2 2-3z"/>
  </svg>
)

export const ScrapflyLogo = () => (
  <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0 text-cyan-400" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 12h4l3-9 4 18 3-9h4" />
  </svg>
)

export const BrightDataLogo = () => (
  <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0 text-orange-400" fill="currentColor" aria-hidden="true">
    <path d="M12 2L4 7v10l8 5 8-5V7l-8-5zm0 2.5L17 7l-5 3-5-3 5-2.5zM6 8.5l5 3v6l-5-3v-6zm12 0v6l-5 3v-6l5-3z"/>
  </svg>
)

export const GDriveLogo = () => (
  <svg viewBox="0 0 87.3 78" className="w-4 h-4 shrink-0">
    <path d="M6.6 66.85l3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8H1.1c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
    <path d="M43.65 25L29.9 1.2C28.55 2 27.4 3.1 26.6 4.5L1.2 48.5c-.8 1.4-1.2 2.95-1.2 4.5h27.5z" fill="#00ac47"/>
    <path d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5H59.8l5.85 11.65z" fill="#ea4335"/>
    <path d="M43.65 25L57.4 1.2C56.05.4 54.5 0 52.95 0H34.35c-1.55 0-3.1.4-4.45 1.2z" fill="#00832d"/>
    <path d="M59.8 53H27.5L13.75 76.8c1.35.8 2.9 1.2 4.45 1.2h50.9c1.55 0 3.1-.4 4.45-1.2z" fill="#2684fc"/>
    <path d="M73.4 26.5l-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3L43.65 25 59.8 53h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/>
  </svg>
)
