import { useLayoutEffect, useRef, type CSSProperties, type ReactNode } from 'react';

interface TexteAjusteProps {
  /** Taille nominale, en points — celle du modele PowerPoint. */
  readonly taillePt: number;
  /** Taille plancher : en dessous, le texte deborde plutot que de devenir illisible. */
  readonly minPt?: number;
  /** Autorise le retour a la ligne (pictogrammes). */
  readonly multiligne?: boolean;
  readonly className?: string;
  readonly style?: CSSProperties;
  /** Cle de recalcul : a changer quand le contenu change. */
  readonly contenu: string;
  readonly children: ReactNode;
}

/**
 * Texte qui reduit sa taille jusqu'a tenir dans sa zone.
 *
 * Reproduit le comportement attendu d'un operateur PowerPoint face a une
 * designation trop longue, sans intervention : la taille du modele est la
 * valeur de depart, jamais depassee. Les mesures se font en coordonnees de mise
 * en page, donc insensibles aux reductions (transform) de l'apercu et des
 * planches A5/A6/A7.
 */
export function TexteAjuste({
  taillePt,
  minPt = Math.max(6, taillePt * 0.35),
  multiligne = false,
  className,
  style,
  contenu,
  children,
}: TexteAjusteProps) {
  const zone = useRef<HTMLDivElement>(null);
  const texte = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    let annule = false;

    const ajuster = () => {
      const z = zone.current;
      const t = texte.current;
      if (!z || !t || annule) return;
      let taille = taillePt;
      t.style.fontSize = `${taille}pt`;
      const deborde = () =>
        t.scrollWidth > z.clientWidth + 0.5 || t.offsetHeight > z.clientHeight + 0.5;
      while (deborde() && taille > minPt) {
        taille = Math.max(minPt, taille * 0.94);
        t.style.fontSize = `${taille}pt`;
      }
    };

    ajuster();
    // Les polices peuvent arriver apres le premier rendu et changer les largeurs.
    if ('fonts' in document) void document.fonts.ready.then(ajuster);
    return () => {
      annule = true;
    };
  }, [contenu, taillePt, minPt]);

  return (
    <div ref={zone} className={className} style={style}>
      <span
        ref={texte}
        style={{
          fontSize: `${taillePt}pt`,
          whiteSpace: multiligne ? 'normal' : 'nowrap',
          display: 'inline-block',
          maxWidth: multiligne ? '100%' : undefined,
        }}
      >
        {children}
      </span>
    </div>
  );
}
