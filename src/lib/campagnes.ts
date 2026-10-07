/**
 * AFFICHES-EM v1.0 — Acces aux donnees « campagnes » et « affiches »
 *
 * Une campagne regroupe les affiches d'une meme operation commerciale. Elle
 * remplace la feuille SAISIE_EM du classeur, qui ne pouvait en contenir qu'une
 * a la fois : chaque nouvelle operation ecrasait la precedente.
 *
 * Droits : un operateur ne voit et ne modifie que ses propres campagnes et
 * affiches, les administrateurs voient tout. C'est PostgreSQL (regles RLS de
 * supabase/schema.sql) qui applique cette regle, pas l'interface.
 */

import { supabase, TABLES, verifier, messageErreurGenerique } from './supabase';
import type { FormatAffiche } from '../config/constants';
import { lireMentions, type CleBadge } from '../components/affiche/BadgesPromo';

export type StatutCampagne = 'brouillon' | 'validee' | 'imprimee' | 'archivee';

export interface Campagne {
  readonly id: string;
  readonly nom: string;
  readonly statut: StatutCampagne;
  readonly createdBy: string;
  readonly creeeLe: string;
  /**
   * Gabarit impose a toute la campagne (« electro », « nouvelles-technologies »
   * ou « op:<id> »), ou null pour le choix automatique selon la categorie.
   */
  readonly gabarit: string | null;
}

export interface Affiche {
  readonly id: string;
  readonly campagneId: string;
  readonly ean: string;
  readonly prixBarre: number;
  readonly prixPrincipal: number;
  readonly format: FormatAffiche;
  readonly stockLimite: boolean;
  readonly nouveaute: boolean;
  readonly promotion: boolean;
  /** Badges supplementaires : Vu dans le depliant, Exclusivite, Marjane s'engage. */
  readonly mentions: readonly CleBadge[];
  readonly ordre: number;
}

export interface SaisieAffiche {
  ean: string;
  prixBarre: number;
  prixPrincipal: number;
  format: FormatAffiche;
  stockLimite: boolean;
  nouveaute: boolean;
  promotion: boolean;
  mentions?: readonly CleBadge[];
}

interface LigneCampagne {
  id: string;
  created_at: string;
  nom: string;
  statut: StatutCampagne | null;
  created_by: string | null;
  gabarit: string | null;
}

interface LigneAffiche {
  id: string;
  campagne_id: string;
  ean: string;
  prix_barre: number | string | null;
  prix_principal: number | string;
  format: FormatAffiche | null;
  stock_limite: boolean | null;
  nouveaute: boolean | null;
  promotion: boolean | null;
  mentions: string | null;
  ordre: number | null;
}

const COLONNES_CAMPAGNE = 'id, created_at, nom, statut, created_by, gabarit';
const COLONNES_AFFICHE =
  'id, campagne_id, ean, prix_barre, prix_principal, format, stock_limite, nouveaute, promotion, mentions, ordre';

const versCampagne = (l: LigneCampagne): Campagne => ({
  id: l.id,
  nom: l.nom,
  statut: l.statut ?? 'brouillon',
  createdBy: l.created_by ?? '',
  creeeLe: l.created_at,
  gabarit: l.gabarit || null,
});

const versAffiche = (l: LigneAffiche): Affiche => ({
  id: l.id,
  campagneId: l.campagne_id,
  ean: l.ean,
  prixBarre: Number(l.prix_barre ?? 0),
  prixPrincipal: Number(l.prix_principal),
  format: l.format ?? 'A4',
  stockLimite: l.stock_limite ?? false,
  nouveaute: l.nouveaute ?? false,
  promotion: l.promotion ?? false,
  mentions: lireMentions(l.mentions),
  ordre: l.ordre ?? 0,
});

/* -------------------------------------------------------------------------- */
/* Campagnes                                                                   */
/* -------------------------------------------------------------------------- */

export async function listerCampagnes(): Promise<Campagne[]> {
  const lignes = verifier(
    await supabase
      .from(TABLES.CAMPAGNES)
      .select(COLONNES_CAMPAGNE)
      .order('created_at', { ascending: false })
      .limit(100),
  );
  return (lignes as LigneCampagne[]).map(versCampagne);
}

