import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import {
  listerAffiches,
  listerCampagnes,
  messageErreurCampagne,
  LIBELLE_STATUT,
  type Campagne,
} from '../lib/campagnes';
import './Campagnes.css';

interface LigneListe {
  readonly campagne: Campagne;
  readonly nombre: number;
}

/**
 * Point d'entree « Affiches » du menu : les campagnes pretes a imprimer, avec
 * le nombre d'affiches de chacune et un acces direct a l'apercu.
 */
export function ListeAffiches() {
  const [lignes, setLignes] = useState<LigneListe[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    let actif = true;
    (async () => {
      try {
        const campagnes = await listerCampagnes();
        const nombres = await Promise.all(
          campagnes.map((c) => listerAffiches(c.id).then((a) => a.length)),
        );
        if (actif) {
          setLignes(campagnes.map((campagne, i) => ({ campagne, nombre: nombres[i] ?? 0 })));
        }
      } catch (probleme) {
        if (actif) setErreur(messageErreurCampagne(probleme));
      } finally {
        if (actif) setChargement(false);
      }
    })();
    return () => {
      actif = false;
    };
  }, []);

  return (
    <AppShell titre="Affiches" sousTitre="Apercu et impression des campagnes">
      {erreur ? (
        <p className="bandeau bandeau--erreur" role="alert">
          {erreur}
        </p>
      ) : null}

      <section className="carte">
        <h2 className="carte__titre">Campagnes a imprimer</h2>

        {chargement ? (
          <p className="carte__texte carte__texte--discret">Chargement…</p>
        ) : lignes.length === 0 ? (
          <p className="carte__texte carte__texte--discret">
            Aucune campagne. Creez-en une depuis le menu Campagnes.
          </p>
        ) : (
          <table className="tableau">
            <thead>
              <tr>
                <th scope="col">Campagne</th>
                <th scope="col">Statut</th>
                <th scope="col">Affiches</th>
                <th scope="col">Creee le</th>
                <th scope="col">
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {lignes.map(({ campagne, nombre }) => (
                <tr key={campagne.id}>
                  <th scope="row">{campagne.nom}</th>
                  <td>{LIBELLE_STATUT[campagne.statut]}</td>
                  <td>{nombre}</td>
                  <td className="colonne-date">
                    {new Date(campagne.creeeLe).toLocaleDateString('fr-FR')}
                  </td>
                  <td className="colonne-actions">
                    {nombre > 0 ? (
                      <Link
                        to={`/affiches/${campagne.id}`}
                        className="bouton bouton--principal bouton--petit"
                      >
                        Voir et imprimer
                      </Link>
                    ) : (
                      <Link
                        to={`/saisie/${campagne.id}`}
                        className="bouton bouton--discret bouton--petit"
                      >
                        Saisir
                      </Link>
                    )}
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
