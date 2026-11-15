import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { lignesExport } from '../export-catalogue';
import { analyser, lireClasseurComplet } from '../import-catalogue';
import type { Article } from '../articles';

const article: Article = {
  id: '1',
  ean: '8003437000001',
  marqueId: 'm1',
  designation: 'LAVANTE SÉCHANTE',
  designationArabe: 'غسالة ومجففة',
  reference: 'FWDD117168SBS',
  categorie: 'lavage',
  photoFileId: null,
  pictos: ['11KG', 'A+++', '', '', '1AN', ''],
  livraisonGratuiteExclue: false,
  actif: true,
};

describe('export du catalogue', () => {
  it('produit les colonnes de l’import, arabe en colonne K', () => {
    const lignes = lignesExport([article], new Map([['m1', 'WHIRLPOOL']]));
    expect(lignes[0]).toHaveLength(13);
    expect(lignes[1]?.[1]).toBe('WHIRLPOOL');
    expect(lignes[1]?.[10]).toBe('غسالة ومجففة');
  });

  it('le fichier exporté se réimporte sans perte', () => {
    const lignes = lignesExport([article], new Map([['m1', 'WHIRLPOOL']]));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(lignes), 'Articles');
    const buffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;

    const { lignes: lues, colonneArabePresente } = lireClasseurComplet(buffer);
    expect(colonneArabePresente).toBe(true);
    const a = analyser(lues, new Map([['WHIRLPOOL', 'm1']]), 'gem');
    expect(a.pretes).toHaveLength(1);
    expect(a.pretes[0]?.saisie.designationArabe).toBe('غسالة ومجففة');
    expect(a.pretes[0]?.saisie.ean).toBe('8003437000001');
    expect(a.pretes[0]?.saisie.pictos[0]).toBe('11KG');
  });
});
