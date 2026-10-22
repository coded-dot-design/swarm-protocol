import { appendFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Stable release versions only; prereleases can be added as a separate policy. */
export function validateReleaseVersion(metadata, lockfile, tag) {
  const version = metadata?.version;
  if (typeof version !== 'string' || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) {
    throw new Error('package.json must contain a stable MAJOR.MINOR.PATCH version.');
  }
  if (tag !== `v${version}`) {
    throw new Error(`Release tag must be v${version}; received ${JSON.stringify(tag)}.`);
  }
  if (lockfile?.version !== version || lockfile?.packages?.['']?.version !== version) {
    throw new Error('package-lock.json must match the package.json version before tagging.');
  }
  return { version, tag };
}

/** A release branch is an explicit request to create one new version tag. */
export function validateReleaseRef(metadata, lockfile, ref, refType = 'tag') {
  if (refType !== 'tag' && refType !== 'branch') {
    throw new Error('A release must come from a tag or a release/vMAJOR.MINOR.PATCH branch.');
  }
  if (refType === 'branch' && (typeof ref !== 'string' || !ref.startsWith('release/'))) {
    throw new Error('Release branches must be named release/vMAJOR.MINOR.PATCH.');
  }
  const tag = refType === 'branch' ? ref.slice('release/'.length) : ref;
  return { ...validateReleaseVersion(metadata, lockfile, tag), createTag: refType === 'branch' };
}

async function main() {
  const [metadata, lockfile] = await Promise.all([
    readFile(new URL('../package.json', import.meta.url), 'utf8').then(JSON.parse),
    readFile(new URL('../package-lock.json', import.meta.url), 'utf8').then(JSON.parse),
  ]);
  const { version, tag, createTag } = validateReleaseRef(metadata, lockfile, process.argv[2], process.argv[3] ?? 'tag');
  if (process.env.GITHUB_OUTPUT) {
    // Both values have passed the strict version check above.
    await appendFile(process.env.GITHUB_OUTPUT, `version=${version}\ntag=${tag}\ncreate_tag=${createTag}\n`);
  }
  console.log(`Verified ${tag}: package.json and package-lock.json match.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
