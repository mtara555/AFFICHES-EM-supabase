import { useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { estConfigure } from '../lib/supabase';
import { APP_NAME, APP_VERSION } from '../config/constants';
import './Connexion.css';
import { definirNomAppareilLocal, nomAppareilLocal } from '../lib/journal';

export function Connexion() {
  const { utilisateur, connexion } = useAuth();
  const emplacement = useLocation();

  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [nomAppareil, setNomAppareil] = useState(nomAppareilLocal);

  if (utilisateur) {
    const destination = (emplacement.state as { origine?: string } | null)?.origine ?? '/';
    return <Navigate to={destination} replace />;
  }

  async function soumettre(evenement: FormEvent) {
    evenement.preventDefault();
    setErreur(null);
    setEnCours(true);
    try {
      definirNomAppareilLocal(nomAppareil);
      await connexion(email.trim(), motDePasse);
    } catch (probleme) {
      setErreur(probleme instanceof Error ? probleme.message : 'La connexion a echoue.');
      setEnCours(false);
    }
  }

  return (
    <div className="connexion">
      <div className="connexion__carte">
        <div className="connexion__entete">
          <span className="connexion__marque" aria-hidden="true">
            m
          </span>
          <div>
            <h1 className="connexion__titre">{APP_NAME}</h1>
            <p className="connexion__version">v{APP_VERSION}</p>
          </div>
        </div>

        <p className="connexion__accroche">
          Generateur d&apos;affiches prix — departement Electromenager
        </p>

        {!estConfigure ? (
          <p className="connexion__alerte">
            La connexion au serveur n&apos;est pas configuree. Verifiez les variables
            d&apos;environnement Supabase.
          </p>
        ) : null}

        <form onSubmit={soumettre} className="connexion__formulaire" noValidate>
          <div className="champ">
            <label htmlFor="email">Adresse e-mail</label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={enCours || !estConfigure}
            />
          </div>

          <div className="champ">
            <label htmlFor="motDePasse">Mot de passe</label>
            <input
              id="motDePasse"
              type="password"
              autoComplete="current-password"
              required
              value={motDePasse}
              onChange={(e) => setMotDePasse(e.target.value)}
              disabled={enCours || !estConfigure}
            />
          </div>

          <div className="champ">
            <label htmlFor="nomAppareil">Nom de cet appareil (facultatif)</label>
            <input
              id="nomAppareil"
              type="text"
              placeholder="PC Decoration, Telephone Karim…"
              maxLength={60}
              value={nomAppareil}
              onChange={(e) => setNomAppareil(e.target.value)}
              disabled={enCours || !estConfigure}
            />
          </div>

          {erreur ? (
            <p className="connexion__erreur" role="alert">
              {erreur}
            </p>
          ) : null}

          <button
            type="submit"
            className="connexion__bouton"
            disabled={enCours || !estConfigure || !email || !motDePasse}
          >
            {enCours ? 'Connexion…' : 'Se connecter'}
          </button>
        </form>

        <p className="connexion__aide">
          Vous n&apos;avez pas de compte ? Les acces sont crees par un administrateur.
        </p>
      </div>
    </div>
  );
}
