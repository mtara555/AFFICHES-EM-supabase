import { useEffect, useId, useRef, useState } from 'react';
import {
  ajouterDesignationArabe,
  chercherDesignationsArabes,
  normaliserArabe,
  validerArabe,
  type DesignationArabe,
} from '../lib/designations-arabes';
import './ChampDesignationArabe.css';

interface ChampDesignationArabeProps {
  readonly valeur: string;
  readonly surChangement: (valeur: string) => void;
  /** Designation francaise de l'article : sert a proposer la traduction habituelle. */
  readonly designationFr?: string;
  /** Vrai pour un administrateur : peut creer une entree du referentiel. */
  readonly peutCreer: boolean;
  readonly desactive?: boolean;
  readonly id?: string;
}

const DELAI_MS = 250;

/**
 * Liste deroulante EDITABLE de la designation arabe (ComboBox).
 *
 * - selection d'une designation existante du referentiel `designations_arabes` ;
 * - saisie libre d'une nouvelle designation ;
 * - option « + Ajouter » qui cree l'entree dans le referentiel (administrateur) ;
 * - recherche asynchrone limitee a 20 resultats : reste fluide avec un
 *   referentiel volumineux ;
 * - champ RTL (dir="rtl", lang="ar"), clavier : fleches, Entree, Echap.
 *
 * Le composant ne contient aucune regle metier : la validation est celle de
 * `validerArabe` (lib/designations-arabes.ts).
 */
