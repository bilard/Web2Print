---
name: component
description: Créer un composant React selon les conventions Web2Print
allowed-tools: Read, Edit, Write, Glob, Grep, Bash
---

# Créer un composant

Crée le composant : $ARGUMENTS

## Conventions obligatoires

- **Nommage** : PascalCase, fichier `.tsx`
- **Max 150 lignes** : extraire en sous-composants si dépassé
- **Props typées** : interface `<NomComposant>Props` explicite, jamais de `any`
- **Dark mode** : utiliser les classes Tailwind du thème shadcn/ui
- **Pas de logique métier** : la logique va dans les hooks/features, pas dans le JSX
- **Imports** : icônes depuis `lucide-react`, UI depuis `@/components/ui/`

## Placement

- UI canvas/éditeur → `src/components/canvas/`
- Panels (sidebar, header, properties) → `src/components/panels/`
- Réutilisable/générique → `src/components/shared/`
- Ne JAMAIS modifier `src/components/ui/` (shadcn auto-généré)

## Template

```tsx
import { type FC } from 'react'

interface NomProps {
  // props typées
}

export const Nom: FC<NomProps> = ({ ... }) => {
  return (
    <div className="...">
      {/* contenu */}
    </div>
  )
}
```

Après création, vérifie avec `npx tsc -b` que le composant compile.
