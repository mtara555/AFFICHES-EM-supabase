import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useParams } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { Planche } from '../components/affiche/Planche';
import { Reduction } from '../components/affiche/Reduction';
import { trouverParEan, type Article } from '../lib/articles';
import { listerMarques, type Marque } from '../lib/marques';
import {
  changerGabaritCampagne,
  changerStatutCampagne,
  listerAffiches,
  messageErreurCampagne,
  obtenirCampagne,
  type Affiche,
  type Campagne,
} from '../lib/campagnes';
import { chargerParametres, PARAMETRES_DEFAUT, type ParametresRegles } from '../lib/regles';
import { depuisAffiche, type DonneesAffiche } from '../lib/affiche-rendu';
import { attendreRenduComplet } from '../lib/medias';
import { FORMATS, FORMATS_ORDONNES, type FormatAffiche } from '../config/constants';
import { GABARITS, GABARITS_ORDONNES } from '../config/gabarits';
import {
  listerGabaritsOperation,
  modeleDepuisChoix,
  PREFIXE_OPERATION,
  type GabaritOperation,
} from '../lib/gabarits-operation';
import './Impression.css';
import { tracer } from '../lib/journal';


interface PlancheCalculee {
  readonly cle: string;
  readonly format: FormatAffiche;
  readonly affiches: DonneesAffiche[];
}

/** Charge les fiches articles par lots, pour ne pas saturer le navigateur. */
async function chargerArticles(eans: readonly string[]): Promise<Map<string, Article | null>> {
  const resultat = new Map<string, Article | null>();
  const uniques = [...new Set(eans)];
  const LOT = 8;
  for (let i = 0; i < uniques.length; i += LOT) {
    const lot = uniques.slice(i, i + LOT);
    const trouves = await Promise.all(lot.map((ean) => trouverParEan(ean)));
    lot.forEach((ean, j) => resultat.set(ean, trouves[j] ?? null));
  }
  return resultat;
}

/**
 * Apercu et impression d'une campagne.
 *
 * Remplace le bouton « Generer » du classeur : chaque ligne de la campagne
 * devient une affiche, les affiches sont regroupees par format puis imposees
 * sur des feuilles A4. L'impression passe par le navigateur (« Enregistrer au
 * format PDF » ou imprimante), ce qui conserve un texte vectoriel net.
 */
