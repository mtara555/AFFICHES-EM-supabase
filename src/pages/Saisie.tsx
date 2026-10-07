import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { useAuth } from '../context/AuthContext';
import { trouverParEan, type Article } from '../lib/articles';
import { listerMarques, type Marque } from '../lib/marques';
import {
  ajouterAffiche,
  listerAffiches,
  modifierAffiche,
  messageErreurCampagne,
  obtenirCampagne,
  supprimerAffiche,
  type Affiche,
  type Campagne,
} from '../lib/campagnes';
import {
  appliquerRegles,
  chargerParametres,
  formaterMontant,
  PARAMETRES_DEFAUT,
  type ParametresRegles,
} from '../lib/regles';
import { FORMATS, FORMATS_ORDONNES, type FormatAffiche } from '../config/constants';
import { AfficheA4 } from '../components/affiche/AfficheA4';
import { ImportSaisie } from '../components/ImportSaisie';
import { ScannerCodeBarre } from '../components/ScannerCodeBarre';
import { listerGabaritsOperation, modeleDepuisChoix, type GabaritOperation } from '../lib/gabarits-operation';
import { Reduction } from '../components/affiche/Reduction';
import { preparerDonnees } from '../lib/affiche-rendu';
import { badgeParCle, MENTIONS, type CleBadge } from '../components/affiche/BadgesPromo';
import './Saisie.css';
import { tracer } from '../lib/journal';

