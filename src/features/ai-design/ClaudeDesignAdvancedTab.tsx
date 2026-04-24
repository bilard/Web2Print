import { PrintSettingsPanel } from './PrintSettingsPanel'

export function ClaudeDesignAdvancedTab() {
  return (
    <div className="space-y-3">
      <PrintSettingsPanel />
      <p className="text-[10px] text-neutral-500 leading-relaxed">
        Ces paramètres affectent le rendu final à l'impression. Modifiez-les uniquement si vous connaissez les
        contraintes techniques de votre imprimeur (DPI, fond perdu, traits de coupe).
      </p>
    </div>
  )
}
