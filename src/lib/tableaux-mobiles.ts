/**
 * AFFICHES-EM v1.0 — Tableaux lisibles sur telephone
 *
 * Sur un ecran etroit, chaque ligne de tableau s'affiche en fiche (voir
 * styles/mobile.css) : l'en-tete disparait, et chaque cellule doit donc porter
 * son propre titre. Plutot que de l'ecrire a la main dans chaque page, on le
 * recopie automatiquement depuis l'en-tete du tableau (attribut data-label),
 * y compris pour les lignes ajoutees apres coup.
 */

export function etiqueterTableaux(racine: ParentNode = document): void {
  racine.querySelectorAll<HTMLTableElement>('table.tableau').forEach((table) => {
    const titres = Array.from(table.querySelectorAll('thead th')).map(
      (th) => th.textContent?.trim() ?? '',
    );
    if (titres.length === 0) return;
    table.querySelectorAll('tbody tr').forEach((ligne) => {
      Array.from(ligne.children).forEach((cellule, i) => {
        const titre = titres[i];
        if (titre && cellule.getAttribute('data-label') !== titre) {
          cellule.setAttribute('data-label', titre);
        }
      });
    });
  });
}

/** Etiquette les tableaux presents et a venir. A appeler une fois au demarrage. */
export function installerTableauxMobiles(): void {
  let prevu = false;
  const observateur = new MutationObserver(() => {
    if (prevu) return;
    prevu = true;
    requestAnimationFrame(() => {
      prevu = false;
      etiqueterTableaux();
    });
  });
  // Seuls les ajouts de noeuds sont observes : poser data-label ne relance rien.
  observateur.observe(document.body, { childList: true, subtree: true });
  etiqueterTableaux();
}
