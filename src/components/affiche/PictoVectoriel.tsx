import type { ReactNode } from 'react';

/**
 * Pictogrammes vectoriels du kit PLV Electro, dessines a partir du code saisi
 * dans le catalogue : « 1200T », « 7KG », « 3USB », « 4HDMI », « 4KUHD »,
 * « WIFI », « TNTHD », « HDR10+ », « ULTRAHD », « FULLHD », « HD »,
 * et la taille d'ecran « 75" » (ou « 75P », « 75 POUCES », « 75PO », « 75IN »).
 *
 * Toutes les variantes chiffrees (1000T, 1400T, 8KG, 9KG, 1 a 5 USB…) sont
 * produites par le meme dessin : aucun fichier image n'est a preparer.
 * Le rendu est vectoriel, donc net a toutes les tailles d'impression.
 */

export const JAUNE = '#ffe924';
export const BLEU = '#1453a2';

const POLICE = "var(--affiche-police-forte, 'Arial Black', Arial, sans-serif)";

/* -------------------------------------------------------------------------- */
/* Reconnaissance du code                                                      */
/* -------------------------------------------------------------------------- */

export type Modele =
  | { type: 'tours'; valeur: string }
  | { type: 'poids'; valeur: string }
  | { type: 'usb'; nombre: string }
  | { type: 'hdmi'; nombre: string }
  | { type: '4k' }
  | { type: 'wifi' }
  | { type: 'tnt' }
  | { type: 'hdr'; suffixe: string }
  | { type: 'resolution'; haut: string | null; bas: string }
  | { type: 'ecran'; pouces: string };

