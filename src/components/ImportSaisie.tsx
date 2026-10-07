import { useMemo, useState } from 'react';
import { ajouterAffiche, messageErreurCampagne } from '../lib/campagnes';
import { formaterMontant } from '../lib/regles';
import {
  lireFichierPrix,
  telechargerModele,
  verifierCodes,
  type LigneImport,
} from '../lib/import-saisie';
import type { FormatAffiche } from '../config/constants';
import { tracer } from '../lib/journal';

interface ImportSaisieProps {
  readonly campagneId: string;
  readonly userId: string;
  /** Nombre d'affiches deja presentes : les nouvelles se placent apres. */
  readonly ordreDepart: number;
  readonly format: FormatAffiche;
  /** Codes deja presents dans la campagne. */
  readonly codesExistants: ReadonlySet<string>;
  readonly nomsMarques: ReadonlyMap<string, string>;
  readonly surTermine: () => Promise<void>;
}

type Etat = 'ok' | 'avertissement' | 'ignore' | 'erreur';

interface LigneAffichee extends LigneImport {
  readonly etat: Etat;
  readonly motif: string | null;
}

/**
 * Import d'un fichier Excel ou CSV dans la campagne :
 * A = code article, B = prix barre, C = prix de vente.
 *
 * Trois temps : lecture du fichier, verification des codes dans le catalogue,
 * puis ajout apres relecture par l'operateur. Rien n'est ecrit avant la
 * confirmation.
 */
