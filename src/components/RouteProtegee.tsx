/**
 * AFFICHES-EM v1.0 — Protection des routes
 *
 * Ce composant est une commodite d'interface, pas une mesure de securite : il
 * evite d'afficher un ecran inutilisable a quelqu'un qui n'y a pas droit. La
 * securite reelle est appliquee par la base (RLS), qui refuse toute requete non
 * autorisee quel que soit l'ecran affiche.
 */

import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LIBELLE_ROLE, type Role } from '../lib/auth';
import './RouteProtegee.css';

interface RouteProtegeeProps {
  readonly children: ReactNode;
  /** Roles autorises. Par defaut, toute session valide suffit. */
  readonly roles?: readonly Role[];
}

export function RouteProtegee({ children, roles }: RouteProtegeeProps) {
  const { utilisateur, enCoursDeVerification } = useAuth();
  const emplacement = useLocation();

  if (enCoursDeVerification) {
    return (
      <div className="chargement">
        <span className="chargement__indicateur" aria-hidden="true" />
        <p>Verification de la session…</p>
      </div>
    );
  }

  if (!utilisateur) {
    return <Navigate to="/connexion" replace state={{ origine: emplacement.pathname }} />;
  }

  if (utilisateur.role === 'aucun') {
    return (
      <div className="acces-refuse">
        <div className="acces-refuse__carte">
          <h1>Compte sans acces</h1>
          <p>
            Votre compte <strong>{utilisateur.email}</strong> n&apos;appartient a aucune equipe.
            Un administrateur doit vous rattacher aux operateurs ou aux administrateurs.
          </p>
        </div>
      </div>
    );
  }

  if (roles && !roles.includes(utilisateur.role)) {
    return (
      <div className="acces-refuse">
        <div className="acces-refuse__carte">
          <h1>Acces reserve</h1>
          <p>
            Cet ecran est reserve aux administrateurs. Votre role actuel est
            « {LIBELLE_ROLE[utilisateur.role]} ».
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
