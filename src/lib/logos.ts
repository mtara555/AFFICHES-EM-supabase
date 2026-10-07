/**
 * AFFICHES-EM v1.0 — Televersement des logos de marques
 *
 * Un logo est range dans le bucket « medias » sous l'identifiant
 * `logo_<idMarque>`, et cet identifiant est inscrit dans la colonne
 * `logoFileId` de la marque. Remplacer un logo supprime l'ancien fichier avant
 * d'envoyer le nouveau : l'identifiant reste stable, les affiches n'ont rien a
 * mettre a jour.
 *
 * Les images trop grandes sont reduites dans le navigateur avant l'envoi :
 * sur l'affiche, le logo occupe 84 × 35 mm, soit environ 1 000 pixels de large
 * a 300 dpi. Au-dela, le fichier ne ferait qu'occuper le quota de stockage (1 Go sur le plan gratuit).
 */

import {
  supabase,
  BUCKET_MEDIAS,
  TABLES,
  idLogo,
  verifier,
  normaliser,
  estDroitsRefuses,
  messageErreurGenerique,
  ErreurBase,
} from './supabase';
import { oublierMedia } from './medias';
import type { Marque } from './marques';

/** Formats acceptes par le bucket (voir supabase/schema.sql). */
export const EXTENSIONS_LOGO = ['png', 'jpg', 'jpeg', 'webp', 'svg'] as const;
export const ACCEPT_LOGO = '.png,.jpg,.jpeg,.webp,.svg,image/png,image/jpeg,image/webp,image/svg+xml';
const TAILLE_MAX_MO = 10;
const LARGEUR_MAX_PX = 1200;

/** Probleme bloquant sur un fichier, ou null s'il est acceptable. */
export function verifierFichierLogo(fichier: File): string | null {
  const extension = fichier.name.split('.').pop()?.toLowerCase() ?? '';
  if (!(EXTENSIONS_LOGO as readonly string[]).includes(extension)) {
    return `Format non accepte (.${extension}). Utilisez PNG, JPG, WEBP ou SVG.`;
  }
  if (fichier.size > TAILLE_MAX_MO * 1024 * 1024) {
    return `Fichier trop lourd (${(fichier.size / 1024 / 1024).toFixed(1)} Mo, maximum ${TAILLE_MAX_MO} Mo).`;
  }
  return null;
}

/** Reduit une image matricielle trop large ; renvoie le fichier d'origine sinon. */
async function reduireSiNecessaire(fichier: File): Promise<File> {
  if (fichier.type === 'image/svg+xml' || fichier.name.toLowerCase().endsWith('.svg')) {
    return fichier;
  }
  try {
    const image = await createImageBitmap(fichier);
    if (image.width <= LARGEUR_MAX_PX) {
      image.close();
      return fichier;
    }
    const echelle = LARGEUR_MAX_PX / image.width;
    const canvas = document.createElement('canvas');
    canvas.width = LARGEUR_MAX_PX;
    canvas.height = Math.round(image.height * echelle);
    const ctx = canvas.getContext('2d');
    if (!ctx) return fichier;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    image.close();

    const type = fichier.type === 'image/jpeg' ? 'image/jpeg' : 'image/png';
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, type, 0.92));
    if (!blob) return fichier;
    const nom = fichier.name.replace(/\.[^.]+$/, type === 'image/jpeg' ? '.jpg' : '.png');
    return new File([blob], nom, { type });
  } catch {
    return fichier;
  }
}

/** Envoie (ou remplace) le logo d'une marque et met a jour la fiche marque. */
export async function televerserLogo(marque: Marque, fichier: File): Promise<void> {
  const probleme = verifierFichierLogo(fichier);
  if (probleme) throw new Error(probleme);

  const fileId = idLogo(marque.id);
  const aEnvoyer = await reduireSiNecessaire(fichier);

  // `upsert` remplace l'ancien fichier sous le meme identifiant.
  const { error } = await supabase.storage
    .from(BUCKET_MEDIAS)
    .upload(fileId, aEnvoyer, { upsert: true, contentType: typeMime(aEnvoyer), cacheControl: '0' });
  if (error) throw normaliser(error);

  if (marque.logoFileId !== fileId) {
    verifier(await supabase.from(TABLES.MARQUES).update({ logo_file_id: fileId }).eq('id', marque.id));
  }
  oublierMedia(fileId);
}

/** Supprime le logo d'une marque. */
export async function supprimerLogo(marque: Marque): Promise<void> {
  const fileId = marque.logoFileId ?? idLogo(marque.id);
  const { error } = await supabase.storage.from(BUCKET_MEDIAS).remove([fileId]);
  if (error) throw normaliser(error);
  verifier(await supabase.from(TABLES.MARQUES).update({ logo_file_id: null }).eq('id', marque.id));
  oublierMedia(fileId);
}

/** Type MIME du fichier ; deduit de l'extension si le navigateur ne le renseigne pas. */
function typeMime(fichier: File): string {
  if (fichier.type) return fichier.type;
  const ext = fichier.name.split('.').pop()?.toLowerCase();
  if (ext === 'svg') return 'image/svg+xml';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  return 'image/jpeg';
}

/* -------------------------------------------------------------------------- */
/* Rapprochement fichier → marque (import en lot)                              */
/* -------------------------------------------------------------------------- */

/**
 * Variantes de nommage rencontrees dans le dossier de logos du classeur VBA.
 * Cle et valeur au format de `cleNom`.
 */
const ALIAS: Readonly<Record<string, string>> = {
  SAMMSUNG: 'SAMSUNG',
  SEVRIN: 'SEVERIN',
};

/** « Beko Logo.JPG » → « BEKO » ; « Arthur-Martin.png » → « ARTHURMARTIN ». */
export function cleNom(valeur: string): string {
  const sansExtension = valeur.replace(/\.[a-z0-9]{2,4}$/i, '');
  return sansExtension
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\bLOGO\b/g, '')
    .replace(/[^A-Z0-9]/g, '');
}

export interface Rapprochement {
  readonly fichier: File;
  /** Marque retenue, ou null si aucune correspondance. */
  marqueId: string | null;
  readonly probleme: string | null;
}

/** Associe chaque fichier a la marque dont le nom correspond au nom du fichier. */
export function rapprocher(fichiers: readonly File[], marques: readonly Marque[]): Rapprochement[] {
  const parCle = new Map<string, Marque>();
  for (const m of marques) parCle.set(cleNom(m.nom), m);
  // Une marque existante l'emporte sur un alias du meme nom.
  for (const [alias, cible] of Object.entries(ALIAS)) {
    const m = parCle.get(cible);
    if (m && !parCle.has(alias)) parCle.set(alias, m);
  }
  return fichiers.map((fichier) => ({
    fichier,
    marqueId: parCle.get(cleNom(fichier.name))?.id ?? null,
    probleme: verifierFichierLogo(fichier),
  }));
}

export function messageErreurLogo(erreur: unknown): string {
  if (estDroitsRefuses(erreur)) return 'Seuls les administrateurs peuvent modifier les logos.';
  if (erreur instanceof ErreurBase) {
    if (erreur.statut === 413 || /exceeded the maximum allowed size|too large/i.test(erreur.message)) {
      return `Fichier trop lourd (maximum ${TAILLE_MAX_MO} Mo).`;
    }
    if (/mime type|not supported/i.test(erreur.message)) {
      return 'Format non accepte. Utilisez PNG, JPG, WEBP ou SVG.';
    }
  }
  return messageErreurGenerique(erreur);
}
