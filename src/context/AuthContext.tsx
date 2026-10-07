/**
 * AFFICHES-EM v1.0 — Contexte d'authentification
 *
 * Expose l'utilisateur connecte a toute l'application et centralise les
 * actions de session. Au premier rendu, l'etat est « en cours de
 * verification » : distinguer cet etat de « non connecte » evite de faire
 * clignoter l'ecran de connexion pour un utilisateur dont la session est
 * valide mais pas encore lue.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { seConnecter, seDeconnecter, utilisateurCourant, type Utilisateur } from '../lib/auth';
import { estConfigure } from '../lib/supabase';
import { definirAuteur, journaliser } from '../lib/journal';

const CLE_OUVERTURE = 'affiches-em.ouverture-journalisee';

/** Une ligne « ouverture » par onglet, quand l'application reprend une session existante. */
function tracerOuverture() {
  try {
    if (sessionStorage.getItem(CLE_OUVERTURE)) return;
    sessionStorage.setItem(CLE_OUVERTURE, '1');
  } catch {
    return;
  }
  void journaliser('connexion', 'session', "Ouverture de l'application (session deja ouverte)");
}

interface ContexteAuth {
  readonly utilisateur: Utilisateur | null;
  readonly enCoursDeVerification: boolean;
  readonly connexion: (email: string, motDePasse: string) => Promise<void>;
  readonly deconnexion: () => Promise<void>;
}

const Contexte = createContext<ContexteAuth | null>(null);

export function FournisseurAuth({ children }: { children: ReactNode }) {
  const [utilisateur, setUtilisateur] = useState<Utilisateur | null>(null);
  const [enCoursDeVerification, setEnCoursDeVerification] = useState(true);

  useEffect(() => {
    let actif = true;

    if (!estConfigure) {
      setEnCoursDeVerification(false);
      return;
    }

    utilisateurCourant()
      .then((resultat) => {
        if (!actif) return;
        setUtilisateur(resultat);
        if (resultat) {
          definirAuteur({ id: resultat.id, nom: resultat.nom });
          tracerOuverture();
        }
      })
      .finally(() => {
        if (actif) setEnCoursDeVerification(false);
      });

    // Evite de mettre a jour l'etat si le composant a ete demonte entre-temps.
    return () => {
      actif = false;
    };
  }, []);

  const connexion = useCallback(async (email: string, motDePasse: string) => {
    const resultat = await seConnecter(email, motDePasse);
    definirAuteur({ id: resultat.id, nom: resultat.nom });
    try {
      sessionStorage.setItem(CLE_OUVERTURE, '1');
    } catch {
      /* sans importance */
    }
    void journaliser('connexion', 'session', `Connexion (${resultat.email}, role ${resultat.role})`);
    setUtilisateur(resultat);
  }, []);

  const deconnexion = useCallback(async () => {
    // Ecrit avant de fermer la session : apres, la base refuserait l'ecriture.
    await journaliser('connexion', 'session', 'Deconnexion');
    await seDeconnecter();
    definirAuteur(null);
    try {
      sessionStorage.removeItem(CLE_OUVERTURE);
    } catch {
      /* sans importance */
    }
    setUtilisateur(null);
  }, []);

  const valeur = useMemo(
    () => ({ utilisateur, enCoursDeVerification, connexion, deconnexion }),
    [utilisateur, enCoursDeVerification, connexion, deconnexion],
  );

  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>;
}

export function useAuth(): ContexteAuth {
  const contexte = useContext(Contexte);
  if (!contexte) {
    throw new Error("useAuth doit etre utilise a l'interieur de <FournisseurAuth>.");
  }
  return contexte;
}
