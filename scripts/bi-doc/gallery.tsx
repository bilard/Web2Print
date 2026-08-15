// Planche de rendu de la documentation BI : chaque visuel y est monté sur son jeu d'exemple,
// et le TEXTE est exposé sur `window` pour que le générateur PDF le lise ici.
//
// ⚠⚠ Cette planche ne porte AUCUN contenu propre. Texte et exemples viennent de
// `src/features/bi/help`, ceux-là mêmes que rend l'aide intégrée à l'application : c'est ce
// qui garantit qu'un PDF imprimé décrit l'écran qu'on a sous les yeux. Une planche qui
// redéclarerait ses exemples aurait divergé au premier visuel modifié.
import { createRoot } from 'react-dom/client'
import '../../src/index.css'
import { useLocaleStore } from '../../src/stores/locale.store'
import { BiVisualSample } from '../../src/features/bi/help/BiVisualSample'
import { SAMPLES } from '../../src/features/bi/help/biDocSamples'
import * as content from '../../src/features/bi/help/biDocContent'

// ⚠ Locale forcée : la documentation est française, et un « 534,735 » à l'anglaise dans une
// illustration ferait douter du reste.
useLocaleStore.setState({ locale: 'fr' })

// Le générateur lit le texte ICI plutôt que d'importer un module TypeScript : Node ne le
// compilerait pas, alors que Vite le sert déjà pour la planche.
;(window as unknown as { __biDoc: typeof content }).__biDoc = content

createRoot(document.getElementById('root')!).render(
  <div className="flex w-fit flex-col gap-4 bg-background p-4">
    {SAMPLES.map((s) => (
      <div key={s.id} style={{ width: 520 }}><BiVisualSample id={s.id} /></div>
    ))}
  </div>,
)
