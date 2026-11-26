import { describe, expect, it } from 'vitest';
import { calculerPlage, compterAffiches, type AfficheResume } from '../statistiques';

const ref = new Date(2026, 10, 26, 15, 30); // jeudi 26 novembre 2026

describe('calculerPlage', () => {
  it('jour : 24 heures', () => {
    const p = calculerPlage('jour', ref);
    expect(p.debut).toEqual(new Date(2026, 10, 26));
    expect(p.fin).toEqual(new Date(2026, 10, 27));
    expect(p.sousIntervalles).toHaveLength(24);
  });
  it('semaine : du lundi 23 au dimanche 29', () => {
    const p = calculerPlage('semaine', ref);
    expect(p.debut).toEqual(new Date(2026, 10, 23));
    expect(p.fin).toEqual(new Date(2026, 10, 30));
    expect(p.sousIntervalles).toHaveLength(7);
  });
  it('mois : 30 jours en novembre', () => {
    const p = calculerPlage('mois', ref);
    expect(p.debut).toEqual(new Date(2026, 10, 1));
    expect(p.sousIntervalles).toHaveLength(30);
  });
  it('trimestre : T4 = octobre a decembre', () => {
    const p = calculerPlage('trimestre', ref);
    expect(p.debut).toEqual(new Date(2026, 9, 1));
    expect(p.fin).toEqual(new Date(2027, 0, 1));
    expect(p.sousIntervalles).toHaveLength(3);
    expect(p.precedente.debut).toEqual(new Date(2026, 6, 1));
  });
  it('annee : 12 mois', () => {
    const p = calculerPlage('annee', ref);
    expect(p.debut).toEqual(new Date(2026, 0, 1));
    expect(p.sousIntervalles).toHaveLength(12);
  });
});

describe('compterAffiches', () => {
  const a = (date: Date, gabarit: AfficheResume['gabarit']): AfficheResume => ({
    date,
    ean: '1',
    gabarit,
    marqueId: 'm',
  });
  it('borne de fin exclue, affiches sans article ignorees', () => {
    const r = compterAffiches(
      [
        a(new Date(2026, 9, 1), 'electro'),
        a(new Date(2026, 11, 31, 23), 'nouvelles-technologies'),
        a(new Date(2027, 0, 1), 'electro'),
        a(new Date(2026, 10, 5), null),
      ],
      new Date(2026, 9, 1),
      new Date(2027, 0, 1),
    );
    expect(r).toEqual({ electro: 1, nt: 1, total: 2 });
  });
});
