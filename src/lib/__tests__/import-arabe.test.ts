import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { analyserArabe, lireFichierArabe } from '../import-arabe';
import type { CorrespondanceArabe } from '../articles';

function classeur(lignes: unknown[][]): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(lignes), 'S');
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}

const CATALOGUE = new Map<string, CorrespondanceArabe>([
  ['8003437000001', { designation: 'LAVANTE SÉCHANTE', designationArabe: '' }],
  ['8003437000002', { designation: 'RÉFRIGÉRATEUR', designationArabe: 'ثلاجة' }],
  ['0123456789012', { designation: 'FOUR', designationArabe: '' }],
]);

describe('lireFichierArabe', () => {
  it('saute l’en-tête et lit code + arabe', () => {
    const l = lireFichierArabe(classeur([['Code article', 'Désignation arabe'], ['8003437000001', ' غسالة   ومجففة ']]));
    expect(l).toEqual([{ numero: 2, code: '8003437000001', arabe: 'غسالة ومجففة' }]);
  });
  it('sans en-tête, la première ligne est une donnée', () => {
    expect(lireFichierArabe(classeur([['8003437000001', 'غسالة']]))).toHaveLength(1);
  });
  it('un code numérique long reste complet (pas de notation scientifique)', () => {
    const l = lireFichierArabe(classeur([['Code', 'Arabe'], [8003437000001, 'غسالة']]));
    expect(l[0]?.code).toBe('8003437000001');
  });
});

describe('analyserArabe', () => {
  it('distingue ajout, remplacement, inchangé, introuvable, vide, invalide', () => {
    const a = analyserArabe(
      [
        { numero: 2, code: '8003437000001', arabe: 'غسالة ومجففة' }, // ajout
        { numero: 3, code: '8003437000002', arabe: 'ثلاجة كبيرة' }, // remplacement
        { numero: 4, code: '0123456789012', arabe: '' }, // vide
        { numero: 5, code: '9999999999999', arabe: 'فرن' }, // introuvable
        { numero: 6, code: '8003437000002', arabe: 'LAVANTE' }, // invalide
      ],
      CATALOGUE,
    );
    expect(a.nbAjouts).toBe(1);
    expect(a.nbRemplacements).toBe(1);
    expect(a.vides).toHaveLength(1);
    expect(a.introuvables).toEqual([{ numero: 5, code: '9999999999999' }]);
    expect(a.invalides).toHaveLength(1);
  });
  it('valeur identique : rien à faire', () => {
    const a = analyserArabe([{ numero: 2, code: '8003437000002', arabe: 'ثلاجة' }], CATALOGUE);
    expect(a.inchanges).toBe(1);
    expect(a.aMettreAJour).toHaveLength(0);
  });
  it('codes en double : la dernière ligne fait foi', () => {
    const a = analyserArabe(
      [
        { numero: 2, code: '8003437000001', arabe: 'غسالة' },
        { numero: 3, code: '8003437000001', arabe: 'غسالة ومجففة' },
      ],
      CATALOGUE,
    );
    expect(a.doublons).toHaveLength(1);
    expect(a.aMettreAJour).toHaveLength(1);
    expect(a.aMettreAJour[0]?.nouveau).toBe('غسالة ومجففة');
  });
  it('rétablit le zéro de tête perdu par Excel', () => {
    const a = analyserArabe([{ numero: 2, code: '123456789012', arabe: 'فرن' }], CATALOGUE);
    expect(a.aMettreAJour[0]?.code).toBe('0123456789012');
  });
  it('n’efface jamais : cellule vide ignorée', () => {
    const a = analyserArabe([{ numero: 2, code: '8003437000002', arabe: '' }], CATALOGUE);
    expect(a.aMettreAJour).toHaveLength(0);
    expect(a.vides).toHaveLength(1);
  });
});
