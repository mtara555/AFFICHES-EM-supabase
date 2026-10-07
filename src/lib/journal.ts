/**
 * AFFICHES-EM v1.0 — Journal d'activite
 *
 * Trace qui fait quoi, quand et depuis quel appareil : connexions,
 * affiches saisies, articles, marques, campagnes, impressions, parametres.
 *
 * Table `journal` (supabase/schema.sql) : creation par tous les roles,
 * lecture reservee aux administrateurs. Personne ne peut modifier ni effacer
 * une ligne depuis l'application : le journal est une trace fiable.
 *
 * L'ecriture ne bloque jamais le travail : si le journal est indisponible,
 * l'action de l'utilisateur reste valable.
 */

import { supabase, TABLES, verifier, estDroitsRefuses, messageErreurGenerique } from './supabase';

/** Valeurs d'action enregistrees dans la colonne `action`. */
export type ActionJournal = 'creation' | 'modification' | 'suppression' | 'export' | 'connexion';

/** Familles d'evenements, colonne `ressource`. */
export type RessourceJournal =
  | 'session'
  | 'affiches'
  | 'articles'
  | 'marques'
  | 'campagnes'
  | 'gabarits'
  | 'parametres'
  | 'impression';

export const LIBELLE_RESSOURCE: Readonly<Record<string, string>> = {
  session: 'Connexion',
  affiches: 'Affiches',
  articles: 'Catalogue',
  marques: 'Marques',
  campagnes: 'Campagnes',
  gabarits: 'Gabarits',
  parametres: 'Parametres',
  impression: 'Impression',
};

export const LIBELLE_ACTION: Readonly<Record<ActionJournal, string>> = {
  creation: 'Ajout',
  modification: 'Modification',
  suppression: 'Suppression',
  export: 'Impression / export',
  connexion: 'Connexion',
};

export interface EntreeJournal {
  readonly id: string;
  readonly date: string;
  readonly action: ActionJournal;
  readonly ressource: string;
  readonly userId: string;
  readonly utilisateur: string;
  readonly appareil: string;
  readonly detail: string;
}

interface LigneJournal {
  id: string;
  date: string;
  action: ActionJournal;
  ressource: string;
  user_id: string;
  utilisateur?: string | null;
  appareil?: string | null;
  avant?: string | null;
  apres?: string | null;
}

/* -------------------------------------------------------------------------- */
/* Utilisateur et appareil courants                                            */
/* -------------------------------------------------------------------------- */

interface Auteur {
  readonly id: string;
  readonly nom: string;
}

let auteur: Auteur | null = null;
let appareil: string | null = null;

const CLE_NOM_APPAREIL = 'affiches-em.nom-appareil';

/** Nom libre donne a cet appareil (« PC Deco », « Tel. Karim »), memorise dans le navigateur. */
export function nomAppareilLocal(): string {
  try {
    return localStorage.getItem(CLE_NOM_APPAREIL) ?? '';
  } catch {
    return '';
  }
}

export function definirNomAppareilLocal(nom: string): void {
  try {
    if (nom.trim()) localStorage.setItem(CLE_NOM_APPAREIL, nom.trim().slice(0, 60));
    else localStorage.removeItem(CLE_NOM_APPAREIL);
  } catch {
    /* stockage indisponible (navigation privee) */
  }
  appareil = null;
}

/** Appele par le contexte d'authentification a chaque changement d'utilisateur. */
export function definirAuteur(u: Auteur | null): void {
  auteur = u;
  appareil = null;
}

