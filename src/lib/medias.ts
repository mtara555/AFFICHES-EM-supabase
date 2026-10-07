/**
 * AFFICHES-EM v1.0 — Chargement des visuels du bucket « medias »
 *
 * Le bucket est prive : chaque fichier est telecharge avec la session de
 * l'utilisateur (le SDK ajoute le jeton), puis expose sous forme d'URL locale
 * (blob:). Une balise <img> pointant directement sur le stockage ne transmet
 * pas le jeton, d'ou ce passage par un telechargement.
 *
 * Chaque identifiant n'est demande qu'une fois par session : une campagne de
 * 50 affiches reutilisant les memes pictogrammes ne declenche que quelques
 * requetes. Un fichier absent est memorise comme tel (null) et l'affiche bascule
 * sur son rendu de secours, sans erreur visible.
 */

import { supabase, BUCKET_MEDIAS, estConfigure } from './supabase';

const cache = new Map<string, Promise<string | null>>();
const enCours = new Set<Promise<string | null>>();

async function telecharger(fileId: string): Promise<string | null> {
  if (!estConfigure) return null;
  try {
    const { data, error } = await supabase.storage.from(BUCKET_MEDIAS).download(fileId);
    if (error || !data) return null;
    if (!data.type.startsWith('image/')) return null;
    return URL.createObjectURL(data);
  } catch {
    return null;
  }
}

/** Renvoie une URL affichable pour le fichier, ou null s'il n'existe pas. */
export function chargerMedia(fileId: string): Promise<string | null> {
  const existant = cache.get(fileId);
  if (existant) return existant;

  const promesse = telecharger(fileId);
  cache.set(fileId, promesse);
  enCours.add(promesse);
  void promesse.finally(() => enCours.delete(promesse));
  return promesse;
}

/**
 * Retire un fichier du cache, apres son remplacement ou sa suppression : le
 * prochain affichage ira chercher la nouvelle version.
 */
export function oublierMedia(fileId: string): void {
  // L'ancienne URL n'est pas revoquee : une image encore affichee l'utilise
  // peut-etre. Le navigateur la liberera a la fermeture de la page.
  cache.delete(fileId);
}

/** Resout quand tous les telechargements lances sont termines. */
export async function attendreMedias(): Promise<void> {
  while (enCours.size > 0) {
    await Promise.allSettled([...enCours]);
  }
}

/**
 * Attend que la page soit prete a etre imprimee : visuels telecharges, images
 * decodees et polices chargees. Sans cette attente, le navigateur imprimerait
 * des emplacements vides.
 */
export async function attendreRenduComplet(): Promise<void> {
  await attendreMedias();
  // Laisse React inserer les images obtenues avant de les inspecter.
  await new Promise((r) => requestAnimationFrame(() => r(null)));
  const images = Array.from(document.images).filter((img) => !img.complete);
  await Promise.allSettled(
    images.map(
      (img) =>
        new Promise((r) => {
          img.addEventListener('load', r, { once: true });
          img.addEventListener('error', r, { once: true });
        }),
    ),
  );
  if ('fonts' in document) await document.fonts.ready;
}
