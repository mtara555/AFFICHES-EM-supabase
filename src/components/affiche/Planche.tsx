import type { CSSProperties } from 'react';
import { FORMATS, type FormatAffiche } from '../../config/constants';
import type { DonneesAffiche } from '../../lib/affiche-rendu';
import { AfficheA4 } from './AfficheA4';
import './Planche.css';

/**
 * Imposition sur feuille A4 portrait.
 *
 * Les formats A sont homothetiques : une affiche A5, A6 ou A7 est l'affiche A4
 * reduite d'un facteur largeur/210, sans aucune retouche de mise en page.
 *   A4 : 1 par feuille
 *   A5 : 2 par feuille, tournees d'un quart de tour (deux A5 couchees)
 *   A6 : 4 par feuille, 2 × 2, droites
 *   A7 : 8 par feuille, 2 × 4, tournees d'un quart de tour
 * Les emplacements se touchent : une seule coupe droite separe deux affiches.
 */
interface Disposition {
  readonly colonnes: number;
  readonly lignes: number;
  readonly tournee: boolean;
}

const DISPOSITIONS: Readonly<Record<FormatAffiche, Disposition>> = {
  A4: { colonnes: 1, lignes: 1, tournee: false },
  A5: { colonnes: 1, lignes: 2, tournee: true },
  A6: { colonnes: 2, lignes: 2, tournee: false },
  A7: { colonnes: 2, lignes: 4, tournee: true },
};

export const parPlanche = (format: FormatAffiche) => FORMATS[format].parPlancheA4;

interface PlancheProps {
  readonly format: FormatAffiche;
  readonly affiches: readonly DonneesAffiche[];
}

export function Planche({ format, affiches }: PlancheProps) {
  const d = DISPOSITIONS[format];
  const echelle = FORMATS[format].largeurMm / 210;
  // Dimensions d'un emplacement sur la feuille, en mm.
  const largeur = (d.tournee ? 297 : 210) * echelle;
  const hauteur = (d.tournee ? 210 : 297) * echelle;

  const grille: CSSProperties = {
    gridTemplateColumns: `repeat(${d.colonnes}, ${largeur}mm)`,
    gridTemplateRows: `repeat(${d.lignes}, ${hauteur}mm)`,
  };

  const transformation = d.tournee
    ? `translateX(${largeur}mm) rotate(90deg) scale(${echelle})`
    : `scale(${echelle})`;

  return (
    <section className={`planche planche--${format}`} style={grille}>
      {affiches.map((donnees) => (
        <div
          key={donnees.cle}
          className="planche__emplacement"
          style={{ width: `${largeur}mm`, height: `${hauteur}mm` }}
        >
          <div className="planche__affiche" style={{ transform: transformation }}>
            <AfficheA4 donnees={donnees} />
          </div>
        </div>
      ))}
    </section>
  );
}