export function Impression() {
  const { campagneId } = useParams<{ campagneId: string }>();

  const [campagne, setCampagne] = useState<Campagne | null>(null);
  const [affiches, setAffiches] = useState<Affiche[]>([]);
  const [articles, setArticles] = useState<Map<string, Article | null>>(new Map());
  const [marques, setMarques] = useState<Map<string, Marque>>(new Map());
  const [parametres, setParametres] = useState<ParametresRegles>(PARAMETRES_DEFAUT);

  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [choixGabarit, setChoixGabarit] = useState<string>('auto');
  const [operations, setOperations] = useState<GabaritOperation[]>([]);
  const [messageGabarit, setMessageGabarit] = useState<string | null>(null);
  // Sur telephone, l'apercu tient dans la largeur de l'ecran (A4 = 794 px a l'echelle 1).
  const [zoom, setZoom] = useState(() =>
    Math.max(0.25, Math.min(0.5, (window.innerWidth - 48) / 794)),
  );
  const [preparation, setPreparation] = useState(false);

  const charger = useCallback(async () => {
    if (!campagneId) return;
    setChargement(true);
    setErreur(null);
    try {
      const [c, a, m, p, ops] = await Promise.all([
        obtenirCampagne(campagneId),
        listerAffiches(campagneId),
        listerMarques(),
        chargerParametres(),
        listerGabaritsOperation(),
      ]);
      setCampagne(c);
      setOperations(ops);
      setChoixGabarit(c.gabarit ?? 'auto');
      setAffiches(a);
      setMarques(new Map(m.map((marque) => [marque.id, marque])));
      setParametres(p);
      setArticles(await chargerArticles(a.map((x) => x.ean)));
    } catch (probleme) {
      setErreur(messageErreurCampagne(probleme));
    } finally {
      setChargement(false);
    }
  }, [campagneId]);

  useEffect(() => {
    void charger();
  }, [charger]);

  const modeleImpose = useMemo(
    () => modeleDepuisChoix(choixGabarit, operations),
    [choixGabarit, operations],
  );

  /** Enregistre le choix sur la campagne : il vaut pour tous les utilisateurs. */
  async function choisirGabarit(valeur: string) {
    setChoixGabarit(valeur);
    setMessageGabarit(null);
    if (!campagne) return;
    try {
      setCampagne(await changerGabaritCampagne(campagne.id, valeur === 'auto' ? null : valeur));
      tracer('modification', 'campagnes', `Campagne « ${campagne.nom} » : gabarit ${valeur}`);
    } catch (probleme) {
      setMessageGabarit(
        `${messageErreurCampagne(probleme)} Le gabarit est applique pour cette impression seulement.`,
      );
    }
  }

  /** Donnees pretes a rendre, et lignes ecartees faute de fiche article. */
  const { donnees, introuvables } = useMemo(() => {
    const prets: { format: FormatAffiche; donnees: DonneesAffiche }[] = [];
    const manquants: string[] = [];
    for (const affiche of affiches) {
      const article = articles.get(affiche.ean);
      if (!article) {
        manquants.push(affiche.ean);
        continue;
      }
      prets.push({
        format: affiche.format,
        donnees: depuisAffiche(
          affiche,
          article,
          marques.get(article.marqueId),
          parametres,
          modeleImpose,
        ),
      });
    }
    return { donnees: prets, introuvables: manquants };
  }, [affiches, articles, marques, parametres, modeleImpose]);

  const planches = useMemo<PlancheCalculee[]>(() => {
    const resultat: PlancheCalculee[] = [];
    for (const format of FORMATS_ORDONNES) {
      const duFormat = donnees.filter((d) => d.format === format).map((d) => d.donnees);
      const n = FORMATS[format].parPlancheA4;
      for (let i = 0; i < duFormat.length; i += n) {
        resultat.push({ cle: `${format}-${i}`, format, affiches: duFormat.slice(i, i + n) });
      }
    }
    return resultat;
  }, [donnees]);

  const repartition = useMemo(
    () =>
      FORMATS_ORDONNES.map((format) => ({
        format,
        nombre: donnees.filter((d) => d.format === format).length,
      })).filter((r) => r.nombre > 0),
    [donnees],
  );

  async function imprimer() {
    setPreparation(true);
    try {
      await attendreRenduComplet();
      window.print();
      if (campagne) {
        tracer('export', 'impression', `Impression / PDF : campagne « ${campagne.nom} » — ${donnees.length} affiche(s) sur ${planches.length} feuille(s) A4`);
      }
      if (campagne && campagne.statut === 'validee') {
        // Trace simple : la campagne passe a « imprimee » apres l'envoi.
        try {
          setCampagne(await changerStatutCampagne(campagne.id, 'imprimee'));
        } catch {
          /* le statut est secondaire : l'impression a eu lieu */
        }
      }
    } finally {
      setPreparation(false);
    }
  }

  const titre = campagne ? `Affiches — ${campagne.nom}` : 'Affiches';

  return (
    <AppShell
      titre={titre}
      sousTitre={
        chargement
          ? 'Chargement…'
          : `${donnees.length} affiche(s) sur ${planches.length} feuille(s) A4`
      }
      actions={
        <>
          {campagneId ? (
            <Link to={`/saisie/${campagneId}`} className="bouton bouton--discret">
              Retour a la saisie
            </Link>
          ) : null}
          <button
            type="button"
            className="bouton bouton--principal"
            onClick={() => void imprimer()}
            disabled={chargement || preparation || planches.length === 0}
          >
            {preparation ? 'Preparation…' : 'Imprimer / PDF'}
          </button>
        </>
      }
    >
      {erreur ? (
        <p className="bandeau bandeau--erreur" role="alert">
          {erreur}
        </p>
      ) : null}

      {introuvables.length > 0 ? (
        <p className="bandeau bandeau--alerte">
          {introuvables.length} ligne(s) ignoree(s), code absent du catalogue :{' '}
          {introuvables.join(', ')}
        </p>
      ) : null}

      <section className="carte impression-outils">
        <div className="champ">
          <label htmlFor="gabarit">Gabarit</label>
          <select
            id="gabarit"
            value={choixGabarit}
            onChange={(e) => void choisirGabarit(e.target.value)}
          >
            <option value="auto">Automatique : Electro ou Image &amp; Son selon l&apos;article</option>
            {GABARITS_ORDONNES.map((g) => (
              <option key={g} value={g}>
                {GABARITS[g].libelle} — toutes les affiches
              </option>
            ))}
            {operations.length > 0 ? (
              <optgroup label="Operations">
                {operations.map((o) => (
                  <option key={o.id} value={`${PREFIXE_OPERATION}${o.id}`}>
                    {o.nom}
                  </option>
                ))}
              </optgroup>
            ) : null}
          </select>
          {messageGabarit ? <span className="champ__aide champ__aide--alerte">{messageGabarit}</span> : null}
        </div>

        <div className="champ">
          <label htmlFor="zoom">Zoom de l&apos;apercu</label>
          <input
            id="zoom"
            type="range"
            min={0.25}
            max={1}
            step={0.05}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
          />
        </div>

        <div className="impression-outils__repartition">
          {repartition.map((r) => (
            <span key={r.format} className="pastille">
              {r.nombre} × {r.format} ({FORMATS[r.format].parPlancheA4}/feuille)
            </span>
          ))}
        </div>

        <p className="impression-outils__aide">
          Dans la fenetre d&apos;impression : format <strong>A4</strong>, marges{' '}
          <strong>Aucune</strong>, echelle <strong>100 %</strong>, cocher{' '}
          <strong>Graphiques d&apos;arriere-plan</strong>. Pour un PDF, choisir la destination
          « Enregistrer au format PDF ».
        </p>
      </section>

      {!chargement && planches.length === 0 && !erreur ? (
        <section className="carte">
          <p className="carte__texte carte__texte--discret">
            Aucune affiche a imprimer. Ajoutez des articles depuis l&apos;ecran de saisie.
          </p>
        </section>
      ) : null}

      <div className="impression-apercu">
        {planches.map((planche, index) => (
          <figure key={planche.cle} className="impression-apercu__feuille">
            <Reduction echelle={zoom}>
              <Planche format={planche.format} affiches={planche.affiches} />
            </Reduction>
            <figcaption>
              Feuille {index + 1} — {planche.format}
            </figcaption>
          </figure>
        ))}
      </div>

      {/* Exemplaire a taille reelle, reserve a l'impression. Il est place hors
          de l'application (enfant direct de <body>) pour que les sauts de page
          ne soient pas neutralises par la mise en page de l'ecran. */}
      {createPortal(
        <div className="zone-impression" aria-hidden="true">
          {planches.map((planche) => (
            <Planche key={planche.cle} format={planche.format} affiches={planche.affiches} />
          ))}
        </div>,
        document.body,
      )}
    </AppShell>
  );
}
