import type { ReactNode } from 'react';

interface ReductionProps {
  /** Facteur d'affichage a l'ecran (1 = taille reelle). */
  readonly echelle: number;
  /** Dimensions reelles du contenu, en mm. */
  readonly largeurMm?: number;
  readonly hauteurMm?: number;
  readonly className?: string;
  readonly children: ReactNode;
}

/**
 * Affiche un contenu millimetrique reduit, en reservant exactement la place
 * qu'il occupe une fois reduit (une transformation seule laisserait la place
 * de la taille reelle dans la page).
 */
export function Reduction({
  echelle,
  largeurMm = 210,
  hauteurMm = 297,
  className,
  children,
}: ReductionProps) {
  return (
    <div
      className={className}
      style={{
        width: `${largeurMm * echelle}mm`,
        height: `${hauteurMm * echelle}mm`,
        position: 'relative',
        overflow: 'hidden',
        flex: 'none',
      }}
    >
      <div
        style={{
          width: `${largeurMm}mm`,
          height: `${hauteurMm}mm`,
          transform: `scale(${echelle})`,
          transformOrigin: '0 0',
        }}
      >
        {children}
      </div>
    </div>
  );
}
