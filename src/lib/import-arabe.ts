/**
 * AFFICHES-EM v1.0 — Mise a jour des designations arabes par fichier
 *
 * Fichier a DEUX colonnes : A = code article, B = designation arabe. Il ne
 * cree aucun article : il complete ou corrige la designation arabe des codes
 * deja presents au catalogue. Rien d'autre n'est modifie, et une cellule
 * arabe vide n'efface jamais une valeur existante.
 */

import * as XLSX from 'xlsx';
import { decoderCsv, texteCellule } from './import-catalogue';
import { mettreAJourDesignationArabe, type CorrespondanceArabe } from './articles';
import { ajouterDesignationsEnLot, normaliserArabe, validerArabe } from './designations-arabes';

export interface LigneArabe {
  readonly numero: number;
  readonly code: string;
  readonly arabe: string;
}

/** Une premiere ligne est un en-tete si elle contient l'un de ces mots. */
const MOTIF_ENTETE = /code|ean|article|arab|\u0639\u0631\u0628|designation|d\u00e9signation/i;

/** Lit le fichier : colonne A = code, colonne B = designation arabe. */
export function lireFichierArabe(donnees: ArrayBuffer, nomFichier = ''): LigneArabe[] {
  const classeur = /\.csv$/i.test(nomFichier)
    ? XLSX.read(decoderCsv(donnees), { type: 'string', raw: true })
    : XLSX.read(donnees, { type: 'array' });
  const nom = classeur.SheetNames[0];
  const feuille = nom ? classeur.Sheets[nom] : undefined;
  if (!feuille) return [];

  // Valeurs brutes : un code long ne doit jamais devenir 8.0E+12.
  const matrice = XLSX.utils.sheet_to_json<unknown[]>(feuille, { header: 1, defval: '', raw: true });
  const entete = matrice[0] ? MOTIF_ENTETE.test(`${String(matrice[0][0] ?? '')} ${String(matrice[0][1] ?? '')}`) : false;

  const lignes: LigneArabe[] = [];
  for (let i = entete ? 1 : 0; i < matrice.length; i++) {
    const cellules = matrice[i];
    if (!cellules) continue;
    const code = texteCellule(cellules[0]).replace(/\s+/g, '');
    if (!code) continue;
    lignes.push({ numero: i + 1, code, arabe: normaliserArabe(texteCellule(cellules[1])) });
  }
  return lignes;
}

export interface MiseAJourArabe {
  readonly numero: number;
  readonly code: string;
  readonly designation: string;
  readonly ancien: string;
  readonly nouveau: string;
}

export interface AnalyseArabe {
  readonly lignesLues: number;
  /** A enregistrer : designation arabe ajoutee (ancien vide) ou remplacee. */
  readonly aMettreAJour: MiseAJourArabe[];
  readonly nbAjouts: number;
  readonly nbRemplacements: number;
  /** Deja identiques en base : rien a faire. */
  readonly inchanges: number;
  /** Codes absents du catalogue : ignores (ce fichier ne cree pas d'article). */
  readonly introuvables: { readonly numero: number; readonly code: string }[];
  /** Cellule arabe vide : ignoree, la valeur existante est conservee. */
  readonly vides: { readonly numero: number; readonly code: string }[];
  readonly invalides: { readonly numero: number; readonly code: string; readonly valeur: string; readonly raison: string }[];
  /** Meme code sur plusieurs lignes : la derniere ligne fait foi. */
  readonly doublons: { readonly code: string; readonly lignes: number[] }[];
}

/** Retrouve le code au catalogue ; a defaut, rajoute les zeros de tete qu'Excel a pu retirer (EAN-13). */
function trouverCode(code: string, catalogue: ReadonlyMap<string, CorrespondanceArabe>): string | null {
  if (catalogue.has(code)) return code;
  if (/^\d+$/.test(code) && code.length < 13) {
    const complet = code.padStart(13, '0');
    if (catalogue.has(complet)) return complet;
  }
  return null;
}

