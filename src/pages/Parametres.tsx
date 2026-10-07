import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell } from '../components/AppShell';
import { useAuth } from '../context/AuthContext';
import {
  appliquerRegles,
  chargerParametres,
  formaterMontant,
  PARAMETRES_DEFAUT,
  type ParametresRegles,
} from '../lib/regles';
import {
  enregistrerParametres,
  messageErreurParametres,
  validerParametres,
} from '../lib/parametres';
import { GestionGabarits } from '../components/GestionGabarits';
import './Parametres.css';

interface LignePalier {
  seuil: string;
  duree: string;
}

interface Formulaire {
  paliers: LignePalier[];
  livraison: string;
  economie: string;
}

const nombre = (texte: string) => Number(texte.replace(/\s/g, '').replace(',', '.'));

function versFormulaire(p: ParametresRegles): Formulaire {
  return {
    paliers: [...p.baremeCredit]
      .sort((a, b) => a.seuilDh - b.seuilDh)
      .map((x) => ({ seuil: String(x.seuilDh), duree: String(x.dureeMois) })),
    livraison: String(p.seuilLivraisonGratuite),
    economie: String(p.seuilEconomiePourcent),
  };
}

function versParametres(f: Formulaire): ParametresRegles {
  return {
    baremeCredit: f.paliers.map((l) => ({ seuilDh: nombre(l.seuil), dureeMois: nombre(l.duree) })),
    seuilLivraisonGratuite: nombre(f.livraison),
    seuilEconomiePourcent: nombre(f.economie),
  };
}

/**
 * Parametres commerciaux — reserve aux administrateurs.
 *
 * Remplace les constantes codees en dur dans le module VBA (seuils 2 999 /
 * 7 999 / 9 999 / 14 999, 2 000 dh, 10 %). Une modification s'applique a la
 * saisie et aux affiches des le rechargement suivant, sans redeploiement.
 */
