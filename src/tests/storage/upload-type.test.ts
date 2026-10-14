import { describe, expect, it } from 'vitest';

import { isValidObjectPath } from '@/lib/storage/object-url';
import {
  checkUpload,
  detectUploadType,
  SNIFF_BYTES,
} from '@/lib/storage/upload-type';

const bytes = (...parts: (number[] | string)[]) =>
  new Uint8Array(
    parts.flatMap((p) =>
      typeof p === 'string' ? Array.from(new TextEncoder().encode(p)) : p
    )
  );

const PNG = bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], [0, 0]);
const JPEG = bytes([0xff, 0xd8, 0xff, 0xe0], [0, 0x10]);
const WEBP = bytes('RIFF', [0x24, 0, 0, 0], 'WEBPVP8 ');
const PDF = bytes('%PDF-1.7\n');

describe('detectUploadType', () => {
  it.each([
    ['PNG', PNG, 'image/png', 'png'],
    ['JPEG', JPEG, 'image/jpeg', 'jpg'],
    ['WebP', WEBP, 'image/webp', 'webp'],
    ['PDF', PDF, 'application/pdf', 'pdf'],
  ])('recognises %s by its magic bytes', (_, input, contentType, extension) => {
    expect(detectUploadType(input)).toEqual({ contentType, extension });
  });

  it('accepts an ArrayBuffer as well as a Uint8Array', () => {
    expect(detectUploadType(PNG.slice().buffer)?.contentType).toBe('image/png');
  });

  it('needs no more than SNIFF_BYTES to decide', () => {
    for (const input of [PNG, JPEG, WEBP, PDF]) {
      expect(input.length).toBeLessThanOrEqual(SNIFF_BYTES);
    }
  });

  it.each([
    ['SVG', bytes('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>')],
    ['SVG with an XML prolog', bytes('<?xml version="1.0"?><svg/>')],
    ['HTML', bytes('<!doctype html><script>alert(1)</script>')],
    ['HTML with leading whitespace', bytes('  \n<html><body>')],
    ['GIF', bytes('GIF89a', [1, 0, 1, 0])],
    ['plain text', bytes('hello')],
    ['an empty file', new Uint8Array(0)],
    ['all zeroes', new Uint8Array(32)],
    ['a RIFF that is not WebP (WAV)', bytes('RIFF', [0, 0, 0, 0], 'WAVEfmt ')],
    ['a truncated PNG signature', bytes([0x89, 0x50, 0x4e, 0x47])],
    // A polyglot: HTML first, an image signature later. The signature must be
    // at offset 0, so this is not an image.
    ['HTML with a PNG header later', bytes('<html>', Array.from(PNG))],
    ['HTML with %PDF- later', bytes('<html>%PDF-1.4')],
  ])('rejects %s', (_, input) => {
    expect(detectUploadType(input)).toBeNull();
  });
});

describe('checkUpload', () => {
  it('stores a PNG labelled text/html as image/png', () => {
    // The declared type never reaches checkUpload; only the bytes do. A File
    // carrying a lying type resolves to the type its bytes say.
    const file = new File([PNG], 'evil.html', { type: 'text/html' });
    expect(file.type).toBe('text/html');
    expect(checkUpload(PNG, 'image')).toEqual({
      contentType: 'image/png',
      extension: 'png',
    });
  });

  it('accepts a file that starts with an image signature whatever follows', () => {
    // Stored and served as image/png with nosniff, so trailing HTML is inert.
    const polyglot = bytes(Array.from(PNG), '<html><script>x</script>');
    expect(checkUpload(polyglot, 'image')?.contentType).toBe('image/png');
  });

  it('refuses a PDF where only images are allowed', () => {
    expect(checkUpload(PDF, 'image')).toBeNull();
  });

  it('accepts a PDF for image-or-pdf', () => {
    expect(checkUpload(PDF, 'image-or-pdf')?.contentType).toBe(
      'application/pdf'
    );
  });

  it.each(['image', 'image-or-pdf'] as const)('refuses SVG for %s', (kind) => {
    expect(checkUpload(bytes('<svg/>'), kind)).toBeNull();
  });

  it('pairs every detected type with an extension the storage proxy serves', () => {
    for (const input of [PNG, JPEG, WEBP, PDF]) {
      const detected = checkUpload(input, 'image-or-pdf');
      expect(detected).not.toBeNull();
      expect(
        isValidObjectPath(
          `11111111-1111-4111-8111-111111111111/x.${detected?.extension}`
        )
      ).toBe(true);
    }
  });
});
