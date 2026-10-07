/**
 * AFFICHES-EM v1.0 — Import du catalogue depuis un fichier Excel
 *
 * Reprend la fonction d'import du classeur VBA (CommandButton8), en y ajoutant
 * les controles qui manquaient : normalisation des valeurs, deduplication des
 * codes et rapport prealable avant ecriture.
 *
 * L'import s'execute dans le navigateur, avec la session de l'administrateur
 * connecte. Aucune cle API n'est donc necessaire, et les regles RLS de Supabase
 * s'appliquent normalement.
 */

import * as XLSX from 'xlsx';
import type { CategorieProduit } from '../config/constants';
import type { SaisieArticle } from './articles';
import { NB_PICTOS } from './articles';

/* -------------------------------------------------------------------------- */
/* Normalisation                                                               */
/* -------------------------------------------------------------------------- */

/** Retire les accents d'une chaine, sans toucher au reste. */
function sansAccents(valeur: string): string {
  return valeur.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Normalise un code de pictogramme ou un nom de marque.
 *
 * Ces valeurs sont des identifiants, pas du texte affiche : la casse et les
 * accents n'y ont pas de sens, et le catalogue existant les melange librement.
 * On retire aussi l'extension de fichier, souvent mal saisie — le catalogue
 * reel contient « 2ANS,jpg », « 2ANS;pg » et « 1AN.JPG » pour la meme valeur.
 */
export function normaliserCode(valeur: unknown): string {
  if (valeur === null || valeur === undefined) return '';
  const texte = String(valeur).trim();
  if (!texte) return '';
  const sansExtension = texte.replace(/[.,;]\s*(jpg|jpeg|png)$/i, '');
  return sansAccents(sansExtension).toUpperCase().replace(/\s+/g, ' ').trim();
}

/**
 * Normalise un libelle destine a l'affichage.
 *
 * Contrairement aux codes, les accents sont CONSERVES : ces textes figurent sur
 * les affiches imprimees, ou « CONGELATEUR » sans accent serait fautif. Seuls
 * les espaces surnumeraires et la casse sont unifies.
 */
export function normaliserLibelle(valeur: unknown): string {
  if (valeur === null || valeur === undefined) return '';
  return String(valeur).trim().replace(/\s+/g, ' ').toUpperCase();
}

/** Cle de comparaison insensible aux accents, pour rapprocher les variantes. */
function cleComparaison(valeur: string): string {
  return sansAccents(valeur).toUpperCase();
}

/**
 * Choisit la forme canonique parmi plusieurs variantes d'un meme libelle.
 *
 * Le catalogue contient « CONGÉLATEUR » (48 fois) et « CONGELATEUR » (41 fois).
 * La variante accentuee est retenue : elle est correcte en francais, et c'est
 * elle qui sera imprimee sur les affiches. A defaut d'accent dans aucune
 * variante, la plus frequente l'emporte.
 */
function choisirFormeCanonique(variantes: Map<string, number>): string {
  let meilleure = '';
  let meilleurScore = -1;

  for (const [forme, occurrences] of variantes) {
    const aDesAccents = forme !== sansAccents(forme);
    const score = occurrences + (aDesAccents ? 100000 : 0);
    if (score > meilleurScore) {
      meilleurScore = score;
      meilleure = forme;
    }
  }
  return meilleure;
}


/* -------------------------------------------------------------------------- */
/* Deduction de la categorie                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Regles de deduction de la categorie a partir de la designation.
 *
 * Le fichier source ne porte pas de colonne categorie : dans le classeur VBA,
 * le rayon etait implicite. Les regles ci-dessous sont evaluees dans l'ordre,
 * la premiere qui correspond l'emporte — d'ou le placement de « TV » avant les
 * regles plus generiques.
 *
 * Testees sur les 2 411 designations du catalogue reel, elles en classent
 * environ 93 %. Le reste recoit la categorie par defaut choisie a l'import et
 * pourra etre corrige article par article.
 */
const REGLES_CATEGORIE: readonly (readonly [RegExp, CategorieProduit])[] = [
  [
    /\bTV\b|TELEVISEUR|BARRE DE SON|HOME CINEMA|ENCEINTE|RADIO|RECEPTEUR|ANTENNE|CASQUE|ECOUTEUR|SOUNDBAR|PROJECTEUR|VIDEOPROJ|\bQLED\b|\bOLED\b/,
    'image-son',
  ],
  [
    /SMARTPHONE|IPHONE|TELEPHONE|TABLETTE|MONTRE|IPAD|MATEPAD|CHARGEUR|POWER ?BANK|COQUE|CABLE|AIRPODS|GALAXY|\bSIM\b/,
    'telephonie',
  ],
  [
    /\bPC\b|NOTEBOOK|ORDINATEUR|IMPRIMANTE|CARTOUCHE|SCANNER|MACBOOK|LAPTOP|CLAVIER|SOURIS|TONER|DISQUE|CLE USB/,
    'pc',
  ],
  [/REFRIGERATEUR|CONGELATEUR|COMBINE|VITRINE|CAVE A VIN|SIDE BY SIDE|MINI BAR/, 'froid'],
  [/MACHINE A LA ?VER|LAVE.?LINGE|LAVE.?VAISSELLE|LAVANTE|SECHE.?LINGE|SECHOIR/, 'lavage'],
  [
    /CUISINIERE|\bFOUR\b|PLAQUE|RECHAUD|MICRO.?ONDES?|HOTTE|BARBECUE|TABLE DE CUISSON|GAZINIERE|PACK CUISINE|TABLE TOP/,
    'cuisson',
  ],
  [
    /BLENDER|PETRIN|FRITEUSE|HACHOIR|HACHE VIANDE|MIXEUR|BOUILLOIRE|CAFETIERE|PANN?INI|PANINEUSE|PRESSE|ROBOT|GRILLE.?PAIN|AIR ?FRYER|KITCHEN|BATTEUR|CENTRIFUGEUSE|EXTRACTEUR|MOULIN|YAOURTIERE|GAUFRIER|CREPIERE|BALANCE|FER A REPASSER|CENTRALE VAPEUR|DEFROISSEUR|SECHE.?CHEVEUX|RASOIR|TONDEUSE|EPILATEUR|BROSSE|LISSEUR|ESPRESSO/,
    'pem',
  ],
  [
    /ASPIRATEUR|NETTOYEUR|CLIMATISEUR|VENTILATEUR|CHAUFFAGE|CHAUFF.? ?EAU|RADIAT|PURIFICATEUR|HUMIDIFICATEUR|CHAUDIERE|POMPE|GROUPE ELECTROGENE|\bCLIM\b/,
    'gem',
  ],
];

/** Deduit la categorie d'un article, ou null si aucune regle ne correspond. */
export function deduireCategorie(designation: string): CategorieProduit | null {
  const texte = sansAccents(designation).toUpperCase();
  for (const [motif, categorie] of REGLES_CATEGORIE) {
    if (motif.test(texte)) return categorie;
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* Lecture du fichier                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Texte d'une cellule lue en valeur brute. Un nombre entier redevient une
 * suite de chiffres complete (6942351415628), jamais « 6.94235E+12 ».
 */
function texteCellule(valeur: unknown): string {
  if (valeur === null || valeur === undefined) return '';
  if (typeof valeur === 'number') {
    return Number.isInteger(valeur) ? valeur.toFixed(0) : String(valeur);
  }
  return String(valeur).trim();
}

/** Une ligne brute du fichier, colonnes A a J dans l'ordre du classeur. */
interface LigneBrute {
  readonly numero: number;
  readonly code: string;
  readonly marque: string;
  readonly designation: string;
  readonly reference: string;
  readonly pictos: string[];
}

/**
 * Lit le classeur et renvoie les lignes brutes.
 *
 * Les colonnes sont lues par position et non par en-tete : ceux du fichier
 * reel sont fautifs (« ARTCILE », « LOGO.jpg.jpg ») et varient d'un export a
 * l'autre. La position, elle, est stable — c'est d'ailleurs ainsi que la macro
 * VBA procedait.
 */
export function lireClasseur(donnees: ArrayBuffer): LigneBrute[] {
  const classeur = XLSX.read(donnees, { type: 'array' });
  const premiereFeuille = classeur.SheetNames[0];
  if (!premiereFeuille) return [];

  const feuille = classeur.Sheets[premiereFeuille];
  if (!feuille) return [];

  // Valeurs brutes : avec le texte affiche (raw: false), Excel rend les codes
  // longs au format « Standard » en notation scientifique (8.8061E+12), et
  // plusieurs articles differents se retrouvaient avec le meme code.
  const matrice = XLSX.utils.sheet_to_json<unknown[]>(feuille, {
    header: 1,
    defval: '',
    raw: true,
  });

  const lignes: LigneBrute[] = [];

  // La premiere ligne porte les en-tetes : on demarre a l'indice 1.
  for (let i = 1; i < matrice.length; i++) {
    const cellules = matrice[i];
    if (!cellules) continue;

    const code = texteCellule(cellules[0]);
    if (!code) continue;

    lignes.push({
      numero: i + 1,
      code,
      marque: normaliserCode(texteCellule(cellules[1])),
      designation: normaliserLibelle(texteCellule(cellules[2])),
      reference: texteCellule(cellules[3]),
      pictos: [4, 5, 6, 7, 8, 9].map((colonne) => normaliserCode(texteCellule(cellules[colonne]))),
    });
  }

  return lignes;
}

/* -------------------------------------------------------------------------- */
/* Deduplication                                                               */
/* -------------------------------------------------------------------------- */

/** Nombre de champs renseignes : sert a departager deux lignes de meme code. */
function completude(ligne: LigneBrute): number {
  let score = 0;
  if (ligne.marque) score += 1;
  if (ligne.designation) score += 1;
  if (ligne.reference) score += 1;
  score += ligne.pictos.filter((p) => p.length > 0).length;
  return score;
}

export interface Doublon {
  readonly code: string;
  readonly retenue: number;
  readonly ecartees: readonly number[];
}

/**
 * Ecarte les codes en double en conservant la ligne la plus complete.
 *
 * Le catalogue reel comporte 110 codes dupliques, dont les variantes different
 * reellement — « PC PORTABLE » et « NOTEBOOK » pour un meme code, avec des
 * pictogrammes distincts. A egalite de completude, la premiere rencontree est
 * conservee.
 */
export function dedupliquer(lignes: readonly LigneBrute[]): {
  retenues: LigneBrute[];
  doublons: Doublon[];
} {
  const parCode = new Map<string, LigneBrute[]>();
  for (const ligne of lignes) {
    const groupe = parCode.get(ligne.code);
    if (groupe) groupe.push(ligne);
    else parCode.set(ligne.code, [ligne]);
  }

  const retenues: LigneBrute[] = [];
  const doublons: Doublon[] = [];

  for (const [code, groupe] of parCode) {
    if (groupe.length === 1) {
      retenues.push(groupe[0]!);
      continue;
    }

    let meilleure = groupe[0]!;
    for (const candidate of groupe.slice(1)) {
      if (completude(candidate) > completude(meilleure)) meilleure = candidate;
    }

    retenues.push(meilleure);
    doublons.push({
      code,
      retenue: meilleure.numero,
      ecartees: groupe.filter((l) => l !== meilleure).map((l) => l.numero),
    });
  }

  return { retenues, doublons };
}

/* -------------------------------------------------------------------------- */
/* Analyse prealable                                                           */
/* -------------------------------------------------------------------------- */

export interface LignePreparee {
  readonly numero: number;
  readonly saisie: SaisieArticle;
  readonly marqueNom: string;
}

export interface Analyse {
  readonly total: number;
  readonly pretes: LignePreparee[];
  readonly doublons: Doublon[];
  readonly marquesInconnues: { readonly nom: string; readonly lignes: number }[];
  readonly sansDesignation: number[];
  readonly formesUnifiees: { readonly canonique: string; readonly variantes: string[] }[];
  /** Articles dont la categorie n'a pas pu etre deduite de la designation. */
  readonly nonClassees: number;
}

/**
 * Prepare l'import sans rien ecrire : produit un rapport que l'operateur
 * valide avant que les donnees ne partent vers Supabase.
 */
export function analyser(
  lignes: readonly LigneBrute[],
  marquesConnues: ReadonlyMap<string, string>,
  categorieParDefaut: CategorieProduit,
): Analyse {
  const { retenues, doublons } = dedupliquer(lignes);

  // Rapprochement des variantes de designation (CONGELATEUR / CONGÉLATEUR).
  const variantesParCle = new Map<string, Map<string, number>>();
  for (const ligne of retenues) {
    if (!ligne.designation) continue;
    const cle = cleComparaison(ligne.designation);
    const variantes = variantesParCle.get(cle) ?? new Map<string, number>();
    variantes.set(ligne.designation, (variantes.get(ligne.designation) ?? 0) + 1);
    variantesParCle.set(cle, variantes);
  }

  const canoniqueParCle = new Map<string, string>();
  const formesUnifiees: { canonique: string; variantes: string[] }[] = [];
  for (const [cle, variantes] of variantesParCle) {
    const canonique = choisirFormeCanonique(variantes);
    canoniqueParCle.set(cle, canonique);
    if (variantes.size > 1) {
      formesUnifiees.push({
        canonique,
        variantes: [...variantes.keys()].filter((v) => v !== canonique),
      });
    }
  }

  const pretes: LignePreparee[] = [];
  const marquesManquantes = new Map<string, number>();
  const sansDesignation: number[] = [];
  let nonClassees = 0;

  for (const ligne of retenues) {
    if (!ligne.designation) {
      sansDesignation.push(ligne.numero);
      continue;
    }

    const marqueId = marquesConnues.get(ligne.marque);
    if (!marqueId) {
      marquesManquantes.set(ligne.marque, (marquesManquantes.get(ligne.marque) ?? 0) + 1);
      continue;
    }

    const designation = canoniqueParCle.get(cleComparaison(ligne.designation)) ?? ligne.designation;
    const categorie = deduireCategorie(designation) ?? categorieParDefaut;
    if (!deduireCategorie(designation)) nonClassees += 1;
    const pictos = [...ligne.pictos];
    while (pictos.length < NB_PICTOS) pictos.push('');

    pretes.push({
      numero: ligne.numero,
      marqueNom: ligne.marque,
      saisie: {
        ean: ligne.code,
        marqueId,
        designation,
        reference: ligne.reference,
        categorie,
        pictos: pictos.slice(0, NB_PICTOS),
        livraisonGratuiteExclue: false,
        actif: true,
      },
    });
  }

  return {
    total: lignes.length,
    pretes,
    doublons,
    marquesInconnues: [...marquesManquantes.entries()]
      .map(([nom, lignes]) => ({ nom, lignes }))
      .sort((a, b) => b.lignes - a.lignes),
    sansDesignation,
    formesUnifiees: formesUnifiees.sort((a, b) => b.variantes.length - a.variantes.length),
    nonClassees,
  };
}
