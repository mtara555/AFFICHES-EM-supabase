import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { APP_NAME, APP_VERSION } from '../config/constants';
import { useAuth } from '../context/AuthContext';
import { LIBELLE_ROLE } from '../lib/auth';
import './AppShell.css';

interface EntreeNavigation {
  readonly to: string;
  readonly libelle: string;
  readonly icone: ReactNode;
  /** Fonctionnalite non encore livree : l'entree reste visible mais desactivee. */
  readonly aVenir?: boolean;
  /** Entree masquee aux operateurs. */
  readonly reserveAdmin?: boolean;
}

const Icone = ({ children }: { children: ReactNode }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);

const NAVIGATION: readonly EntreeNavigation[] = [
  {
    to: '/',
    libelle: 'Tableau de bord',
    icone: (
      <Icone>
        <rect x="3" y="3" width="7" height="9" rx="1" />
        <rect x="14" y="3" width="7" height="5" rx="1" />
        <rect x="14" y="12" width="7" height="9" rx="1" />
        <rect x="3" y="16" width="7" height="5" rx="1" />
      </Icone>
    ),
  },
  {
    to: '/campagnes',
    libelle: 'Campagnes',
    icone: (
      <Icone>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M3 10h18M8 3v4M16 3v4" />
      </Icone>
    ),
  },
  {
    to: '/affiches',
    libelle: 'Affiches',
    icone: (
      <Icone>
        <rect x="5" y="2" width="14" height="20" rx="1.5" />
        <path d="M8 7h8M8 11h5" />
        <rect x="8" y="14" width="8" height="4" rx="0.5" />
      </Icone>
    ),
  },
  {
    to: '/marques',
    libelle: 'Marques',
    reserveAdmin: true,
    icone: (
      <Icone>
        <path d="M12 2 3 11v2l9 9 9-9V4h-9Z" />
        <circle cx="8.5" cy="7.5" r="1.4" fill="currentColor" stroke="none" />
      </Icone>
    ),
  },
  {
    to: '/catalogue',
    libelle: 'Catalogue',
    icone: (
      <Icone>
        <path d="M4 5a2 2 0 0 1 2-2h5v18H6a2 2 0 0 1-2-2Z" />
        <path d="M11 3h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7" />
      </Icone>
    ),
  },
  {
    to: '/journal',
    libelle: 'Journal',
    reserveAdmin: true,
    icone: (
      <Icone>
        <path d="M5 3h11l3 3v15H5z" />
        <path d="M9 8h6M9 12h6M9 16h4" />
      </Icone>
    ),
  },
  {
    to: '/parametres',
    libelle: 'Parametres',
    reserveAdmin: true,
    icone: (
      <Icone>
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1" />
      </Icone>
    ),
  },
];

interface AppShellProps {
  readonly titre: string;
  readonly sousTitre?: string;
  readonly actions?: ReactNode;
  readonly children: ReactNode;
}

export function AppShell({ titre, sousTitre, actions, children }: AppShellProps) {
  const { utilisateur, deconnexion } = useAuth();

  return (
    <div className="shell">
      <aside className="shell__sidebar">
        <div className="shell__brand">
          <span className="shell__brand-mark" aria-hidden="true">
            m
          </span>
          <span className="shell__brand-text">
            <span className="shell__brand-name">{APP_NAME}</span>
            <span className="shell__brand-version">v{APP_VERSION}</span>
          </span>
        </div>

        <nav className="shell__nav" aria-label="Navigation principale">
          {NAVIGATION.filter(
            (entree) => !entree.reserveAdmin || utilisateur?.role === 'administrateur',
          ).map((entree) =>
            entree.aVenir ? (
              <span key={entree.to} className="shell__nav-link shell__nav-link--disabled">
                <span className="shell__nav-icon">{entree.icone}</span>
                {entree.libelle}
                <span className="shell__nav-badge">a venir</span>
              </span>
            ) : (
              <NavLink
                key={entree.to}
                to={entree.to}
                end
                className={({ isActive }) =>
                  isActive ? 'shell__nav-link shell__nav-link--active' : 'shell__nav-link'
                }
              >
                <span className="shell__nav-icon">{entree.icone}</span>
                {entree.libelle}
              </NavLink>
            ),
          )}
        </nav>

        {utilisateur ? (
          <div className="shell__compte">
            <div className="shell__compte-infos">
              <span className="shell__compte-nom">{utilisateur.nom}</span>
              <span className="shell__compte-role">{LIBELLE_ROLE[utilisateur.role]}</span>
            </div>
            <button
              type="button"
              className="shell__deconnexion"
              onClick={() => void deconnexion()}
              title="Se deconnecter"
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.9}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <path d="M16 17l5-5-5-5M21 12H9" />
              </svg>
              <span className="visually-hidden">Se deconnecter</span>
            </button>
          </div>
        ) : null}

        <div className="shell__sidebar-foot">
          Departement Electromenager
          <br />
          Phase 3 — generation des affiches
        </div>
      </aside>

      <div className="shell__main">
        <header className="shell__topbar">
          <div className="shell__titles">
            <h1 className="shell__title">{titre}</h1>
            {sousTitre ? <p className="shell__subtitle">{sousTitre}</p> : null}
          </div>
          {actions ? <div className="shell__actions">{actions}</div> : null}
        </header>

        <main className="shell__content">{children}</main>
      </div>
    </div>
  );
}