/** Description de l'appareil, deduite de l'agent utilisateur du navigateur. */
function decrireAppareil(): string {
  if (appareil) return appareil;
  const morceaux: string[] = [];
  const nomLocal = nomAppareilLocal();
  if (nomLocal) morceaux.push(`« ${nomLocal} »`);

  const ua = navigator.userAgent;
  const type = /iPad|Tablet/i.test(ua) ? 'Tablette' : /Mobi|Android|iPhone/i.test(ua) ? 'Telephone' : 'Ordinateur';
  const systeme = /Windows/i.test(ua)
    ? 'Windows'
    : /Android/i.test(ua)
      ? 'Android'
      : /iPhone|iPad|iOS/i.test(ua)
        ? 'iOS'
        : /Mac OS/i.test(ua)
          ? 'macOS'
          : /Linux/i.test(ua)
            ? 'Linux'
            : '';
  const navigateur = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\//.test(ua)
      ? 'Opera'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Chrome\//.test(ua)
          ? 'Chrome'
          : /Safari\//.test(ua)
            ? 'Safari'
            : '';
  morceaux.push([type, systeme, navigateur].filter(Boolean).join(' · '));

  appareil = morceaux.filter(Boolean).join(' — ').slice(0, 250);
  return appareil;
}

/* -------------------------------------------------------------------------- */
/* Ecriture                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Ajoute une ligne au journal. Ne leve jamais d'erreur.
 * @param detail texte lisible, par ex. « Affiche 6923... — 4 999 dh (campagne Promo) »
 */
export async function journaliser(
  action: ActionJournal,
  ressource: RessourceJournal,
  detail: string,
): Promise<void> {
  if (!auteur) return;
  try {
    verifier(
      await supabase.from(TABLES.JOURNAL).insert({
        action,
        ressource,
        user_id: auteur.id,
        utilisateur: auteur.nom.slice(0, 120),
        appareil: decrireAppareil(),
        apres: detail.slice(0, 4000),
        date: new Date().toISOString(),
      }),
    );
  } catch (e) {
    console.warn('[journal] ecriture impossible', e);
  }
}

/** Version « on n'attend pas » pour ne pas ralentir l'ecran. */
export function tracer(action: ActionJournal, ressource: RessourceJournal, detail: string): void {
  void journaliser(action, ressource, detail);
}

/* -------------------------------------------------------------------------- */
/* Lecture (administrateurs)                                                   */
/* -------------------------------------------------------------------------- */

const versEntree = (l: LigneJournal): EntreeJournal => {
  // Anciennes lignes ou colonnes absentes : nom et appareil sont dans « avant ».
  const [nomAvant, ...reste] = (l.avant ?? '').split(' — ');
  const secours = !l.utilisateur && l.ressource !== 'parametres';
  return {
    id: l.id,
    date: l.date,
    action: l.action,
    ressource: l.ressource,
    userId: l.user_id,
    utilisateur: l.utilisateur || (secours && nomAvant ? nomAvant : ''),
    appareil: l.appareil || (secours ? reste.join(' — ') : ''),
    detail:
      l.ressource === 'parametres' && l.avant
        ? `Avant : ${l.avant} — Apres : ${l.apres ?? ''}`
        : (l.apres ?? ''),
  };
};

/** Toutes les lignes depuis une date (lues par pages de 500, 2 000 au plus). */
export async function lireJournal(depuis: Date | null): Promise<EntreeJournal[]> {
  const lignes: LigneJournal[] = [];
  const PAGE = 500;
  for (let debut = 0; debut < 2000; debut += PAGE) {
    let requete = supabase
      .from(TABLES.JOURNAL)
      .select('id, date, action, ressource, user_id, utilisateur, appareil, avant, apres')
      .order('date', { ascending: false })
      .range(debut, debut + PAGE - 1);
    if (depuis) requete = requete.gte('date', depuis.toISOString());
    const page = verifier(await requete) as LigneJournal[];
    lignes.push(...page);
    if (page.length < PAGE) break;
  }
  return lignes.map(versEntree);
}

export function messageErreurJournal(erreur: unknown): string {
  if (estDroitsRefuses(erreur)) {
    return 'Lecture du journal refusee : seuls les administrateurs y ont acces (role dans la table profiles).';
  }
  return messageErreurGenerique(erreur);
}