/** Renvoie le modele de dessin correspondant au code, ou null (rendu texte). */
export function reconnaitre(code: string): Modele | null {
  const c = code.toUpperCase().replace(/[\s_.-]/g, '');
  let m: RegExpExecArray | null;

  // Taille d'ecran : 75", 75'', 75″, 75P, 75 POUCES, 75PO, 75IN, 75INCH, 65"...
  const e = code.toUpperCase().replace(/\s/g, '').replace(/[“”″]/g, '"').replace(/''/g, '"');
  if ((m = /^(\d{2,3}(?:[,.]\d)?)("|POUCES?|PO|P|IN|INCH|INCHES|POUCE)$/.exec(e))) {
    return { type: 'ecran', pouces: m[1]!.replace('.', ',') };
  }

  if ((m = /^(\d{3,4})(T|TR|TRS|TOURS?|TRMIN|RPM)$/.exec(c))) return { type: 'tours', valeur: m[1]! };
  if ((m = /^(\d{1,2}(?:,\d)?)KGS?$/.exec(code.toUpperCase().replace(/\s/g, '').replace('.', ',')))) {
    return { type: 'poids', valeur: m[1]! };
  }
  if ((m = /^(\d)?USB(\d)?$/.exec(c))) return { type: 'usb', nombre: m[1] ?? m[2] ?? '' };
  if ((m = /^(\d)?HDMI(\d)?$/.exec(c))) return { type: 'hdmi', nombre: m[1] ?? m[2] ?? '' };
  if (/^4K(UHD|ULTRAHD)?$/.test(c)) return { type: '4k' };
  if (/^WIFI$/.test(c)) return { type: 'wifi' };
  if (/^TNT(HD)?$/.test(c)) return { type: 'tnt' };
  if ((m = /^HDR(10\+?|10PLUS)?$/.exec(c))) {
    return { type: 'hdr', suffixe: m[1] ? '10+' : '' };
  }
  if (/^(ULTRAHD|UHD)$/.test(c)) return { type: 'resolution', haut: 'ULTRA', bas: 'HD' };
  if (/^(FULLHD|FHD)$/.test(c)) return { type: 'resolution', haut: 'FULL', bas: 'HD' };
  if (/^HD$/.test(c)) return { type: 'resolution', haut: null, bas: 'HD' };
  return null;
}

/* -------------------------------------------------------------------------- */
/* Primitives                                                                  */
/* -------------------------------------------------------------------------- */

/** Largeur approximative d'un texte gras, pour le contraindre a sa zone. */
const largeurEstimee = (texte: string, taille: number) => texte.length * taille * 0.66;

interface TexteProps {
  readonly x: number;
  readonly y: number;
  readonly taille: number;
  readonly max: number;
  readonly couleur?: string;
  readonly italique?: boolean;
  readonly children: string;
}

/** Texte centre, compresse seulement s'il depasse sa largeur maximale. */
function Texte({ x, y, taille, max, couleur = BLEU, italique = false, children }: TexteProps) {
  const trop = largeurEstimee(children, taille) > max;
  return (
    <text
      x={x}
      y={y}
      textAnchor="middle"
      fill={couleur}
      fontFamily={POLICE}
      fontWeight={900}
      fontSize={taille}
      fontStyle={italique ? 'italic' : undefined}
      textLength={trop ? max : undefined}
      lengthAdjust={trop ? 'spacingAndGlyphs' : undefined}
    >
      {children}
    </text>
  );
}

/** Hexagone jaune a pointes laterales, coins arrondis (viewBox 140 × 120). */
function Hexagone({ children, label }: { children: ReactNode; label: string }) {
  const points = '36,4 104,4 136,60 104,116 36,116 4,60';
  return (
    <svg className="affiche__picto-svg" viewBox="0 0 140 120" role="img" aria-label={label}>
      <polygon points={points} fill={JAUNE} stroke={JAUNE} strokeWidth={8} strokeLinejoin="round" />
      {children}
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/* Dessins                                                                     */
/* -------------------------------------------------------------------------- */

function Tours({ valeur }: { valeur: string }) {
  return (
    <Hexagone label={`${valeur} tours`}>
      <circle cx={70} cy={44} r={27} fill="#ffffff" stroke={BLEU} strokeWidth={6} />
      <circle cx={70} cy={44} r={19} fill="none" stroke={BLEU} strokeWidth={2.2} />
      <Texte x={70} y={101} taille={26} max={96}>
        {`${valeur}T`}
      </Texte>
    </Hexagone>
  );
}

function Poids({ valeur }: { valeur: string }) {
  return (
    <Hexagone label={`${valeur} kg`}>
      {/* Anse */}
      <path d="M56,40 V30 a14,14 0 0 1 28,0 V40" fill="none" stroke={BLEU} strokeWidth={6} />
      {/* Corps du poids, legerement evase vers le bas */}
      <path d="M40,40 H100 L108,102 H32 Z" fill={BLEU} stroke={BLEU} strokeWidth={4} strokeLinejoin="round" />
      <Texte x={70} y={83} taille={30} max={64} couleur="#ffffff">
        {`${valeur}kg`}
      </Texte>
    </Hexagone>
  );
}

function Usb({ nombre }: { nombre: string }) {
  const avecNombre = nombre !== '';
  const yPrise = avecNombre ? 80 : 52;
  return (
    <Hexagone label={`${nombre} USB`}>
      {avecNombre ? (
        <Texte x={70} y={60} taille={52} max={60}>
          {nombre}
        </Texte>
      ) : null}
      {/* Cable */}
      <rect x={14} y={yPrise + 9} width={30} height={6} rx={2} fill={BLEU} />
      {/* Prise */}
      <rect x={42} y={yPrise} width={62} height={24} rx={5} fill={BLEU} />
      <Texte x={73} y={yPrise + 19} taille={18} max={52} couleur="#ffffff">
        USB
      </Texte>
      {/* Contacts */}
      <rect x={104} y={yPrise + 3} width={9} height={18} rx={2} fill="none" stroke={BLEU} strokeWidth={2.5} />
      <line x1={107} y1={yPrise + 8} x2={110} y2={yPrise + 8} stroke={BLEU} strokeWidth={2} />
      <line x1={107} y1={yPrise + 12} x2={110} y2={yPrise + 12} stroke={BLEU} strokeWidth={2} />
      <line x1={107} y1={yPrise + 16} x2={110} y2={yPrise + 16} stroke={BLEU} strokeWidth={2} />
    </Hexagone>
  );
}

function Hdmi({ nombre }: { nombre: string }) {
  const avecNombre = nombre !== '';
  return (
    <Hexagone label={`${nombre} HDMI`}>
      {avecNombre ? (
        <Texte x={70} y={58} taille={48} max={56}>
          {nombre}
        </Texte>
      ) : null}
      <Texte x={68} y={avecNombre ? 92 : 72} taille={28} max={98}>
        HDMI
      </Texte>
      <text x={112} y={avecNombre ? 74 : 54} fill={BLEU} fontFamily={POLICE} fontSize={7} fontWeight={700}>
        TM
      </text>
    </Hexagone>
  );
}

function QuatreK() {
  return (
    <Hexagone label="4K Ultra HD">
      <rect x={34} y={14} width={72} height={92} fill="none" stroke={BLEU} strokeWidth={5} />
      <Texte x={70} y={66} taille={42} max={60}>
        4K
      </Texte>
      <rect x={34} y={78} width={72} height={28} fill={BLEU} />
      <Texte x={70} y={97} taille={13} max={62} couleur="#ffffff">
        ULTRA HD
      </Texte>
    </Hexagone>
  );
}

function Wifi() {
  return (
    <Hexagone label="Wi-Fi">
      <rect x={18} y={38} width={104} height={46} rx={23} fill={JAUNE} stroke={BLEU} strokeWidth={5} />
      <Texte x={48} y={72} taille={30} max={44}>
        Wi
      </Texte>
      <circle cx={97} cy={61} r={23} fill={BLEU} />
      <Texte x={97} y={72} taille={28} max={34} couleur={JAUNE}>
        Fi
      </Texte>
    </Hexagone>
  );
}

function Tnt() {
  return (
    <Hexagone label="TNT HD">
      <Texte x={70} y={56} taille={38} max={84}>
        TNT
      </Texte>
      <Texte x={70} y={96} taille={38} max={64}>
        HD
      </Texte>
    </Hexagone>
  );
}

function Hdr({ suffixe }: { suffixe: string }) {
  return (
    <Hexagone label={`HDR ${suffixe}`}>
      {/* « HDR » en lettres a double trait, comme le logo */}
      <text
        x={70}
        y={suffixe ? 58 : 74}
        textAnchor="middle"
        fontFamily={POLICE}
        fontWeight={900}
        fontSize={36}
        fill={JAUNE}
        stroke={BLEU}
        strokeWidth={4.5}
        paintOrder="stroke"
      >
        HDR
      </text>
      {suffixe ? (
        <Texte x={70} y={98} taille={32} max={70}>
          {suffixe}
        </Texte>
      ) : null}
    </Hexagone>
  );
}

function Resolution({ haut, bas }: { haut: string | null; bas: string }) {
  return (
    <Hexagone label={`${haut ?? ''} ${bas}`.trim()}>
      {haut ? (
        <>
          <Texte x={70} y={54} taille={26} max={100}>
            {haut}
          </Texte>
          <Texte x={70} y={98} taille={40} max={70} italique>
            {bas}
          </Texte>
        </>
      ) : (
        <Texte x={70} y={78} taille={54} max={80} italique>
          {bas}
        </Texte>
      )}
    </Hexagone>
  );
}

export const ROUGE = '#e30613';

/**
 * Taille d'ecran (TV, PC, tablette…) : triangle rouge dans l'angle superieur
 * droit, diagonale du coin haut-gauche au coin bas-droit, valeur en blanc.
 */
function Ecran({ pouces }: { pouces: string }) {
  const texte = `${pouces}"`;
  const trop = largeurEstimee(texte, 40) > 68;
  return (
    <svg className="affiche__picto-svg" viewBox="0 0 120 120" role="img" aria-label={`Ecran ${pouces} pouces`}>
      <polygon points="0,0 120,0 120,120" fill={ROUGE} />
      <text
        x={116}
        y={44}
        textAnchor="end"
        fill="#ffffff"
        fontFamily={POLICE}
        fontWeight={900}
        fontSize={40}
        textLength={trop ? 68 : undefined}
        lengthAdjust={trop ? 'spacingAndGlyphs' : undefined}
      >
        {texte}
      </text>
    </svg>
  );
}

/** Dessine le pictogramme du modele reconnu. */
export function PictoVectoriel({ modele }: { modele: Modele }) {
  switch (modele.type) {
    case 'tours':
      return <Tours valeur={modele.valeur} />;
    case 'poids':
      return <Poids valeur={modele.valeur} />;
    case 'usb':
      return <Usb nombre={modele.nombre} />;
    case 'hdmi':
      return <Hdmi nombre={modele.nombre} />;
    case '4k':
      return <QuatreK />;
    case 'wifi':
      return <Wifi />;
    case 'tnt':
      return <Tnt />;
    case 'hdr':
      return <Hdr suffixe={modele.suffixe} />;
    case 'resolution':
      return <Resolution haut={modele.haut} bas={modele.bas} />;
    case 'ecran':
      return <Ecran pouces={modele.pouces} />;
  }
}
