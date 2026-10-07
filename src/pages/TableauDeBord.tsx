import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '../components/AppShell';
import { GraphiqueAffiches, COULEUR_ELECTRO, COULEUR_NT } from '../components/stats/GraphiqueAffiches';
import { estConfigure } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { LIBELLE_ROLE } from '../lib/auth';
import { listerMarques, type Marque } from '../lib/marques';
import {
  chargerAffichesResume,
  chargerArticlesResume,
  regrouper,
  ETENDUE_PERIODE,
  LIBELLE_PERIODE,
  type AfficheResume,
  type ArticleResume,
  type Periode,
} from '../lib/statistiques';
import { APP_FULL_NAME } from '../config/constants';
import './TableauDeBord.css';

const PERIODES: readonly Periode[] = ['jour', 'semaine', 'mois', 'annee'];
const NB_MARQUES_VISIBLES = 15;

const nombre = (n: number) => n.toLocaleString('fr-FR');

export function TableauDeBord() {
  const { utilisateur } = useAuth();

  const [marques, setMarques] = useState<Marque[]>([]);
  const [articles, setArticles] = useState<ArticleResume[]>([]);
  const [affiches, setAffiches] = useState<AfficheResume[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  const [periode, setPeriode] = useState<Periode>(() => {
    try {
      const p = localStorage.getItem('tdb-periode') as Periode | null;
      return p && PERIODES.includes(p) ? p : 'mois';
    } catch {
      return 'mois';
    }
  });
  const [voirTableau, setVoirTableau] = useState(false);
  const [toutesMarques, setToutesMarques] = useState(false);

  const [actualisation, setActualisation] = useState(0);

  useEffect(() => {
    if (!estConfigure || !utilisateur) {
      setChargement(false);
      return;
    }
    let actif = true;
    const forcer = actualisation > 0;
    setChargement(true);
    (async () => {
      try {
        // Lectures economes : cache du navigateur, relu seulement si les donnees ont change.
        const [m, a] = await Promise.all([listerMarques(), chargerArticlesResume(forcer)]);
        const aff = await chargerAffichesResume(a, utilisateur.id, forcer);
        if (!actif) return;
        setMarques(m);
        setArticles(a);
        setAffiches(aff);
      } catch (e) {
        if (actif) setErreur(e instanceof Error ? e.message : 'Chargement des statistiques impossible.');
      } finally {
        if (actif) setChargement(false);
      }
    })();
    return () => {
      actif = false;
    };
  }, [utilisateur, actualisation]);

  function choisirPeriode(p: Periode) {
    setPeriode(p);
    try {
      localStorage.setItem('tdb-periode', p);
    } catch {
      /* preference non memorisee */
    }
  }

  /* --- Chiffres cles --------------------------------------------------- */
  const cles = useMemo(() => {
    const articlesElectro = articles.filter((a) => a.gabarit === 'electro').length;
    const affElectro = affiches.filter((a) => a.gabarit === 'electro').length;
    const affNt = affiches.filter((a) => a.gabarit === 'nouvelles-technologies').length;
    return {
      marques: marques.length,
      marquesActives: marques.filter((m) => m.actif).length,
      articles: articles.length,
      articlesElectro,
      articlesNt: articles.length - articlesElectro,
      affiches: affElectro + affNt,
      affElectro,
      affNt,
      sansArticle: affiches.length - affElectro - affNt,
    };
  }, [marques, articles, affiches]);

  const intervalles = useMemo(() => regrouper(periode, affiches), [periode, affiches]);
  const totalPeriode = intervalles.reduce(
    (s, i) => ({ electro: s.electro + i.electro, nt: s.nt + i.nt }),
    { electro: 0, nt: 0 },
  );

  /* --- Articles par marque --------------------------------------------- */
  const parMarque = useMemo(() => {
    const compte = new Map<string, number>();
    for (const a of articles) compte.set(a.marqueId, (compte.get(a.marqueId) ?? 0) + 1);
    const noms = new Map(marques.map((m) => [m.id, m.nom]));
    return [...compte.entries()]
      .map(([id, n]) => ({ id, nom: noms.get(id) ?? 'Marque inconnue', n }))
      .sort((a, b) => b.n - a.n || a.nom.localeCompare(b.nom));
  }, [articles, marques]);

  const lignesMarques = useMemo(
    () => (toutesMarques ? parMarque : parMarque.slice(0, NB_MARQUES_VISIBLES)),
    [parMarque, toutesMarques],
  );
  const autres = parMarque.slice(lignesMarques.length);
  const articlesAutres = autres.reduce((s, x) => s + x.n, 0);
  const maxMarque = Math.max(1, ...lignesMarques.map((l) => l.n));

  const estOperateur = utilisateur?.role === 'operateur';

  return (
    <AppShell
      titre="Tableau de bord"
      sousTitre={
        utilisateur
          ? `${utilisateur.nom} — ${LIBELLE_ROLE[utilisateur.role]} · ${APP_FULL_NAME}`
          : APP_FULL_NAME
      }
      actions={
        estConfigure ? (
          <button
            type="button"
            className="bouton bouton--discret"
            onClick={() => setActualisation((n) => n + 1)}
            disabled={chargement}
            title="Relire toutes les donnees depuis le serveur (recharge les listes depuis le serveur)"
          >
            {chargement ? 'Chargement…' : 'Actualiser'}
          </button>
        ) : null
      }
    >
      {!estConfigure ? (
        <section className="carte carte--verification est-attente">
          <h2 className="carte__titre">Connexion a Supabase</h2>
          <p className="carte__texte">
            Aucun projet Supabase n&apos;est relie : renseignez <code>VITE_SUPABASE_URL</code>{' '}
            et <code>VITE_SUPABASE_ANON_KEY</code> dans <code>.env.local</code>.
          </p>
        </section>
      ) : null}

      {erreur ? (
        <p className="bandeau bandeau--erreur" role="alert">
          {erreur}
        </p>
      ) : null}

      {/* --- Chiffres cles ----------------------------------------------- */}
      <section className="tuiles" aria-busy={chargement}>
        <div className="tuile">
          <span className="tuile__libelle">Marques</span>
          <span className="tuile__valeur">{chargement ? '…' : nombre(cles.marques)}</span>
          <span className="tuile__detail">{nombre(cles.marquesActives)} actives</span>
        </div>
        <div className="tuile">
          <span className="tuile__libelle">Articles au catalogue</span>
          <span className="tuile__valeur">{chargement ? '…' : nombre(cles.articles)}</span>
          <span className="tuile__detail">
            <i style={{ background: COULEUR_ELECTRO }} /> {nombre(cles.articlesElectro)} Electro
            <i style={{ background: COULEUR_NT }} /> {nombre(cles.articlesNt)} Image &amp; Son
          </span>
        </div>
        <div className="tuile">
          <span className="tuile__libelle">
            {estOperateur ? 'Vos affiches generees' : 'Affiches generees'}
          </span>
          <span className="tuile__valeur">{chargement ? '…' : nombre(cles.affiches)}</span>
          <span className="tuile__detail">
            <i style={{ background: COULEUR_ELECTRO }} /> {nombre(cles.affElectro)} Electro
            <i style={{ background: COULEUR_NT }} /> {nombre(cles.affNt)} Image &amp; Son
          </span>
        </div>
        <div className="tuile">
          <span className="tuile__libelle">Sur la periode</span>
          <span className="tuile__valeur">
            {chargement ? '…' : nombre(totalPeriode.electro + totalPeriode.nt)}
          </span>
          <span className="tuile__detail">{ETENDUE_PERIODE[periode]}</span>
        </div>
      </section>

      {/* --- Affiches par periode ------------------------------------------- */}
      <section className="carte">
        <div className="carte__entete-stats">
          <div>
            <h2 className="carte__titre">Affiches generees — Electro et Image &amp; Son</h2>
            <p className="carte__texte carte__texte--discret">
              Par {LIBELLE_PERIODE[periode].toLowerCase()}, {ETENDUE_PERIODE[periode]}.
              {estOperateur ? ' Vos campagnes uniquement.' : ''}
            </p>
          </div>
          <div className="segments" role="group" aria-label="Periode">
            {PERIODES.map((p) => (
              <button
                key={p}
                type="button"
                className={p === periode ? 'segments__bouton est-actif' : 'segments__bouton'}
                aria-pressed={p === periode}
                onClick={() => choisirPeriode(p)}
              >
                {LIBELLE_PERIODE[p]}
              </button>
            ))}
          </div>
        </div>

        <div className="legende">
          <span>
            <i style={{ background: COULEUR_ELECTRO }} /> Electro ({nombre(totalPeriode.electro)})
          </span>
          <span>
            <i style={{ background: COULEUR_NT }} /> Image &amp; Son — Nouvelles technologies (
            {nombre(totalPeriode.nt)})
          </span>
        </div>

        {chargement ? (
          <p className="carte__texte carte__texte--discret">Chargement…</p>
        ) : (
          <GraphiqueAffiches intervalles={intervalles} />
        )}

        {cles.sansArticle > 0 ? (
          <p className="carte__texte carte__texte--discret">
            {cles.sansArticle} affiche(s) non comptee(s) : leur code n&apos;existe plus au catalogue.
          </p>
        ) : null}

        <button
          type="button"
          className="bouton bouton--discret bouton--petit"
          onClick={() => setVoirTableau((v) => !v)}
          aria-expanded={voirTableau}
        >
          {voirTableau ? 'Masquer le tableau' : 'Voir le tableau'}
        </button>

        {voirTableau ? (
          <div className="tableau-defilant">
            <table className="tableau tableau--stats">
              <thead>
                <tr>
                  <th scope="col">{LIBELLE_PERIODE[periode]}</th>
                  <th scope="col">Electro</th>
                  <th scope="col">Image &amp; Son</th>
                  <th scope="col">Total</th>
                </tr>
              </thead>
              <tbody>
                {[...intervalles].reverse().map((i) => (
                  <tr key={i.cle}>
                    <th scope="row">{i.libelleLong}</th>
                    <td>{i.electro}</td>
                    <td>{i.nt}</td>
                    <td>
                      <strong>{i.electro + i.nt}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      {/* --- Articles par marque ------------------------------------------- */}
      <section className="carte">
        <h2 className="carte__titre">Articles par marque</h2>
        {chargement ? (
          <p className="carte__texte carte__texte--discret">Chargement…</p>
        ) : parMarque.length === 0 ? (
          <p className="carte__texte carte__texte--discret">Aucun article au catalogue.</p>
        ) : (
          <>
            <ul className="barres">
              {lignesMarques.map((l) => (
                <li key={l.id} title={`${l.nom} : ${l.n} article(s)`}>
                  <span className="barres__nom">{l.nom}</span>
                  <span className="barres__piste">
                    <span
                      className="barres__remplissage"
                      style={{ width: `${(l.n / maxMarque) * 100}%`, display: 'block' }}
                    />
                  </span>
                  <span className="barres__valeur">{nombre(l.n)}</span>
                </li>
              ))}
            </ul>
            {autres.length > 0 ? (
              <p className="carte__texte carte__texte--discret barres__reste">
                + {autres.length} autres marques : {nombre(articlesAutres)} articles
              </p>
            ) : null}
            {parMarque.length > NB_MARQUES_VISIBLES ? (
              <button
                type="button"
                className="bouton bouton--discret bouton--petit bouton--espace"
                onClick={() => setToutesMarques((v) => !v)}
              >
                {toutesMarques
                  ? `Afficher les ${NB_MARQUES_VISIBLES} premieres`
                  : `Afficher les ${parMarque.length} marques`}
              </button>
            ) : null}
          </>
        )}
      </section>
    </AppShell>
  );
}
