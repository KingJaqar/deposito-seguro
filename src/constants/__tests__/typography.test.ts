import { archivoFontFamilyForWeight, FontFamily, isArchivoFontFamily, Type } from '../typography';

describe('Archivo typography contract', () => {
  it('maps every supported semantic weight to an exact bundled face', () => {
    expect(archivoFontFamilyForWeight('900')).toBe(FontFamily.black);
    expect(archivoFontFamilyForWeight('800')).toBe(FontFamily.extraBold);
    expect(archivoFontFamilyForWeight('700')).toBe(FontFamily.bold);
    expect(archivoFontFamilyForWeight('bold')).toBe(FontFamily.bold);
    expect(archivoFontFamilyForWeight('600')).toBe(FontFamily.semiBold);
    expect(archivoFontFamilyForWeight('500')).toBe(FontFamily.medium);
    expect(archivoFontFamilyForWeight('400')).toBe(FontFamily.regular);
    expect(archivoFontFamilyForWeight()).toBe(FontFamily.regular);
  });

  it('binds every type token to a registered Archivo face', () => {
    for (const type of Object.values(Type)) {
      expect(isArchivoFontFamily(type.fontFamily)).toBe(true);
    }
    expect(isArchivoFontFamily('monospace')).toBe(false);
  });
});
