import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { listerMarques, type Marque } from '../lib/marques';
import {
  creerArticle,
  estEan13Valide,
  listerArticles,
  messageErreurArticle,
  modifierArticle,
  supprimerArticle,
  trouverParEan,
  validerArticle,
  NB_PICTOS,
  type Article,
  type SaisieArticle,
} from '../lib/articles';
import { CATEGORIES, type CategorieProduit } from '../config/constants';
import { marqueLaPlusProche, type Correction } from '../lib/correcteur';
import { chargerVocabulaire, oublierVocabulaire, type Vocabulaire } from '../lib/vocabulaire';
import './Catalogue.css';
import { tracer } from '../lib/journal';
import { useAuth } from '../context/AuthContext';
import { DetailDemande } from '../components/DetailDemande';
import {
  cloturerDemande,
  envoyerDemande,
  LIBELLE_STATUT_DEMANDE,
  listerDemandes,
  messageErreurDemande,
  saisieDepuisDemande,
  type DemandeArticle,
} from '../lib/demandes';

const PAR_PAGE = 25;

const SAISIE_VIDE: SaisieArticle = {
  ean: '',
  marqueId: '',
  designation: '',
  reference: '',
  categorie: 'gem',
  pictos: Array.from({ length: NB_PICTOS }, () => ''),
  livraisonGratuiteExclue: false,
  actif: true,
};

function versSaisie(article: Article): SaisieArticle {
  return {
    ean: article.ean,
    marqueId: article.marqueId,
    designation: article.designation,
    reference: article.reference,
    categorie: article.categorie,
    pictos: [...article.pictos],
    livraisonGratuiteExclue: article.livraisonGratuiteExclue,
    actif: article.actif,
  };
}

