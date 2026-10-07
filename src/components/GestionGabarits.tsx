import { useCallback, useEffect, useMemo, useState } from 'react';
import { Visuel } from './affiche/Visuel';
import { AfficheA4 } from './affiche/AfficheA4';
import { Reduction } from './affiche/Reduction';
import {
  ACCEPT_GABARIT,
  ajouterGabaritOperation,
  listerGabaritsOperation,
  messageErreurGabarit,
  modifierDisposition,
  supprimerGabaritOperation,
  versModele,
  type GabaritOperation,
} from '../lib/gabarits-operation';
import { preparerDonnees } from '../lib/affiche-rendu';
import { PARAMETRES_DEFAUT } from '../lib/regles';
import { LIBELLE_DISPOSITION, type Disposition } from '../config/gabarits';
import type { Article } from '../lib/articles';
import { tracer } from '../lib/journal';

const DISPOSITIONS: readonly Disposition[] = ['standard', 'macaron-large'];

/** Article fictif pour l'apercu : montre toutes les zones de l'affiche. */
const ARTICLE_EXEMPLE: Article = {
  id: 'exemple',
  ean: '0000000000000',
  marqueId: 'exemple',
  designation: 'SECHE-CHEVEUX',
  reference: 'SECHE-CHEVEUX IONIQUE 2200W',
  categorie: 'pem',
  photoFileId: null,
  pictos: ['2200W', 'NOIR', '', '', '1AN', ''],
  livraisonGratuiteExclue: false,
  actif: true,
};

/**
 * Gestion des gabarits d'operation (administrateurs) : ajout d'une image de
 * cadre, choix de la mise en page, apercu, suppression.
 */
