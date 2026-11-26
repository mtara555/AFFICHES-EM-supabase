/**
 * AFFICHES-EM v1.0 — Rapport d'activite au format PDF
 *
 * Genere, dans le navigateur, un rapport A4 pour la periode choisie au
 * tableau de bord (jour, semaine, mois, trimestre ou annee) :
 * chiffres cles, comparaison avec la periode precedente, histogramme,
 * detail par heure / jour / mois et repartition par marque.
 *
 * Les donnees viennent des statistiques deja chargees par le tableau de bord :
 * aucune requete supplementaire, et les droits (RLS) restent respectes —
 * un operateur n'obtient que le rapport de ses propres campagnes.
 *
 * jsPDF est charge a la demande : il n'alourdit pas le demarrage de l'application.
 */

import type { jsPDF } from 'jspdf';
import type { Marque } from './marques';
import { compterAffiches, type AfficheResume, type PlageRapport } from './statistiques';

const COULEUR_ELECTRO: RGB = [31, 91, 181];
const COULEUR_NT: RGB = [212, 49, 122];
const ENCRE: RGB = [14, 19, 48];
const ENCRE_DOUCE: RGB = [90, 96, 120];
const TRAIT: RGB = [217, 221, 232];
const FOND_CLAIR: RGB = [243, 245, 250];

type RGB = [number, number, number];

const LARGEUR_PAGE = 210;
const HAUTEUR_PAGE = 297;
const MARGE = 14;
const LARGEUR_UTILE = LARGEUR_PAGE - 2 * MARGE;
const NB_MARQUES_MAX = 20;

export interface DonneesRapport {
  readonly plage: PlageRapport;
  readonly affiches: readonly AfficheResume[];
  readonly marques: readonly Marque[];
  readonly nomUtilisateur: string;
  readonly libelleRole: string;
  /** Un operateur ne voit que ses propres campagnes. */
  readonly estOperateur: boolean;
  readonly nomApplication: string;
}

/** Nombre a la francaise, avec une espace simple (les espaces insecables s'impriment mal en PDF). */
const nombre = (n: number) => n.toLocaleString('fr-FR').replace(/[\u202f\u00a0]/g, ' ');

const deux = (n: number) => String(n).padStart(2, '0');

function dateHeure(d: Date): string {
  const jour = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  return `${jour} a ${deux(d.getHours())}h${deux(d.getMinutes())}`.replace(/[\u202f\u00a0]/g, ' ');
}

/** Retire les caracteres que la police standard du PDF ne sait pas dessiner. */
const texte = (t: string) => t.replace(/[\u202f\u00a0]/g, ' ').replace(/[\u2013\u2014]/g, '-');

function nomFichier(plage: PlageRapport): string {
  const d = plage.debut;
  const date = `${d.getFullYear()}-${deux(d.getMonth() + 1)}-${deux(d.getDate())}`;
  const nom = { jour: 'jour', semaine: 'semaine', mois: 'mois', trimestre: 'trimestre', annee: 'annee' }[plage.type];
  return `rapport-affiches-${nom}-${date}.pdf`;
}

/** Graduations rondes pour l'axe vertical (0, 5, 10… ou 0, 20, 40…). */
function graduations(max: number): number[] {
  if (max <= 0) return [0, 1];
  const brut = max / 4;
  const puissance = 10 ** Math.floor(Math.log10(brut));
  const pas = Math.max(1, Math.round([1, 2, 5, 10].map((m) => m * puissance).find((p) => p >= brut) ?? puissance * 10));
  const liste: number[] = [];
  for (let v = 0; v <= max + pas - 1; v += pas) liste.push(v);
  if (liste[liste.length - 1]! < max) liste.push(liste[liste.length - 1]! + pas);
  return liste;
}

/** Variation en pourcentage, sous forme de texte. */
function variation(actuel: number, precedent: number): string {
  if (precedent === 0) return actuel === 0 ? 'stable' : 'nouveau';
  const pct = Math.round(((actuel - precedent) / precedent) * 100);
  return `${pct > 0 ? '+' : ''}${pct} %`;
}

interface LigneMarque {
  nom: string;
  electro: number;
  nt: number;
}

