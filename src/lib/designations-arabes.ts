/**
 * AFFICHES-EM v1.0 — Designation arabe (الاسم العربي)
 *
 * Normalisation, validation et acces au referentiel `designations_arabes` qui
 * alimente la liste deroulante du formulaire article.
 *
 * Les fonctions de texte (normaliserArabe, contientArabe, validerArabe) sont
 * pures : elles servent aussi bien au formulaire qu'a l'import Excel, et sont
 * couvertes par des tests unitaires.
 */

import { supabase, TABLES, TAILLE_PAGE, verifier } from './supabase';

/** Longueur maximale d'une designation arabe (identique a la contrainte SQL). */
export const LONGUEUR_MAX_ARABE = 120;

/** Plages Unicode de l'ecriture arabe (lettres, supplement, formes de presentation A et B). */
const CARACTERE_ARABE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

/** Caracteres de controle de direction, parasites frequents des copier-coller. */
const MARQUES_DIRECTION = /[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;

/**
 * Normalise une designation arabe saisie ou importee : forme Unicode NFC,
 * marques de direction retirees, espaces unifies. La casse n'existe pas en
 * arabe : contrairement a la designation francaise, rien n'est mis en
 * majuscules.
 */
export function normaliserArabe(valeur: unknown): string {
  if (valeur === null || valeur === undefined) return '';
  return String(valeur)
    .normalize('NFC')
    .replace(MARQUES_DIRECTION, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Vrai si le texte contient au moins une lettre arabe. */
export function contientArabe(texte: string): boolean {
  return CARACTERE_ARABE.test(texte);
}

/**
 * Renvoie le probleme d'une designation arabe, ou null si elle est valide.
 * Le champ est facultatif : une valeur vide est valide.
 */
export function validerArabe(valeur: string): string | null {
  const texte = normaliserArabe(valeur);
  if (!texte) return null;
  if (texte.length > LONGUEUR_MAX_ARABE) {
    return `La designation arabe depasse ${LONGUEUR_MAX_ARABE} caracteres.`;
  }
  if (!contientArabe(texte)) {
    return 'La designation arabe doit contenir des caracteres arabes.';
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* Referentiel                                                                 */
/* -------------------------------------------------------------------------- */

export interface DesignationArabe {
  readonly id: string;
  readonly libelleAr: string;
  readonly libelleFr: string;
}

interface LigneDesignationArabe {
  id: string;
  libelle_ar: string;
  libelle_fr: string | null;
}

const versDesignation = (l: LigneDesignationArabe): DesignationArabe => ({
  id: l.id,
  libelleAr: l.libelle_ar,
  libelleFr: l.libelle_fr ?? '',
});

/** Retire de la saisie ce qui casserait un filtre PostgREST (`,` `(` `)` `"` `\` et jokers LIKE). */
const motSur = (mot: string) => mot.replace(/[%_,()"\\*]/g, '');

/**
 * Suggestions de la liste deroulante : recherche asynchrone limitee a
 * `limite` resultats, donc performante meme si le referentiel grossit.
 *
 * - `terme` : texte tape (arabe ou francais) ;
 * - `indiceFr` : designation francaise de l'article, utilisee quand `terme`
 *   est vide pour proposer d'abord la traduction habituelle.
 */
export async function chercherDesignationsArabes(
  terme: string,
  indiceFr = '',
  limite = 20,
): Promise<DesignationArabe[]> {
  let requete = supabase
    .from(TABLES.DESIGNATIONS_ARABES)
    .select('id, libelle_ar, libelle_fr')
    .eq('actif', true)
    .order('libelle_ar', { ascending: true })
    .limit(limite);

  const mots = normaliserArabe(terme).split(' ').map(motSur).filter(Boolean);
  if (mots.length > 0) {
    for (const mot of mots) {
      requete = requete.or(`libelle_ar.ilike."%${mot}%",libelle_fr.ilike."%${mot}%"`);
    }
  } else {
    const indice = motSur(indiceFr.trim());
    if (indice) requete = requete.ilike('libelle_fr', `%${indice}%`);
  }

  return (verifier(await requete) as LigneDesignationArabe[]).map(versDesignation);
}

/**
 * Ajoute une designation au referentiel si elle n'y figure pas deja
 * (insensible aux doublons : l'index unique sur `libelle_ar` fait foi).
 * Reserve aux administrateurs par les regles RLS.
 */
export async function ajouterDesignationArabe(libelleAr: string, libelleFr = ''): Promise<void> {
  const ar = normaliserArabe(libelleAr);
  if (validerArabe(ar) !== null || !ar) return;
  verifier(
    await supabase
      .from(TABLES.DESIGNATIONS_ARABES)
      .upsert({ libelle_ar: ar, libelle_fr: libelleFr.trim() }, { onConflict: 'libelle_ar', ignoreDuplicates: true }),
  );
}

/** Tous les libelles arabes deja au referentiel (lus par pages). */
export async function listerLibellesArabes(): Promise<Set<string>> {
  const libelles = new Set<string>();
  for (let debut = 0; ; debut += TAILLE_PAGE) {
    const lignes = verifier(
      await supabase
        .from(TABLES.DESIGNATIONS_ARABES)
        .select('libelle_ar')
        .order('id', { ascending: true })
        .range(debut, debut + TAILLE_PAGE - 1),
    ) as { libelle_ar: string }[];
    lignes.forEach((l) => libelles.add(l.libelle_ar));
    if (lignes.length < TAILLE_PAGE) break;
  }
  return libelles;
}

export interface PaireArabeFrancais {
  readonly ar: string;
  readonly fr: string;
}

/**
 * Ajoute au referentiel les designations d'un import Excel qui n'y sont pas
 * encore, par lots de 200. Renvoie les libelles reellement ajoutes, pour le
 * rapport d'import.
 */
export async function ajouterDesignationsEnLot(paires: readonly PaireArabeFrancais[]): Promise<string[]> {
  const existants = await listerLibellesArabes();
  const nouvelles = new Map<string, string>();
  for (const { ar, fr } of paires) {
    const libelle = normaliserArabe(ar);
    if (libelle && !existants.has(libelle) && !nouvelles.has(libelle)) nouvelles.set(libelle, fr.trim());
  }

  const lignes = [...nouvelles].map(([libelle_ar, libelle_fr]) => ({ libelle_ar, libelle_fr }));
  for (let i = 0; i < lignes.length; i += 200) {
    verifier(
      await supabase
        .from(TABLES.DESIGNATIONS_ARABES)
        .upsert(lignes.slice(i, i + 200), { onConflict: 'libelle_ar', ignoreDuplicates: true }),
    );
  }
  return [...nouvelles.keys()];
}