export function ChampDesignationArabe({
  valeur,
  surChangement,
  designationFr = '',
  peutCreer,
  desactive = false,
  id,
}: ChampDesignationArabeProps) {
  const idAuto = useId();
  const idChamp = id ?? `ar-${idAuto}`;
  const idListe = `${idChamp}-liste`;

  const [ouvert, setOuvert] = useState(false);
  const [suggestions, setSuggestions] = useState<DesignationArabe[]>([]);
  const [actif, setActif] = useState(-1);
  const [chargement, setChargement] = useState(false);
  const [problemeListe, setProblemeListe] = useState<string | null>(null);
  const [creation, setCreation] = useState(false);
  const conteneur = useRef<HTMLDivElement>(null);
  const numeroRequete = useRef(0);

  const texte = normaliserArabe(valeur);
  const probleme = validerArabe(valeur);
  const existeDeja = suggestions.some((s) => s.libelleAr === texte);
  // Ligne d'action finale : creer (admin) ou simplement utiliser la saisie libre.
  const ligneAjout = texte !== '' && probleme === null && !existeDeja;
  const nbLignes = suggestions.length + (ligneAjout ? 1 : 0);

  // Recherche asynchrone avec delai : seule la derniere requete est prise en compte.
  useEffect(() => {
    if (!ouvert) return;
    const numero = ++numeroRequete.current;
    setChargement(true);
    const minuteur = setTimeout(() => {
      chercherDesignationsArabes(valeur, designationFr)
        .then((liste) => {
          if (numero !== numeroRequete.current) return;
          setSuggestions(liste);
          setProblemeListe(null);
          setActif(-1);
        })
        .catch(() => {
          if (numero === numeroRequete.current) {
            setSuggestions([]);
            setProblemeListe('Liste indisponible : la saisie libre reste possible.');
          }
        })
        .finally(() => {
          if (numero === numeroRequete.current) setChargement(false);
        });
    }, DELAI_MS);
    return () => clearTimeout(minuteur);
  }, [valeur, designationFr, ouvert]);

  // Fermeture au clic hors du composant.
  useEffect(() => {
    if (!ouvert) return;
    const surClic = (e: MouseEvent) => {
      if (conteneur.current && !conteneur.current.contains(e.target as Node)) setOuvert(false);
    };
    document.addEventListener('mousedown', surClic);
    return () => document.removeEventListener('mousedown', surClic);
  }, [ouvert]);

  function choisir(libelle: string) {
    surChangement(libelle);
    setOuvert(false);
  }

  async function ajouterAuReferentiel() {
    if (!ligneAjout) return;
    if (!peutCreer) {
      // Operateur : saisie libre uniquement, l'administrateur completera le referentiel.
      choisir(texte);
      return;
    }
    setCreation(true);
    try {
      await ajouterDesignationArabe(texte, designationFr);
      choisir(texte);
    } catch {
      setProblemeListe("Ajout au referentiel impossible. La valeur reste utilisable pour l'article.");
    } finally {
      setCreation(false);
    }
  }

  function activer(index: number) {
    if (index < suggestions.length) {
      const s = suggestions[index];
      if (s) choisir(s.libelleAr);
    } else {
      void ajouterAuReferentiel();
    }
  }

  function surTouche(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOuvert(true);
      setActif((i) => (nbLignes === 0 ? -1 : (i + 1) % nbLignes));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActif((i) => (nbLignes === 0 ? -1 : (i <= 0 ? nbLignes - 1 : i - 1)));
    } else if (e.key === 'Enter' && ouvert && actif >= 0) {
      e.preventDefault();
      activer(actif);
    } else if (e.key === 'Escape') {
      setOuvert(false);
    }
  }

  return (
    <div className="champ-arabe" ref={conteneur}>
      <input
        id={idChamp}
        type="text"
        dir="rtl"
        lang="ar"
        className="champ-arabe__saisie texte-arabe"
        placeholder="الاسم العربي"
        autoComplete="off"
        role="combobox"
        aria-expanded={ouvert}
        aria-controls={idListe}
        aria-autocomplete="list"
        aria-invalid={probleme !== null}
        aria-activedescendant={actif >= 0 ? `${idChamp}-opt-${actif}` : undefined}
        maxLength={160}
        value={valeur}
        disabled={desactive}
        onChange={(e) => {
          surChangement(e.target.value);
          setOuvert(true);
        }}
        onFocus={() => setOuvert(true)}
        onBlur={() => {
          // Nettoyage a la sortie du champ (espaces, marques de direction).
          const propre = normaliserArabe(valeur);
          if (propre !== valeur) surChangement(propre);
        }}
        onKeyDown={surTouche}
      />

      {ouvert ? (
        <ul id={idListe} role="listbox" className="champ-arabe__liste">
          {suggestions.map((s, i) => (
            <li
              key={s.id}
              id={`${idChamp}-opt-${i}`}
              role="option"
              aria-selected={i === actif}
              className={`champ-arabe__option${i === actif ? ' est-actif' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault();
                choisir(s.libelleAr);
              }}
            >
              <span dir="rtl" lang="ar" className="texte-arabe champ-arabe__ar">
                {s.libelleAr}
              </span>
              {s.libelleFr ? <span className="champ-arabe__fr">{s.libelleFr}</span> : null}
            </li>
          ))}

          {ligneAjout ? (
            <li
              id={`${idChamp}-opt-${suggestions.length}`}
              role="option"
              aria-selected={actif === suggestions.length}
              className={`champ-arabe__option champ-arabe__option--ajout${actif === suggestions.length ? ' est-actif' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault();
                void ajouterAuReferentiel();
              }}
            >
              {creation ? 'Ajout…' : peutCreer ? '+ Ajouter une nouvelle designation : ' : 'Utiliser : '}
              <span dir="rtl" lang="ar" className="texte-arabe">
                {texte}
              </span>
            </li>
          ) : null}

          {!chargement && nbLignes === 0 ? (
            <li className="champ-arabe__vide" role="presentation">
              Aucune designation dans le referentiel.
            </li>
          ) : null}
          {chargement ? (
            <li className="champ-arabe__vide" role="presentation">
              Recherche…
            </li>
          ) : null}
        </ul>
      ) : null}

      {probleme ? (
        <p className="champ__aide champ__aide--alerte" role="alert">
          {probleme}
        </p>
      ) : null}
      {problemeListe ? <p className="champ__aide">{problemeListe}</p> : null}
    </div>
  );
}
