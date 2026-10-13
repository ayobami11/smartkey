import { describe, expect, it } from 'vitest';

import { isValidObjectPath } from '@/lib/storage/object-url';
import { uploadExtension } from '@/lib/storage/extension';

describe('uploadExtension', () => {
  it.each([
    ['letter.pdf', 'pdf'],
    ['Scan.JPG', 'jpg'],
    ['my letter.final.png', 'png'],
  ])('keeps a normal extension: %s', (name, ext) => {
    expect(uploadExtension(name, 'bin')).toBe(ext);
  });

  it.each([
    ['scan copy'], // no dot: the old code used the whole name, space included
    ['scan'],
    ['.pdf'], // dotfile, no real extension
    ['letter.'],
    ['letter.p d f'],
    ['letter.jpeg%20'],
    ['letter.averyverylongext'],
  ])('falls back for %s', (name) => {
    expect(uploadExtension(name, 'bin')).toBe('bin');
  });

  it('always yields a path the storage proxy accepts', () => {
    for (const name of ['scan copy', 'a.b c', 'x.PNG', 'é.pdf', '']) {
      const path = `${crypto.randomUUID()}/${crypto.randomUUID()}.${uploadExtension(name, 'bin')}`;
      expect(isValidObjectPath(path)).toBe(true);
    }
  });
});
