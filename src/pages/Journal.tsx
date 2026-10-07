import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell } from '../components/AppShell';
import {
  LIBELLE_ACTION,
  LIBELLE_RESSOURCE,
  lireJournal,
  messageErreurJournal,
  type EntreeJournal,
} from '../lib/journal';
import './Catalogue.css';
import './TableauDeBord.css';
import './Journal.css';

type Periode = 'jour' | '7j' | '30j' | '90j';

const PERIODES: Readonly<Record<Periode, string>> = {
  jour: "Aujourd'hui",
  '7j': '7 derniers jours',
  '30j': '30 derniers jours',
  '90j': '90 derniers jours',
};

function debutPeriode(p: Periode): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (p === '7j') d.setDate(d.getDate() - 6);
  if (p === '30j') d.setDate(d.getDate() - 29);
  if (p === '90j') d.setDate(d.getDate() - 89);
  return d;
}

const PAR_PAGE = 50;

const dateHeure = (iso: string) =>
  new Date(iso).toLocaleString('fr-FR', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

const estAujourdhui = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();

/** Libelle de la ligne : « Connexion », « Deconnexion », « Affiches — Ajout »… */
function libelleEvenement(e: EntreeJournal): string {
  if (e.ressource === 'session') {
    if (/^Deconnexion/.test(e.detail)) return 'Deconnexion';
    if (/^Ouverture/.test(e.detail)) return 'Ouverture';
    return 'Connexion';
  }
  return `${LIBELLE_RESSOURCE[e.ressource] ?? e.ressource} — ${LIBELLE_ACTION[e.action] ?? e.action}`;
}

function classeEvenement(e: EntreeJournal): string {
  if (e.ressource === 'session') return 'evt evt--session';
  if (e.action === 'suppression') return 'evt evt--suppression';
  if (e.action === 'creation') return 'evt evt--creation';
  if (e.action === 'export') return 'evt evt--export';
  return 'evt';
}

/** Export CSV (separateur « ; », lisible directement par Excel). */
function exporterCsv(lignes: readonly EntreeJournal[], nom: (e: EntreeJournal) => string) {
  const echapper = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const contenu = [
    ['Date', 'Utilisateur', 'Appareil', 'Evenement', 'Detail'].join(';'),
    ...lignes.map((e) =>
      [dateHeure(e.date), nom(e), e.appareil, libelleEvenement(e), e.detail].map(echapper).join(';'),
    ),
  ].join('\r\n');
  const url = URL.createObjectURL(new Blob(['﻿' + contenu], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `journal-affiches-em-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Journal d'activite — reserve aux administrateurs.
 * Qui s'est connecte, depuis quel appareil, et ce qui a ete saisi ou modifie.
 */
export function Journal() {
  const [periode, setPeriode] = useState<Periode>('jour');
  const [entrees, setEntrees] = useState<EntreeJournal[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  const [filtreUtilisateur, setFiltreUtilisateur] = useState('');
  const [filtreType, setFiltreType] = useState('');
  const [recherche, setRecherche] = useState('');
  const [page, setPage] = useState(0);

  const charger = useCallback(async () => {
    setChargement(true);
    setErreur(null);
    try {
      setEntrees(await lireJournal(debutPeriode(periode)));
    } catch (probleme) {
      setErreur(messageErreurJournal(probleme));
    } finally {
      setChargement(false);
    }
  }, [periode]);

  useEffect(() => {
    void charger();
  }, [charger]);

  useEffect(() => setPage(0), [periode, filtreUtilisateur, filtreType, recherche]);

  /** Nom de chaque utilisateur, retrouve dans ses autres lignes si besoin. */
  const noms = useMemo(() => {
    const table = new Map<string, string>();
    for (const e of entrees) if (e.utilisateur && !table.has(e.userId)) table.set(e.userId, e.utilisateur);
    return table;
  }, [entrees]);
  const nom = useCallback((e: EntreeJournal) => e.utilisateur || noms.get(e.userId) || e.userId, [noms]);

  const utilisateurs = useMemo(
    () => [...new Set(entrees.map((e) => e.userId))].sort((a, b) => (noms.get(a) ?? a).localeCompare(noms.get(b) ?? b)),
    [entrees, noms],
  );

  const filtrees = useMemo(() => {
    const terme = recherche.trim().toLowerCase();
    return entrees.filter(
      (e) =>
        (!filtreUtilisateur || e.userId === filtreUtilisateur) &&
        (!filtreType || e.ressource === filtreType) &&
        (!terme || `${e.detail} ${e.appareil} ${nom(e)}`.toLowerCase().includes(terme)),
    );
  }, [entrees, filtreUtilisateur, filtreType, recherche, nom]);

  const visibles = filtrees.slice(page * PAR_PAGE, (page + 1) * PAR_PAGE);
  const nbPages = Math.max(1, Math.ceil(filtrees.length / PAR_PAGE));

  /** Chiffres du jour. */
  const jour = useMemo(() => {
    const aujourdhui = entrees.filter((e) => estAujourdhui(e.date));
    return {
      connexions: aujourdhui.filter((e) => e.ressource === 'session' && !/^Deconnexion/.test(e.detail)).length,
      utilisateurs: new Set(aujourdhui.map((e) => e.userId)).size,
      affiches: aujourdhui.filter((e) => e.ressource === 'affiches' && e.action === 'creation').length,
      articles: aujourdhui.filter((e) => e.ressource === 'articles' && e.action !== 'suppression').length,
    };
  }, [entrees]);

  /** Derniere activite de chaque utilisateur sur la periode. */
  const derniereActivite = useMemo(() => {
    const vus = new Map<string, EntreeJournal>();
    for (const e of entrees) if (!vus.has(e.userId)) vus.set(e.userId, e); // deja tries du plus recent
    return [...vus.values()];
  }, [entrees]);

  return (
    <AppShell
      titre="Journal"
      sousTitre="Connexions et actions des utilisateurs"
      actions={
        <>
          <button type="button" className="bouton bouton--discret" onClick={() => void charger()} disabled={chargement}>
            Actualiser
          </button>
          <button
            type="button"
            className="bouton bouton--principal"
            onClick={() => exporterCsv(filtrees, nom)}
            disabled={filtrees.length === 0}
          >
            Exporter (Excel)
          </button>
        </>
      }
    >
      {erreur ? (
        <p className="bandeau bandeau--erreur" role="alert">
          {erreur}
        </p>
      ) : null}

      <section className="tuiles" aria-busy={chargement}>
        <div className="tuile">
          <span className="tuile__libelle">Connexions aujourd&apos;hui</span>
          <span className="tuile__valeur">{chargement ? '…' : jour.connexions}</span>
        </div>
        <div className="tuile">
          <span className="tuile__libelle">Utilisateurs actifs aujourd&apos;hui</span>
          <span className="tuile__valeur">{chargement ? '…' : jour.utilisateurs}</span>
        </div>
        <div className="tuile">
          <span className="tuile__libelle">Affiches saisies aujourd&apos;hui</span>
          <span className="tuile__valeur">{chargement ? '…' : jour.affiches}</span>
        </div>
        <div className="tuile">
          <span className="tuile__libelle">Articles crees / modifies aujourd&apos;hui</span>
          <span className="tuile__valeur">{chargement ? '…' : jour.articles}</span>
        </div>
      </section>

      <section className="carte">
        <h2 className="carte__titre">Derniere activite par utilisateur</h2>
        {derniereActivite.length === 0 ? (
          <p className="carte__texte carte__texte--discret">
            {chargement ? 'Chargement…' : 'Aucune activite sur la periode.'}
          </p>
        ) : (
          <table className="tableau tableau--journal">
            <thead>
              <tr>
                <th scope="col">Utilisateur</th>
                <th scope="col">Derniere action</th>
                <th scope="col">Date et heure</th>
                <th scope="col">Appareil</th>
              </tr>
            </thead>
            <tbody>
              {derniereActivite.map((e) => (
                <tr key={e.userId}>
                  <th scope="row">{nom(e)}</th>
                  <td>
                    <span className={classeEvenement(e)}>{libelleEvenement(e)}</span>
                  </td>
                  <td className="colonne-date">{dateHeure(e.date)}</td>
                  <td className="colonne-appareil">{e.appareil || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="carte">
        <div className="barre-filtres">
          <select value={periode} onChange={(e) => setPeriode(e.target.value as Periode)} aria-label="Periode">
            {Object.entries(PERIODES).map(([cle, libelle]) => (
              <option key={cle} value={cle}>
                {libelle}
              </option>
            ))}
          </select>
          <select value={filtreUtilisateur} onChange={(e) => setFiltreUtilisateur(e.target.value)} aria-label="Utilisateur">
            <option value="">Tous les utilisateurs</option>
            {utilisateurs.map((id) => (
              <option key={id} value={id}>
                {noms.get(id) ?? id}
              </option>
            ))}
          </select>
          <select value={filtreType} onChange={(e) => setFiltreType(e.target.value)} aria-label="Type d'evenement">
            <option value="">Tous les evenements</option>
            {Object.entries(LIBELLE_RESSOURCE).map(([cle, libelle]) => (
              <option key={cle} value={cle}>
                {libelle}
              </option>
            ))}
          </select>
          <input
            type="search"
            className="recherche"
            placeholder="Rechercher (code, appareil, campagne…)"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
          />
        </div>

        <p className="carte__texte carte__texte--discret">
          {chargement ? 'Chargement du journal…' : `${filtrees.length} evenement(s)`}
        </p>

        {visibles.length > 0 ? (
          <table className="tableau tableau--journal">
            <thead>
              <tr>
                <th scope="col">Date et heure</th>
                <th scope="col">Utilisateur</th>
                <th scope="col">Evenement</th>
                <th scope="col">Detail</th>
                <th scope="col">Appareil</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((e) => (
                <tr key={e.id}>
                  <td className="colonne-date">{dateHeure(e.date)}</td>
                  <th scope="row">{nom(e)}</th>
                  <td>
                    <span className={classeEvenement(e)}>{libelleEvenement(e)}</span>
                  </td>
                  <td className="colonne-detail">{e.detail}</td>
                  <td className="colonne-appareil">{e.appareil || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}

        {nbPages > 1 ? (
          <div className="pagination">
            <button
              type="button"
              className="bouton bouton--discret bouton--petit"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
            >
              Precedent
            </button>
            <span className="pagination__position">
              Page {page + 1} sur {nbPages}
            </span>
            <button
              type="button"
              className="bouton bouton--discret bouton--petit"
              onClick={() => setPage((p) => Math.min(nbPages - 1, p + 1))}
              disabled={page >= nbPages - 1}
            >
              Suivant
            </button>
          </div>
        ) : null}
      </section>
    </AppShell>
  );
}
