# Signature calibration samples

Drop real Dean signature images here to run `src/lib/ai/signature/calibrate.ts`
against real data. This folder exists so images have a fixed, safe place to
go — actual image files here are gitignored and will never be committed.

## Layout

```
reference/<dean>.png       one file per Dean — their onboarded reference signature
genuine/<dean>/*.png       more real signatures from that same Dean
forged/<dean>/*.png        signatures NOT by that Dean
```

The name before the extension in `reference/` must match the folder name
under `genuine/` and `forged/` exactly — e.g. `reference/dean-eng.png` needs
`genuine/dean-eng/` and `forged/dean-eng/`.

Collect genuine samples on different days, with different pens, not all in
one sitting — see the comment at the top of `calibrate.test.ts`'s real-sample
runner for why. Keep framing/cropping consistent across photos.

## Running it

```bash
SIGNATURE_CALIBRATION_DIR=tests/signature-calibration-samples bunx vitest run calibrate
```
