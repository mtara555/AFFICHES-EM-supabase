import { idPictogramme } from '../../lib/supabase';
import { Visuel } from './Visuel';
import { TexteAjuste } from './TexteAjuste';
import { PictoVectoriel, reconnaitre } from './PictoVectoriel';
import { trouverBadge } from './BadgesPromo';

interface PictogrammeProps {
  readonly code: string;
}

/** « 2ANS », « 1 AN », « 5 ANS » → 2, 1, 5. */
function dureeGarantie(code: string): number | null {
  const m = /^(\d{1,2})\s*ANS?$/.exec(code.trim().toUpperCase());
  return m ? Number(m[1]) : null;
}

/**
 * Pictogramme d'un emplacement.
 *
 * Le visuel televerse (`picto_<CODE>`) est prioritaire. A defaut, un rendu
 * vectoriel reprend la charte du kit PLV : cartouche rouge pour la garantie,
 * dessins dedies (tours, kg, USB, HDMI, 4K, Wi-Fi, TNT, HDR, HD, taille d ecran), badges promotionnels
 * (Stock limite, Nouveau, Vu dans le depliant, Exclusivite, Marjane s'engage) et hexagone
 * jaune avec le texte du code pour toute autre caracteristique. L'affiche reste donc
 * exploitable meme avant que la bibliotheque de pictogrammes soit complete.
 */
export function Pictogramme({ code }: PictogrammeProps) {
  if (!code.trim()) return null;
  return (
    <Visuel
      fileId={idPictogramme(code)}
      alt={code}
      className="affiche__picto-image"
      secours={<PictogrammeSecours code={code} />}
    />
  );
}

function PictogrammeSecours({ code }: PictogrammeProps) {
  const badge = trouverBadge(code);
  if (badge) {
    return <img src={badge.image} alt={badge.libelle} className="affiche__picto-image" draggable={false} />;
  }

  const annees = dureeGarantie(code);
  if (annees !== null) {
    const unite = annees > 1 ? 'ANS' : 'AN';
    return (
      <svg className="affiche__garantie" viewBox="0 0 88 98" role="img" aria-label={`Garantie ${annees} ${unite}`}>
        <rect x="0" y="0" width="88" height="98" fill="#e30613" />
        <rect x="3" y="3" width="82" height="92" fill="none" stroke="#fff" strokeWidth="1.5" />
        <text x="44" y="17" textAnchor="middle" fill="#fff" fontSize="12.5" fontWeight="900" fontFamily="var(--affiche-police-forte)">
          GARANTIE
        </text>
        <text
          x={annees > 9 ? 34 : 30}
          y="88"
          textAnchor="middle"
          fill="#fff"
          fontSize={annees > 9 ? 50 : 76}
          fontWeight="900"
          fontFamily="var(--affiche-police-forte)"
        >
          {annees}
        </text>
        <text
          x="0"
          y="0"
          transform="translate(62 24) rotate(90)"
          fill="#fff"
          fontSize="21"
          fontWeight="900"
          letterSpacing="1"
          fontFamily="var(--affiche-police-forte)"
        >
          {unite}
        </text>
      </svg>
    );
  }

  const modele = reconnaitre(code);
  if (modele) return <PictoVectoriel modele={modele} />;

  return (
    <div className="affiche__hexagone">
      <TexteAjuste
        className="affiche__hexagone-texte"
        taillePt={22}
        minPt={8}
        multiligne
        contenu={code}
      >
        {code}
      </TexteAjuste>
    </div>
  );
}
