/**
 * AFFICHES-EM v1.0 — Service d'authentification
 *
 * Le role d'un utilisateur est lu dans la table `profiles`. Cette meme table
 * sert, cote base de donnees, a autoriser chaque requete (fonctions
 * `est_admin()` / `est_operateur()` des regles RLS) : un utilisateur ne peut
 * donc pas s'attribuer un role en manipulant le code, car seul un
 * administrateur peut modifier `profiles`.
 */

import type { User } from '@supabase/supabase-js';
import { supabase, TABLES } from './supabase';

export type Role = 'administrateur' | 'operateur' | 'aucun';

export interface Utilisateur {
  readonly id: string;
  readonly nom: string;
  readonly email: string;
  readonly role: Role;
}

interface Profil {
  nom: string | null;
  role: Role | null;
}

/** Lit le profil (nom et role) du compte. Role « aucun » si le profil n'existe pas encore. */
async function lireProfil(id: string): Promise<Profil> {
  const { data } = await supabase
    .from(TABLES.PROFILS)
    .select('nom, role')
    .eq('id', id)
    .maybeSingle();
  return (data as Profil | null) ?? { nom: null, role: 'aucun' };
}

function versUtilisateur(compte: User, profil: Profil): Utilisateur {
  const email = compte.email ?? '';
  return {
    id: compte.id,
    nom: profil.nom?.trim() || email,
    email,
    role: profil.role ?? 'aucun',
  };
}

/**
 * Recupere l'utilisateur de la session en cours.
 * Renvoie null si personne n'est connecte — ce n'est pas une erreur, c'est
 * l'etat normal au premier chargement.
 */
export async function utilisateurCourant(): Promise<Utilisateur | null> {
  try {
    const { data } = await supabase.auth.getSession();
    const compte = data.session?.user;
    if (!compte) return null;
    return versUtilisateur(compte, await lireProfil(compte.id));
  } catch {
    return null;
  }
}

/** Ouvre une session. Leve une erreur porteuse d'un message lisible en cas d'echec. */
export async function seConnecter(email: string, motDePasse: string): Promise<Utilisateur> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password: motDePasse,
  });
  if (error || !data.user) {
    throw new Error(messageErreurConnexion(error));
  }
  return versUtilisateur(data.user, await lireProfil(data.user.id));
}

/** Ferme la session en cours. */
export async function seDeconnecter(): Promise<void> {
  try {
    await supabase.auth.signOut();
  } catch {
    // Session deja expiree cote serveur : l'objectif est atteint.
  }
}

/**
 * Traduit les erreurs d'authentification en messages exploitables.
 * Les identifiants invalides recoivent volontairement un message unique, qui
 * ne revele pas si l'adresse existe.
 */
function messageErreurConnexion(erreur: { code?: string; status?: number; message?: string } | null): string {
  if (!erreur) return 'La connexion a echoue.';
  switch (erreur.code) {
    case 'invalid_credentials':
      return 'Adresse e-mail ou mot de passe incorrect.';
    case 'user_banned':
      return 'Ce compte est bloque. Contactez un administrateur.';
    case 'email_not_confirmed':
      return 'Adresse e-mail non confirmee. Contactez un administrateur.';
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit':
      return 'Trop de tentatives. Patientez quelques minutes avant de reessayer.';
    default:
      break;
  }
  if (erreur.status === 429) return 'Trop de tentatives. Patientez quelques minutes avant de reessayer.';
  if (erreur.status === 0 || erreur.message === 'Failed to fetch') {
    return 'Connexion au serveur impossible. Verifiez votre reseau.';
  }
  if (erreur.status === 400) return 'Adresse e-mail ou mot de passe incorrect.';
  return erreur.message || 'La connexion a echoue.';
}

/** Libelle affichable d'un role. */
export const LIBELLE_ROLE: Readonly<Record<Role, string>> = {
  administrateur: 'Administrateur',
  operateur: 'Operateur',
  aucun: 'Aucun acces',
};
