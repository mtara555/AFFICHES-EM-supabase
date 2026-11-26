import { useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { LIBELLE_ROLE } from '../../lib/auth';
import { tracer } from '../../lib/journal';
import type { Marque } from '../../lib/marques';
import { genererRapportPdf } from '../../lib/rapport-pdf';
import {
  LIBELLE_PERIODE_RAPPORT,
  calculerPlage,
  compterAffiches,
  type AfficheResume,
  type PeriodeRapport,
} from '../../lib/statistiques';
import { APP_FULL_NAME } from '../../config/constants';
import './RapportPdf.css';

const TYPES: readonly PeriodeRapport[] = ['jour', 'semaine', 'mois', 'trimestre', 'annee'];
const CLE_TYPE = 'tdb-rapport-type';

const nombre = (n: number) => n.toLocaleString('fr-FR');
const deux = (n: number) => String(n).padStart(2, '0');
const versChamp = (d: Date) => `${d.getFullYear()}-${deux(d.getMonth() + 1)}-${deux(d.getDate())}`;

function depuisChamp(v: string): Date {
  const [a, m, j] = v.split('-').map(Number);
  if (!a || !m || !j) return new Date();
  return new Date(a, m - 1, j);
}

interface Props {
  readonly affiches: readonly AfficheResume[];
  readonly marques: readonly Marque[];
  readonly chargement: boolean;
}

/** Choix de la periode et telechargement du rapport PDF. */
export function RapportPdf({ affiches, marques, chargement }: Props) {
  const { utilisateur } = useAuth();

  const [type, setType] = useState<PeriodeRapport>(() => {
    try {
      const t = localStorage.getItem(CLE_TYPE) as PeriodeRapport | null;
      return t && TYPES.includes(t) ? t : 'mois';
    } catch {
      return 'mois';
    }
  });
  const aujourdhui = useMemo(() => versChamp(new Date()), []);
  const [dateRef, setDateRef] = useState(aujourdhui);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const plage = useMemo(() => calculerPlage(type, depuisChamp(dateRef)), [type, dateRef]);
  const total = useMemo(
    () => compterAffiches(affiches, plage.debut, plage.fin),
    [affiches, plage],
  );

  const peutAvancer = plage.fin.getTime() <= Date.now();

  function choisirType(t: PeriodeRapport) {
    setType(t);
    try {
      localStorage.setItem(CLE_TYPE, t);
    } catch {
      /* preference non memorisee */
    }
  }

  async function telecharger() {
    if (!utilisateur) return;
    setEnCours(true);
    setErreur(null);
    try {
      const fichier = await genererRapportPdf({
        plage,
        affiches,
        marques,
        nomUtilisateur: utilisateur.nom,
        libelleRole: LIBELLE_ROLE[utilisateur.role],
        estOperateur: utilisateur.role === 'operateur',
        nomApplication: APP_FULL_NAME,
      });
      tracer('export', 'impression', `Rapport PDF : ${plage.libelle} — ${total.total} affiche(s) (${fichier})`);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Generation du rapport impossible.');
    } finally {
      setEnCours(false);
    }
  }

  return (
    <section className="carte rapport">
      <h2 className="carte__titre">Rapport PDF</h2>
      <p className="carte__texte carte__texte--discret">
        Choisir la periode, puis telecharger le rapport (chiffres cles, histogramme, detail et
        repartition par marque).
      </p>

      <div className="rapport__commandes">
        <div className="segments" role="group" aria-label="Periode du rapport">
          {TYPES.map((t) => (
            <button
              key={t}
              type="button"
              className={t === type ? 'segments__bouton est-actif' : 'segments__bouton'}
              aria-pressed={t === type}
              onClick={() => choisirType(t)}
            >
              {LIBELLE_PERIODE_RAPPORT[t]}
            </button>
          ))}
        </div>

        <div className="rapport__navigation">
          <button
            type="button"
            className="bouton bouton--discret bouton--petit"
            onClick={() => setDateRef(versChamp(plage.precedente.debut))}
            aria-label="Periode precedente"
          >
            ‹
          </button>
          <input
            type="date"
            className="rapport__date"
            value={dateRef}
            max={aujourdhui}
            onChange={(e) => e.target.value && setDateRef(e.target.value)}
            aria-label="Date comprise dans la periode"
          />
          <button
            type="button"
            className="bouton bouton--discret bouton--petit"
            onClick={() => setDateRef(versChamp(plage.fin))}
            disabled={!peutAvancer}
            aria-label="Periode suivante"
          >
            ›
          </button>
        </div>
      </div>

      <p className="rapport__resume" aria-live="polite">
        <strong>{plage.libelle}</strong>
        <span>
          {chargement ? 'Chargement…' : `${nombre(total.total)} affiche(s) — ${nombre(total.electro)} Electro, ${nombre(total.nt)} Image & Son`}
        </span>
      </p>

      {erreur ? (
        <p className="bandeau bandeau--erreur" role="alert">
          {erreur}
        </p>
      ) : null}

      <button
        type="button"
        className="bouton"
        onClick={telecharger}
        disabled={enCours || chargement || !utilisateur}
      >
        {enCours ? 'Generation du PDF…' : 'Telecharger le rapport PDF'}
      </button>
    </section>
  );
}
