/**
 * AFFICHES-EM v1.0 — Correcteur orthographique du catalogue
 *
 * Fonctionne hors ligne, sans service externe : il compare chaque mot saisi a
 * un lexique de l'electromenager (ci-dessous) enrichi des mots frequents du
 * catalogue. Un mot inconnu est remplace par le mot connu le plus proche
 * (distance de Damerau-Levenshtein : lettre en trop, manquante, fausse ou
 * inversee), en privilegiant le mot le plus utilise.
 *
 * Convention du catalogue : MAJUSCULES SANS ACCENTS (« REFRIGERATEUR » y est
 * 13 fois plus frequent que « RÉFRIGÉRATEUR »). Le correcteur l'applique.
 */

/** Mots de reference, orthographe correcte, majuscules sans accents. */
const LEXIQUE = `
A AGRUME AGRUMES AIR AIRFRYER AIRPODS AMERICAIN AND ANDROID ANTI ANTIMOUSTIQUE APPLE AQUA ARMOIRE
ASPIRANTE ASPIRATEUR AUTO AUTOCUISEUR AVEC BABYPHONE BAIN BALAI BALANCE BANK BAR BARBECUE BARRE BATTERIE
BATTEUR BIBERON BLACK BLANC BLENDER BLUETOOTH BOL BOUCLEUR BOUILLOIRE BOUTEILLE BOX BROSSE BROYEUR BUDS
BUREAU CABLE CAFE CAFETIERE CAMERA CAPSULE CAPSULES CARTE CARTOUCHE CASQUE CAVE CENTRALE CERAMIQUE
CHALEUR CHARGEUR CHAUD CHAUDIERE CHAUFFAGE CHAUFFE CHAUFFERETTE CHEMINEE CHEVEUX CHOPPER CLAVIER CLE
CLIMATISEUR COCOTTE COFFRE COLONNE COMBINE COMPACT CONDENSATION CONGELATEUR CONNECTEE CONSOLE CONVECTEUR
CONVECTION COOLER COQUE COUVERTS CREPIERE CUISEUR CUISINE CUISINIERE CUIT DEFROISSEUR DEJEUNER
DESHUMIDIFICATEUR DIGITAL DISQUE DISTRIBUTEUR DOMINO DOUBLE DUAL DUO EARBUDS EAU ECOUTEUR ECOUTEURS
ECRAN ELECTRIQUE ENCASTRABLE ENCEINTE EPILATEUR ESPRESSO EVACUATION EXPRESSO EXTERNE EXTRACTEUR FER
FEUX FIL FONDUE FONTAINE FOUR FOYERS FRAMELESS FRIGO FRITEUSE FROID FROST FRY FRYER GALAXY GAMER GAUFRIER
GAZ GLACE GLACONS GRAIN GRILL GRILLE GRILLOIR HACHE HACHOIR HALOGENE HAUT HORIZONTAL HOTTE HUBLOT HUILE
HUMIDIFICATEUR IMPRIMANTE INDUCTION INFRAROUGE INOX INSECTE INVERTER IPAD IPHONE JEU JEUX JUS KITCHEN
LAIT LAVANT LAVANTE LAVE LAVER LECTEUR LINGE LISSEUR MACBOOK MACHINE MANETTE MANETTES MANUEL MEMOIRE
MICRO MINI MIXEUR MOBILE MONITEUR MONITEURS MONTRE MOULIN MOULINETTE MULTI MULTIFONCTION MURAL NANO
NATURELLE NEO NETBOOK NETTOYEUR NOIR NOTEBOOK ONDE ONDES ORDINATEUR PACK PAIN PALES PANINEUSE PANINI
PARLEUR PETIT PETRIN PIED PIEDS PIERRE PLANCHA PLAQUE PLONGEANT PLONGEUR POMPE PORTABLE PORTES POSABLE
POWER PRESSE PRO PROFESSIONNEL PROTECTION PURIFICATEUR RACLETTE RADIATEUR RASOIR RECEPTEUR RECHARGEABLE
RECHAUD REFRIGERATEUR REFROIDISSEUR REPASSER ROBOT ROUTEUR SAC SALLE SANDWICH SANS SECHANTE SECHE
SEMI SHAMPOUINEUSE SIDE SILVER SMART SMARTPHONE SMARTWATCH SOL SOLS SON SOUFFLANT SOUND SOURIS SPLIT
STERILISATEUR SUPPORT SURVEILLANCE TABLE TABLETTE TABLETTES TAPIS TELECOMMANDE TELEVISEUR THEIERE
THERMOS TIROIRS TOASTER TONDEUSE TOP TRAINEAU TROTTINETTE VAISSELLE VAPEUR VELO VENTILATEUR VERRE
VERTICAL VIANDE VIDEO VIN VINTAGE VITRE VITRINE VITROCERAMIQUE VOITURE WATCH WHITE YAOURTIERE
LED QLED OLED HQLED NQLED MQLED QNED DLED ULED MINILED UHD BROYEURS NOFROST FRAMELESS
`
  .split(/\s+/)
  .filter(Boolean);

