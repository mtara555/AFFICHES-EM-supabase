/**
 * AFFICHES-EM v1.0 — Enregistrement des parametres commerciaux
 *
 * La lecture reste dans `regles.ts` (chargerParametres). Ce module ajoute
 * l'ecriture, reservee aux administrateurs : la base refuse toute
 * modification de la table `parametres` a un operateur, quel que soit l'ecran.
 *
 * Chaque parametre est une ligne cle / valeur. L'enregistrement met a jour la
 * ligne existante ou la cree si elle manque : la page fonctionne donc aussi sur
 * une base ou la table est encore vide.
 *
 * Toute modification est tracee dans la table `journal` (avant / apres).
 */

import { supabase, TABLES, verifier, estDroitsRefuses, messageErreurGenerique } from './supabase';
import type { ParametresRegles } from './regles';
import type { PalierCredit } from '../config/constants';

/** Cles utilisees dans la table, et description enregistree avec la valeur. */
const CLES = {
  baremeCredit: 'Bareme du credit 0 % : liste des paliers { seuilDh, dureeMois }',
  seuilLivraisonGratuite: 'Prix de vente minimal (dh) pour le badge livraison gratuite',
  seuilEconomiePourcent: 'Remise minimale (% du prix barre) pour le bandeau economie',
} as const;

type Cle = keyof typeof CLES;

interface LigneParametre {
  id: string;
  cle: string;
  valeur: string;
}

function versValeurs(p: ParametresRegles): Record<Cle, string> {
  const bareme = [...p.baremeCredit]
    .sort((a, b) => b.seuilDh - a.seuilDh)
    .map((x) => ({ seuilDh: x.seuilDh, dureeMois: x.dureeMois }));
  return {
    baremeCredit: JSON.stringify(bareme),
    seuilLivraisonGratuite: String(p.seuilLivraisonGratuite),
    seuilEconomiePourcent: String(p.seuilEconomiePourcent),
  };
}

/* -------------------------------------------------------------------------- */
/* Validation                                                                  */
/* -------------------------------------------------------------------------- */

/** Renvoie la liste des problemes bloquants, vide si les valeurs sont valides. */
export function validerParametres(p: ParametresRegles): string[] {
  const problemes: string[] = [];

  if (p.baremeCredit.length === 0) {
    problemes.push('Le bareme du credit doit contenir au moins un palier.');
  }
  const seuils = new Set<number>();
  p.baremeCredit.forEach((palier: PalierCredit, i) => {
    const n = i + 1;
    if (!Number.isFinite(palier.seuilDh) || palier.seuilDh <= 0) {
      problemes.push(`Palier ${n} : le seuil doit etre un montant positif.`);
    }
    if (!Number.isInteger(palier.dureeMois) || palier.dureeMois < 1 || palier.dureeMois > 60) {
      problemes.push(`Palier ${n} : la duree doit etre un nombre entier de mois, entre 1 et 60.`);
    }
    if (seuils.has(palier.seuilDh)) {
      problemes.push(`Palier ${n} : le seuil ${palier.seuilDh} dh figure deja dans le bareme.`);
    }
    seuils.add(palier.seuilDh);
  });

  if (!Number.isFinite(p.seuilLivraisonGratuite) || p.seuilLivraisonGratuite < 0) {
    problemes.push('Le seuil de livraison gratuite doit etre un montant positif ou nul.');
  }
  if (
    !Number.isFinite(p.seuilEconomiePourcent) ||
    p.seuilEconomiePourcent < 0 ||
    p.seuilEconomiePourcent > 100
  ) {
    problemes.push('Le seuil du bandeau economie doit etre compris entre 0 et 100 %.');
  }
  return problemes;
}

/* -------------------------------------------------------------------------- */
/* Enregistrement                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Enregistre les parametres et trace la modification.
 *
 * Seules les valeurs reellement modifiees sont ecrites. Le journal est
 * alimente en dernier et ne bloque jamais l'enregistrement : une trace
 * manquante est preferable a un parametre non sauvegarde.
 */
export async function enregistrerParametres(
  nouveaux: ParametresRegles,
  precedents: ParametresRegles,
  userId: string,
): Promise<number> {
  const lignes = verifier(
    await supabase.from(TABLES.PARAMETRES).select('id, cle, valeur').limit(50),
  ) as LigneParametre[];
  const existantes = new Map(lignes.map((l) => [l.cle, l]));

  const valeurs = versValeurs(nouveaux);
  const avant = versValeurs(precedents);
  let modifies = 0;

  for (const cle of Object.keys(CLES) as Cle[]) {
    const ligne = existantes.get(cle);
    if (ligne && ligne.valeur === valeurs[cle]) continue;

    if (ligne) {
      verifier(await supabase.from(TABLES.PARAMETRES).update({ valeur: valeurs[cle] }).eq('id', ligne.id));
    } else {
      verifier(
        await supabase
          .from(TABLES.PARAMETRES)
          .insert({ cle, valeur: valeurs[cle], description: CLES[cle] }),
      );
    }
    modifies += 1;
  }

  if (modifies > 0) {
    try {
      verifier(
        await supabase.from(TABLES.JOURNAL).insert({
          action: 'modification',
          ressource: 'parametres',
          user_id: userId,
          avant: JSON.stringify(avant).slice(0, 4000),
          apres: JSON.stringify(valeurs).slice(0, 4000),
          date: new Date().toISOString(),
        }),
      );
    } catch {
      /* journal indisponible : la modification reste valable */
    }
  }

  return modifies;
}

export function messageErreurParametres(erreur: unknown): string {
  if (estDroitsRefuses(erreur)) return 'Seuls les administrateurs peuvent modifier les parametres.';
  return messageErreurGenerique(erreur);
}
