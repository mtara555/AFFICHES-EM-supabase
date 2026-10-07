import { useCallback, useEffect, useMemo, useState } from 'react';
import { Visuel } from '../components/affiche/Visuel';
import { AppShell } from '../components/AppShell';
import {
  creerMarque,
  importerMarques,
  listerMarques,
  messageErreur,
  modifierMarque,
  supprimerMarque,
  type Marque,
} from '../lib/marques';
import {
  ACCEPT_LOGO,
  messageErreurLogo,
  rapprocher,
  supprimerLogo,
  televerserLogo,
  type Rapprochement,
} from '../lib/logos';
import { MARQUES_CATALOGUE } from '../config/marques-catalogue';
import './Marques.css';
import { tracer } from '../lib/journal';

type Edition = { readonly id: string | null; nom: string; actif: boolean };

const EDITION_VIDE: Edition = { id: null, nom: '', actif: true };

export function Marques() {
  const [marques, setMarques] = useState<Marque[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [edition, setEdition] = useState<Edition>(EDITION_VIDE);
  const [enregistrement, setEnregistrement] = useState(false);
  const [recherche, setRecherche] = useState('');
  const [importEnCours, setImportEnCours] = useState<{ traites: number; total: number } | null>(
    null,
  );

  /* --- Logos ------------------------------------------------------------ */
  const [versions, setVersions] = useState<Record<string, number>>({});
  const [logoEnCours, setLogoEnCours] = useState<string | null>(null);
  const [lot, setLot] = useState<Rapprochement[] | null>(null);
  const [lotProgression, setLotProgression] = useState<{ faits: number; total: number } | null>(
    null,
  );

  /** Apercus locaux des fichiers du lot, liberes quand le lot change. */
  const apercusLot = useMemo(
    () => (lot ? lot.map((r) => URL.createObjectURL(r.fichier)) : []),
    [lot],
  );
  useEffect(() => () => apercusLot.forEach((u) => URL.revokeObjectURL(u)), [apercusLot]);

  const incrementerVersion = (id: string) =>
    setVersions((v) => ({ ...v, [id]: (v[id] ?? 0) + 1 }));

  const recharger = useCallback(async () => {
    setChargement(true);
    setErreur(null);
    try {
      setMarques(await listerMarques());
    } catch (probleme) {
      setErreur(messageErreur(probleme));
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => {
    void recharger();
  }, [recharger]);

  const filtrees = useMemo(() => {
    const terme = recherche.trim().toLowerCase();
    if (!terme) return marques;
    return marques.filter((m) => m.nom.toLowerCase().includes(terme));
  }, [marques, recherche]);

  const manquantes = useMemo(() => {
    const existantes = new Set(marques.map((m) => m.nom.toUpperCase()));
    return MARQUES_CATALOGUE.filter((nom) => !existantes.has(nom.toUpperCase()));
  }, [marques]);

  async function enregistrer() {
    const nom = edition.nom.trim();
    if (!nom) return;

    setEnregistrement(true);
    setErreur(null);
    setMessage(null);
    try {
      if (edition.id) {
        await modifierMarque(edition.id, { nom, actif: edition.actif });
        tracer('modification', 'marques', `Marque modifiee : ${nom}${edition.actif ? '' : ' (inactive)'}`);
        setMessage(`Marque « ${nom} » modifiee.`);
      } else {
        await creerMarque({ nom, actif: edition.actif });
        tracer('creation', 'marques', `Marque creee : ${nom}`);
        setMessage(`Marque « ${nom} » creee.`);
      }
      setEdition(EDITION_VIDE);
      await recharger();
    } catch (probleme) {
      setErreur(messageErreur(probleme));
    } finally {
      setEnregistrement(false);
    }
  }

  async function supprimer(marque: Marque) {
    const confirme = window.confirm(
      `Supprimer la marque « ${marque.nom} » ?\n\n` +
        'Les articles qui y sont rattaches perdront leur reference de marque.',
    );
    if (!confirme) return;

    setErreur(null);
    setMessage(null);
    try {
      await supprimerMarque(marque.id);
      tracer('suppression', 'marques', `Marque supprimee : ${marque.nom}`);
      setMessage(`Marque « ${marque.nom} » supprimee.`);
      if (edition.id === marque.id) setEdition(EDITION_VIDE);
      await recharger();
    } catch (probleme) {
      setErreur(messageErreur(probleme));
    }
  }

  async function importerCatalogue() {
    const confirme = window.confirm(
      `Creer les ${manquantes.length} marques absentes du catalogue existant ?\n\n` +
        'Les marques deja presentes seront ignorees.',
    );
    if (!confirme) return;

    setErreur(null);
    setMessage(null);
    setImportEnCours({ traites: 0, total: manquantes.length });
    try {
      const resultat = await importerMarques(manquantes, (traites, total) =>
        setImportEnCours({ traites, total }),
      );
      const details = [
        `${resultat.crees} creee(s)`,
        resultat.ignores > 0 ? `${resultat.ignores} deja presente(s)` : null,
        resultat.erreurs.length > 0 ? `${resultat.erreurs.length} en echec` : null,
      ].filter(Boolean);
      setMessage(`Import termine : ${details.join(', ')}.`);
      tracer('creation', 'marques', `Import des marques : ${details.join(', ')}`);
      if (resultat.erreurs.length > 0) {
        setErreur(
          `Echecs : ${resultat.erreurs
            .slice(0, 3)
            .map((e) => e.nom)
            .join(', ')}${resultat.erreurs.length > 3 ? '…' : ''}`,
        );
      }
      await recharger();
    } catch (probleme) {
      setErreur(messageErreur(probleme));
    } finally {
      setImportEnCours(null);
    }
  }

  async function changerLogo(marque: Marque, fichier: File | undefined) {
    if (!fichier) return;
    setErreur(null);
    setMessage(null);
    setLogoEnCours(marque.id);
    try {
      await televerserLogo(marque, fichier);
      tracer('modification', 'marques', `Logo enregistre : ${marque.nom}`);
      incrementerVersion(marque.id);
      setMessage(`Logo de « ${marque.nom} » enregistre.`);
      await recharger();
    } catch (probleme) {
      setErreur(`${marque.nom} : ${messageErreurLogo(probleme)}`);
    } finally {
      setLogoEnCours(null);
    }
  }

  async function retirerLogo(marque: Marque) {
    if (!window.confirm(`Retirer le logo de « ${marque.nom} » ?`)) return;
    setErreur(null);
    setMessage(null);
    setLogoEnCours(marque.id);
    try {
      await supprimerLogo(marque);
      tracer('suppression', 'marques', `Logo retire : ${marque.nom}`);
      incrementerVersion(marque.id);
      setMessage(`Logo de « ${marque.nom} » retire. Le nom de la marque s'affichera a sa place.`);
      await recharger();
    } catch (probleme) {
      setErreur(`${marque.nom} : ${messageErreurLogo(probleme)}`);
    } finally {
      setLogoEnCours(null);
    }
  }

  function preparerLot(fichiers: FileList | null) {
    if (!fichiers || fichiers.length === 0) return;
    setErreur(null);
    setMessage(null);
    setLot(rapprocher(Array.from(fichiers), marques));
  }

  function choisirMarqueLot(index: number, marqueId: string) {
    setLot((l) =>
      l ? l.map((r, i) => (i === index ? { ...r, marqueId: marqueId || null } : r)) : l,
    );
  }

  const lotValide = (lot ?? []).filter((r) => r.marqueId && !r.probleme);

  async function envoyerLot() {
    if (!lot) return;
    const aEnvoyer = lotValide;
    const echecs: string[] = [];
    setErreur(null);
    setMessage(null);
    setLotProgression({ faits: 0, total: aEnvoyer.length });
    for (const [i, r] of aEnvoyer.entries()) {
      const marque = marques.find((m) => m.id === r.marqueId);
      if (marque) {
        try {
          await televerserLogo(marque, r.fichier);
          incrementerVersion(marque.id);
        } catch (probleme) {
          echecs.push(`${r.fichier.name} (${messageErreurLogo(probleme)})`);
        }
      }
      setLotProgression({ faits: i + 1, total: aEnvoyer.length });
    }
    setLotProgression(null);
    setLot(null);
    setMessage(`${aEnvoyer.length - echecs.length} logo(s) enregistre(s).`);
    tracer('modification', 'marques', `Envoi groupe de logos : ${aEnvoyer.length - echecs.length} enregistre(s)`);
    if (echecs.length > 0) setErreur(`Echecs : ${echecs.join(' ; ')}`);
    await recharger();
  }

  const actives = marques.filter((m) => m.actif).length;

  return (
    <AppShell
      titre="Marques"
      sousTitre={
        chargement
          ? 'Chargement…'
          : `${marques.length} marque(s) — ${actives} active(s) — ${
              marques.filter((m) => m.logoFileId).length
            } avec logo`
      }
    >
      {erreur ? (
        <p className="bandeau bandeau--erreur" role="alert">
          {erreur}
        </p>
      ) : null}
      {message ? <p className="bandeau bandeau--succes">{message}</p> : null}

      {manquantes.length > 0 && !chargement ? (
        <section className="carte carte--import">
          <h2 className="carte__titre">Import du catalogue existant</h2>
          <p className="carte__texte">
            {manquantes.length} marque(s) du fichier <code>BD-EM-1108.xlsx</code> ne sont pas
            encore enregistrees. Les logos pourront etre ajoutes ensuite, en lot ou marque par marque.
          </p>
          {importEnCours ? (
            <div className="progression">
              <div
                className="progression__barre"
                style={{ width: `${(importEnCours.traites / importEnCours.total) * 100}%` }}
              />
              <span className="progression__texte">
                {importEnCours.traites} / {importEnCours.total}
              </span>
            </div>
          ) : (
            <button type="button" className="bouton bouton--principal" onClick={importerCatalogue}>
              Importer {manquantes.length} marque(s)
            </button>
          )}
        </section>
      ) : null}

      {!chargement && marques.length > 0 ? (
        <section className="carte">
          <div className="carte__entete">
            <h2 className="carte__titre">Logos en lot</h2>
            {!lot ? (
              <label className="bouton bouton--principal">
                Choisir des fichiers…
                <input
                  type="file"
                  accept={ACCEPT_LOGO}
                  multiple
                  className="visually-hidden"
                  onChange={(e) => {
                    preparerLot(e.target.files);
                    e.target.value = '';
                  }}
                />
              </label>
            ) : null}
          </div>

          {!lot ? (
            <p className="carte__texte">
              Selectionnez plusieurs logos a la fois (Ctrl + A dans le dossier). Chaque fichier est
              associe a la marque de meme nom : <code>SAMSUNG.jpg</code>, <code>Beko logo.png</code>{' '}
              ou <code>arthur-martin.png</code> sont reconnus. Vous pourrez corriger avant
              l&apos;envoi. Formats PNG, JPG, WEBP ou SVG ; fond blanc ou transparent conseille.
            </p>
          ) : (
            <>
              <p className="carte__texte">
                {lotValide.length} fichier(s) pret(s) sur {lot.length}.
                {lot.some((r) => !r.marqueId)
                  ? ' Choisissez la marque des fichiers non reconnus, ou laissez « Ignorer ».'
                  : ''}
              </p>
              <div className="tableau-defilant">
                <table className="tableau tableau--lot">
                  <thead>
                    <tr>
                      <th scope="col">Apercu</th>
                      <th scope="col">Fichier</th>
                      <th scope="col">Marque</th>
                      <th scope="col">Etat</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lot.map((r, i) => {
                      const cible = marques.find((m) => m.id === r.marqueId);
                      return (
                        <tr key={`${r.fichier.name}-${i}`}>
                          <td>
                            <span className="vignette-logo">
                              <img src={apercusLot[i]} alt="" />
                            </span>
                          </td>
                          <td className="colonne-fichier">{r.fichier.name}</td>
                          <td>
                            <select
                              id={`lot-marque-${i}`}
                              aria-label={`Marque pour ${r.fichier.name}`}
                              value={r.marqueId ?? ''}
                              onChange={(e) => choisirMarqueLot(i, e.target.value)}
                              disabled={lotProgression !== null}
                            >
                              <option value="">— Ignorer —</option>
                              {marques.map((m) => (
                                <option key={m.id} value={m.id}>
                                  {m.nom}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td>
                            {r.probleme ? (
                              <span className="etiquette etiquette--inactive">{r.probleme}</span>
                            ) : !r.marqueId ? (
                              <span className="etiquette">Ignore</span>
                            ) : cible?.logoFileId ? (
                              <span className="etiquette">Remplacera le logo actuel</span>
                            ) : (
                              <span className="etiquette etiquette--ok">Nouveau logo</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {lotProgression ? (
                <div className="progression">
                  <div
                    className="progression__barre"
                    style={{ width: `${(lotProgression.faits / lotProgression.total) * 100}%` }}
                  />
                  <span className="progression__texte">
                    {lotProgression.faits} / {lotProgression.total}
                  </span>
                </div>
              ) : (
                <div className="actions-formulaire">
                  <button
                    type="button"
                    className="bouton bouton--principal"
                    onClick={() => void envoyerLot()}
                    disabled={lotValide.length === 0}
                  >
                    Televerser {lotValide.length} logo(s)
                  </button>
                  <button
                    type="button"
                    className="bouton bouton--discret"
                    onClick={() => setLot(null)}
                  >
                    Annuler
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      ) : null}

      <section className="carte">
        <h2 className="carte__titre">{edition.id ? 'Modifier la marque' : 'Nouvelle marque'}</h2>
        <div className="formulaire-ligne">
          <div className="champ champ--extensible">
            <label htmlFor="nomMarque">Nom</label>
            <input
              id="nomMarque"
              type="text"
              value={edition.nom}
              placeholder="SAMSUNG"
              onChange={(e) => setEdition({ ...edition, nom: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void enregistrer();
                if (e.key === 'Escape') setEdition(EDITION_VIDE);
              }}
              disabled={enregistrement}
            />
          </div>

          <label className="case">
            <input
              type="checkbox"
              checked={edition.actif}
              onChange={(e) => setEdition({ ...edition, actif: e.target.checked })}
              disabled={enregistrement}
            />
            Active
          </label>

          <button
            type="button"
            className="bouton bouton--principal"
            onClick={enregistrer}
            disabled={enregistrement || !edition.nom.trim()}
          >
            {edition.id ? 'Enregistrer' : 'Ajouter'}
          </button>

          {edition.id ? (
            <button
              type="button"
              className="bouton bouton--discret"
              onClick={() => setEdition(EDITION_VIDE)}
              disabled={enregistrement}
            >
              Annuler
            </button>
          ) : null}
        </div>
      </section>

      <section className="carte">
        <div className="carte__entete">
          <h2 className="carte__titre">Liste des marques</h2>
          <input
            type="search"
            className="recherche"
            placeholder="Rechercher…"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
          />
        </div>

        {chargement ? (
          <p className="carte__texte carte__texte--discret">Chargement des marques…</p>
        ) : filtrees.length === 0 ? (
          <p className="carte__texte carte__texte--discret">
            {marques.length === 0
              ? 'Aucune marque enregistree pour le moment.'
              : 'Aucune marque ne correspond a cette recherche.'}
          </p>
        ) : (
          <table className="tableau tableau--marques">
            <thead>
              <tr>
                <th scope="col">Nom</th>
                <th scope="col">Logo</th>
                <th scope="col">Statut</th>
                <th scope="col">
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtrees.map((marque) => (
                <tr key={marque.id} className={edition.id === marque.id ? 'est-editee' : undefined}>
                  <th scope="row">{marque.nom}</th>
                  <td>
                    <div className="cellule-logo">
                      <span className="vignette-logo">
                        {marque.logoFileId ? (
                          <Visuel
                            fileId={marque.logoFileId}
                            version={versions[marque.id] ?? 0}
                            alt={`Logo ${marque.nom}`}
                            secours={<span className="vignette-logo__vide">…</span>}
                          />
                        ) : (
                          <span className="vignette-logo__vide">A fournir</span>
                        )}
                      </span>
                      <label
                        className={`bouton bouton--discret bouton--petit${
                          logoEnCours === marque.id ? ' est-desactive' : ''
                        }`}
                      >
                        {logoEnCours === marque.id
                          ? 'Envoi…'
                          : marque.logoFileId
                            ? 'Remplacer'
                            : 'Televerser'}
                        <input
                          type="file"
                          accept={ACCEPT_LOGO}
                          className="visually-hidden"
                          disabled={logoEnCours !== null}
                          onChange={(e) => {
                            void changerLogo(marque, e.target.files?.[0]);
                            e.target.value = '';
                          }}
                        />
                      </label>
                      {marque.logoFileId ? (
                        <button
                          type="button"
                          className="bouton bouton--discret bouton--petit"
                          onClick={() => void retirerLogo(marque)}
                          disabled={logoEnCours !== null}
                        >
                          Retirer
                        </button>
                      ) : null}
                    </div>
                  </td>
                  <td>
                    {marque.actif ? (
                      <span className="etiquette etiquette--ok">Active</span>
                    ) : (
                      <span className="etiquette etiquette--inactive">Inactive</span>
                    )}
                  </td>
                  <td className="colonne-actions">
                    <button
                      type="button"
                      className="bouton bouton--discret bouton--petit"
                      onClick={() =>
                        setEdition({ id: marque.id, nom: marque.nom, actif: marque.actif })
                      }
                    >
                      Modifier
                    </button>
                    <button
                      type="button"
                      className="bouton bouton--danger bouton--petit"
                      onClick={() => void supprimer(marque)}
                    >
                      Supprimer
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </AppShell>
  );
}
