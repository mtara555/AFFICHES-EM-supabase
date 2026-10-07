/**
 * AFFICHES-EM v1.0 — Preparation des donnees d'une affiche
 *
 * Rassemble en un seul objet tout ce que le gabarit doit afficher : ligne de
 * campagne, fiche article, marque et resultat des regles commerciales. Le
 * composant de rendu reste ainsi purement visuel, sans aucun calcul metier.
 */

import type { CleBadge } from '../components/affiche/BadgesPromo';
import type { Affiche } from './campagnes';
import type { Article } from './articles';
import type { Marque } from './marques';
import { appliquerRegles, formaterMontant, type ParametresRegles, type ResultatRegles } from './regles';
import { resoudreModele, type ModeleAffiche } from '../config/gabarits';
import { DEVISE } from '../config/constants';
import { idLogo } from './supabase';

export interface DonneesAffiche {
  readonly cle: string;
  /** Cadre et mise en page de l'affiche. */
  readonly modele: ModeleAffiche;
  readonly marqueNom: string;
  /**
   * Identifiant du logo dans le compartiment : celui enregistre sur la marque,
   * sinon l'identifiant conventionnel `logo_<marqueId>`.
   */
  readonly logoFileId: string | null;
  /** Ligne 1 — designation (colonne C du classeur). */
  readonly designation: string;
  /** Ligne 2 — reference commerciale (colonne D). */
  readonly reference: string;
  /** Six emplacements ordonnes, chaine vide = emplacement libre. */
  readonly pictos: readonly string[];
  readonly prixBarre: number;
  readonly prixPrincipal: number;
  /** Prix barre affiche des qu'il est superieur au prix de vente (regle VBA). */
  readonly afficherPrixBarre: boolean;
  readonly regles: ResultatRegles;
  readonly badges: {
    readonly nouveaute: boolean;
    readonly stockLimite: boolean;
    readonly promotion: boolean;
    readonly mentions: readonly CleBadge[];
  };
}

export interface EntreeDonnees {
  readonly cle: string;
  readonly article: Article;
  readonly marque: Marque | undefined;
  readonly prixBarre: number;
  readonly prixPrincipal: number;
  readonly nouveaute?: boolean;
  readonly stockLimite?: boolean;
  readonly promotion?: boolean;
  readonly mentions?: readonly CleBadge[];
  /** Impose un modele (gabarit de campagne) ; a defaut, il suit la categorie de l'article. */
  readonly modele?: ModeleAffiche | null;
}

export function preparerDonnees(
  entree: EntreeDonnees,
  parametres: ParametresRegles,
): DonneesAffiche {
  const { article, marque } = entree;
  const prixBarre = Number.isFinite(entree.prixBarre) ? entree.prixBarre : 0;
  const prixPrincipal = Number.isFinite(entree.prixPrincipal) ? entree.prixPrincipal : 0;

  return {
    cle: entree.cle,
    modele: resoudreModele(entree.modele, article.categorie),
    marqueNom: marque?.nom ?? '',
    logoFileId: marque ? (marque.logoFileId ?? idLogo(marque.id)) : null,
    designation: article.designation,
    reference: article.reference,
    pictos: article.pictos,
    prixBarre,
    prixPrincipal,
    afficherPrixBarre: prixBarre > prixPrincipal && prixPrincipal > 0,
    regles: appliquerRegles(prixBarre, prixPrincipal, article.livraisonGratuiteExclue, parametres),
    badges: {
      nouveaute: entree.nouveaute ?? false,
      stockLimite: entree.stockLimite ?? false,
      promotion: entree.promotion ?? false,
      mentions: entree.mentions ?? [],
    },
  };
}

export function depuisAffiche(
  affiche: Affiche,
  article: Article,
  marque: Marque | undefined,
  parametres: ParametresRegles,
  modele?: ModeleAffiche | null,
): DonneesAffiche {
  return preparerDonnees(
    {
      cle: affiche.id,
      article,
      marque,
      prixBarre: affiche.prixBarre,
      prixPrincipal: affiche.prixPrincipal,
      nouveaute: affiche.nouveaute,
      stockLimite: affiche.stockLimite,
      promotion: affiche.promotion,
      mentions: affiche.mentions,
      modele,
    },
    parametres,
  );
}

/**
 * Decoupe un montant comme la macro `UpdateFormattedShapeText` : partie entiere
 * en grand, decimales et devise en petit. 4990 → { entier: "4 990", reste: ",00dh" }.
 */
export function decouperMontant(valeur: number): { entier: string; reste: string } {
  const texte = formaterMontant(valeur);
  const virgule = texte.lastIndexOf(',');
  if (virgule < 0) return { entier: texte, reste: DEVISE };
  return { entier: texte.slice(0, virgule), reste: `${texte.slice(virgule)}${DEVISE}` };
}
