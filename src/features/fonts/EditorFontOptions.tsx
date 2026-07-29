// Options des sélecteurs de police de l'ÉDITEUR (PropertiesPanel, TextToolbar) :
// « Mes polices » (uploads + Google ajoutées par URL), puis les fonts du document
// (IDML importé), puis le catalogue Google Fonts de l'éditeur. Chaque option
// s'affiche dans sa propre police.
import { AVAILABLE_FONTS, getAllFonts } from '@/features/assets/useFonts'
import { useUserFonts } from './useUserFonts'
import { useTranslation } from '@/lib/i18n'

export function EditorFontOptions() {
  const { t } = useTranslation()
  const { fonts: userFonts } = useUserFonts()
  const docFonts = getAllFonts()
    .filter((f) => !AVAILABLE_FONTS.some((af) => af.family === f.family))
    .filter((f) => !userFonts.some((u) => u.family === f.family))
  return (
    <>
      {userFonts.length > 0 && (
        <optgroup label={t('fonts.myFonts')}>
          {userFonts.map((f) => <option key={f.id} value={f.family} style={{ fontFamily: f.family }}>{f.family}</option>)}
        </optgroup>
      )}
      {docFonts.length > 0 && (
        <optgroup label={t('fonts.documentFonts')}>
          {docFonts.map((f) => <option key={f.family} value={f.family} style={{ fontFamily: f.family }}>{f.label}</option>)}
        </optgroup>
      )}
      <optgroup label={t('fonts.google')}>
        {AVAILABLE_FONTS.map((f) => <option key={f.family} value={f.family} style={{ fontFamily: f.family }}>{f.label}</option>)}
      </optgroup>
    </>
  )
}
