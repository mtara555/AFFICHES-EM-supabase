/**
 * AFFICHES-EM v1.0 — Acces aux donnees « marques »
 *
 * Couche mince au-dessus de Supabase : elle traduit les lignes brutes en objets
 * du domaine et centralise les requetes. Les composants d'interface n'ont ainsi
 * jamais a manipuler les noms de table ni la forme des reponses.
 */

import { supabase, TABLES, verifier, estDoublon, messageErreurGenerique } from './supabase';

export interface Marque {
  readonly id: string;
  readonly nom: string;
  readonly logoFileId: string | null;
  readonly actif: boolean;
}

/** Champs modifiables depuis l'interface. */
export interface SaisieMarque {
  nom: string;
  actif: boolean;
}

interface LigneMarque {
  id: string;
  nom: string;
  logo_file_id: string | null;
  actif: boolean | null;
}

const COLONNES = 'id, nom, logo_file_id, actif';

function versMarque(ligne: LigneMarque): Marque {
  return {
    id: ligne.id,
    nom: ligne.nom,
    logoFileId: ligne.logo_file_id ?? null,
    actif: ligne.actif ?? true,
  };
}

/**
 * Liste les marques par ordre alphabetique.
 * La limite explicite de 500 couvre largement les 78 marques du catalogue reel.
 */
export async function listerMarques(): Promise<Marque[]> {
  const lignes = verifier(
    await supabase.from(TABLES.MARQUES).select(COLONNES).order('nom', { ascending: true }).limit(500),
  );
  return (lignes as LigneMarque[]).map(versMarque);
}

export async function creerMarque(saisie: SaisieMarque): Promise<Marque> {
  const ligne = verifier(
    await supabase
      .from(TABLES.MARQUES)
      .insert({ nom: saisie.nom.trim(), actif: saisie.actif })
      .select(COLONNES)
      .single(),
  );
  return versMarque(ligne as LigneMarque);
}

export async function modifierMarque(id: string, saisie: SaisieMarque): Promise<Marque> {
  const ligne = verifier(
    await supabase
      .from(TABLES.MARQUES)
      .update({ nom: saisie.nom.trim(), actif: saisie.actif })
      .eq('id', id)
      .select(COLONNES)
      .single(),
  );
  return versMarque(ligne as LigneMarque);
}

export async function supprimerMarque(id: string): Promise<void> {
  verifier(await supabase.from(TABLES.MARQUES).delete().eq('id', id));
}

export interface ResultatImport {
  readonly crees: number;
  readonly ignores: number;
  readonly erreurs: { readonly nom: string; readonly message: string }[];
}

/**
 * Cree plusieurs marques en une passe, en ignorant celles qui existent deja.
 * Un doublon (contrainte d'unicite sur `nom`) n'interrompt pas le traitement :
 * il est compte comme ignore, ce qui rend l'import relancable sans doublons.
 */
export async function importerMarques(
  noms: readonly string[],
  surProgression?: (traites: number, total: number) => void,
): Promise<ResultatImport> {
  let crees = 0;
  let ignores = 0;
  const erreurs: { nom: string; message: string }[] = [];

  for (const [index, nom] of noms.entries()) {
    try {
      await creerMarque({ nom, actif: true });
      crees += 1;
    } catch (erreur) {
      if (estDoublon(erreur)) {
        ignores += 1;
      } else {
        erreurs.push({ nom, message: erreur instanceof Error ? erreur.message : 'Erreur inconnue' });
      }
    }
    surProgression?.(index + 1, noms.length);
  }

  return { crees, ignores, erreurs };
}

/** Message lisible pour les erreurs les plus courantes. */
export function messageErreur(erreur: unknown): string {
  if (estDoublon(erreur)) return 'Cette marque existe deja.';
  return messageErreurGenerique(erreur);
}