export function ImportSaisie({
  campagneId,
  userId,
  ordreDepart,
  format,
  codesExistants,
  nomsMarques,
  surTermine,
}: ImportSaisieProps) {
  const [nomFichier, setNomFichier] = useState<string | null>(null);
  const [lignes, setLignes] = useState<LigneImport[] | null>(null);
  const [progression, setProgression] = useState<{ libelle: string; faits: number; total: number } | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [bilan, setBilan] = useState<string | null>(null);

  /** Etat final de chaque ligne : erreurs, doublons et codes deja presents. */
  const affichees = useMemo<LigneAffichee[]>(() => {
    if (!lignes) return [];
    const vus = new Set<string>();
    return lignes.map((l) => {
      let etat: Etat = 'ok';
      let motif: string | null = null;
      if (l.probleme) {
        etat = 'erreur';
        motif = l.probleme;
      } else if (vus.has(l.code)) {
        etat = 'ignore';
        motif = 'En double dans le fichier';
      } else if (codesExistants.has(l.code)) {
        etat = 'ignore';
        motif = 'Deja dans la campagne';
      } else if (l.avertissement) {
        etat = 'avertissement';
        motif = l.avertissement;
      }
      vus.add(l.code);
      return { ...l, etat, motif };
    });
  }, [lignes, codesExistants]);

  const aAjouter = affichees.filter((l) => l.etat === 'ok' || l.etat === 'avertissement');
  const nbErreurs = affichees.filter((l) => l.etat === 'erreur').length;
  const nbIgnores = affichees.filter((l) => l.etat === 'ignore').length;

  async function choisirFichier(fichier: File | undefined) {
    if (!fichier) return;
    setErreur(null);
    setBilan(null);
    setLignes(null);
    setNomFichier(fichier.name);
    try {
      const lues = lireFichierPrix(await fichier.arrayBuffer());
      if (lues.length === 0) {
        setErreur('Aucune ligne exploitable : la colonne A (code article) est vide.');
        return;
      }
      setProgression({ libelle: 'Verification des codes', faits: 0, total: lues.length });
      const verifiees = await verifierCodes(lues, (faits, total) =>
        setProgression({ libelle: 'Verification des codes', faits, total }),
      );
      setLignes(verifiees);
    } catch (probleme) {
      setErreur(
        probleme instanceof Error && /zip|file|sheet/i.test(probleme.message)
          ? 'Fichier illisible. Enregistrez-le au format .xlsx ou .csv et reessayez.'
          : messageErreurCampagne(probleme),
      );
    } finally {
      setProgression(null);
    }
  }

  async function importer() {
    const liste = aAjouter;
    if (liste.length === 0) return;
    setErreur(null);
    const echecs: string[] = [];
    for (const [i, l] of liste.entries()) {
      setProgression({ libelle: 'Ajout des affiches', faits: i, total: liste.length });
      try {
        await ajouterAffiche(
          campagneId,
          {
            ean: l.article?.ean ?? l.code,
            prixBarre: l.prixBarre,
            prixPrincipal: l.prixPrincipal,
            format,
            stockLimite: false,
            nouveaute: false,
            promotion: false,
          },
          ordreDepart + i - echecs.length,
          userId,
        );
      } catch (probleme) {
        echecs.push(`${l.code} (${messageErreurCampagne(probleme)})`);
      }
    }
    setProgression(null);
    tracer('creation', 'affiches', `Import d'un fichier de prix : ${liste.length - echecs.length} affiche(s) ajoutee(s)${echecs.length ? `, ${echecs.length} echec(s)` : ''} (campagne ${campagneId})`);
    const nonTrouves = affichees.filter((l) => l.motif === 'Code absent du catalogue').map((l) => l.code);
    setBilan(
      [
        `${liste.length - echecs.length} affiche(s) ajoutee(s).`,
        nonTrouves.length > 0
          ? `Codes absents du catalogue, non importes : ${nonTrouves.join(', ')}.`
          : null,
      ]
        .filter(Boolean)
        .join(' '),
    );
    if (echecs.length > 0) setErreur(`Echecs : ${echecs.join(' ; ')}`);
    setLignes(null);
    setNomFichier(null);
    await surTermine();
  }

  function annuler() {
    setLignes(null);
    setNomFichier(null);
    setErreur(null);
  }

  return (
    <section className="carte">
      <div className="carte__entete">
        <h2 className="carte__titre">Importer un fichier de prix</h2>
        <button type="button" className="bouton bouton--discret bouton--petit" onClick={telechargerModele}>
          Telecharger le modele
        </button>
      </div>

      {bilan ? <p className="bandeau bandeau--succes">{bilan}</p> : null}
      {erreur ? (
        <p className="bandeau bandeau--erreur" role="alert">
          {erreur}
        </p>
      ) : null}

      {!lignes ? (
        <div className="import-saisie__depart">
          <p className="carte__texte">
            Fichier Excel (.xlsx, .xls) ou CSV : <strong>colonne A</strong> code article,{' '}
            <strong>colonne B</strong> prix barre (facultatif), <strong>colonne C</strong> prix de
            vente. La ligne de titres est ignoree. Les affiches sont ajoutees au format{' '}
            <strong>{format}</strong>.
          </p>
          <label className={`bouton bouton--principal${progression ? ' est-desactive' : ''}`}>
            {progression ? 'Lecture…' : 'Choisir un fichier…'}
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              className="visually-hidden"
              disabled={progression !== null}
              onChange={(e) => {
                void choisirFichier(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </label>
        </div>
      ) : (
        <>
          <p className="carte__texte">
            <strong>{nomFichier}</strong> — {affichees.length} ligne(s) :{' '}
            <span className="etiquette etiquette--ok">{aAjouter.length} a ajouter</span>{' '}
            {nbErreurs > 0 ? <span className="etiquette etiquette--inactive">{nbErreurs} en erreur</span> : null}{' '}
            {nbIgnores > 0 ? <span className="etiquette">{nbIgnores} ignoree(s)</span> : null}
          </p>

          <div className="tableau-defilant import-saisie__tableau">
            <table className="tableau">
              <thead>
                <tr>
                  <th scope="col">Ligne</th>
                  <th scope="col">Code</th>
                  <th scope="col">Article</th>
                  <th scope="col">Prix barre</th>
                  <th scope="col">Prix de vente</th>
                  <th scope="col">Etat</th>
                </tr>
              </thead>
              <tbody>
                {affichees.map((l) => (
                  <tr key={`${l.numero}-${l.code}`} className={`import-saisie__ligne--${l.etat}`}>
                    <td className="colonne-prix">{l.numero}</td>
                    <th scope="row" className="colonne-code">
                      {l.code}
                    </th>
                    <td>
                      {l.article ? (
                        <>
                          <span className="import-saisie__marque">
                            {nomsMarques.get(l.article.marqueId) ?? ''}
                          </span>{' '}
                          {l.article.designation}
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="colonne-prix">{l.prixBarre > 0 ? formaterMontant(l.prixBarre) : '—'}</td>
                    <td className="colonne-prix colonne-prix--fort">
                      {l.prixPrincipal > 0 ? formaterMontant(l.prixPrincipal) : '—'}
                    </td>
                    <td>
                      {l.etat === 'ok' ? (
                        <span className="etiquette etiquette--ok">A ajouter</span>
                      ) : l.etat === 'avertissement' ? (
                        <span className="etiquette etiquette--alerte" title={l.motif ?? ''}>
                          A ajouter — {l.motif}
                        </span>
                      ) : l.etat === 'ignore' ? (
                        <span className="etiquette">{l.motif}</span>
                      ) : (
                        <span className="etiquette etiquette--inactive">{l.motif}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {progression ? (
            <div className="progression">
              <div
                className="progression__barre"
                style={{ width: `${(progression.faits / Math.max(1, progression.total)) * 100}%` }}
              />
              <span className="progression__texte">
                {progression.libelle} {progression.faits} / {progression.total}
              </span>
            </div>
          ) : (
            <div className="actions-formulaire">
              <button
                type="button"
                className="bouton bouton--principal"
                onClick={() => void importer()}
                disabled={aAjouter.length === 0}
              >
                Ajouter {aAjouter.length} affiche(s) a la campagne
              </button>
              <button type="button" className="bouton bouton--discret" onClick={annuler}>
                Annuler
              </button>
            </div>
          )}
        </>
      )}

      {progression && !lignes ? (
        <div className="progression">
          <div
            className="progression__barre"
            style={{ width: `${(progression.faits / Math.max(1, progression.total)) * 100}%` }}
          />
          <span className="progression__texte">
            {progression.libelle} {progression.faits} / {progression.total}
          </span>
        </div>
      ) : null}
    </section>
  );
}
