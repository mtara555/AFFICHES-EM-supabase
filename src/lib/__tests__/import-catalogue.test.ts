import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import {
  analyser,
  COLONNE_ARABE_DEFAUT,
  decoderCsv,
  detecterColonneArabe,
  lireClasseurComplet,
} from '../import-catalogue';

const MARQUES = new Map([['WHIRLPOOL', 'm1']]);

/** Fabrique un classeur .xlsx en memoire. */
function classeur(lignes: unknown[][]): ArrayBuffer {
  const feuille = XLSX.utils.aoa_to_sheet(lignes);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, feuille, 'Articles');
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  return out;
}

const ENTETES_ANCIENS = ['Code', 'Marque', 'Designation', 'Reference', 'P1', 'P2', 'P3', 'P4', 'P5', 'P6'];
const ENTETES_ARABES = [...ENTETES_ANCIENS, 'Designation arabe'];

describe('import Excel — colonne « Designation arabe »', () => {
  it('lit la colonne K et conserve l’arabe tel quel (pas de majuscules)', () => {
    const { lignes, colonneArabePresente } = lireClasseurComplet(
      classeur([
        ENTETES_ARABES,
        ['111', 'whirlpool', 'lavante séchante', 'FWDD', '11kg', '', '', '', '', '', ' غسالة   ومجففة '],
      ]),
    );
    expect(colonneArabePresente).toBe(true);
    expect(lignes).toHaveLength(1);
    expect(lignes[0]?.designation).toBe('LAVANTE SÉCHANTE');
    expect(lignes[0]?.designationArabe).toBe('غسالة ومجففة');
  });

  it('rétrocompatibilité : un ancien fichier sans colonne arabe est lu comme avant', () => {
    const { lignes, colonneArabePresente } = lireClasseurComplet(
      classeur([ENTETES_ANCIENS, ['111', 'whirlpool', 'lavante', 'REF', '11kg', '', '', '', '', '']]),
    );
    expect(colonneArabePresente).toBe(false);
    expect(lignes[0]?.designationArabe).toBe('');
    expect(lignes[0]?.pictos[0]).toBe('11KG');
    const analyse = analyser(lignes, MARQUES, 'gem');
    expect(analyse.pretes).toHaveLength(1);
    expect(analyse.arabe.absentes).toBe(1);
    expect(analyse.arabe.renseignees).toBe(0);
  });

  it('repère la colonne par son en-tête même déplacée', () => {
    expect(detecterColonneArabe(['a', 'b', 'c'])).toBe(COLONNE_ARABE_DEFAUT);
    expect(detecterColonneArabe([...ENTETES_ANCIENS, 'Note', 'Désignation arabe'])).toBe(11);
    expect(detecterColonneArabe([...ENTETES_ANCIENS, 'الاسم العربي'])).toBe(10);
  });

  it('valeur vide : article importé sans arabe', () => {
    const { lignes } = lireClasseurComplet(
      classeur([ENTETES_ARABES, ['111', 'whirlpool', 'lavante', 'REF', '', '', '', '', '', '', '']]),
    );
    const a = analyser(lignes, MARQUES, 'gem');
    expect(a.pretes[0]?.saisie.designationArabe).toBe('');
    expect(a.arabe.invalides).toHaveLength(0);
  });

  it('valeur non arabe : signalée, article importé sans sa désignation arabe', () => {
    const { lignes } = lireClasseurComplet(
      classeur([ENTETES_ARABES, ['111', 'whirlpool', 'lavante', 'REF', '', '', '', '', '', '', 'WASHER']]),
    );
    const a = analyser(lignes, MARQUES, 'gem');
    expect(a.pretes).toHaveLength(1);
    expect(a.pretes[0]?.saisie.designationArabe).toBe('');
    expect(a.arabe.invalides).toEqual([expect.objectContaining({ numero: 2, valeur: 'WASHER' })]);
  });

  it('doublons de code : la ligne portant l’arabe est préférée à égalité', () => {
    const { lignes } = lireClasseurComplet(
      classeur([
        ENTETES_ARABES,
        ['111', 'whirlpool', 'lavante', 'REF', '', '', '', '', '', '', ''],
        ['111', 'whirlpool', 'lavante', 'REF', '', '', '', '', '', '', 'غسالة'],
      ]),
    );
    const a = analyser(lignes, MARQUES, 'gem');
    expect(a.doublons).toHaveLength(1);
    expect(a.pretes[0]?.saisie.designationArabe).toBe('غسالة');
  });

  it('alimente la liste des couples pour le référentiel, sans doublon', () => {
    const { lignes } = lireClasseurComplet(
      classeur([
        ENTETES_ARABES,
        ['1', 'whirlpool', 'lavante', 'R', '', '', '', '', '', '', 'غسالة'],
        ['2', 'whirlpool', 'lavante', 'R', '', '', '', '', '', '', 'غسالة'],
        ['3', 'whirlpool', 'four', 'R', '', '', '', '', '', '', 'فرن'],
      ]),
    );
    const a = analyser(lignes, MARQUES, 'gem');
    expect(a.arabe.paires).toHaveLength(2);
    expect(a.arabe.renseignees).toBe(3);
  });

  it('signale une même désignation française avec deux traductions', () => {
    const { lignes } = lireClasseurComplet(
      classeur([
        ENTETES_ARABES,
        ['1', 'whirlpool', 'lavante', 'R', '', '', '', '', '', '', 'غسالة'],
        ['2', 'whirlpool', 'lavante', 'R', '', '', '', '', '', '', 'غساله'],
      ]),
    );
    expect(analyser(lignes, MARQUES, 'gem').arabe.incoherences).toHaveLength(1);
  });
});

describe('import CSV — encodage', () => {
  const enc = new TextEncoder();

  it('UTF-8 avec BOM : l’arabe est lu correctement', () => {
    const csv = '\uFEFFCode,Marque,Designation,Reference,P1,P2,P3,P4,P5,P6,Designation arabe\n111,whirlpool,lavante,REF,,,,,,,غسالة ومجففة\n';
    const octets = enc.encode(csv);
    const buffer = octets.buffer.slice(octets.byteOffset, octets.byteOffset + octets.byteLength) as ArrayBuffer;
    const { lignes } = lireClasseurComplet(buffer, 'articles.csv');
    expect(lignes[0]?.designationArabe).toBe('غسالة ومجففة');
  });

  it('decoderCsv retombe sur Windows-1252 si le fichier n’est pas de l’UTF-8', () => {
    const ansi = new Uint8Array([0x43, 0x4f, 0x4e, 0x47, 0xc9, 0x4c]); // « CONGÉL » en cp1252
    const buffer = ansi.buffer.slice(0) as ArrayBuffer;
    expect(decoderCsv(buffer)).toBe('CONGÉL');
  });
});
