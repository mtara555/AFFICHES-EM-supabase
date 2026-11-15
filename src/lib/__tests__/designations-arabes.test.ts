import { describe, expect, it } from 'vitest';
import { contientArabe, LONGUEUR_MAX_ARABE, normaliserArabe, validerArabe } from '../designations-arabes';
import { cotesPour } from '../../config/gabarits';

describe('normaliserArabe', () => {
  it('retire les espaces en trop et les marques de direction, sans changer la casse', () => {
    expect(normaliserArabe('  \u200Fغسالة   ومجففة\u200E ')).toBe('غسالة ومجففة');
    expect(normaliserArabe('Abc')).toBe('Abc');
  });
  it('gere les valeurs vides', () => {
    expect(normaliserArabe(null)).toBe('');
    expect(normaliserArabe(undefined)).toBe('');
    expect(normaliserArabe('   ')).toBe('');
  });
});

describe('validerArabe', () => {
  it('accepte une valeur vide (champ facultatif)', () => {
    expect(validerArabe('')).toBeNull();
    expect(validerArabe('   ')).toBeNull();
  });
  it('accepte une designation arabe, avec chiffres et latin', () => {
    expect(validerArabe('غسالة ومجففة')).toBeNull();
    expect(validerArabe('تلفاز OLED 55 بوصة')).toBeNull();
  });
  it('refuse un texte sans lettre arabe', () => {
    expect(validerArabe('LAVANTE')).toMatch(/arabes/);
    expect(validerArabe('12345')).not.toBeNull();
  });
  it('refuse une valeur trop longue', () => {
    expect(validerArabe('م'.repeat(LONGUEUR_MAX_ARABE + 1))).toMatch(/120/);
    expect(validerArabe('م'.repeat(LONGUEUR_MAX_ARABE))).toBeNull();
  });
});

describe('contientArabe', () => {
  it('detecte les formes de presentation', () => {
    expect(contientArabe('ﻏﺴﺎﻟﺔ')).toBe(true);
    expect(contientArabe('Whirlpool')).toBe(false);
  });
});

describe('cotesPour (mise en page de l’affiche)', () => {
  it('sans arabe : cotes d’origine inchangees', () => {
    const c = cotesPour('standard');
    expect(c.designation).toEqual({ x: 27.6, y: 74.0, l: 148.4, h: 16.5 });
    expect(c.reference).toEqual({ x: 27.6, y: 90.5, l: 148.4, h: 16.5 });
  });
  it('avec arabe : arabe au-dessus du francais, puis la reference, sans chevauchement ni empiètement sur les pictos', () => {
    for (const disposition of ['standard', 'macaron-large'] as const) {
      const c = cotesPour(disposition, true);
      const fin = (z: { y: number; h: number }) => z.y + z.h;
      expect(fin(c.designationArabe)).toBeLessThanOrEqual(c.designation.y + 0.01);
      expect(fin(c.designation)).toBeLessThanOrEqual(c.reference.y + 0.01);
      const premierPicto = Math.min(...c.pictos.map((p) => p.y));
      expect(fin(c.reference)).toBeLessThanOrEqual(premierPicto + 0.01);
    }
  });
});
