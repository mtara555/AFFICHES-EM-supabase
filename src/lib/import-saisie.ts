/**
 * AFFICHES-EM v1.0 — Import d'un fichier de prix dans une campagne
 *
 * Reprend le bouton « Importer donnees » de la feuille SAISIE_EM :
 *   colonne A : code article
 *   colonne B : prix barre (facultatif)
 *   colonne C : prix de vente
 * Les codes absents du catalogue sont signales et ne sont pas importes,
 * exactement comme la macro VBA.
 *
 * Formats acceptes : .xlsx, .xls, .csv. Une ligne d'en-tete est detectee et
 * ignoree automatiquement.
 */

import * as XLSX from 'xlsx';
import { trouverParEan, type Article } from './articles';

export interface LigneImport {
  readonly numero: number;
  readonly code: string;
  readonly prixBarre: number;
  readonly prixPrincipal: number;
  /** Fiche article trouvee, null si le code est inconnu. */
  article: Article | null;
  /** Probleme bloquant, ou null si la ligne peut etre importee. */
  probleme: string | null;
  /** Avertissement non bloquant. */
  avertissement: string | null;
}

/** « 7 990,00 », « 7990.00 », 7990 → 7990. Vide → 0. Illisible → NaN. */
function lirePrix(valeur: unknown): number {
  if (valeur === null || valeur === undefined || valeur === '') return 0;
  if (typeof valeur === 'number') return valeur;
  const texte = String(valeur)
    .replace(/\s| | /g, '')
    .replace(/dh|mad/gi, '')
    .replace(',', '.');
  if (!texte) return 0;
  const n = Number(texte);
  return Number.isFinite(n) ? n : Number.NaN;
}

/** Un code lu comme nombre par Excel (6942351415628) redevient du texte, sans « E+12 ». */
function lireCode(valeur: unknown): string {
  if (typeof valeur === 'number') return Number.isInteger(valeur) ? valeur.toFixed(0) : String(valeur);
  return String(valeur ?? '').trim();
}

/** Lit la premiere feuille du fichier. */
export function lireFichierPrix(donnees: ArrayBuffer): LigneImport[] {
  const classeur = XLSX.read(donnees, { type: 'array' });
  const nom = classeur.SheetNames[0];
  const feuille = nom ? classeur.Sheets[nom] : undefined;
  if (!feuille) return [];

  const matrice = XLSX.utils.sheet_to_json<unknown[]>(feuille, {
    header: 1,
    defval: '',
    raw: true,
    blankrows: false,
  });

  const lignes: LigneImport[] = [];
  matrice.forEach((cellules, index) => {
    const code = lireCode(cellules[0]);
    if (!code) return;
    // En-tete : la premiere ligne dont la colonne A ne contient aucun chiffre.
    if (index === 0 && !/\d/.test(code)) return;

    const prixBarre = lirePrix(cellules[1]);
    const prixPrincipal = lirePrix(cellules[2]);

    let probleme: string | null = null;
    let avertissement: string | null = null;
    if (!Number.isFinite(prixPrincipal) || prixPrincipal <= 0) {
      probleme = 'Prix de vente manquant ou illisible (colonne C)';
    } else if (!Number.isFinite(prixBarre) || prixBarre < 0) {
      probleme = 'Prix barre illisible (colonne B)';
    } else if (prixBarre > 0 && prixBarre <= prixPrincipal) {
      avertissement = 'Prix barre inferieur ou egal au prix de vente : il ne sera pas affiche';
    }

    lignes.push({
      numero: index + 1,
      code,
      prixBarre: Number.isFinite(prixBarre) ? prixBarre : 0,
      prixPrincipal: Number.isFinite(prixPrincipal) ? prixPrincipal : 0,
      article: null,
      probleme,
      avertissement,
    });
  });
  return lignes;
}

/** Recherche les fiches articles, par lots, et marque les codes inconnus. */
export async function verifierCodes(
  lignes: LigneImport[],
  surProgression?: (faits: number, total: number) => void,
): Promise<LigneImport[]> {
  const codes = [...new Set(lignes.map((l) => l.code))];
  const trouves = new Map<string, Article | null>();
  const LOT = 8;
  for (let i = 0; i < codes.length; i += LOT) {
    const lot = codes.slice(i, i + LOT);
    const resultats = await Promise.all(lot.map((c) => trouverParEan(c)));
    lot.forEach((c, j) => trouves.set(c, resultats[j] ?? null));
    surProgression?.(Math.min(i + LOT, codes.length), codes.length);
  }
  return lignes.map((l) => {
    const article = trouves.get(l.code) ?? null;
    return {
      ...l,
      article,
      probleme: l.probleme ?? (article ? null : 'Code absent du catalogue'),
    };
  });
}

/** Genere et telecharge un modele vierge, avec deux lignes d'exemple. */
export function telechargerModele(): void {
  const feuille = XLSX.utils.aoa_to_sheet([
    ['CODE ARTICLE', 'PRIX BARRE', 'PRIX DE VENTE'],
    ['6942351415628', 7990, 4999],
    ['9315540422153', 6799, 6299],
  ]);
  feuille['!cols'] = [{ wch: 18 }, { wch: 14 }, { wch: 16 }];
  // Colonne A en texte : Excel n'ecrira pas les codes en notation scientifique.
  for (let r = 2; r <= 3; r++) {
    const cellule = feuille[`A${r}`];
    if (cellule) {
      cellule.t = 's';
      cellule.z = '@';
    }
  }
  const classeur = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(classeur, feuille, 'SAISIE');
  XLSX.writeFile(classeur, 'modele-import-affiches.xlsx');
}
