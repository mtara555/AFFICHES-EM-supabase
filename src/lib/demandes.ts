/**
 * AFFICHES-EM v1.0 — Demandes d'ajout d'article
 *
 * Un operateur ne peut pas ecrire dans le catalogue (reserve aux
 * administrateurs). Quand il trouve un article absent, il envoie une demande
 * avec les informations qu'il connait ; un administrateur la valide (l'article
 * est cree) ou la rejette.
 *
 * Table `demandes_article` (supabase/schema.sql) :
 *   ean, demandeur (userId), commentaire, statut
 * Les details de l'article sont ranges en JSON dans `commentaire`.
 *
 * Droits : creation par tous les roles ; chaque auteur relit ses propres
 * demandes ; les administrateurs lisent et modifient toutes les demandes.
 */

import { supabase, TABLES, verifier, estDroitsRefuses, messageErreurGenerique } from './supabase';
import type { CategorieProduit } from '../config/constants';
import type { SaisieArticle } from './articles';

export type StatutDemande = 'en_attente' | 'traitee' | 'rejetee';

export const LIBELLE_STATUT_DEMANDE: Readonly<Record<StatutDemande, string>> = {
  en_attente: 'En attente',
  traitee: 'Validee — article cree',
  rejetee: 'Rejetee',
};

/** Contenu de la demande, stocke en JSON. Cles courtes pour rester compact. */
interface Contenu {
  m?: string; // marqueId
  mn?: string; // nom de la marque (lisible meme si la marque change)
  d?: string; // designation
  r?: string; // reference
  c?: CategorieProduit;
  p?: string[]; // pictos
  n?: string; // nom du demandeur
  x?: string; // motif de rejet
}

export interface DemandeArticle {
  readonly id: string;
  readonly ean: string;
  readonly demandeurId: string;
  readonly demandeurNom: string;
  readonly statut: StatutDemande;
  readonly date: string;
  readonly marqueId: string;
  readonly marqueNom: string;
  readonly designation: string;
  readonly reference: string;
  readonly categorie: CategorieProduit;
  readonly pictos: readonly string[];
  readonly motifRejet: string;
}

interface LigneDemande {
  id: string;
  created_at: string;
  ean: string;
  demandeur: string;
  commentaire: string | null;
  statut: StatutDemande | null;
}

const COLONNES = 'id, created_at, ean, demandeur, commentaire, statut';

function lireContenu(texte: string | null | undefined): Contenu {
  try {
    const v = JSON.parse(texte ?? '{}') as unknown;
    return v && typeof v === 'object' ? (v as Contenu) : {};
  } catch {
    // Ancienne demande en texte libre.
    return { d: texte ?? '' };
  }
}

const versDemande = (l: LigneDemande): DemandeArticle => {
  const c = lireContenu(l.commentaire);
  return {
    id: l.id,
    ean: l.ean,
    demandeurId: l.demandeur,
    demandeurNom: c.n ?? '',
    statut: l.statut ?? 'en_attente',
    date: l.created_at,
    marqueId: c.m ?? '',
    marqueNom: c.mn ?? '',
    designation: c.d ?? '',
    reference: c.r ?? '',
    categorie: c.c ?? 'gem',
    pictos: Array.from({ length: 6 }, (_, i) => c.p?.[i] ?? ''),
    motifRejet: c.x ?? '',
  };
};

const serialiser = (c: Contenu): string => JSON.stringify(c);

/** Envoie une demande d'ajout (operateur ou administrateur). */
export async function envoyerDemande(
  saisie: SaisieArticle,
  marqueNom: string,
  auteur: { id: string; nom: string },
): Promise<DemandeArticle> {
  const ligne = verifier(
    await supabase
      .from(TABLES.DEMANDES_ARTICLE)
      .insert({
        ean: saisie.ean.trim(),
        demandeur: auteur.id,
        statut: 'en_attente',
        commentaire: serialiser({
          m: saisie.marqueId,
          mn: marqueNom,
          d: saisie.designation.trim(),
          r: saisie.reference.trim(),
          c: saisie.categorie,
          p: saisie.pictos.map((x) => x.trim()),
          n: auteur.nom,
        }),
      })
      .select(COLONNES)
      .single(),
  );
  return versDemande(ligne as LigneDemande);
}

/** Demandes visibles par l'utilisateur (toutes pour un admin, les siennes pour un operateur). */
export async function listerDemandes(statut?: StatutDemande): Promise<DemandeArticle[]> {
  let requete = supabase
    .from(TABLES.DEMANDES_ARTICLE)
    .select(COLONNES)
    .order('created_at', { ascending: false })
    .limit(200);
  if (statut) requete = requete.eq('statut', statut);
  const lignes = verifier(await requete);
  return (lignes as LigneDemande[]).map(versDemande);
}

/** Cloture une demande (administrateurs). */
export async function cloturerDemande(
  demande: DemandeArticle,
  statut: Exclude<StatutDemande, 'en_attente'>,
  motif = '',
): Promise<void> {
  const data: { statut: string; commentaire?: string } = { statut };
  if (motif.trim()) {
    data.commentaire = serialiser({
      m: demande.marqueId,
      mn: demande.marqueNom,
      d: demande.designation,
      r: demande.reference,
      c: demande.categorie,
      p: [...demande.pictos],
      n: demande.demandeurNom,
      x: motif.trim().slice(0, 120),
    });
  }
  verifier(await supabase.from(TABLES.DEMANDES_ARTICLE).update(data).eq('id', demande.id));
}

/** Saisie article pre-remplie a partir d'une demande. */
export function saisieDepuisDemande(d: DemandeArticle): SaisieArticle {
  return {
    ean: d.ean,
    marqueId: d.marqueId,
    designation: d.designation,
    reference: d.reference,
    categorie: d.categorie,
    pictos: [...d.pictos],
    livraisonGratuiteExclue: false,
    actif: true,
  };
}

export function messageErreurDemande(erreur: unknown): string {
  if (estDroitsRefuses(erreur)) {
    return "Envoi refuse : votre compte doit avoir le role operateur ou administrateur (table profiles).";
  }
  return messageErreurGenerique(erreur);
}