function repartitionParMarque(
  affiches: readonly AfficheResume[],
  marques: readonly Marque[],
  plage: PlageRapport,
): LigneMarque[] {
  const noms = new Map(marques.map((m) => [m.id, m.nom]));
  const parMarque = new Map<string, LigneMarque>();
  const debut = plage.debut.getTime();
  const fin = plage.fin.getTime();
  for (const a of affiches) {
    if (!a.gabarit || !a.marqueId) continue;
    const t = a.date.getTime();
    if (t < debut || t >= fin) continue;
    let ligne = parMarque.get(a.marqueId);
    if (!ligne) {
      ligne = { nom: noms.get(a.marqueId) ?? 'Marque inconnue', electro: 0, nt: 0 };
      parMarque.set(a.marqueId, ligne);
    }
    if (a.gabarit === 'electro') ligne.electro += 1;
    else ligne.nt += 1;
  }
  return [...parMarque.values()].sort(
    (a, b) => b.electro + b.nt - (a.electro + a.nt) || a.nom.localeCompare(b.nom),
  );
}

/** Construit le document sans le telecharger (utile pour les tests). */
export async function construireRapport(d: DonneesRapport): Promise<jsPDF> {
  const [{ jsPDF: JsPdf }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);

  const { plage } = d;
  const doc = new JsPdf({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  doc.setProperties({
    title: `Rapport d'activite - ${texte(plage.libelle)}`,
    subject: 'Affiches generees',
    author: d.nomUtilisateur,
    creator: d.nomApplication,
  });

  const total = compterAffiches(d.affiches, plage.debut, plage.fin);
  const precedent = compterAffiches(d.affiches, plage.precedente.debut, plage.precedente.fin);
  const sousComptes = plage.sousIntervalles.map((s) => ({
    ...s,
    ...compterAffiches(d.affiches, s.debut, s.fin),
  }));
  const marques = repartitionParMarque(d.affiches, d.marques, plage);

  /* --- En-tete --------------------------------------------------------- */
  doc.setFillColor(...ENCRE);
  doc.rect(0, 0, LARGEUR_PAGE, 30, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text("Rapport d'activité", MARGE, 14);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  doc.text(texte(`Affiches générées — ${plage.libelle}`), MARGE, 22, { maxWidth: LARGEUR_UTILE - 40 });
  doc.setFontSize(9);
  doc.text(texte(d.nomApplication), LARGEUR_PAGE - MARGE, 14, { align: 'right' });

  doc.setTextColor(...ENCRE_DOUCE);
  doc.setFontSize(8.5);
  const perimetre = d.estOperateur ? 'vos campagnes uniquement' : 'toutes les campagnes';
  doc.text(
    texte(`Édité le ${dateHeure(new Date())} par ${d.nomUtilisateur} (${d.libelleRole}) — ${perimetre}`),
    MARGE,
    37,
    { maxWidth: LARGEUR_UTILE },
  );

  /* --- Chiffres cles --------------------------------------------------- */
  const tuiles: { titre: string; valeur: string; detail: string; couleur: RGB }[] = [
    { titre: 'TOTAL', valeur: nombre(total.total), detail: 'affiches sur la période', couleur: ENCRE },
    { titre: 'ELECTRO', valeur: nombre(total.electro), detail: total.total ? `${Math.round((total.electro / total.total) * 100)} % du total` : '-', couleur: COULEUR_ELECTRO },
    { titre: 'IMAGE & SON', valeur: nombre(total.nt), detail: total.total ? `${Math.round((total.nt / total.total) * 100)} % du total` : '-', couleur: COULEUR_NT },
    { titre: 'PÉRIODE PRÉCÉDENTE', valeur: nombre(precedent.total), detail: `Évolution : ${variation(total.total, precedent.total)}`, couleur: ENCRE_DOUCE },
  ];
  const ecartTuile = 4;
  const largeurTuile = (LARGEUR_UTILE - ecartTuile * 3) / 4;
  let y = 43;
  tuiles.forEach((t, i) => {
    const x = MARGE + i * (largeurTuile + ecartTuile);
    doc.setFillColor(...FOND_CLAIR);
    doc.setDrawColor(...TRAIT);
    doc.roundedRect(x, y, largeurTuile, 24, 2, 2, 'FD');
    doc.setFillColor(...t.couleur);
    doc.rect(x, y + 3, 1.2, 18, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...ENCRE_DOUCE);
    doc.text(texte(t.titre), x + 4, y + 6.5);
    doc.setFontSize(17);
    doc.setTextColor(...t.couleur);
    doc.text(texte(t.valeur), x + 4, y + 15);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...ENCRE_DOUCE);
    doc.text(texte(t.detail), x + 4, y + 20.5);
  });
  y += 24 + 9;

  /* --- Histogramme empile --------------------------------------------- */
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...ENCRE);
  doc.text(texte(`RÉPARTITION PAR ${plage.colonne.toUpperCase()}`), MARGE, y);
  // Legende
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setFillColor(...COULEUR_ELECTRO);
  doc.rect(LARGEUR_PAGE - MARGE - 62, y - 2.6, 3, 3, 'F');
  doc.setTextColor(...ENCRE_DOUCE);
  doc.text('Electro', LARGEUR_PAGE - MARGE - 58, y);
  doc.setFillColor(...COULEUR_NT);
  doc.rect(LARGEUR_PAGE - MARGE - 38, y - 2.6, 3, 3, 'F');
  doc.text('Image & Son', LARGEUR_PAGE - MARGE - 34, y);
  y += 4;

  const hauteurGraphique = 52;
  const gauche = MARGE + 8;
  const largeurGraphique = LARGEUR_UTILE - 8;
  const bas = y + hauteurGraphique;
  const maxValeur = Math.max(0, ...sousComptes.map((s) => s.total));
  const ticks = graduations(maxValeur);
  const maxAxe = ticks[ticks.length - 1] ?? 1;

  doc.setDrawColor(...TRAIT);
  doc.setLineWidth(0.15);
  doc.setFontSize(7);
  doc.setTextColor(...ENCRE_DOUCE);
  for (const v of ticks) {
    const yy = bas - (v / maxAxe) * hauteurGraphique;
    doc.line(gauche, yy, gauche + largeurGraphique, yy);
    doc.text(String(v), gauche - 1.5, yy + 1, { align: 'right' });
  }

  const n = sousComptes.length;
  const pas = largeurGraphique / n;
  const largeurBarre = Math.min(pas * 0.7, 12);
  // Une etiquette sur deux, sur trois… pour ne jamais se chevaucher.
  const cadence = n > 24 ? 3 : n > 12 ? 2 : 1;
  sousComptes.forEach((s, i) => {
    const x = gauche + i * pas + (pas - largeurBarre) / 2;
    const hE = (s.electro / maxAxe) * hauteurGraphique;
    const hN = (s.nt / maxAxe) * hauteurGraphique;
    if (hE > 0) {
      doc.setFillColor(...COULEUR_ELECTRO);
      doc.rect(x, bas - hE, largeurBarre, hE, 'F');
    }
    if (hN > 0) {
      doc.setFillColor(...COULEUR_NT);
      doc.rect(x, bas - hE - hN, largeurBarre, hN, 'F');
    }
    if (i % cadence === 0) {
      doc.setFontSize(n > 12 ? 6 : 7);
      doc.setTextColor(...ENCRE_DOUCE);
      doc.text(texte(s.libelle), x + largeurBarre / 2, bas + 4, { align: 'center' });
    }
  });
  doc.setDrawColor(...ENCRE_DOUCE);
  doc.setLineWidth(0.3);
  doc.line(gauche, bas, gauche + largeurGraphique, bas);
  y = bas + 11;

  /* --- Detail par sous-periode ---------------------------------------- */
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...ENCRE);
  doc.text(texte(`DÉTAIL PAR ${plage.colonne.toUpperCase()}`), MARGE, y);

  const enTeteTableau = {
    fillColor: ENCRE,
    textColor: [255, 255, 255] as RGB,
    fontStyle: 'bold' as const,
    fontSize: 8.5,
  };
  const styleCommun = { fontSize: 8.5, cellPadding: 1.8, textColor: ENCRE, lineColor: TRAIT, lineWidth: 0.1 };

  autoTable(doc, {
    startY: y + 2.5,
    margin: { left: MARGE, right: MARGE, bottom: 16 },
    head: [[plage.colonne, 'Electro', 'Image & Son', 'Total']],
    body: sousComptes.map((s) => [texte(s.libelle), nombre(s.electro), nombre(s.nt), nombre(s.total)]),
    foot: [
      [
        'Total',
        { content: nombre(total.electro), styles: { halign: 'right' } },
        { content: nombre(total.nt), styles: { halign: 'right' } },
        { content: nombre(total.total), styles: { halign: 'right' } },
      ],
    ],
    theme: 'grid',
    styles: styleCommun,
    headStyles: enTeteTableau,
    footStyles: { fillColor: FOND_CLAIR, textColor: ENCRE, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [250, 251, 253] },
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { halign: 'right', cellWidth: 32 },
      2: { halign: 'right', cellWidth: 32 },
      3: { halign: 'right', cellWidth: 32, fontStyle: 'bold' },
    },
    showFoot: 'lastPage',
  });

  /* --- Repartition par marque ----------------------------------------- */
  const apresDetail = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  let yMarques = apresDetail + 10;
  if (yMarques > HAUTEUR_PAGE - 50) {
    doc.addPage();
    yMarques = 20;
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...ENCRE);
  doc.text('AFFICHES PAR MARQUE', MARGE, yMarques);

  if (marques.length === 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...ENCRE_DOUCE);
    doc.text('Aucune affiche générée sur cette période.', MARGE, yMarques + 6);
  } else {
    const visibles = marques.slice(0, NB_MARQUES_MAX);
    const autres = marques.slice(NB_MARQUES_MAX);
    const corps = visibles.map((m) => {
      const t = m.electro + m.nt;
      return [texte(m.nom), nombre(m.electro), nombre(m.nt), nombre(t), total.total ? `${Math.round((t / total.total) * 100)} %` : '-'];
    });
    if (autres.length > 0) {
      const e = autres.reduce((s, m) => s + m.electro, 0);
      const nt = autres.reduce((s, m) => s + m.nt, 0);
      corps.push([`${autres.length} autres marques`, nombre(e), nombre(nt), nombre(e + nt), total.total ? `${Math.round(((e + nt) / total.total) * 100)} %` : '-']);
    }
    autoTable(doc, {
      startY: yMarques + 2.5,
      margin: { left: MARGE, right: MARGE, bottom: 16 },
      head: [['Marque', 'Electro', 'Image & Son', 'Total', 'Part']],
      body: corps,
      theme: 'grid',
      styles: styleCommun,
      headStyles: enTeteTableau,
      alternateRowStyles: { fillColor: [250, 251, 253] },
      columnStyles: {
        0: { cellWidth: 'auto' },
        1: { halign: 'right', cellWidth: 28 },
        2: { halign: 'right', cellWidth: 28 },
        3: { halign: 'right', cellWidth: 28, fontStyle: 'bold' },
        4: { halign: 'right', cellWidth: 22 },
      },
    });
  }

  const sansArticle = d.affiches.filter((a) => {
    const t = a.date.getTime();
    return !a.gabarit && t >= plage.debut.getTime() && t < plage.fin.getTime();
  }).length;
  if (sansArticle > 0) {
    const yNote = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? yMarques + 10;
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7.5);
    doc.setTextColor(...ENCRE_DOUCE);
    doc.text(
      `${sansArticle} affiche(s) non comptée(s) : leur code n'existe plus au catalogue.`,
      MARGE,
      Math.min(yNote + 6, HAUTEUR_PAGE - 14),
    );
  }

  /* --- Pied de page sur chaque page ----------------------------------- */
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setDrawColor(...TRAIT);
    doc.setLineWidth(0.2);
    doc.line(MARGE, HAUTEUR_PAGE - 11, LARGEUR_PAGE - MARGE, HAUTEUR_PAGE - 11);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...ENCRE_DOUCE);
    doc.text(texte(`${d.nomApplication} — ${plage.libelle}`), MARGE, HAUTEUR_PAGE - 6.5);
    doc.text(`Page ${p} / ${pages}`, LARGEUR_PAGE - MARGE, HAUTEUR_PAGE - 6.5, { align: 'right' });
  }

  return doc;
}

/** Construit le rapport et le telecharge. Renvoie le nom du fichier. */
export async function genererRapportPdf(d: DonneesRapport): Promise<string> {
  const doc = await construireRapport(d);
  const fichier = nomFichier(d.plage);
  doc.save(fichier);
  return fichier;
}
