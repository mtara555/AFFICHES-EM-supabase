/**
 * Genere public/modeles/modele-import-catalogue.xlsx : le modele telechargeable
 * de l'import du catalogue, avec la colonne « Designation arabe » (K).
 *
 *   node scripts/generer-modele-import.mjs
 *
 * La feuille 1 est celle lue par l'import ; la feuille 2 n'est qu'une notice.
 */
import * as XLSX from 'xlsx';
import { mkdirSync, writeFileSync } from 'node:fs';

const entetes = [
  'Code article', 'Marque', 'Designation', 'Reference',
  'Picto 1', 'Picto 2', 'Picto 3', 'Picto 4', 'Picto 5', 'Picto 6',
  'Designation arabe (الاسم العربي)',
];
const exemples = [
  ['8003437000001', 'WHIRLPOOL', 'LAVANTE SÉCHANTE', 'FWDD117168SBS', '11KG', 'A+++', 'SILVER', '1600T', '1AN', '', 'غسالة ومجففة'],
  ['8003437000002', 'WHIRLPOOL', 'RÉFRIGÉRATEUR', 'W7X82OOX', 'NOFROST', 'A++', '', '', '2ANS', '', ''],
];

const feuille = XLSX.utils.aoa_to_sheet([entetes, ...exemples]);
feuille['!cols'] = [18, 14, 22, 20, 9, 9, 9, 9, 9, 9, 34].map((wch) => ({ wch }));
// Les codes restent du texte : evite la notation scientifique d'Excel (8.00344E+12).
for (let r = 1; r <= exemples.length; r++) feuille[`A${r + 1}`].t = 's';

const notice = XLSX.utils.aoa_to_sheet([
  ['Import du catalogue — notice'],
  ['Colonnes A a J : code, marque, designation, reference, six pictogrammes (inchange).'],
  ['Colonne K : designation arabe, FACULTATIVE (maximum 120 caracteres, doit contenir des lettres arabes).'],
  ['Un fichier sans colonne K (ancien modele) est toujours accepte.'],
  ['Une designation arabe nouvelle est ajoutee automatiquement a la liste deroulante du catalogue.'],
  ['CSV : enregistrer en « CSV UTF-8 » pour conserver l\'arabe.'],
]);
notice['!cols'] = [{ wch: 110 }];

const classeur = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(classeur, feuille, 'Articles');
XLSX.utils.book_append_sheet(classeur, notice, 'Notice');

mkdirSync('public/modeles', { recursive: true });
writeFileSync('public/modeles/modele-import-catalogue.xlsx', XLSX.write(classeur, { type: 'buffer', bookType: 'xlsx' }));
console.log('Modele ecrit : public/modeles/modele-import-catalogue.xlsx');

// ---------------------------------------------------------------------------
// Modele de mise a jour des designations arabes (deux colonnes) — ecran Catalogue
// ---------------------------------------------------------------------------
const feuilleArabe = XLSX.utils.aoa_to_sheet([
  ['Code article', 'Designation arabe (الاسم العربي)'],
  ['8003437000001', 'غسالة ومجففة'],
  ['8003437000002', 'ثلاجة'],
]);
feuilleArabe['!cols'] = [{ wch: 20 }, { wch: 40 }];
for (const ref of ['A2', 'A3']) feuilleArabe[ref].t = 's';
const noticeArabe = XLSX.utils.aoa_to_sheet([
  ['Mise a jour des designations arabes — notice'],
  ['Colonne A : code article (doit deja exister au catalogue). Colonne B : designation arabe.'],
  ['Les codes inconnus sont ignores : ce fichier ne cree aucun article.'],
  ['Une cellule arabe vide n\'efface pas la valeur existante.'],
  ['Maximum 120 caracteres, lettres arabes obligatoires.'],
]);
noticeArabe['!cols'] = [{ wch: 100 }];
const classeurArabe = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(classeurArabe, feuilleArabe, 'Designations arabes');
XLSX.utils.book_append_sheet(classeurArabe, noticeArabe, 'Notice');
writeFileSync('public/modeles/modele-import-designations-arabes.xlsx', XLSX.write(classeurArabe, { type: 'buffer', bookType: 'xlsx' }));
console.log('Modele ecrit : public/modeles/modele-import-designations-arabes.xlsx');
