# Swarm Protocol 1.0.9 verification

Verified on 2026-10-22:

- The required typecheck, build, and all 125 tests passed during npm packaging. Historical engine and HUD regression traces remain unchanged.
- Chromium checks passed at 1280×800, 390×844, and 320×640. They verify the visible start-screen Esc reminder, full exit from the intro, normal activation, actual offscreen attack cues, scoreboard minimization, pause/resume, scroll clearing, reduced motion, and final Escape cleanup with no browser errors.
- The bug icon's CSS animation was sampled at its dim and bright phases. System reduced motion disables both the icon pulse and glow. The existing explicit reduced-motion option uses the same steady presentation.
- Side cards fit simultaneously without overlapping, including at 320 pixels wide. Mobile bottom cards remain above the compact scoreboard. Mobile cue, narrow intro, and narrow side-card screenshots were inspected.
- The effects use CSS on the existing lazy cue DOM, without additional JavaScript timers or animation loops. The v1.0.8 score palette and gameplay are preserved.
- The npm tarball and 17-file drop-in ZIP were checked byte for byte against their inputs. Stable tag validation and release-workflow YAML parsing passed.
- Release packaging now includes the npm tarball in the verified artifact and checksum file, and publishes it alongside the ZIP. The npm package can be installed by its versioned GitHub asset URL; the site's manifest/lockfile pins it.

Browser checks use controlled local pages and emulated system settings. They do not deploy or replace the consuming production site's integration. GitHub workflow publication is checked separately after pushing.
