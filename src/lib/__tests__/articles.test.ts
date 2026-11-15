import { describe, expect, it } from 'vitest';
import { validerArticle, type SaisieArticle } from '../articles';

const base: SaisieArticle = {
  ean: '111',
  marqueId: 'm1',
  designation: 'LAVANTE SÉCHANTE',
  designationArabe: '',
  reference: 'FWDD117168SBS',
  categorie: 'lavage',
  pictos: ['', '', '', '', '', ''],
  livraisonGratuiteExclue: false,
  actif: true,
};

describe('validerArticle — designation arabe', () => {
  it('est facultative', () => {
    expect(validerArticle(base)).toEqual([]);
  });
  it('accepte une désignation arabe valide', () => {
    expect(validerArticle({ ...base, designationArabe: 'غسالة ومجففة' })).toEqual([]);
  });
  it('refuse un texte non arabe', () => {
    expect(validerArticle({ ...base, designationArabe: 'LAVANTE' })).toHaveLength(1);
  });
});