export function Catalogue() {
  const { utilisateur } = useAuth();
  const estAdmin = utilisateur?.role === 'administrateur';
  const [parametresUrl, setParametresUrl] = useSearchParams();

  // Demandes d'ajout : un operateur propose, un administrateur valide.
  const [demandes, setDemandes] = useState<DemandeArticle[]>([]);
  const [demandeEnCours, setDemandeEnCours] = useState<DemandeArticle | null>(null);
  const [idConsulte, setIdConsulte] = useState<string | null>(null);
  const [articles, setArticles] = useState<Article[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [chargement, setChargement] = useState(true);

  const [marques, setMarques] = useState<Marque[]>([]);
  const [recherche, setRecherche] = useState('');
  const [termeApplique, setTermeApplique] = useState('');
  const [filtreMarque, setFiltreMarque] = useState('');
  const [filtreCategorie, setFiltreCategorie] = useState<CategorieProduit | ''>('');

  const [saisie, setSaisie] = useState<SaisieArticle | null>(null);
  const [idEdite, setIdEdite] = useState<string | null>(null);
  const [enregistrement, setEnregistrement] = useState(false);

  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Assistance a la saisie : listes de suggestions et correcteur orthographique.
  const [vocabulaire, setVocabulaire] = useState<Vocabulaire | null>(null);
  const [texteMarque, setTexteMarque] = useState('');
  const [avisMarque, setAvisMarque] = useState<string | null>(null);
  const [corrections, setCorrections] = useState<
    Partial<Record<'designation' | 'reference', { avant: string; liste: readonly Correction[] }>>
  >({});

  /** Dictionnaire enrichi des noms de marques (jamais « corriges »). */
  const dictionnaire = useMemo(() => {
    if (!vocabulaire) return null;
    vocabulaire.dictionnaire.ajouter(marques.map((m) => m.nom));
    return vocabulaire.dictionnaire;
  }, [vocabulaire, marques]);

  const referencesMarque = useMemo(
    () => (saisie && vocabulaire ? (vocabulaire.referencesParMarque.get(saisie.marqueId) ?? []) : []),
    [saisie, vocabulaire],
  );

  const nomsMarques = useMemo(() => {
    const table = new Map<string, string>();
    for (const m of marques) table.set(m.id, m.nom);
    return table;
  }, [marques]);

  useEffect(() => {
    listerMarques()
      .then(setMarques)
      .catch((probleme) => setErreur(messageErreurArticle(probleme)));
  }, []);

  const charger = useCallback(async () => {
    setChargement(true);
    setErreur(null);
    try {
      const resultat = await listerArticles({
        recherche: termeApplique,
        marqueId: filtreMarque || undefined,
        categorie: filtreCategorie || undefined,
        page,
        parPage: PAR_PAGE,
      });
      setArticles(resultat.articles);
      setTotal(resultat.total);
    } catch (probleme) {
      setErreur(messageErreurArticle(probleme));
    } finally {
      setChargement(false);
    }
  }, [termeApplique, filtreMarque, filtreCategorie, page]);

  useEffect(() => {
    void charger();
  }, [charger]);

  const chargerDemandes = useCallback(async () => {
    if (!utilisateur) return;
    try {
      setDemandes(await listerDemandes(estAdmin ? 'en_attente' : undefined));
    } catch {
      setDemandes([]); // table absente ou non lisible : la section reste vide
    }
  }, [utilisateur, estAdmin]);

  useEffect(() => {
    void chargerDemandes();
  }, [chargerDemandes]);

  function lancerRecherche() {
    setPage(0);
    setTermeApplique(recherche);
  }

  /** Operateur : envoie une demande d'ajout au lieu d'ecrire dans le catalogue. */
  async function envoyer() {
    if (!saisie || !utilisateur) return;
    const problemes: string[] = [];
    if (!saisie.ean.trim()) problemes.push('Le code article est obligatoire.');
    if (!saisie.designation.trim()) problemes.push('La designation est obligatoire.');
    if (!saisie.marqueId && !texteMarque.trim()) problemes.push('Indiquez la marque.');
    if (problemes.length > 0) {
      setErreur(problemes.join(' '));
      return;
    }
    setEnregistrement(true);
    setErreur(null);
    setMessage(null);
    try {
      if (await trouverParEan(saisie.ean.trim())) {
        setErreur(`Le code ${saisie.ean.trim()} existe deja au catalogue : inutile de le demander.`);
        return;
      }
      const marqueNom = nomsMarques.get(saisie.marqueId) ?? texteMarque.trim();
      await envoyerDemande(saisie, marqueNom, { id: utilisateur.id, nom: utilisateur.nom });
      tracer('creation', 'articles', `Demande d'ajout envoyee : ${saisie.ean} ${saisie.designation} — ${marqueNom} ${saisie.reference}`);
      setMessage(`Demande envoyee pour « ${saisie.designation} » (${saisie.ean}). Un administrateur va la traiter.`);
      fermerFormulaire();
      await chargerDemandes();
    } catch (probleme) {
      setErreur(messageErreurDemande(probleme));
    } finally {
      setEnregistrement(false);
    }
  }

  async function enregistrer() {
    if (!saisie) return;
    if (!estAdmin) {
      await envoyer();
      return;
    }

    const problemes = validerArticle(saisie);
    if (problemes.length > 0) {
      setErreur(problemes.join(' '));
      return;
    }

    setEnregistrement(true);
    setErreur(null);
    setMessage(null);
    try {
      oublierVocabulaire();
      if (idEdite) {
        await modifierArticle(idEdite, saisie);
        tracer('modification', 'articles', `Article modifie : ${saisie.ean} ${saisie.designation} — ${nomsMarques.get(saisie.marqueId) ?? ''} ${saisie.reference}`);
        setMessage(`Article « ${saisie.designation} » modifie.`);
      } else {
        await creerArticle(saisie);
        tracer('creation', 'articles', `Article cree : ${saisie.ean} ${saisie.designation} — ${nomsMarques.get(saisie.marqueId) ?? ''} ${saisie.reference}${demandeEnCours ? ` (demande de ${demandeEnCours.demandeurNom || 'un operateur'})` : ''}`);
        setMessage(`Article « ${saisie.designation} » cree.`);
        if (demandeEnCours) {
          try {
            await cloturerDemande(demandeEnCours, 'traitee');
          } catch (probleme) {
            setErreur(`Article cree, mais la demande n'a pas pu etre cloturee : ${messageErreurDemande(probleme)}`);
          }
          await chargerDemandes();
        }
      }
      fermerFormulaire();
      await charger();
    } catch (probleme) {
      setErreur(messageErreurArticle(probleme));
    } finally {
      setEnregistrement(false);
    }
  }

  async function supprimer(article: Article) {
    const confirme = window.confirm(
      `Supprimer l'article « ${article.designation} » (${article.ean}) ?`,
    );
    if (!confirme) return;

    setErreur(null);
    try {
      await supprimerArticle(article.id);
      tracer('suppression', 'articles', `Article supprime : ${article.ean} ${article.designation}`);
      setMessage('Article supprime.');
      await charger();
    } catch (probleme) {
      setErreur(messageErreurArticle(probleme));
    }
  }

  /** Le vocabulaire (suggestions + correcteur) est lu a l'ouverture du formulaire. */
  function preparerAssistance(marqueId: string) {
    setTexteMarque(nomsMarques.get(marqueId) ?? '');
    setAvisMarque(null);
    setCorrections({});
    chargerVocabulaire()
      .then(setVocabulaire)
      .catch(() => setVocabulaire(null)); // sans vocabulaire, la saisie reste possible
  }

  function ouvrirCreation(ean = '') {
    setIdEdite(null);
    setDemandeEnCours(null);
    setSaisie({ ...SAISIE_VIDE, ean, pictos: Array.from({ length: NB_PICTOS }, () => '') });
    setErreur(null);
    setMessage(null);
    preparerAssistance('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Arrivee depuis la Saisie (« code absent du catalogue ») : formulaire pre-rempli.
  useEffect(() => {
    const code = parametresUrl.get('demande');
    if (code === null) return;
    ouvrirCreation(code);
    setParametresUrl({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parametresUrl]);

  /** Administrateur : consulte la demande (caracteristiques, controles, apercu). */
  function consulter(d: DemandeArticle) {
    const ouvert = idConsulte === d.id ? null : d.id;
    setIdConsulte(ouvert);
    if (ouvert) {
      chargerVocabulaire().then(setVocabulaire).catch(() => undefined);
      window.setTimeout(
        () => document.getElementById('detail-demande')?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
        50,
      );
    }
  }

  /** Administrateur : ouvre le formulaire rempli avec la demande, a verifier puis creer. */
  function ouvrirValidation(d: DemandeArticle) {
    setIdConsulte(null);
    setIdEdite(null);
    setDemandeEnCours(d);
    setSaisie(saisieDepuisDemande(d));
    setErreur(null);
    setMessage(null);
    preparerAssistance(d.marqueId);
    if (!d.marqueId || !nomsMarques.has(d.marqueId)) {
      setTexteMarque(d.marqueNom);
      setAvisMarque(`Marque « ${d.marqueNom} » inconnue : creez-la d'abord dans le menu Marques, puis choisissez-la ici.`);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function rejeter(d: DemandeArticle) {
    const motif = window.prompt(`Rejeter la demande « ${d.designation} » (${d.ean}) ?\n\nMotif (facultatif) :`, '');
    if (motif === null) return;
    setErreur(null);
    try {
      await cloturerDemande(d, 'rejetee', motif);
      setIdConsulte(null);
      tracer('suppression', 'articles', `Demande d'ajout rejetee : ${d.ean} ${d.designation} (de ${d.demandeurNom})${motif ? ` — ${motif}` : ''}`);
      setMessage(`Demande « ${d.designation} » rejetee.`);
      await chargerDemandes();
    } catch (probleme) {
      setErreur(messageErreurDemande(probleme));
    }
  }

  function ouvrirEdition(article: Article) {
    setIdEdite(article.id);
    setSaisie(versSaisie(article));
    setErreur(null);
    preparerAssistance(article.marqueId);
  }

  function fermerFormulaire() {
    setSaisie(null);
    setIdEdite(null);
    setDemandeEnCours(null);
    setCorrections({});
    setAvisMarque(null);
  }

  /** Marque tapee : exacte, ou corrigee vers la marque existante la plus proche. */
  function validerMarque(texte: string) {
    if (!saisie) return;
    if (!texte.trim()) {
      setSaisie({ ...saisie, marqueId: '' });
      setAvisMarque(null);
      return;
    }
    const m = marqueLaPlusProche(texte, marques);
    if (!m) {
      setSaisie({ ...saisie, marqueId: '' });
      setAvisMarque(
        estAdmin
          ? `Marque « ${texte.trim()} » inconnue : creez-la d'abord dans le menu Marques.`
          : `Marque « ${texte.trim()} » absente de la liste : elle sera signalee a l'administrateur avec votre demande.`,
      );
      return;
    }
    const corrigee = m.nom.toUpperCase() !== texte.trim().toUpperCase();
    setTexteMarque(m.nom);
    setSaisie({ ...saisie, marqueId: m.id });
    setAvisMarque(corrigee ? `Marque corrigee : « ${texte.trim()} » → « ${m.nom} ».` : null);
  }

  /** Correction automatique a la sortie du champ (majuscules sans accents + fautes). */
  function corrigerChamp(champ: 'designation' | 'reference') {
    if (!saisie || !dictionnaire) return;
    const avant = saisie[champ];
    if (!avant.trim()) return;
    // La reference contient surtout des codes : on n'y corrige que les mots de 5 lettres et plus.
    const r = dictionnaire.corriger(avant, champ === 'reference' ? 5 : 4);
    const suite: SaisieArticle = { ...saisie, [champ]: r.texte };
    // Designation connue : on propose sa categorie habituelle (nouvel article seulement).
    if (champ === 'designation' && !idEdite && vocabulaire) {
      const cat = vocabulaire.categorieParDesignation.get(r.texte);
      if (cat) suite.categorie = cat;
    }
    setSaisie(suite);
    setCorrections((c) => ({
      ...c,
      [champ]: r.corrections.length > 0 ? { avant, liste: r.corrections } : undefined,
    }));
  }

  function annulerCorrection(champ: 'designation' | 'reference') {
    const c = corrections[champ];
    if (!saisie || !c) return;
    setSaisie({ ...saisie, [champ]: c.avant });
    setCorrections((x) => ({ ...x, [champ]: undefined }));
  }

  function AvisCorrection({ champ }: { champ: 'designation' | 'reference' }) {
    const c = corrections[champ];
    if (!c) return null;
    return (
      <p className="champ__aide champ__aide--correction">
        Corrige : {c.liste.map((x) => `${x.de} → ${x.vers}`).join(', ')}{' '}
        <button type="button" className="lien-bouton" onClick={() => annulerCorrection(champ)}>
          Annuler
        </button>
      </p>
    );
  }

  function majPicto(index: number, valeur: string) {
    if (!saisie) return;
    const pictos = [...saisie.pictos];
    pictos[index] = valeur;
    setSaisie({ ...saisie, pictos });
  }

  const nbPages = Math.ceil(total / PAR_PAGE);
  const eanSuspect =
    saisie !== null && saisie.ean.trim().length > 0 && !estEan13Valide(saisie.ean);

  return (
    <AppShell
      titre="Catalogue"
      sousTitre={chargement ? 'Chargement…' : `${total} article(s)`}
      actions={
        estAdmin ? (
          <>
            <Link to="/catalogue/import" className="bouton bouton--discret">
              Importer un fichier
            </Link>
            <button type="button" className="bouton bouton--principal" onClick={() => ouvrirCreation()}>
              Nouvel article
            </button>
          </>
        ) : (
          <button type="button" className="bouton bouton--principal" onClick={() => ouvrirCreation()}>
            Demander un nouvel article
          </button>
        )
      }
    >
      {erreur ? (
        <p className="bandeau bandeau--erreur" role="alert">
          {erreur}
        </p>
      ) : null}
      {message ? <p className="bandeau bandeau--succes">{message}</p> : null}

      {saisie ? (
        <section className="carte carte--formulaire">
          <h2 className="carte__titre">
            {idEdite
              ? "Modifier l'article"
              : demandeEnCours
                ? `Valider la demande de ${demandeEnCours.demandeurNom || 'un operateur'}`
                : estAdmin
                  ? 'Nouvel article'
                  : "Demande d'ajout d'un article"}
          </h2>
          {!estAdmin ? (
            <p className="bandeau bandeau--alerte">
              Le catalogue est gere par les administrateurs. Remplissez ce que vous connaissez :
              votre demande leur sera envoyee et l&apos;article sera cree apres verification.
            </p>
          ) : demandeEnCours ? (
            <p className="bandeau bandeau--alerte">
              Verifiez et completez les informations, puis cliquez sur « Creer l&apos;article et
              valider ».
            </p>
          ) : null}

          <div className="grille">
            <div className="champ">
              <label htmlFor="ean">Code article / EAN</label>
              <input
                id="ean"
                type="text"
                inputMode="numeric"
                value={saisie.ean}
                onChange={(e) => setSaisie({ ...saisie, ean: e.target.value })}
                disabled={enregistrement}
              />
              {eanSuspect ? (
                <p className="champ__aide champ__aide--alerte">
                  Ce code n&apos;est pas un EAN-13 valide. Il reste accepte — le catalogue
                  contient des references internes — mais aucun code-barres ne pourra etre
                  genere.
                </p>
              ) : null}
            </div>

            <div className="champ">
              <label htmlFor="marque">Marque</label>
              <input
                id="marque"
                type="text"
                list="liste-marques"
                autoComplete="off"
                placeholder="Tapez ou choisissez…"
                value={texteMarque}
                onChange={(e) => {
                  setTexteMarque(e.target.value);
                  // Choix dans la liste : la marque est reconnue tout de suite.
                  const exacte = marques.find((m) => m.nom.toUpperCase() === e.target.value.trim().toUpperCase());
                  setSaisie({ ...saisie, marqueId: exacte?.id ?? '' });
                  if (exacte) setAvisMarque(null);
                }}
                onBlur={(e) => validerMarque(e.target.value)}
                disabled={enregistrement}
              />
              <datalist id="liste-marques">
                {marques.map((m) => (
                  <option key={m.id} value={m.nom} />
                ))}
              </datalist>
              {avisMarque ? (
                <p className={`champ__aide ${saisie.marqueId ? 'champ__aide--correction' : 'champ__aide--alerte'}`}>
                  {avisMarque}
                </p>
              ) : null}
            </div>

            <div className="champ">
              <label htmlFor="designation">Designation</label>
              <input
                id="designation"
                type="text"
                placeholder="TV LED"
                list="liste-designations"
                autoComplete="off"
                spellCheck
                value={saisie.designation}
                onChange={(e) => setSaisie({ ...saisie, designation: e.target.value })}
                onBlur={() => corrigerChamp('designation')}
                disabled={enregistrement}
              />
              <datalist id="liste-designations">
                {(vocabulaire?.designations ?? []).map((d) => (
                  <option key={d} value={d} />
                ))}
              </datalist>
              <AvisCorrection champ="designation" />
            </div>

            <div className="champ">
              <label htmlFor="categorie">Categorie</label>
              <select
                id="categorie"
                value={saisie.categorie}
                onChange={(e) =>
                  setSaisie({ ...saisie, categorie: e.target.value as CategorieProduit })
                }
                disabled={enregistrement}
              >
                {Object.entries(CATEGORIES).map(([cle, libelle]) => (
                  <option key={cle} value={cle}>
                    {libelle}
                  </option>
                ))}
              </select>
            </div>

            <div className="champ champ--large">
              <label htmlFor="reference">Reference constructeur</label>
              <input
                id="reference"
                type="text"
                placeholder="OLED QA83S85HAEXMV SAMSUNG"
                list="liste-references"
                autoComplete="off"
                value={saisie.reference}
                onChange={(e) => setSaisie({ ...saisie, reference: e.target.value })}
                onBlur={() => corrigerChamp('reference')}
                disabled={enregistrement}
              />
              <datalist id="liste-references">
                {referencesMarque.map((r) => (
                  <option key={r} value={r} />
                ))}
              </datalist>
              <AvisCorrection champ="reference" />
              <p className="champ__aide">
                {saisie.marqueId
                  ? `${referencesMarque.length} reference(s) existante(s) pour cette marque dans la liste.`
                  : 'Choisissez la marque pour voir ses references existantes.'}
              </p>
            </div>
          </div>

          <h3 className="sous-titre">Pictogrammes</h3>
          <p className="carte__texte carte__texte--discret">
            Six emplacements dans l&apos;ordre d&apos;affichage sur l&apos;affiche. Leur contenu
            depend du produit : capacite et classe energetique pour un lave-linge, memoire et
            taille d&apos;ecran pour un smartphone.
          </p>
          <div className="grille grille--pictos">
            {saisie.pictos.map((valeur, index) => (
              <div className="champ" key={index}>
                <label htmlFor={`picto${index}`}>Emplacement {index + 1}</label>
                <input
                  id={`picto${index}`}
                  type="text"
                  placeholder={index === 0 ? '4KUHD' : ''}
                  value={valeur}
                  onChange={(e) => majPicto(index, e.target.value)}
                  disabled={enregistrement}
                />
              </div>
            ))}
          </div>

          <div className="options">
            <label className="case">
              <input
                type="checkbox"
                checked={saisie.actif}
                onChange={(e) => setSaisie({ ...saisie, actif: e.target.checked })}
                disabled={enregistrement}
              />
              Article actif
            </label>
            <label className="case">
              <input
                type="checkbox"
                checked={saisie.livraisonGratuiteExclue}
                onChange={(e) =>
                  setSaisie({ ...saisie, livraisonGratuiteExclue: e.target.checked })
                }
                disabled={enregistrement}
              />
              Exclu de la livraison gratuite
            </label>
          </div>

          <div className="actions-formulaire">
            <button
              type="button"
              className="bouton bouton--principal"
              onClick={enregistrer}
              disabled={enregistrement}
            >
              {enregistrement
                ? 'Enregistrement…'
                : !estAdmin
                  ? 'Envoyer la demande'
                  : demandeEnCours
                    ? "Creer l'article et valider"
                    : 'Enregistrer'}
            </button>
            <button
              type="button"
              className="bouton bouton--discret"
              onClick={fermerFormulaire}
              disabled={enregistrement}
            >
              Annuler
            </button>
          </div>
        </section>
      ) : null}

      {demandes.length > 0 ? (
        <section className="carte carte--demandes">
          <h2 className="carte__titre">
            {estAdmin ? `Demandes d'ajout en attente (${demandes.length})` : 'Mes demandes d\'ajout'}
          </h2>
          <table className="tableau">
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Code</th>
                <th scope="col">Article demande</th>
                <th scope="col">{estAdmin ? 'Demandeur' : 'Statut'}</th>
                {estAdmin ? (
                  <th scope="col">
                    <span className="visually-hidden">Actions</span>
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {demandes.map((d) => (
                <tr key={d.id} className={idConsulte === d.id ? 'est-consultee' : undefined}>
                  <td>{new Date(d.date).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</td>
                  <th scope="row" className="colonne-code">
                    {d.ean}
                  </th>
                  <td>
                    {d.designation}
                    <span className="reference">
                      {[d.marqueNom, d.reference].filter(Boolean).join(' — ')}
                    </span>
                  </td>
                  <td>
                    {estAdmin ? (
                      d.demandeurNom || '—'
                    ) : (
                      <span className={`statut-demande statut-demande--${d.statut}`}>
                        {LIBELLE_STATUT_DEMANDE[d.statut]}
                        {d.motifRejet ? ` : ${d.motifRejet}` : ''}
                      </span>
                    )}
                  </td>
                  {estAdmin ? (
                    <td className="colonne-actions">
                      <button
                        type="button"
                        className="bouton bouton--discret bouton--petit"
                        onClick={() => consulter(d)}
                      >
                        {idConsulte === d.id ? 'Masquer' : 'Consulter'}
                      </button>
                      <button
                        type="button"
                        className="bouton bouton--principal bouton--petit"
                        onClick={() => ouvrirValidation(d)}
                      >
                        Valider
                      </button>
                      <button
                        type="button"
                        className="bouton bouton--danger bouton--petit"
                        onClick={() => void rejeter(d)}
                      >
                        Rejeter
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>

          {(() => {
            const d = estAdmin ? demandes.find((x) => x.id === idConsulte) : undefined;
            return d ? (
              <div id="detail-demande">
                <DetailDemande
                  demande={d}
                  marques={marques}
                  dictionnaire={dictionnaire}
                  surValider={() => ouvrirValidation(d)}
                  surRejeter={() => void rejeter(d)}
                  surFermer={() => setIdConsulte(null)}
                />
              </div>
            ) : null;
          })()}
        </section>
      ) : null}

      <section className="carte">
        <div className="barre-filtres">
          <input
            type="search"
            className="recherche"
            placeholder="Code article ou designation…"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') lancerRecherche();
            }}
          />
          <button type="button" className="bouton bouton--discret" onClick={lancerRecherche}>
            Rechercher
          </button>

          <select
            value={filtreMarque}
            onChange={(e) => {
              setPage(0);
              setFiltreMarque(e.target.value);
            }}
          >
            <option value="">Toutes les marques</option>
            {marques.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nom}
              </option>
            ))}
          </select>

          <select
            value={filtreCategorie}
            onChange={(e) => {
              setPage(0);
              setFiltreCategorie(e.target.value as CategorieProduit | '');
            }}
          >
            <option value="">Toutes les categories</option>
            {Object.entries(CATEGORIES).map(([cle, libelle]) => (
              <option key={cle} value={cle}>
                {libelle}
              </option>
            ))}
          </select>
        </div>

        {chargement ? (
          <p className="carte__texte carte__texte--discret">Chargement du catalogue…</p>
        ) : articles.length === 0 ? (
          <p className="carte__texte carte__texte--discret">
            {total === 0 && !termeApplique
              ? "Le catalogue est vide. L'import des 2 419 articles est prevu a l'etape suivante."
              : 'Aucun article ne correspond a cette recherche.'}
          </p>
        ) : (
          <>
            <table className="tableau tableau--articles">
              <thead>
                <tr>
                  <th scope="col">Code</th>
                  <th scope="col">Designation</th>
                  <th scope="col">Marque</th>
                  <th scope="col">Pictogrammes</th>
                  <th scope="col">
                    <span className="visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {articles.map((article) => (
                  <tr key={article.id} className={article.actif ? undefined : 'est-inactif'}>
                    <th scope="row" className="colonne-code">
                      {article.ean}
                    </th>
                    <td>
                      {article.designation}
                      {article.reference ? (
                        <span className="reference">{article.reference}</span>
                      ) : null}
                    </td>
                    <td>{nomsMarques.get(article.marqueId) ?? '—'}</td>
                    <td>
                      <div className="pastilles">
                        {article.pictos
                          .filter((p) => p.length > 0)
                          .map((p, i) => (
                            <span className="pastille" key={i}>
                              {p}
                            </span>
                          ))}
                      </div>
                    </td>
                    <td className="colonne-actions">
                      {estAdmin ? (
                        <>
                          <button
                            type="button"
                            className="bouton bouton--discret bouton--petit"
                            onClick={() => ouvrirEdition(article)}
                          >
                            Modifier
                          </button>
                          <button
                            type="button"
                            className="bouton bouton--danger bouton--petit"
                            onClick={() => void supprimer(article)}
                          >
                            Supprimer
                          </button>
                        </>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {nbPages > 1 ? (
              <div className="pagination">
                <button
                  type="button"
                  className="bouton bouton--discret bouton--petit"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                >
                  Precedent
                </button>
                <span className="pagination__position">
                  Page {page + 1} sur {nbPages}
                </span>
                <button
                  type="button"
                  className="bouton bouton--discret bouton--petit"
                  onClick={() => setPage((p) => Math.min(nbPages - 1, p + 1))}
                  disabled={page >= nbPages - 1}
                >
                  Suivant
                </button>
              </div>
            ) : null}
          </>
        )}
      </section>
    </AppShell>
  );
}
