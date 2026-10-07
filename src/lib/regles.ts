/**
 * AFFICHES-EM v1.0 — Moteur de regles commerciales
 *
 * Reprend a l'identique la logique du module VBA `InsererDonnees`, en la
 * sortant du code : les seuils et le bareme sont desormais des donnees,
 * modifiables par un administrateur sans intervention technique.
 *
 * Les fonctions sont pures : memes entrees, memes sorties, aucun appel reseau.
 * C'est ce qui permet de les verifier isolement et de garantir que l'affiche
 * generee correspondra toujours au calcul affiche a la saisie.
 */

import { supabase, TABLES, verifier } from './supabase';
import {
  BAREME_CREDIT_DEFAUT,
  SEUIL_LIVRAISON_GRATUITE_DEFAUT,
  SEUIL_ECONOMIE_POURCENT_DEFAUT,
  type PalierCredit,
} from '../config/constants';

export interface ParametresRegles {
  readonly baremeCredit: readonly PalierCredit[];
  readonly seuilLivraisonGratuite: number;
  readonly seuilEconomiePourcent: number;
}

export const PARAMETRES_DEFAUT: ParametresRegles = {
  baremeCredit: BAREME_CREDIT_DEFAUT,
  seuilLivraisonGratuite: SEUIL_LIVRAISON_GRATUITE_DEFAUT,
  seuilEconomiePourcent: SEUIL_ECONOMIE_POURCENT_DEFAUT,
};

/* -------------------------------------------------------------------------- */
/* Calculs                                                                     */
/* -------------------------------------------------------------------------- */

export interface ResultatRegles {
  /** Montant de la remise, en dirhams. Zero si aucune remise. */
  readonly economie: number;
  /** Remise exprimee en pourcentage du prix barre. */
  readonly economiePourcent: number;
  /** Le bandeau « economie » doit-il figurer sur l'affiche ? */
  readonly afficherEconomie: boolean;
  /** Duree de financement retenue, ou null si le produit n'y est pas eligible. */
  readonly dureeCredit: number | null;
  /** Montant d'une mensualite, ou null. */
  readonly mensualite: number | null;
  /** Le badge « livraison gratuite » doit-il figurer sur l'affiche ? */
  readonly livraisonGratuite: boolean;
}

/**
 * Applique les regles commerciales a un couple de prix.
 *
 * @param prixBarre      Prix avant remise (colonne M du classeur). Zero si absent.
 * @param prixPrincipal  Prix de vente affiche (colonne N).
 * @param exclueLivraison Article exclu de la livraison gratuite malgre son prix.
 */
export function appliquerRegles(
  prixBarre: number,
  prixPrincipal: number,
  exclueLivraison: boolean,
  parametres: ParametresRegles = PARAMETRES_DEFAUT,
): ResultatRegles {
  const M = Number.isFinite(prixBarre) ? prixBarre : 0;
  const N = Number.isFinite(prixPrincipal) ? prixPrincipal : 0;

  /* --- Economie -----------------------------------------------------------
   * Le module VBA comparait `difference < seuil10Pourcent` sans verifier que le
   * prix barre etait renseigne : une colonne M vide produisait une difference
   * negative et un affichage incoherent. Les deux gardes ci-dessous corrigent
   * ce defaut. */
  const economie = M > 0 ? M - N : 0;
  const seuil = (M * parametres.seuilEconomiePourcent) / 100;
  const afficherEconomie = M > 0 && economie > 0 && economie >= seuil;
  const economiePourcent = M > 0 ? (economie / M) * 100 : 0;

  /* --- Credit sans interet ------------------------------------------------
   * Le bareme est parcouru du palier le plus eleve au plus bas : le premier
   * atteint l'emporte, exactement comme la cascade de If du module VBA. */
  const paliers = [...parametres.baremeCredit].sort((a, b) => b.seuilDh - a.seuilDh);
  const palier = paliers.find((p) => N >= p.seuilDh) ?? null;
  const dureeCredit = palier ? palier.dureeMois : null;
  const mensualite = dureeCredit ? N / dureeCredit : null;

  /* --- Livraison gratuite -------------------------------------------------- */
  const livraisonGratuite = !exclueLivraison && N >= parametres.seuilLivraisonGratuite;

  return {
    economie: afficherEconomie ? economie : 0,
    economiePourcent,
    afficherEconomie,
    dureeCredit,
    mensualite,
    livraisonGratuite,
  };
}

/* -------------------------------------------------------------------------- */
/* Formatage                                                                   */
/* -------------------------------------------------------------------------- */

/** Formate un montant au format « # ##0,00 » utilise sur les affiches. */
export function formaterMontant(valeur: number): string {
  // Le separateur de milliers francais est une espace fine insecable (U+202F),
  // absente des polices BF Marjane : on la remplace par l'espace insecable
  // classique (U+00A0), que la police contient.
  return valeur
    .toLocaleString('fr-FR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
    .replace(/\u202f/g, '\u00a0');
}

/* -------------------------------------------------------------------------- */
/* Chargement depuis Supabase                                                  */
/* -------------------------------------------------------------------------- */

interface LigneParametre {
  cle: string;
  valeur: string;
}

/**
 * Charge les parametres commerciaux depuis la base.
 *
 * En cas d'absence ou d'erreur, les valeurs par defaut s'appliquent : mieux
 * vaut une affiche calculee avec le bareme standard qu'un ecran bloque. Les
 * valeurs illisibles sont ignorees individuellement, sans invalider les autres.
 */
export async function chargerParametres(): Promise<ParametresRegles> {
  try {
    const lignes = verifier(
      await supabase.from(TABLES.PARAMETRES).select('cle, valeur').limit(50),
    ) as LigneParametre[];

    const valeurs = new Map(lignes.map((l) => [l.cle, l.valeur]));

    return {
      baremeCredit: lireBareme(valeurs.get('baremeCredit')) ?? PARAMETRES_DEFAUT.baremeCredit,
      seuilLivraisonGratuite:
        lireNombre(valeurs.get('seuilLivraisonGratuite')) ??
        PARAMETRES_DEFAUT.seuilLivraisonGratuite,
      seuilEconomiePourcent:
        lireNombre(valeurs.get('seuilEconomiePourcent')) ??
        PARAMETRES_DEFAUT.seuilEconomiePourcent,
    };
  } catch {
    return PARAMETRES_DEFAUT;
  }
}

function lireNombre(valeur: string | undefined): number | null {
  if (valeur === undefined) return null;
  const n = Number(valeur);
  return Number.isFinite(n) ? n : null;
}

function lireBareme(valeur: string | undefined): PalierCredit[] | null {
  if (!valeur) return null;
  try {
    const brut: unknown = JSON.parse(valeur);
    if (!Array.isArray(brut)) return null;
    const paliers = brut
      .filter(
        (p): p is { seuilDh: number; dureeMois: number } =>
          typeof p === 'object' &&
          p !== null &&
          typeof (p as { seuilDh?: unknown }).seuilDh === 'number' &&
          typeof (p as { dureeMois?: unknown }).dureeMois === 'number',
      )
      .map((p) => ({ seuilDh: p.seuilDh, dureeMois: p.dureeMois }));
    return paliers.length > 0 ? paliers : null;
  } catch {
    return null;
  }
}