/** « Réfrigérateur » → « REFRIGERATEUR ». */
export const normaliser = (texte: string) =>
  texte
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase();

/** Distance de Damerau-Levenshtein (transposition de deux lettres voisines comprise). */
export function distance(a: string, b: string, max = 3): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cout = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cout);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, d[i - 2]![j - 2]! + 1);
      }
      d[i]![j] = v;
    }
  }
  return d[a.length]![b.length]!;
}

/** Ecart tolere selon la longueur du mot : 1 faute jusqu'a 5 lettres, 2 ensuite, 3 au-dela de 10. */
const ecartTolere = (n: number) => (n <= 5 ? 1 : n <= 10 ? 2 : 3);

export interface Correction {
  readonly de: string;
  readonly vers: string;
}

export interface ResultatCorrection {
  readonly texte: string;
  readonly corrections: readonly Correction[];
}

/**
 * Dictionnaire : lexique de reference + mots frequents du catalogue.
 * Un mot du catalogue n'est admis que s'il ne ressemble a aucun mot du
 * lexique : les fautes deja presentes (« RADIATAEUR ») ne sont pas apprises.
 */
export class Dictionnaire {
  private readonly frequences = new Map<string, number>();

  constructor(motsCatalogue: ReadonlyMap<string, number> = new Map(), seuil = 3) {
    for (const mot of LEXIQUE) this.frequences.set(mot, 1);
    const reference = [...this.frequences.keys()];
    for (const [mot, n] of motsCatalogue) {
      if (this.frequences.has(mot)) {
        this.frequences.set(mot, this.frequences.get(mot)! + n);
      } else if (n >= seuil && mot.length >= 3 && !/\d/.test(mot)) {
        const ressemble = reference.some((r) => distance(mot, r, 2) <= ecartTolere(mot.length));
        if (!ressemble) this.frequences.set(mot, n);
      }
    }
  }

  /** Ajoute des mots toujours valides (noms de marques…). */
  ajouter(mots: Iterable<string>): void {
    for (const m of mots) {
      const cle = normaliser(m).replace(/[^A-Z]/g, '');
      if (cle) this.frequences.set(cle, (this.frequences.get(cle) ?? 0) + 100);
    }
  }

  connait(mot: string): boolean {
    return this.frequences.has(mot);
  }

  /** Mot connu le plus proche, ou null si aucun n'est assez proche. */
  proposer(mot: string): string | null {
    const max = ecartTolere(mot.length);
    let meilleur: string | null = null;
    let meilleureDistance = max + 1;
    let meilleureFrequence = -1;
    for (const [candidat, freq] of this.frequences) {
      if (Math.abs(candidat.length - mot.length) > max) continue;
      const dist = distance(mot, candidat, max);
      if (dist < meilleureDistance || (dist === meilleureDistance && freq > meilleureFrequence)) {
        meilleur = candidat;
        meilleureDistance = dist;
        meilleureFrequence = freq;
      }
    }
    return meilleureDistance <= max ? meilleur : null;
  }

  /**
   * Corrige un texte mot a mot. Les codes (mots avec chiffres) et les mots de
   * moins de `longueurMin` lettres sont laisses tels quels.
   */
  corriger(texte: string, longueurMin = 4): ResultatCorrection {
    const corrections: Correction[] = [];
    const propre = normaliser(texte).replace(/\s+/g, ' ').trim();
    const resultat = propre.replace(/[A-Z0-9]+/g, (mot) => {
      if (/\d/.test(mot) || mot.length < longueurMin || this.connait(mot)) return mot;
      const vers = this.proposer(mot);
      if (vers && vers !== mot) {
        corrections.push({ de: mot, vers });
        return vers;
      }
      return mot;
    });
    return { texte: resultat, corrections };
  }
}

/** Nom de marque le plus proche parmi la liste (tolere 1 a 2 fautes). */
export function marqueLaPlusProche<T extends { nom: string }>(saisie: string, marques: readonly T[]): T | null {
  const cle = normaliser(saisie).replace(/[^A-Z0-9]/g, '');
  if (!cle) return null;
  let meilleure: T | null = null;
  let meilleureDistance = Infinity;
  for (const m of marques) {
    const nom = normaliser(m.nom).replace(/[^A-Z0-9]/g, '');
    if (nom === cle) return m;
    const d = distance(cle, nom, 3);
    if (d < meilleureDistance) {
      meilleure = m;
      meilleureDistance = d;
    }
  }
  return meilleureDistance <= ecartTolere(cle.length) ? meilleure : null;
}