export function Parametres() {
  const { utilisateur } = useAuth();

  const [enBase, setEnBase] = useState<ParametresRegles>(PARAMETRES_DEFAUT);
  const [form, setForm] = useState<Formulaire>(versFormulaire(PARAMETRES_DEFAUT));
  const [chargement, setChargement] = useState(true);
  const [enregistrement, setEnregistrement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);

  const [simBarre, setSimBarre] = useState('7990');
  const [simPrix, setSimPrix] = useState('4999');

  const charger = useCallback(async () => {
    setChargement(true);
    const p = await chargerParametres();
    setEnBase(p);
    setForm(versFormulaire(p));
    setChargement(false);
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  const saisis = useMemo(() => versParametres(form), [form]);
  const problemes = useMemo(() => validerParametres(saisis), [saisis]);
  const modifie = useMemo(
    () => JSON.stringify(versFormulaire(saisis)) !== JSON.stringify(versFormulaire(enBase)),
    [saisis, enBase],
  );

  const simulation = useMemo(
    () =>
      problemes.length === 0
        ? appliquerRegles(nombre(simBarre) || 0, nombre(simPrix) || 0, false, saisis)
        : null,
    [problemes, simBarre, simPrix, saisis],
  );

  function changerPalier(index: number, champ: keyof LignePalier, valeur: string) {
    setSucces(null);
    setForm((f) => ({
      ...f,
      paliers: f.paliers.map((l, i) => (i === index ? { ...l, [champ]: valeur } : l)),
    }));
  }

  function ajouterPalier() {
    setSucces(null);
    setForm((f) => ({ ...f, paliers: [...f.paliers, { seuil: '', duree: '' }] }));
  }

  function retirerPalier(index: number) {
    setSucces(null);
    setForm((f) => ({ ...f, paliers: f.paliers.filter((_, i) => i !== index) }));
  }

  async function enregistrer() {
    if (!utilisateur || problemes.length > 0) return;
    setEnregistrement(true);
    setErreur(null);
    setSucces(null);
    try {
      const n = await enregistrerParametres(saisis, enBase, utilisateur.id);
      await charger();
      setSucces(
        n === 0
          ? 'Aucune modification a enregistrer.'
          : `Parametres enregistres (${n} valeur(s)). Ils s'appliquent a la saisie et aux affiches.`,
      );
    } catch (probleme) {
      setErreur(messageErreurParametres(probleme));
    } finally {
      setEnregistrement(false);
    }
  }

  return (
    <AppShell
      titre="Parametres"
      sousTitre="Regles commerciales appliquees a la saisie et aux affiches"
      actions={
        <>
          <button
            type="button"
            className="bouton bouton--discret"
            onClick={() => {
              setSucces(null);
              setForm(versFormulaire(PARAMETRES_DEFAUT));
            }}
            disabled={chargement || enregistrement}
          >
            Valeurs par defaut
          </button>
          <button
            type="button"
            className="bouton bouton--principal"
            onClick={() => void enregistrer()}
            disabled={chargement || enregistrement || !modifie || problemes.length > 0}
          >
            {enregistrement ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </>
      }
    >
      {erreur ? (
        <p className="bandeau bandeau--erreur" role="alert">
          {erreur}
        </p>
      ) : null}
      {succes ? <p className="bandeau bandeau--succes">{succes}</p> : null}
      {problemes.length > 0 ? (
        <div className="bandeau bandeau--alerte" role="alert">
          {problemes.map((p) => (
            <div key={p}>{p}</div>
          ))}
        </div>
      ) : null}
      {modifie && problemes.length === 0 ? (
        <p className="bandeau bandeau--alerte">
          Modifications non enregistrees. Cliquez sur « Enregistrer » pour les appliquer.
        </p>
      ) : null}

      <div className="parametres-grille">
        <section className="carte">
          <h2 className="carte__titre">Credit 0 %</h2>
          <p className="carte__texte carte__texte--discret">
            Le palier le plus eleve atteint par le prix de vente fixe la duree. En dessous du plus
            petit seuil, le bandeau credit n&apos;apparait pas.
          </p>

          <table className="tableau tableau--paliers">
            <thead>
              <tr>
                <th scope="col">A partir de (dh)</th>
                <th scope="col">Duree (mois)</th>
                <th scope="col">
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {form.paliers.map((palier, i) => (
                <tr key={i}>
                  <td>
                    <input
                      id={`seuil-${i}`}
                      aria-label={`Seuil du palier ${i + 1}`}
                      type="text"
                      inputMode="decimal"
                      value={palier.seuil}
                      onChange={(e) => changerPalier(i, 'seuil', e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      id={`duree-${i}`}
                      aria-label={`Duree du palier ${i + 1}`}
                      type="text"
                      inputMode="numeric"
                      value={palier.duree}
                      onChange={(e) => changerPalier(i, 'duree', e.target.value)}
                    />
                  </td>
                  <td className="colonne-actions">
                    <button
                      type="button"
                      className="bouton bouton--danger bouton--petit"
                      onClick={() => retirerPalier(i)}
                      disabled={form.paliers.length <= 1}
                    >
                      Retirer
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button type="button" className="bouton bouton--discret bouton--petit" onClick={ajouterPalier}>
            Ajouter un palier
          </button>
        </section>

        <section className="carte">
          <h2 className="carte__titre">Badges et bandeaux</h2>
          <div className="parametres-champs">
            <div className="champ">
              <label htmlFor="livraison">Livraison gratuite a partir de (dh)</label>
              <input
                id="livraison"
                type="text"
                inputMode="decimal"
                value={form.livraison}
                onChange={(e) => {
                  setSucces(null);
                  setForm((f) => ({ ...f, livraison: e.target.value }));
                }}
              />
              <span className="champ__aide">Sauf articles marques « exclus » dans le catalogue.</span>
            </div>
            <div className="champ">
              <label htmlFor="economie">Bandeau « وفر » a partir de (% de remise)</label>
              <input
                id="economie"
                type="text"
                inputMode="decimal"
                value={form.economie}
                onChange={(e) => {
                  setSucces(null);
                  setForm((f) => ({ ...f, economie: e.target.value }));
                }}
              />
              <span className="champ__aide">Calcule sur le prix barre. Le prix barre, lui, s&apos;affiche des qu&apos;il depasse le prix de vente.</span>
            </div>
          </div>
        </section>

        <section className="carte carte--simulation">
          <h2 className="carte__titre">Simulation</h2>
          <p className="carte__texte carte__texte--discret">
            Resultat avec les valeurs saisies ci-dessus, avant enregistrement.
          </p>
          <div className="parametres-champs">
            <div className="champ">
              <label htmlFor="simBarre">Prix barre (dh)</label>
              <input
                id="simBarre"
                type="text"
                inputMode="decimal"
                value={simBarre}
                onChange={(e) => setSimBarre(e.target.value)}
              />
            </div>
            <div className="champ">
              <label htmlFor="simPrix">Prix de vente (dh)</label>
              <input
                id="simPrix"
                type="text"
                inputMode="decimal"
                value={simPrix}
                onChange={(e) => setSimPrix(e.target.value)}
              />
            </div>
          </div>

          {simulation ? (
            <div className="regles-grille">
              <div className={`regle ${simulation.dureeCredit ? 'est-active' : ''}`}>
                <span className="regle__libelle">Credit 0 %</span>
                <span className="regle__valeur">
                  {simulation.dureeCredit && simulation.mensualite !== null
                    ? `${formaterMontant(simulation.mensualite)} dh x ${simulation.dureeCredit} mois`
                    : 'non affiche'}
                </span>
              </div>
              <div className={`regle ${simulation.livraisonGratuite ? 'est-active' : ''}`}>
                <span className="regle__libelle">Livraison gratuite</span>
                <span className="regle__valeur">
                  {simulation.livraisonGratuite ? 'badge affiche' : 'non affiche'}
                </span>
              </div>
              <div className={`regle ${simulation.afficherEconomie ? 'est-active' : ''}`}>
                <span className="regle__libelle">Bandeau economie</span>
                <span className="regle__valeur">
                  {simulation.afficherEconomie
                    ? `${formaterMontant(simulation.economie)} dh (${simulation.economiePourcent.toFixed(0)} %)`
                    : `non affiche (${simulation.economiePourcent.toFixed(0)} %)`}
                </span>
              </div>
            </div>
          ) : (
            <p className="carte__texte carte__texte--discret">
              Corrigez les valeurs signalees pour voir la simulation.
            </p>
          )}
        </section>
      </div>

      <GestionGabarits />
    </AppShell>
  );
}
