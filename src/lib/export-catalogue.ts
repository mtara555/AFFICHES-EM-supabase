/**
 * AFFICHES-EM v1.0 — Export du catalogue vers Excel
 *
 * Le fichier reprend la structure de l'import (colonnes A a K : code, marque,
 * designation, reference, six pictogrammes, designation arabe), puis ajoute la
 * categorie et l'etat. Il peut donc etre corrige dans Excel et reimporte tel
 * quel : l'import ignore les colonnes au-dela de K.
 */

import type { Article, FiltresArticles } from './articles';
import { listerArticles } from './articles';
import { CATEGORIES } from '../config/constants';
import { TAILLE_PAGE } from './supabase';

export const ENTETES_EXPORT = [
  'Code article',
  'Marque',
  'Designation',
  'Reference',
  'Picto 1',
  'Picto 2',
  'Picto 3',
  'Picto 4',
  'Picto 5',
  'Picto 6',
  'Designation arabe (الاسم العربي)',
  'Categorie',
  'Actif',
] as const;

/** Lignes du tableau (en-tetes comprises), prets pour la feuille Excel. */
export function lignesExport(
  articles: readonly Article[],
  nomsMarques: ReadonlyMap<string, string>,
): string[][] {
  return [
    [...ENTETES_EXPORT],
    ...articles.map((a) => [
      a.ean,
      nomsMarques.get(a.marqueId) ?? '',
      a.designation,
      a.reference,
      ...Array.from({ length: 6 }, (_, i) => a.pictos[i] ?? ''),
      a.designationArabe,
      CATEGORIES[a.categorie] ?? a.categorie,
      a.actif ? 'Oui' : 'Non',
    ]),
  ];
}

/** Lit tout le catalogue correspondant aux filtres, par pages de 500. */
export async function lireTousLesArticles(filtres: Omit<FiltresArticles, 'page' | 'parPage'>): Promise<Article[]> {
  const tous: Article[] = [];
  for (let page = 0; ; page++) {
    const { articles, total } = await listerArticles({ ...filtres, page, parPage: TAILLE_PAGE });
    tous.push(...articles);
    if (articles.length < TAILLE_PAGE || tous.length >= total) break;
  }
  return tous;
}

/**
 * Exporte le catalogue (filtres de l'ecran appliques) et declenche le
 * telechargement. Renvoie le nombre d'articles exportes.
 */
export async function exporterCatalogue(
  filtres: Omit<FiltresArticles, 'page' | 'parPage'>,
  nomsMarques: ReadonlyMap<string, string>,
): Promise<number> {
  const articles = await lireTousLesArticles(filtres);
  // Chargement a la demande : la bibliotheque Excel n'alourdit pas l'ecran.
  const XLSX = await import('xlsx');

  const feuille = XLSX.utils.aoa_to_sheet(lignesExport(articles, nomsMarques));
  feuille['!cols'] = [18, 16, 30, 24, 9, 9, 9, 9, 9, 9, 34, 14, 7].map((wch) => ({ wch }));
  // Codes en texte : evite la notation scientifique d'Excel (8.00344E+12).
  for (let r = 2; r <= articles.length + 1; r++) {
    const cellule = feuille[`A${r}`];
    if (cellule) cellule.t = 's';
  }

  const classeur = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(classeur, feuille, 'Articles');
  const jour = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(classeur, `catalogue-articles-${jour}.xlsx`);
  return articles.length;
}
