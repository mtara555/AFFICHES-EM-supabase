import stockLimite from '../../assets/pictos/stock-limite.png';
import nouveau from '../../assets/pictos/nouveau.png';
import vuDansLeDepliant from '../../assets/pictos/vu-dans-le-depliant.png';
import exclusivite from '../../assets/pictos/exclusivite.png';
import marjaneSEngage from '../../assets/pictos/marjane-s-engage.png';

/**
 * Badges promotionnels du kit PLV, integres a l'application : ils sont
 * disponibles sans televersement et fonctionnent hors ligne.
 *
 * Codes acceptes dans un emplacement picto du catalogue (majuscules,
 * accents, espaces et apostrophes indifferents) :
 *   STOCK LIMITE · NOUVEAU · VU DANS LE DEPLIANT · EXCLUSIVITE · MARJANE S'ENGAGE
 */
export type CleBadge = 'stock' | 'nouveau' | 'depliant' | 'exclusivite' | 'engage';

export interface BadgePromo {
  readonly cle: CleBadge;
  readonly libelle: string;
  readonly image: string;
}

const BADGES: readonly { readonly codes: readonly string[]; readonly badge: BadgePromo }[] = [
  {
    codes: ['STOCKLIMITE', 'STOCK', 'STOCKLIMITEE'],
    badge: { cle: 'stock', libelle: 'Stock limite', image: stockLimite },
  },
  {
    codes: ['NOUVEAU', 'NOUVEAUTE', 'NEW'],
    badge: { cle: 'nouveau', libelle: 'Nouveau', image: nouveau },
  },
  {
    codes: ['VUDANSLEDEPLIANT', 'VUDEPLIANT', 'DEPLIANT', 'VUAUDEPLIANT', 'VDLD'],
    badge: { cle: 'depliant', libelle: 'Vu dans le depliant', image: vuDansLeDepliant },
  },
  {
    codes: ['EXCLUSIVITE', 'EXCLU', 'EXCLUSIF', 'EXCLUSIVITEMARJANE'],
    badge: { cle: 'exclusivite', libelle: 'Exclusivite', image: exclusivite },
  },
  {
    codes: ['MARJANESENGAGE', 'SENGAGE', 'ENGAGE', 'MARJANEENGAGE'],
    badge: { cle: 'engage', libelle: "Marjane s'engage", image: marjaneSEngage },
  },
];

/** « Stock limité », « VU DANS LE DÉPLIANT », « marjane s'engage » → cle comparable. */
export const normaliserCode = (code: string) =>
  code
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

/** Badge correspondant au code, ou null. */
export function trouverBadge(code: string): BadgePromo | null {
  const cle = normaliserCode(code);
  return BADGES.find((b) => b.codes.includes(cle))?.badge ?? null;
}

/** Badges dans l'ordre d'affichage. */
export const LISTE_BADGES: readonly BadgePromo[] = BADGES.map((b) => b.badge);

/** Mentions cochables en plus de Stock limite / Nouveaute (colonne « mentions »). */
export const MENTIONS: readonly CleBadge[] = ['depliant', 'exclusivite', 'engage'];

export const badgeParCle = (cle: CleBadge): BadgePromo =>
  LISTE_BADGES.find((b) => b.cle === cle)!;

/** « depliant,engage » → ['depliant', 'engage'] (valeurs inconnues ignorees). */
export const lireMentions = (texte: string | null | undefined): CleBadge[] =>
  (texte ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter((x): x is CleBadge => (MENTIONS as readonly string[]).includes(x));
