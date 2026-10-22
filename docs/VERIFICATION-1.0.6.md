# Swarm Protocol 1.0.6 verification

Verified on 2026-10-22:

- Type checking, minified build, and all 122 tests passed.
- Five historical gameplay/page-mutation traces remain identical across 8,827 active frames.
- Direction tests cover all four edges, corners, simultaneous attacks, partial visibility, travel without attachment, removed/hidden/breached targets, and cached geometry after scrolling or resizing.
- Real engine simulations verify offscreen attacks, direction changes, pause/resume, scrolling into view, target removal, restart, game over, and destruction.
- Chromium browser checks passed at 1280×800 and 390×844: corrected keyboard activation, bottom/top cues, scoreboard minimization, pause/resume, scroll-to-target clearing, reduced motion, and complete Escape cleanup. No browser errors occurred.
- Desktop and mobile screenshots were inspected. The mobile bottom notice sits above the compact scoreboard.
- The overlay is pointer-transparent and introduces no additional timers, animation frames, or geometry reads. Repeated identical cue states do not rewrite attributes.
- The 17-file drop-in ZIP passed CRC and byte-for-byte input verification. Stable tag validation passed.
- The initial scheduler remains about 1.1 KB gzip; cues add about 1.6 KB gzip to the lazy game payload.

Browser checks use a controlled test page, not the consuming production site or physical iOS/Android devices. No consuming website is deployed by this release.