/** Compare le fichier au catalogue. Fonction pure : ne touche pas a la base. */
export function analyserArabe(
  lignes: readonly LigneArabe[],
  catalogue: ReadonlyMap<string, CorrespondanceArabe>,
): AnalyseArabe {
  const introuvables: AnalyseArabe['introuvables'][number][] = [];
  const vides: AnalyseArabe['vides'][number][] = [];
  const invalides: AnalyseArabe['invalides'][number][] = [];
  const parCode = new Map<string, LigneArabe[]>();

  for (const ligne of lignes) {
    const code = trouverCode(ligne.code, catalogue);
    if (!code) {
      introuvables.push({ numero: ligne.numero, code: ligne.code });
      continue;
    }
    if (!ligne.arabe) {
      vides.push({ numero: ligne.numero, code });
      continue;
    }
    const probleme = validerArabe(ligne.arabe);
    if (probleme) {
      invalides.push({ numero: ligne.numero, code, valeur: ligne.arabe, raison: probleme });
      continue;
    }
    parCode.set(code, [...(parCode.get(code) ?? []), { ...ligne, code }]);
  }

  const aMettreAJour: MiseAJourArabe[] = [];
  const doublons: AnalyseArabe['doublons'][number][] = [];
  let inchanges = 0;
  let nbAjouts = 0;
  let nbRemplacements = 0;

  for (const [code, occurrences] of parCode) {
    if (occurrences.length > 1) doublons.push({ code, lignes: occurrences.map((o) => o.numero) });
    const derniere = occurrences[occurrences.length - 1];
    const article = catalogue.get(code);
    if (!derniere || !article) continue;
    if (article.designationArabe === derniere.arabe) {
      inchanges += 1;
      continue;
    }
    if (article.designationArabe) nbRemplacements += 1;
    else nbAjouts += 1;
    aMettreAJour.push({
      numero: derniere.numero,
      code,
      designation: article.designation,
      ancien: article.designationArabe,
      nouveau: derniere.arabe,
    });
  }

  return {
    lignesLues: lignes.length,
    aMettreAJour,
    nbAjouts,
    nbRemplacements,
    inchanges,
    introuvables,
    vides,
    invalides,
    doublons,
  };
}

export interface ResultatApplication {
  readonly reussies: number;
  readonly erreurs: { readonly code: string; readonly message: string }[];
  /** Designations nouvellement ajoutees au referentiel de la liste deroulante. */
  readonly ajoutsReferentiel: number;
}

/**
 * Enregistre les mises a jour (6 requetes en parallele), puis complete le
 * referentiel de la liste deroulante. Une erreur sur un article n'arrete pas
 * les autres : elle est listee dans le resultat.
 */
export async function appliquerMisesAJour(
  maj: readonly MiseAJourArabe[],
  surProgression: (faites: number, total: number) => void,
  arret: { current: boolean },
): Promise<ResultatApplication> {
  const erreurs: { code: string; message: string }[] = [];
  const reussies: MiseAJourArabe[] = [];
  let curseur = 0;
  let faites = 0;

  async function ouvrier() {
    while (!arret.current) {
      const element = maj[curseur++];
      if (!element) return;
      try {
        await mettreAJourDesignationArabe(element.code, element.nouveau);
        reussies.push(element);
      } catch (e) {
        erreurs.push({ code: element.code, message: e instanceof Error ? e.message : String(e) });
      }
      faites += 1;
      surProgression(faites, maj.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(6, maj.length) }, ouvrier));

  let ajoutsReferentiel = 0;
  try {
    ajoutsReferentiel = (
      await ajouterDesignationsEnLot(reussies.map((m) => ({ ar: m.nouveau, fr: m.designation })))
    ).length;
  } catch {
    /* non bloquant : les articles sont a jour, la liste se completera plus tard */
  }
  return { reussies: reussies.length, erreurs, ajoutsReferentiel };
}
