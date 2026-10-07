import { useEffect, useMemo, useState } from 'react';
import { AfficheA4 } from './affiche/AfficheA4';
import { Reduction } from './affiche/Reduction';
import { Pictogramme } from './affiche/Pictogramme';
import { estEan13Valide, trouverParEan, type Article } from '../lib/articles';
import type { Marque } from '../lib/marques';
import type { DemandeArticle } from '../lib/demandes';
import type { Dictionnaire } from '../lib/correcteur';
import { preparerDonnees } from '../lib/affiche-rendu';
import { chargerParametres, PARAMETRES_DEFAUT, type ParametresRegles } from '../lib/regles';
import { CATEGORIES } from '../config/constants';

interface DetailDemandeProps {
  readonly demande: DemandeArticle;
  readonly marques: readonly Marque[];
  readonly dictionnaire: Dictionnaire | null;
  readonly surValider: () => void;
  readonly surRejeter: () => void;
  readonly surFermer: () => void;
}

type Etat = 'ok' | 'alerte' | 'erreur' | 'attente';

interface Controle {
  readonly etat: Etat;
  readonly texte: string;
}

/**
 * Fiche de consultation d'une demande d'ajout : toutes les caracteristiques
 * saisies par l'operateur, des controles automatiques et l'apercu de
 * l'affiche telle qu'elle sortirait, pour decider avant de valider ou rejeter.
 */
export function DetailDemande({ demande, marques, dictionnaire, surValider, surRejeter, surFermer }: DetailDemandeProps) {
  const [existant, setExistant] = useState<Article | null | undefined>(undefined);
  const [parametres, setParametres] = useState<ParametresRegles>(PARAMETRES_DEFAUT);

  useEffect(() => {
    let actif = true;
    setExistant(undefined);
    trouverParEan(demande.ean)
      .then((a) => actif && setExistant(a))
      .catch(() => actif && setExistant(null));
    chargerParametres().then((p) => actif && setParametres(p)).catch(() => undefined);
    return () => {
      actif = false;
    };
  }, [demande.ean]);

  const marque = marques.find((m) => m.id === demande.marqueId) ?? null;

  const controles = useMemo<Controle[]>(() => {
    const liste: Controle[] = [];
    // Code
    if (existant === undefined) liste.push({ etat: 'attente', texte: 'Verification du code au catalogue…' });
    else if (existant) {
      liste.push({
        etat: 'erreur',
        texte: `Le code existe deja au catalogue : ${existant.designation} ${existant.reference}. A rejeter (doublon).`,
      });
    } else liste.push({ etat: 'ok', texte: 'Code absent du catalogue : pas de doublon.' });
    liste.push(
      estEan13Valide(demande.ean)
        ? { etat: 'ok', texte: 'Code EAN-13 valide (cle de controle correcte).' }
        : { etat: 'alerte', texte: "Ce n'est pas un EAN-13 valide : verifiez le code (reference interne ou faute de frappe ?)." },
    );
    // Marque
    liste.push(
      marque
        ? { etat: 'ok', texte: `Marque connue : ${marque.nom}.` }
        : {
            etat: 'alerte',
            texte: `Marque « ${demande.marqueNom || '—'} » absente de la liste : a creer dans Marques avant de valider.`,
          },
    );
    // Orthographe
    if (dictionnaire && demande.designation) {
      const r = dictionnaire.corriger(demande.designation);
      liste.push(
        r.corrections.length === 0
          ? { etat: 'ok', texte: 'Designation sans faute detectee.' }
          : {
              etat: 'alerte',
              texte: `Orthographe a verifier : ${r.corrections.map((c) => `${c.de} → ${c.vers}`).join(', ')}.`,
            },
      );
    }
    if (!demande.reference) liste.push({ etat: 'alerte', texte: 'Reference constructeur non renseignee.' });
    if (!demande.pictos.some(Boolean)) liste.push({ etat: 'alerte', texte: 'Aucun pictogramme renseigne.' });
    return liste;
  }, [existant, demande, marque, dictionnaire]);

  /** Affiche de controle avec un prix fictif, pour juger le rendu. */
  const apercu = useMemo(() => {
    const article: Article = {
      id: `demande-${demande.id}`,
      ean: demande.ean,
      marqueId: demande.marqueId,
      designation: demande.designation,
      reference: demande.reference,
      categorie: demande.categorie,
      photoFileId: null,
      pictos: demande.pictos,
      livraisonGratuiteExclue: false,
      actif: true,
    };
    return preparerDonnees(
      {
        cle: `demande-${demande.id}`,
        article,
        marque: marque ?? { id: '', nom: demande.marqueNom, logoFileId: null, actif: true },
        prixBarre: 0,
        prixPrincipal: 1999,
      },
      parametres,
    );
  }, [demande, marque, parametres]);

  const bloquant = Boolean(existant);

  return (
    <div className="detail-demande">
      <div className="detail-demande__infos">
        <dl className="detail-demande__liste">
          <dt>Code article</dt>
          <dd className="colonne-code">{demande.ean}</dd>
          <dt>Marque</dt>
          <dd>{marque?.nom ?? demande.marqueNom ?? '—'}</dd>
          <dt>Designation</dt>
          <dd>{demande.designation || '—'}</dd>
          <dt>Reference</dt>
          <dd>{demande.reference || '—'}</dd>
          <dt>Categorie</dt>
          <dd>{CATEGORIES[demande.categorie] ?? demande.categorie}</dd>
          <dt>Demande par</dt>
          <dd>
            {demande.demandeurNom || '—'} le{' '}
            {new Date(demande.date).toLocaleString('fr-FR', { dateStyle: 'full', timeStyle: 'short' })}
          </dd>
        </dl>

        <h4 className="detail-demande__titre">Pictogrammes</h4>
        <div className="detail-demande__pictos">
          {demande.pictos.map((code, i) => (
            <div key={i} className="detail-demande__picto">
              <div className="detail-demande__picto-visuel">
                {code ? <Pictogramme code={code} /> : <span className="detail-demande__vide">—</span>}
              </div>
              <span>{code || `Emplacement ${i + 1}`}</span>
            </div>
          ))}
        </div>

        <h4 className="detail-demande__titre">Controles automatiques</h4>
        <ul className="detail-demande__controles">
          {controles.map((c) => (
            <li key={c.texte} className={`controle controle--${c.etat}`}>
              {c.texte}
            </li>
          ))}
        </ul>

        <div className="detail-demande__actions">
          <button
            type="button"
            className="bouton bouton--principal"
            onClick={surValider}
            disabled={bloquant}
            title={bloquant ? 'Code deja au catalogue' : undefined}
          >
            Valider (ouvrir le formulaire)
          </button>
          <button type="button" className="bouton bouton--danger" onClick={surRejeter}>
            Rejeter
          </button>
          <button type="button" className="bouton bouton--discret" onClick={surFermer}>
            Fermer
          </button>
        </div>
      </div>

      <figure className="detail-demande__apercu">
        <Reduction echelle={0.38}>
          <AfficheA4 donnees={apercu} />
        </Reduction>
        <figcaption>Apercu de l&apos;affiche (prix fictif 1 999 dh)</figcaption>
      </figure>
    </div>
  );
}
