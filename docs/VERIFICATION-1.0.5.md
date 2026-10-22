# Swarm Protocol 1.0.5 verification

Verified on 2026-10-22:

- Type checking and the minified runtime build passed.
- All 117 tests passed, including built-module activation, the final Enter requirement, rejection of the obsolete extra B A pair, mobile hold-then-tap, Escape cleanup, React lifecycle, and gameplay regressions.
- The five historical gameplay traces still match across 8,827 active frames.
- The corrected activation is `↑ ↑ ↓ ↓ ← → ← → B A Enter` in source, tests, and current integration guides.
- The release builder validated local runtime imports and generated a 17-file drop-in ZIP. Every archived file matched its input bytes; the archive passed CRC verification.
- Initial deferred scheduler: 1,119 gzip bytes. Additional activation bootstrap: 4,044 gzip bytes. Additional game on first open: 20,665 gzip bytes (separate-file gzip sizes).

The change does not deploy a consuming website. These automated checks do not replace testing the integration on its actual pages and devices.
