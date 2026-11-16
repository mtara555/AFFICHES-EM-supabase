import { useRef, useState } from 'react';
import { listerCorrespondancesArabe, messageErreurArticle } from '../lib/articles';
import {
  analyserArabe,
  appliquerMisesAJour,
  lireFichierArabe,
  type AnalyseArabe,
  type ResultatApplication,
} from '../lib/import-arabe';
import { tracer } from '../lib/journal';
import './ImportDesignationsArabes.css';

interface Props {
  /** Appele apres une mise a jour reussie, pour recharger la liste. */
  readonly surTermine: () => void;
  readonly surFermer: () => void;
}

const MODELE = `${import.meta.env.BASE_URL}modeles/modele-import-designations-arabes.xlsx`;

/**
 * Panneau de l'ecran Catalogue : met a jour la designation arabe d'articles
 * EXISTANTS depuis un fichier a deux colonnes (code article, designation arabe).
 * Etapes : choisir le fichier -> analyse (rien n'est ecrit) -> appliquer.
 */
export function ImportDesignationsArabes({ surTermine, surFermer }: Props) {
  const champFichier = useRef<HTMLInputElement>(null);
  const arret = useRef(false);
  const [nomFichier, setNomFichier] = useState('');
  const [analyse, setAnalyse] = useState<AnalyseArabe | null>(null);
  const [occupe, setOccupe] = useState(false);
  const [progression, setProgression] = useState<[number, number] | null>(null);
  const [resultat, setResultat] = useState<ResultatApplication | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  async function choisirFichier(fichier: File) {
    setErreur(null);
    setResultat(null);
    setAnalyse(null);
    setNomFichier(fichier.name);
    setOccupe(true);
    try {
      const lignes = lireFichierArabe(await fichier.arrayBuffer(), fichier.name);
      if (lignes.length === 0) {
        setErreur('Aucune ligne exploitable : colonne A = code article, colonne B = designation arabe.');
        return;
      }
      setAnalyse(analyserArabe(lignes, await listerCorrespondancesArabe()));
    } catch (probleme) {
      setErreur(`Lecture impossible : ${messageErreurArticle(probleme)}`);
    } finally {
      setOccupe(false);
    }
  }

  async function appliquer() {
    if (!analyse || analyse.aMettreAJour.length === 0) return;
    arret.current = false;
    setOccupe(true);
    setErreur(null);
    setProgression([0, analyse.aMettreAJour.length]);
    try {
      const res = await appliquerMisesAJour(analyse.aMettreAJour, (f, t) => setProgression([f, t]), arret);
      setResultat(res);
      tracer(
        'modification',
        'articles',
        `Import des designations arabes (${nomFichier}) : ${res.reussies} article(s) mis a jour, ${res.erreurs.length} erreur(s)`,
      );
      setAnalyse(null);
      surTermine();
    } catch (probleme) {
      setErreur(messageErreurArticle(probleme));
    } finally {
      setOccupe(false);
      setProgression(null);
    }
  }

  const liste = (titre: string, lignes: string[], ouvert = false) =>
    lignes.length > 0 ? (
      <details className="import-arabe__detail" open={ouvert}>
        <summary>{titre}</summary>
        <ul>
          {lignes.slice(0, 20).map((l) => (
            <li key={l}>{l}</li>
          ))}
          {lignes.length > 20 ? <li>… et {lignes.length - 20} autre(s)</li> : null}
        </ul>
      </details>
    ) : null;

  return (
    <section className="carte import-arabe">
      <div className="import-arabe__entete">
        <h2>Mettre a jour les designations arabes</h2>
        <button type="button" className="bouton bouton--discret" onClick={surFermer} disabled={occupe}>
          Fermer
        </button>
      </div>

      <p className="import-arabe__aide">
        Fichier Excel (.xlsx) ou CSV a <strong>deux colonnes</strong> : <strong>A = code article</strong>,{' '}
        <strong>B = designation arabe</strong>. Seuls les articles <strong>deja au catalogue</strong> sont modifies ;
        une cellule arabe vide n&apos;efface rien. Rien n&apos;est enregistre avant votre confirmation.{' '}
        <a href={MODELE} download>
          Telecharger le modele
        </a>
        .
      </p>

      <input
        ref={champFichier}
        type="file"
        accept=".xlsx,.xls,.csv"
        disabled={occupe}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void choisirFichier(f);
          e.target.value = '';
        }}
      />

      {erreur ? (
        <p className="import-arabe__erreur" role="alert">
          {erreur}
        </p>
      ) : null}

      {analyse ? (
        <div className="import-arabe__analyse">
          <p>
            <strong>{nomFichier}</strong> : {analyse.lignesLues} ligne(s) lue(s).
          </p>
          <ul className="import-arabe__bilan">
            <li>
              <strong>{analyse.nbAjouts}</strong> designation(s) arabe(s) a ajouter
            </li>
            <li>
              <strong>{analyse.nbRemplacements}</strong> a remplacer
            </li>
            <li>{analyse.inchanges} deja identique(s)</li>
            <li>{analyse.introuvables.length} code(s) introuvable(s) — ignores</li>
            <li>{analyse.vides.length} cellule(s) arabe(s) vide(s) — ignorees</li>
            <li>{analyse.invalides.length} valeur(s) refusee(s)</li>
          </ul>

          {liste(
            'Apercu des modifications',
            analyse.aMettreAJour.slice(0, 20).map(
              (m) => `${m.code} — ${m.designation} : ${m.ancien ? `« ${m.ancien} » → ` : ''}« ${m.nouveau} »`,
            ),
            true,
          )}
          {liste('Codes introuvables au catalogue', analyse.introuvables.map((x) => `Ligne ${x.numero} : ${x.code}`))}
          {liste(
            'Valeurs refusees',
            analyse.invalides.map((x) => `Ligne ${x.numero} (${x.code}) : « ${x.valeur} » — ${x.raison}`),
            true,
          )}
          {liste(
            'Codes en double (la derniere ligne est retenue)',
            analyse.doublons.map((d) => `${d.code} : lignes ${d.lignes.join(', ')}`),
          )}

          <button
            type="button"
            className="bouton bouton--principal"
            disabled={occupe || analyse.aMettreAJour.length === 0}
            onClick={() => void appliquer()}
          >
            {analyse.aMettreAJour.length === 0
              ? 'Rien a modifier'
              : `Appliquer ${analyse.aMettreAJour.length} modification(s)`}
          </button>
        </div>
      ) : null}

      {progression ? (
        <p className="import-arabe__aide">
          <progress value={progression[0]} max={progression[1]} /> {progression[0]} / {progression[1]}
        </p>
      ) : null}

      {resultat ? (
        <div className="import-arabe__resultat" role="status">
          <p>
            <strong>{resultat.reussies}</strong> article(s) mis a jour
            {resultat.ajoutsReferentiel > 0
              ? `, ${resultat.ajoutsReferentiel} designation(s) ajoutee(s) a la liste deroulante`
              : ''}
            {resultat.erreurs.length > 0 ? `, ${resultat.erreurs.length} erreur(s).` : '.'}
          </p>
          {liste('Erreurs', resultat.erreurs.map((e) => `${e.code} : ${e.message}`), true)}
        </div>
      ) : null}
    </section>
  );
}
