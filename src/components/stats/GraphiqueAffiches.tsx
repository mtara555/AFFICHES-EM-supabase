import { useLayoutEffect, useRef, useState } from 'react';
import type { Intervalle } from '../../lib/statistiques';
import './Graphiques.css';

/** Couleurs validees (ecart daltonisme ΔE 10,4 ; contraste ≥ 3:1 sur fond clair). */
export const COULEUR_ELECTRO = '#1f5bb5';
export const COULEUR_NT = '#d4317a';

const HAUTEUR = 260;
const MARGE = { haut: 16, droite: 8, bas: 28, gauche: 36 };
const ECART = 2; // espace blanc entre segments empiles
const RAYON = 4; // extremite arrondie

/** Graduations « rondes » : 0, 5, 10… ou 0, 20, 40… */
function graduations(max: number): number[] {
  if (max <= 0) return [0, 1];
  const brut = max / 4;
  const puissance = 10 ** Math.floor(Math.log10(brut));
  const pas = [1, 2, 5, 10].map((m) => m * puissance).find((p) => p >= brut) ?? puissance * 10;
  const pasEntier = Math.max(1, Math.round(pas));
  const liste: number[] = [];
  for (let v = 0; v <= max + pasEntier - 1; v += pasEntier) liste.push(v);
  if (liste[liste.length - 1]! < max) liste.push(liste[liste.length - 1]! + pasEntier);
  return liste;
}

/** Rectangle arrondi en haut seulement (base carree sur l'axe). */
function barreArrondie(x: number, y: number, l: number, h: number): string {
  const r = Math.min(RAYON, h, l / 2);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + l - r}Q${x + l},${y} ${x + l},${y + r}V${y + h}Z`;
}

interface Props {
  readonly intervalles: readonly Intervalle[];
}

/**
 * Histogramme empile Electro / Nouvelles technologies.
 * Survol ou focus d'une colonne : infobulle avec le detail et le total.
 */
export function GraphiqueAffiches({ intervalles }: Props) {
  const conteneur = useRef<HTMLDivElement>(null);
  const [largeur, setLargeur] = useState(640);
  const [actif, setActif] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = conteneur.current;
    if (!el) return;
    const obs = new ResizeObserver(([e]) => setLargeur(Math.max(280, e!.contentRect.width)));
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const max = Math.max(0, ...intervalles.map((i) => i.electro + i.nt));
  const ticks = graduations(max);
  const haut = ticks[ticks.length - 1]!;
  const zoneL = largeur - MARGE.gauche - MARGE.droite;
  const zoneH = HAUTEUR - MARGE.haut - MARGE.bas;
  const bande = zoneL / Math.max(1, intervalles.length);
  const epaisseur = Math.min(24, bande * 0.62);
  const y = (v: number) => MARGE.haut + zoneH - (v / haut) * zoneH;
  // Un libelle sur n pour eviter les chevauchements (30 jours), cale sur la periode la plus recente.
  const pasLibelle = Math.max(1, Math.ceil(intervalles.length / Math.floor(zoneL / 44)));

  const survol = actif !== null ? intervalles[actif] : undefined;

  return (
    <div className="graphique" ref={conteneur}>
      <svg
        width={largeur}
        height={HAUTEUR}
        role="img"
        aria-label="Affiches generees par periode, Electro et Image et Son"
      >
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={MARGE.gauche}
              x2={largeur - MARGE.droite}
              y1={y(t)}
              y2={y(t)}
              className={t === 0 ? 'graphique__base' : 'graphique__grille'}
            />
            <text x={MARGE.gauche - 8} y={y(t)} dy="0.32em" textAnchor="end" className="graphique__axe">
              {t.toLocaleString('fr-FR')}
            </text>
          </g>
        ))}

        {intervalles.map((i, index) => {
          const cx = MARGE.gauche + bande * index + bande / 2;
          const x = cx - epaisseur / 2;
          const hE = i.electro > 0 ? y(0) - y(i.electro) : 0;
          const hN = i.nt > 0 ? y(0) - y(i.nt) : 0;
          const yE = y(0) - hE;
          const yN = yE - hN - (hE > 0 && hN > 0 ? ECART : 0);
          const estActif = actif === index;
          return (
            <g key={i.cle} className={actif !== null && !estActif ? 'graphique__col--attenue' : undefined}>
              {hE > 0 ? (
                hN > 0 ? (
                  <rect x={x} y={yE} width={epaisseur} height={hE} fill={COULEUR_ELECTRO} />
                ) : (
                  <path d={barreArrondie(x, yE, epaisseur, hE)} fill={COULEUR_ELECTRO} />
                )
              ) : null}
              {hN > 0 ? <path d={barreArrondie(x, yN, epaisseur, hN)} fill={COULEUR_NT} /> : null}
              {(intervalles.length - 1 - index) % pasLibelle === 0 ? (
                <text x={cx} y={HAUTEUR - 8} textAnchor="middle" className="graphique__axe">
                  {i.libelle}
                </text>
              ) : null}
              {/* Zone de survol : toute la hauteur de la colonne */}
              <rect
                x={MARGE.gauche + bande * index}
                y={MARGE.haut}
                width={bande}
                height={zoneH}
                fill="transparent"
                tabIndex={0}
                aria-label={`${i.libelleLong} : ${i.electro} Electro, ${i.nt} Image et Son`}
                onMouseEnter={() => setActif(index)}
                onMouseLeave={() => setActif(null)}
                onFocus={() => setActif(index)}
                onBlur={() => setActif(null)}
              />
            </g>
          );
        })}
      </svg>

      {survol && actif !== null ? (
        <div
          className="graphique__infobulle"
          style={{
            left: Math.min(
              Math.max(MARGE.gauche + bande * actif + bande / 2, 90),
              largeur - 90,
            ),
            top: Math.max(0, y(survol.electro + survol.nt) - 12),
          }}
          role="status"
        >
          <strong>{survol.libelleLong}</strong>
          <span>
            <i style={{ background: COULEUR_ELECTRO }} /> Electro <b>{survol.electro}</b>
          </span>
          <span>
            <i style={{ background: COULEUR_NT }} /> Image &amp; Son <b>{survol.nt}</b>
          </span>
          <span className="graphique__infobulle-total">
            Total <b>{survol.electro + survol.nt}</b>
          </span>
        </div>
      ) : null}
    </div>
  );
}
