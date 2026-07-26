// Options partagées de TOUS les sélecteurs de polices de l'app : « Mes polices »
// (fichiers uploadés + familles Google ajoutées par URL) puis le catalogue
// Google Fonts intégré. À rendre à l'intérieur d'un <select>.
import { FONT_OPTIONS } from '@/features/retail-promo/promoCardTypes'
import { useUserFonts } from './useUserFonts'

export function FontSelectOptions() {
  const { fonts } = useUserFonts()
  return (
    <>
      {fonts.length > 0 && (
        <optgroup label="Mes polices">
          {fonts.map((f) => <option key={f.id} value={f.family}>{f.family}</option>)}
        </optgroup>
      )}
      <optgroup label="Google Fonts">
        {FONT_OPTIONS.map((f) => <option key={f} value={f}>{f}</option>)}
      </optgroup>
    </>
  )
}
