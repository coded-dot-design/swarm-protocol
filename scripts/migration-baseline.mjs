import {transformSync} from 'esbuild';
export const modules=['dom-defender','attack-indicators','feedback-colors','target-health','target-hover','target-palette','swarm-widget','swarm-loader','swarm-deferred'];
// Normalize emitted JavaScript before fingerprinting; TS assertions/types erase.
// Exclude only the new native paint hooks; all gameplay must emit identically.
export const normalize=(source,loader)=>transformSync(source.replace(/^import \{ createBitHighlights \}.*\n/m,'').replace(/^  const bitHighlights = createBitHighlights\(doc\);\n/m,'').replace(/^    bitHighlights\.(?:destroy|update)\([^\n]*\);\n/gm,''),{loader,legalComments:'none',target:'es2022'}).code;