export function Saisie() {
  const { campagneId } = useParams<{ campagneId: string }>();
  const { utilisateur } = useAuth();

  const [campagne, setCampagne] = useState<Campagne | null>(null);
  const [affiches, setAffiches] = useState<Affiche[]>([]);
  const [marques, setMarques] = useState<Marque[]>([]);
  const [parametres, setParametres] = useState<ParametresRegles>(PARAMETRES_DEFAUT);

  const [ean, setEan] = useState('');
  const [article, setArticle] = useState<Article | null>(null);
  const [recherche, setRecherche] = useState(false);
  const [introuvable, setIntrouvable] = useState(false);

  const [prixBarre, setPrixBarre] = useState('');
  const [prixPrincipal, setPrixPrincipal] = useState('');
  const [format, setFormat] = useState<FormatAffiche>('A4');
  const [stockLimite, setStockLimite] = useState(false);
  const [nouveaute, setNouveaute] = useState(false);
  const [promotion, setPromotion] = useState(false);
  const [mentions, setMentions] = useState<CleBadge[]>([]);
  const [alerteMentions, setAlerteMentions] = useState(false);
  /** Affiche en cours de correction (null = ajout d'une nouvelle affiche). */
  const [enEdition, setEnEdition] = useState<Affiche | null>(null);
  const carteSaisie = useRef<HTMLElement>(null);

  const [erreur, setErreur] = useState<string | null>(null);
  const [ajout, setAjout] = useState(false);
  const champEan = useRef<HTMLInputElement>(null);
  const [operations, setOperations] = useState<GabaritOperation[]>([]);
  const champPrixBarre = useRef<HTMLInputElement>(null);
  const [scanner, setScanner] = useState(false);
  const cameraDisponible =
    typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);

  const nomsMarques = useMemo(
    () => new Map(marques.map((m) => [m.id, m.nom])),
    [marques],
  );

  const codesExistants = useMemo(() => new Set(affiches.map((a) => a.ean)), [affiches]);

  const charger = useCallback(async () => {
    if (!campagneId) return;
    setErreur(null);
    try {
      const [c, a, m, p, ops] = await Promise.all([
        obtenirCampagne(campagneId),
        listerAffiches(campagneId),
        listerMarques(),
        chargerParametres(),
        listerGabaritsOperation(),
      ]);
      setCampagne(c);
      setAffiches(a);
      setMarques(m);
      setParametres(p);
      setOperations(ops);
    } catch (probleme) {
      setErreur(messageErreurCampagne(probleme));
    }
  }, [campagneId]);

  useEffect(() => {
    void charger();
  }, [charger]);

  /** Recherche l'article des que le code saisi est plausible. */
  async function chercherArticle(codeLu?: string) {
    const code = (codeLu ?? ean).trim();
    if (!code) return;

    setRecherche(true);
    setIntrouvable(false);
    setErreur(null);
    try {
      const trouve = await trouverParEan(code);
      setArticle(trouve);
      setIntrouvable(trouve === null);
      // Apres un scan, on enchaine directement sur la saisie des prix.
      if (trouve && codeLu) window.setTimeout(() => champPrixBarre.current?.focus(), 50);
    } catch (probleme) {
      setErreur(messageErreurCampagne(probleme));
    } finally {
      setRecherche(false);
    }
  }

  /** Affiche telle qu'elle sera imprimee, recalculee a chaque frappe. */
  const apercu = useMemo(() => {
    if (!article) return null;
    return preparerDonnees(
      {
        cle: 'apercu',
        article,
        marque: marques.find((m) => m.id === article.marqueId),
        prixBarre: Number(prixBarre.replace(',', '.')) || 0,
        prixPrincipal: Number(prixPrincipal.replace(',', '.')) || 0,
        nouveaute,
        stockLimite,
        promotion,
        mentions,
        modele: modeleDepuisChoix(campagne?.gabarit, operations),
      },
      parametres,
    );
  }, [article, marques, prixBarre, prixPrincipal, nouveaute, stockLimite, promotion, mentions, parametres, campagne, operations]);

  const regles = useMemo(
    () =>
      appliquerRegles(
        Number(prixBarre.replace(',', '.')) || 0,
        Number(prixPrincipal.replace(',', '.')) || 0,
        article?.livraisonGratuiteExclue ?? false,
        parametres,
      ),
    [prixBarre, prixPrincipal, article, parametres],
  );

  function reinitialiser() {
    setEan('');
    setArticle(null);
    setIntrouvable(false);
    setPrixBarre('');
    setPrixPrincipal('');
    setStockLimite(false);
    setNouveaute(false);
    setPromotion(false);
    setMentions([]);
    setEnEdition(null);
    champEan.current?.focus();
  }

  /** Ajoute l'affiche, ou enregistre la correction de l'affiche en cours d'edition. */
  async function ajouter() {
    if (!campagneId || !article || !utilisateur) return;
    const N = Number(prixPrincipal.replace(',', '.'));
    if (!Number.isFinite(N) || N <= 0) {
      setErreur('Le prix principal est obligatoire et doit etre superieur a zero.');
      return;
    }

    const saisie = {
      ean: article.ean,
      prixBarre: Number(prixBarre.replace(',', '.')) || 0,
      prixPrincipal: N,
      format,
      stockLimite,
      nouveaute,
      promotion,
      mentions,
    };

    setAjout(true);
    setErreur(null);
    try {
      const resultat = enEdition
        ? await modifierAffiche(enEdition.id, saisie)
        : await ajouterAffiche(campagneId, saisie, affiches.length, utilisateur.id);
      tracer(
        enEdition ? 'modification' : 'creation',
        'affiches',
        `${enEdition ? 'Affiche modifiee' : 'Affiche saisie'} : ${article.ean} ${article.designation} — prix ${formaterMontant(N)} dh${saisie.prixBarre > 0 ? ` (barre ${formaterMontant(saisie.prixBarre)} dh)` : ''}, ${format} — campagne « ${campagne?.nom ?? campagneId} »`,
      );
      // Mentions cochees mais non enregistrees : colonne `mentions` absente de la base.
      setAlerteMentions(mentions.length > 0 && resultat.mentions.length === 0);
      reinitialiser();
      await charger();
    } catch (probleme) {
      setErreur(messageErreurCampagne(probleme));
    } finally {
      setAjout(false);
    }
  }

  /** Recharge une affiche deja saisie dans le formulaire pour la corriger. */
  async function editer(affiche: Affiche) {
    setErreur(null);
    setAlerteMentions(false);
    setEnEdition(affiche);
    setEan(affiche.ean);
    setPrixBarre(affiche.prixBarre > 0 ? String(affiche.prixBarre) : '');
    setPrixPrincipal(String(affiche.prixPrincipal));
    setFormat(affiche.format);
    setStockLimite(affiche.stockLimite);
    setNouveaute(affiche.nouveaute);
    setPromotion(affiche.promotion);
    setMentions([...affiche.mentions]);
    carteSaisie.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    await chercherArticle(affiche.ean);
  }

  async function retirer(affiche: Affiche) {
    setErreur(null);
    try {
      await supprimerAffiche(affiche.id);
      tracer('suppression', 'affiches', `Affiche retiree : ${affiche.ean} — ${formaterMontant(affiche.prixPrincipal)} dh — campagne « ${campagne?.nom ?? campagneId} »`);
      if (enEdition?.id === affiche.id) reinitialiser();
      await charger();
    } catch (probleme) {
      setErreur(messageErreurCampagne(probleme));
    }
  }

  return (
    <AppShell
      titre={campagne ? campagne.nom : 'Saisie'}
      sousTitre={`${affiches.length} affiche(s) — format par defaut ${FORMATS[format].code}`}
      actions={
        <>
          <Link to="/campagnes" className="bouton bouton--discret">
            Toutes les campagnes
          </Link>
          {campagneId && affiches.length > 0 ? (
            <Link to={`/affiches/${campagneId}`} className="bouton bouton--principal">
              Apercu & impression
            </Link>
          ) : null}
        </>
      }
    >
      {erreur ? (
        <p className="bandeau bandeau--erreur" role="alert">
          {erreur}
        </p>
      ) : null}

      <section className={`carte${enEdition ? ' carte--edition' : ''}`} ref={carteSaisie}>
        <h2 className="carte__titre">
          {enEdition ? `Modifier l'affiche ${enEdition.ean}` : 'Ajouter une affiche'}
        </h2>
        {enEdition ? (
          <p className="bandeau bandeau--alerte">
            Correction en cours : modifiez le code, les prix, le format ou les badges, puis
            cliquez sur « Enregistrer les modifications ».
          </p>
        ) : null}

        <div className="ligne-ean">
          <div className="champ champ--extensible">
            <label htmlFor="ean">Code article</label>
            <input
              ref={champEan}
              id="ean"
              type="text"
              inputMode="numeric"
              placeholder="Saisir un code puis Entree"
              value={ean}
              onChange={(e) => {
                setEan(e.target.value);
                setArticle(null);
                setIntrouvable(false);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void chercherArticle();
              }}
              onBlur={() => {
                if (ean.trim() && !article && !introuvable) void chercherArticle();
              }}
            />
          </div>
          <button
            type="button"
            className="bouton bouton--discret"
            onClick={() => void chercherArticle()}
            disabled={recherche || !ean.trim()}
          >
            {recherche ? 'Recherche…' : 'Rechercher'}
          </button>
          {cameraDisponible ? (
            <button
              type="button"
              className="bouton bouton--principal bouton--scanner"
              onClick={() => setScanner(true)}
              title="Scanner le code-barres avec la camera"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
                <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" />
                <path d="M7 8v8M10 8v8M13 8v8M17 8v8" />
              </svg>
              Scanner
            </button>
          ) : null}
        </div>

        <ScannerCodeBarre
          ouvert={scanner}
          surFermer={() => setScanner(false)}
          surCode={(code) => {
            setScanner(false);
            setEan(code);
            setArticle(null);
            void chercherArticle(code);
          }}
        />

        {introuvable ? (
          <p className="bandeau bandeau--alerte">
            Aucun article ne porte ce code. Verifiez la saisie, ou{' '}
            <Link to={`/catalogue?demande=${encodeURIComponent(ean.trim())}`}>
              demandez l&apos;ajout de cet article au catalogue
            </Link>
            .
          </p>
        ) : null}

        {article ? (
          <>
            <div className="fiche-article">
              <div className="fiche-article__entete">
                <span className="fiche-article__marque">
                  {nomsMarques.get(article.marqueId) ?? '—'}
                </span>
                <span className="fiche-article__designation">{article.designation}</span>
                {article.reference ? (
                  <span className="fiche-article__reference">{article.reference}</span>
                ) : null}
              </div>
              <div className="pastilles">
                {article.pictos
                  .filter((p) => p)
                  .map((p, i) => (
                    <span className="pastille" key={i}>
                      {p}
                    </span>
                  ))}
              </div>
            </div>

            <div className="grille-prix">
              <div className="champ">
                <label htmlFor="prixBarre">Prix barre (dh)</label>
                <input
                  ref={champPrixBarre}
                  id="prixBarre"
                  type="text"
                  inputMode="decimal"
                  placeholder="46999"
                  value={prixBarre}
                  onChange={(e) => setPrixBarre(e.target.value)}
                />
              </div>
              <div className="champ">
                <label htmlFor="prixPrincipal">Prix principal (dh)</label>
                <input
                  id="prixPrincipal"
                  type="text"
                  inputMode="decimal"
                  placeholder="39999"
                  value={prixPrincipal}
                  onChange={(e) => setPrixPrincipal(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void ajouter();
                  }}
                />
              </div>
              <div className="champ">
                <label htmlFor="format">Format</label>
                <select
                  id="format"
                  value={format}
                  onChange={(e) => setFormat(e.target.value as FormatAffiche)}
                >
                  {FORMATS_ORDONNES.map((code) => (
                    <option key={code} value={code}>
                      {FORMATS[code].libelle}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="badges-commerciaux">
              <label className="case">
                <input
                  type="checkbox"
                  checked={stockLimite}
                  onChange={(e) => setStockLimite(e.target.checked)}
                />
                Stock limite
              </label>
              <label className="case">
                <input
                  type="checkbox"
                  checked={nouveaute}
                  onChange={(e) => setNouveaute(e.target.checked)}
                />
                Nouveaute
              </label>
              <label className="case">
                <input
                  type="checkbox"
                  checked={promotion}
                  onChange={(e) => setPromotion(e.target.checked)}
                />
                Promotion limitee
              </label>
              {MENTIONS.map((cle) => (
                <label key={cle} className="case">
                  <input
                    type="checkbox"
                    checked={mentions.includes(cle)}
                    onChange={(e) =>
                      setMentions((liste) =>
                        e.target.checked
                          ? MENTIONS.filter((m) => m === cle || liste.includes(m))
                          : liste.filter((m) => m !== cle),
                      )
                    }
                  />
                  {badgeParCle(cle).libelle}
                </label>
              ))}
            </div>
            {alerteMentions ? (
              <p className="bandeau bandeau--alerte" role="alert">
                Affiche ajoutee, mais les mentions (depliant, exclusivite, Marjane s&apos;engage) n&apos;ont
                pas ete enregistrees : verifiez que la colonne « mentions » existe dans la table affiches
                (supabase/schema.sql).
              </p>
            ) : null}

            <div className="apercu-regles">
              <h3 className="sous-titre">Calcule automatiquement</h3>
              <div className="regles-grille">
                <div className={`regle ${regles.afficherEconomie ? 'est-active' : ''}`}>
                  <span className="regle__libelle">Bandeau economie</span>
                  <span className="regle__valeur">
                    {regles.afficherEconomie
                      ? `${formaterMontant(regles.economie)} dh (${regles.economiePourcent.toFixed(0)} %)`
                      : `masque — remise sous ${parametres.seuilEconomiePourcent} %`}
                  </span>
                </div>
                <div className={`regle ${regles.dureeCredit ? 'est-active' : ''}`}>
                  <span className="regle__libelle">Credit sans interet</span>
                  <span className="regle__valeur">
                    {regles.dureeCredit && regles.mensualite !== null
                      ? `${formaterMontant(regles.mensualite)} dh x ${regles.dureeCredit} mois`
                      : 'non eligible'}
                  </span>
                </div>
                <div className={`regle ${regles.livraisonGratuite ? 'est-active' : ''}`}>
                  <span className="regle__libelle">Livraison gratuite</span>
                  <span className="regle__valeur">
                    {regles.livraisonGratuite
                      ? 'badge affiche'
                      : article.livraisonGratuiteExclue
                        ? 'article exclu'
                        : `sous ${parametres.seuilLivraisonGratuite} dh`}
                  </span>
                </div>
                <div className={`regle ${article.pictos.some((p) => p) ? 'est-active' : ''}`}>
                  <span className="regle__libelle">Pictogrammes</span>
                  <span className="regle__valeur">
                    {article.pictos.filter((p) => p).length} depuis la fiche article
                  </span>
                </div>
              </div>
            </div>

            {apercu ? (
              <div className="apercu-affiche">
                <h3 className="sous-titre">Apercu de l&apos;affiche A4</h3>
                <Reduction echelle={0.42} className="apercu-affiche__feuille">
                  <AfficheA4 donnees={apercu} />
                </Reduction>
              </div>
            ) : null}

            <div className="actions-formulaire">
              <button
                type="button"
                className="bouton bouton--principal"
                onClick={ajouter}
                disabled={ajout || !prixPrincipal.trim()}
              >
                {ajout
                  ? 'Enregistrement…'
                  : enEdition
                    ? 'Enregistrer les modifications'
                    : 'Ajouter a la campagne'}
              </button>
              <button type="button" className="bouton bouton--discret" onClick={reinitialiser}>
                {enEdition ? 'Annuler la modification' : 'Effacer'}
              </button>
            </div>
          </>
        ) : null}
      </section>

      {campagneId && utilisateur ? (
        <ImportSaisie
          campagneId={campagneId}
          userId={utilisateur.id}
          ordreDepart={affiches.length}
          format={format}
          codesExistants={codesExistants}
          nomsMarques={nomsMarques}
          surTermine={charger}
        />
      ) : null}

      <section className="carte">
        <h2 className="carte__titre">Affiches de la campagne</h2>

        {affiches.length === 0 ? (
          <p className="carte__texte carte__texte--discret">
            Aucune affiche pour le moment. Saisissez un code article ci-dessus.
          </p>
        ) : (
          <table className="tableau">
            <thead>
              <tr>
                <th scope="col">Code</th>
                <th scope="col">Prix barre</th>
                <th scope="col">Prix</th>
                <th scope="col">Format</th>
                <th scope="col">Badges</th>
                <th scope="col">
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {affiches.map((affiche) => (
                <tr key={affiche.id} className={enEdition?.id === affiche.id ? 'est-en-edition' : undefined}>
                  <th scope="row" className="colonne-code">
                    {affiche.ean}
                  </th>
                  <td className="colonne-prix">
                    {affiche.prixBarre > 0 ? formaterMontant(affiche.prixBarre) : '—'}
                  </td>
                  <td className="colonne-prix colonne-prix--fort">
                    {formaterMontant(affiche.prixPrincipal)}
                  </td>
                  <td>{affiche.format}</td>
                  <td>
                    <div className="pastilles">
                      {affiche.stockLimite ? <span className="pastille">Stock limite</span> : null}
                      {affiche.nouveaute ? <span className="pastille">Nouveaute</span> : null}
                      {affiche.promotion ? <span className="pastille">Promotion</span> : null}
                      {affiche.mentions.map((m) => (
                        <span key={m} className="pastille">
                          {badgeParCle(m).libelle}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="colonne-actions">
                    <button
                      type="button"
                      className="bouton bouton--discret bouton--petit"
                      onClick={() => void editer(affiche)}
                      disabled={ajout}
                    >
                      Modifier
                    </button>
                    <button
                      type="button"
                      className="bouton bouton--danger bouton--petit"
                      onClick={() => void retirer(affiche)}
                    >
                      Retirer
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
