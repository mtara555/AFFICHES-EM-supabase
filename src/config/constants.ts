/**
 * AFFICHES-EM v1.0 — Constantes de l'application
 *
 * Ce fichier rassemble les valeurs structurantes du projet. Les regles
 * commerciales (seuils, bareme) y figurent comme valeurs par defaut : a partir
 * de l'etape 0.4 elles seront lues depuis la table `parametres` de Supabase
 * et modifiables par un administrateur, conformement au document de cadrage.
 */

export const APP_NAME = 'AFFICHES-EM';
export const APP_VERSION = '1.0.0';
export const APP_FULL_NAME = `${APP_NAME} v${APP_VERSION}`;

/* -------------------------------------------------------------------------- */
/* Formats d'affiches                                                          */
/* -------------------------------------------------------------------------- */

export type FormatAffiche = 'A4' | 'A5' | 'A6' | 'A7';

export interface DefinitionFormat {
  readonly code: FormatAffiche;
  /** Largeur en millimetres */
  readonly largeurMm: number;
  /** Hauteur en millimetres */
  readonly hauteurMm: number;
  /** Nombre d'affiches imposees sur une planche A4 a l'impression */
  readonly parPlancheA4: number;
  readonly libelle: string;
}

export const FORMATS: Readonly<Record<FormatAffiche, DefinitionFormat>> = {
  A4: { code: 'A4', largeurMm: 210, hauteurMm: 297, parPlancheA4: 1, libelle: 'A4 — 210 × 297 mm' },
  A5: { code: 'A5', largeurMm: 148, hauteurMm: 210, parPlancheA4: 2, libelle: 'A5 — 148 × 210 mm' },
  A6: { code: 'A6', largeurMm: 105, hauteurMm: 148, parPlancheA4: 4, libelle: 'A6 — 105 × 148 mm' },
  A7: { code: 'A7', largeurMm: 74, hauteurMm: 105, parPlancheA4: 8, libelle: 'A7 — 74 × 105 mm' },
} as const;

export const FORMATS_ORDONNES: readonly FormatAffiche[] = ['A4', 'A5', 'A6', 'A7'];

/* -------------------------------------------------------------------------- */
/* Categories produit                                                          */
/* -------------------------------------------------------------------------- */

export type CategorieProduit =
  | 'gem'
  | 'pem'
  | 'image-son'
  | 'nt'
  | 'telephonie'
  | 'pc'
  | 'cuisson'
  | 'froid'
  | 'lavage';

export const CATEGORIES: Readonly<Record<CategorieProduit, string>> = {
  gem: 'Gros Electromenager',
  pem: 'Petit Electromenager',
  'image-son': 'Image & Son',
  nt: 'Nouvelles technologies',
  telephonie: 'Telephonie & Accessoires',
  pc: 'Informatique',
  cuisson: 'Cuisson',
  froid: 'Froid',
  lavage: 'Lavage',
} as const;

/* -------------------------------------------------------------------------- */
/* Regles commerciales — valeurs par defaut                                    */
/* -------------------------------------------------------------------------- */

/**
 * Bareme du credit sans interet, repris du module VBA existant.
 * Lu de haut en bas : le premier palier atteint determine la duree.
 */
export interface PalierCredit {
  readonly seuilDh: number;
  readonly dureeMois: number;
}

export const BAREME_CREDIT_DEFAUT: readonly PalierCredit[] = [
  { seuilDh: 14999, dureeMois: 24 },
  { seuilDh: 9999, dureeMois: 18 },
  { seuilDh: 7999, dureeMois: 15 },
  { seuilDh: 2999, dureeMois: 12 },
] as const;

/** Prix principal a partir duquel le badge livraison gratuite s'affiche. */
export const SEUIL_LIVRAISON_GRATUITE_DEFAUT = 2000;

/** Ecart minimal, en pourcentage du prix barre, pour afficher le bandeau economie. */
export const SEUIL_ECONOMIE_POURCENT_DEFAUT = 10;

/** Durees de garantie proposees a la saisie d'un article. */
export const GARANTIES_ANNEES: readonly number[] = [1, 2, 5] as const;

/* -------------------------------------------------------------------------- */
/* Roles                                                                       */
/* -------------------------------------------------------------------------- */

export const ROLES = {
  OPERATEUR: 'operateurs',
  ADMINISTRATEUR: 'administrateurs',
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

/* -------------------------------------------------------------------------- */
/* Formatage                                                                   */
/* -------------------------------------------------------------------------- */

export const DEVISE = 'dh';
export const LOCALE = 'fr-MA';
