# Swarm Protocol 1.0.8 verification

Verified on 2026-10-22:

- The only runtime change from v1.0.7 is the light-mode score fill, now the requested brand pink `#F4457A`.
- `npm pack` completed its required typecheck, build, and all 125 tests. Historical gameplay/page-mutation traces remain unchanged.
- Palette checks retain the dark-mode 7:1 score contrast floor and use a 3:1 floor for the approved light-mode pink. Burst/ring contrast checks are unchanged.
- A Chromium mobile light-mode check verified the production kill score, white outline, hold/fade, existing burst/ring colors, a live switch to dark mode, and Escape cleanup with no browser errors. Its screenshot was inspected.
- The v1.0.8 npm tarball and 17-file drop-in ZIP were built. Package contents and ZIP inputs were checked byte for byte. Stable tag validation passed.

The browser check uses a controlled page and emulated system settings. The consuming production site was not changed or deployed.
