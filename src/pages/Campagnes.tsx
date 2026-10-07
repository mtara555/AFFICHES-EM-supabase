import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { useAuth } from '../context/AuthContext';
import {
  changerStatutCampagne,
  creerCampagne,
  listerCampagnes,
  messageErreurCampagne,
  supprimerCampagne,
  LIBELLE_STATUT,
  type Campagne,
  type StatutCampagne,
} from '../lib/campagnes';
import './Campagnes.css';
import { tracer } from '../lib/journal';

export function Campagnes() {
  const { utilisateur } = useAuth();
  const [campagnes, setCampagnes] = useState<Campagne[]>([]);
  const [chargement, setChargement] = useState(true);
  const [nouveauNom, setNouveauNom] = useState('');
  const [creation, setCreation] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(async () => {
    setChargement(true);
    setErreur(null);
    try {
      setCampagnes(await listerCampagnes());
    } catch (probleme) {
      setErreur(messageErreurCampagne(probleme));
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  async function creer() {
    const nom = nouveauNom.trim();
    if (!nom || !utilisateur) return;

    setCreation(true);
    setErreur(null);
    try {
      await creerCampagne(nom, utilisateur.id);
      tracer('creation', 'campagnes', `Campagne creee : ${nom}`);
      setNouveauNom('');
      await charger();
    } catch (probleme) {
      setErreur(messageErreurCampagne(probleme));
    } finally {
      setCreation(false);
    }
  }

  async function changerStatut(campagne: Campagne, statut: StatutCampagne) {
    setErreur(null);
    try {
      await changerStatutCampagne(campagne.id, statut);
      tracer('modification', 'campagnes', `Campagne « ${campagne.nom} » : statut ${statut}`);
      await charger();
    } catch (probleme) {
      setErreur(messageErreurCampagne(probleme));
    }
  }

  async function supprimer(campagne: Campagne) {
    const confirme = window.confirm(
      `Supprimer la campagne « ${campagne.nom} » ?\n\n` +
        'Toutes les affiches qu\'elle contient seront egalement supprimees.',
    );
    if (!confirme) return;

    setErreur(null);
    try {
      await supprimerCampagne(campagne.id);
      tracer('suppression', 'campagnes', `Campagne supprimee : ${campagne.nom}`);
      await charger();
    } catch (probleme) {
      setErreur(messageErreurCampagne(probleme));
    }
  }

  return (
    <AppShell
      titre="Campagnes"
      sousTitre={chargement ? 'Chargement…' : `${campagnes.length} campagne(s)`}
    >
      {erreur ? (
        <p className="bandeau bandeau--erreur" role="alert">
          {erreur}
        </p>
      ) : null}

      <section className="carte">
        <h2 className="carte__titre">Nouvelle campagne</h2>
        <div className="formulaire-ligne">
          <div className="champ champ--extensible">
            <label htmlFor="nomCampagne">Nom de l&apos;operation</label>
            <input
              id="nomCampagne"
              type="text"
              placeholder="Promotion rentree — septembre"
              value={nouveauNom}
              onChange={(e) => setNouveauNom(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void creer();
              }}
              disabled={creation}
            />
          </div>
          <button
            type="button"
            className="bouton bouton--principal"
            onClick={creer}
            disabled={creation || !nouveauNom.trim()}
          >
            Creer
          </button>
        </div>
      </section>

      <section className="carte">
        <h2 className="carte__titre">Vos campagnes</h2>

        {chargement ? (
          <p className="carte__texte carte__texte--discret">Chargement…</p>
        ) : campagnes.length === 0 ? (
          <p className="carte__texte carte__texte--discret">
            Aucune campagne. Creez-en une ci-dessus pour commencer a saisir des affiches.
          </p>
        ) : (
          <table className="tableau">
            <thead>
              <tr>
                <th scope="col">Nom</th>
                <th scope="col">Statut</th>
                <th scope="col">Creee le</th>
                <th scope="col">
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {campagnes.map((campagne) => (
                <tr key={campagne.id}>
                  <th scope="row">
                    <Link to={`/saisie/${campagne.id}`} className="lien-campagne">
                      {campagne.nom}
                    </Link>
                  </th>
                  <td>
                    <select
                      className="statut-select"
                      value={campagne.statut}
                      onChange={(e) =>
                        void changerStatut(campagne, e.target.value as StatutCampagne)
                      }
                    >
                      {Object.entries(LIBELLE_STATUT).map(([cle, libelle]) => (
                        <option key={cle} value={cle}>
                          {libelle}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="colonne-date">
                    {new Date(campagne.creeeLe).toLocaleDateString('fr-FR')}
                  </td>
                  <td className="colonne-actions">
                    <Link
                      to={`/saisie/${campagne.id}`}
                      className="bouton bouton--discret bouton--petit"
                    >
                      Saisir
                    </Link>
                    <Link
                      to={`/affiches/${campagne.id}`}
                      className="bouton bouton--discret bouton--petit"
                    >
                      Affiches
                    </Link>
                    <button
                      type="button"
                      className="bouton bouton--danger bouton--petit"
                      onClick={() => void supprimer(campagne)}
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