export function GestionGabarits() {
  const [liste, setListe] = useState<GabaritOperation[]>([]);
  const [chargement, setChargement] = useState(true);
  const [nom, setNom] = useState('');
  const [disposition, setDisposition] = useState<Disposition>('macaron-large');
  const [fichier, setFichier] = useState<File | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [apercuId, setApercuId] = useState<string | null>(null);

  const charger = useCallback(async () => {
    setChargement(true);
    setListe(await listerGabaritsOperation());
    setChargement(false);
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  const apercu = useMemo(() => {
    const g = liste.find((x) => x.id === apercuId);
    if (!g) return null;
    return preparerDonnees(
      {
        cle: `apercu-${g.id}`,
        article: ARTICLE_EXEMPLE,
        marque: { id: 'exemple', nom: 'MARQUE', logoFileId: null, actif: true },
        prixBarre: 599,
        prixPrincipal: 399,
        modele: versModele(g),
      },
      PARAMETRES_DEFAUT,
    );
  }, [liste, apercuId]);

  async function ajouter() {
    if (!fichier) return;
    setEnvoi(true);
    setErreur(null);
    setMessage(null);
    try {
      const g = await ajouterGabaritOperation(nom, fichier, disposition);
      tracer('creation', 'gabarits', `Gabarit d'operation ajoute : ${g.nom}`);
      setMessage(
        `Gabarit « ${g.nom} » ajoute${g.cadreDessus ? '' : ' (image opaque : le cadre sera place sous le contenu)'}. Il est maintenant propose dans la page Affiches de chaque campagne.`,
      );
      setNom('');
      setFichier(null);
      await charger();
      setApercuId(g.id);
    } catch (probleme) {
      setErreur(messageErreurGabarit(probleme));
    } finally {
      setEnvoi(false);
    }
  }

  async function changerDisposition(g: GabaritOperation, d: Disposition) {
    setErreur(null);
    try {
      await modifierDisposition(g.id, d);
      tracer('modification', 'gabarits', `Gabarit « ${g.nom} » : mise en page ${d}`);
      await charger();
    } catch (probleme) {
      setErreur(messageErreurGabarit(probleme));
    }
  }

  async function supprimer(g: GabaritOperation) {
    if (!window.confirm(`Supprimer le gabarit « ${g.nom} » ?\n\nLes campagnes qui l'utilisent reviendront au choix automatique Electro / Image & Son.`)) {
      return;
    }
    setErreur(null);
    setMessage(null);
    try {
      await supprimerGabaritOperation(g);
      tracer('suppression', 'gabarits', `Gabarit d'operation supprime : ${g.nom}`);
      if (apercuId === g.id) setApercuId(null);
      await charger();
      setMessage(`Gabarit « ${g.nom} » supprime.`);
    } catch (probleme) {
      setErreur(messageErreurGabarit(probleme));
    }
  }

  return (
    <section className="carte carte--gabarits">
      <h2 className="carte__titre">Gabarits d&apos;operation</h2>
      <p className="carte__texte carte__texte--discret">
        Un gabarit d&apos;operation remplace les cadres Electro et Image &amp; Son pour toute une
        campagne (choix dans la page Affiches). Image A4 portrait, idealement un PNG au centre
        transparent, 2480 × 3508 px pour une impression nette.
      </p>

      {erreur ? (
        <p className="bandeau bandeau--erreur" role="alert">
          {erreur}
        </p>
      ) : null}
      {message ? <p className="bandeau bandeau--succes">{message}</p> : null}

      <div className="gabarits-ajout">
        <div className="champ">
          <label htmlFor="gabarit-nom">Nom de l&apos;operation</label>
          <input
            id="gabarit-nom"
            type="text"
            placeholder="Maison & Beaute a prix legers"
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            disabled={envoi}
          />
        </div>
        <div className="champ">
          <label htmlFor="gabarit-disposition">Mise en page</label>
          <select
            id="gabarit-disposition"
            value={disposition}
            onChange={(e) => setDisposition(e.target.value as Disposition)}
            disabled={envoi}
          >
            {DISPOSITIONS.map((d) => (
              <option key={d} value={d}>
                {LIBELLE_DISPOSITION[d]}
              </option>
            ))}
          </select>
        </div>
        <div className="champ">
          <span className="gabarits-ajout__libelle">Image du cadre</span>
          <label className="bouton bouton--discret">
            {fichier ? fichier.name : 'Choisir une image…'}
            <input
              type="file"
              accept={ACCEPT_GABARIT}
              className="visually-hidden"
              disabled={envoi}
              onChange={(e) => {
                setFichier(e.target.files?.[0] ?? null);
                e.target.value = '';
              }}
            />
          </label>
        </div>
        <button
          type="button"
          className="bouton bouton--principal"
          onClick={() => void ajouter()}
          disabled={envoi || !fichier || !nom.trim()}
        >
          {envoi ? 'Envoi…' : 'Ajouter le gabarit'}
        </button>
      </div>

      {chargement ? (
        <p className="carte__texte carte__texte--discret">Chargement…</p>
      ) : liste.length === 0 ? (
        <p className="carte__texte carte__texte--discret">Aucun gabarit d&apos;operation pour le moment.</p>
      ) : (
        <div className="gabarits-grille">
          <ul className="gabarits-liste">
            {liste.map((g) => (
              <li key={g.id} className={apercuId === g.id ? 'est-actif' : undefined}>
                <span className="gabarits-liste__vignette">
                  <Visuel fileId={g.fileId} alt={g.nom} secours={<span>…</span>} />
                </span>
                <div className="gabarits-liste__infos">
                  <strong>{g.nom}</strong>
                  <select
                    aria-label={`Mise en page de ${g.nom}`}
                    value={g.disposition}
                    onChange={(e) => void changerDisposition(g, e.target.value as Disposition)}
                  >
                    {DISPOSITIONS.map((d) => (
                      <option key={d} value={d}>
                        {LIBELLE_DISPOSITION[d]}
                      </option>
                    ))}
                  </select>
                  <div className="gabarits-liste__actions">
                    <button
                      type="button"
                      className="bouton bouton--discret bouton--petit"
                      onClick={() => setApercuId(apercuId === g.id ? null : g.id)}
                    >
                      {apercuId === g.id ? "Masquer l'apercu" : 'Apercu'}
                    </button>
                    <button
                      type="button"
                      className="bouton bouton--danger bouton--petit"
                      onClick={() => void supprimer(g)}
                    >
                      Supprimer
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          {apercu ? (
            <div className="gabarits-apercu">
              <Reduction echelle={0.4}>
                <AfficheA4 donnees={apercu} />
              </Reduction>
              <span className="carte__texte carte__texte--discret">Apercu avec un article fictif</span>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