/** Cree une campagne appartenant a son auteur. */
export async function creerCampagne(nom: string, userId: string): Promise<Campagne> {
  const ligne = verifier(
    await supabase
      .from(TABLES.CAMPAGNES)
      .insert({ nom: nom.trim(), statut: 'brouillon', created_by: userId })
      .select(COLONNES_CAMPAGNE)
      .single(),
  );
  return versCampagne(ligne as LigneCampagne);
}

export async function obtenirCampagne(id: string): Promise<Campagne> {
  const ligne = verifier(
    await supabase.from(TABLES.CAMPAGNES).select(COLONNES_CAMPAGNE).eq('id', id).single(),
  );
  return versCampagne(ligne as LigneCampagne);
}

export async function changerStatutCampagne(id: string, statut: StatutCampagne): Promise<Campagne> {
  const ligne = verifier(
    await supabase
      .from(TABLES.CAMPAGNES)
      .update({ statut })
      .eq('id', id)
      .select(COLONNES_CAMPAGNE)
      .single(),
  );
  return versCampagne(ligne as LigneCampagne);
}

/** Enregistre le gabarit de la campagne (null : choix automatique). */
export async function changerGabaritCampagne(id: string, gabarit: string | null): Promise<Campagne> {
  const ligne = verifier(
    await supabase
      .from(TABLES.CAMPAGNES)
      .update({ gabarit })
      .eq('id', id)
      .select(COLONNES_CAMPAGNE)
      .single(),
  );
  return versCampagne(ligne as LigneCampagne);
}

/** Supprime la campagne ; ses affiches sont supprimees par la base (cascade). */
export async function supprimerCampagne(id: string): Promise<void> {
  verifier(await supabase.from(TABLES.CAMPAGNES).delete().eq('id', id));
}

/* -------------------------------------------------------------------------- */
/* Affiches                                                                    */
/* -------------------------------------------------------------------------- */

export async function listerAffiches(campagneId: string): Promise<Affiche[]> {
  const lignes = verifier(
    await supabase
      .from(TABLES.AFFICHES)
      .select(COLONNES_AFFICHE)
      .eq('campagne_id', campagneId)
      .order('ordre', { ascending: true })
      .limit(500),
  );
  return (lignes as LigneAffiche[]).map(versAffiche);
}

/** Convertit la saisie en colonnes de la table. */
function versDonnees(saisie: SaisieAffiche) {
  return {
    ean: saisie.ean,
    prix_barre: saisie.prixBarre,
    prix_principal: saisie.prixPrincipal,
    format: saisie.format,
    stock_limite: saisie.stockLimite,
    nouveaute: saisie.nouveaute,
    promotion: saisie.promotion,
    mentions: (saisie.mentions ?? []).join(','),
  };
}

export async function ajouterAffiche(
  campagneId: string,
  saisie: SaisieAffiche,
  ordre: number,
  userId: string,
): Promise<Affiche> {
  const ligne = verifier(
    await supabase
      .from(TABLES.AFFICHES)
      .insert({ campagne_id: campagneId, ordre, created_by: userId, ...versDonnees(saisie) })
      .select(COLONNES_AFFICHE)
      .single(),
  );
  return versAffiche(ligne as LigneAffiche);
}

export async function modifierAffiche(id: string, saisie: SaisieAffiche): Promise<Affiche> {
  const ligne = verifier(
    await supabase
      .from(TABLES.AFFICHES)
      .update(versDonnees(saisie))
      .eq('id', id)
      .select(COLONNES_AFFICHE)
      .single(),
  );
  return versAffiche(ligne as LigneAffiche);
}

export async function supprimerAffiche(id: string): Promise<void> {
  verifier(await supabase.from(TABLES.AFFICHES).delete().eq('id', id));
}

/* -------------------------------------------------------------------------- */

export const LIBELLE_STATUT: Readonly<Record<StatutCampagne, string>> = {
  brouillon: 'Brouillon',
  validee: 'Validee',
  imprimee: 'Imprimee',
  archivee: 'Archivee',
};

export function messageErreurCampagne(erreur: unknown): string {
  return messageErreurGenerique(erreur);
}
