# Releases and version pinning

Repository: `coded-dot-design/swarm-protocol`.

The release asset is a self-hosted drop-in ZIP. GitHub holds the source and downloadable releases; sites copy a specific release into their own assets. They do not need GitHub access at runtime.

## Version policy

- `main` contains ongoing development.
- A stable version uses an exact tag such as `v1.0.4`, matching `package.json` version `1.0.4`.
- Each release has its own `swarm-protocol-drop-in-<version>.zip`, `SHA256SUMS.txt`, and `/swarm-protocol/<version>/` asset directory.
- Published tags and assets are never moved, replaced, or reused. A fix receives a new version.
- Use a patch version for compatible fixes, a minor version for compatible additions, and a major version for breaking integration/API changes.

The first public release candidate is `v1.0.4`, so the already-tested package and asset paths keep their identities. There is no need to reset them to `1.0.0`.

## Protect published releases

Before publishing the first release, enable **immutable releases** for this GitHub repository. This is an administrator setting, separate from the workflow files. Verify it is enabled; its presence in these instructions does not mean it has already been configured.

With immutability enabled, GitHub locks a published release's tag and assets. Create a draft, attach every asset, then publish it. The supplied release workflow follows that order. It does not overwrite an existing release or upload with `--clobber`.

Keep old releases available. Do not delete a published release to replace its contents. If a shipped release needs a correction, publish another version and document the change.

References: [GitHub immutable releases](https://docs.github.com/en/code-security/concepts/supply-chain-security/immutable-releases) · [Managing releases](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository).

## Prepare the current first release

From a checkout of this repository using Node 22 and Python 3:

```bash
npm ci
npm run check
npm run release:build
```

Inspect `artifacts/swarm-protocol-drop-in-1.0.4.zip` and its README. Test the ZIP in a local Astro site before publishing. The commands above only create local files.

After the source is committed and pushed to `main`, create and push the matching tag:

```bash
git tag -a v1.0.4 -m "Swarm Protocol 1.0.4"
git push origin v1.0.4
```

If the tag already exists, inspect it instead of recreating or force-pushing it.

### Release from GitHub or a connected repository tool

You can also request the release by creating a branch named **`release/v1.0.4`** at the exact reviewed `main` commit. GitHub's branch-creation event starts the same verification and publication workflow. This works when a repository tool can create branches but cannot create tags directly.

Create that branch only when you intend to publish. Its name must match the stable version in both package files. Keep `main` at that commit until publication finishes; the workflow refuses to tag if `main` has moved. After verification, it creates a new `v1.0.4` tag at that exact commit and publishes the artifacts in the same workflow run. A branch request refuses an existing tag or release and never moves or overwrites either.

Do not create both a release branch and a tag for the same version. Updating an existing release branch does not request another release. For a later version, use its new branch name, such as `release/v1.0.5`.

This flow uses the repository's normal GitHub Actions token. The token-created tag is not expected to start another workflow; verification, tag creation, asset upload, and publication happen in one run. See [GitHub's create event](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#create) and [GITHUB_TOKEN event behavior](https://docs.github.com/en/actions/concepts/security/github_token#when-github_token-triggers-workflow-runs).

## What the GitHub workflow does

Ordinary pushes and pull requests run verification. A pushed stable version tag or a newly created `release/v<version>` branch starts the release workflow:

1. Validate that the tag exactly matches the package version.
2. Install locked development dependencies, typecheck, build, and run the tests.
3. Build the versioned drop-in ZIP and its checksum file.
4. Pass the verified artifacts to the release job and verify their checksums.
5. Refuse to replace an existing release; for a release branch, require the reviewed commit to remain the tip of `main` and create its new tag only if that tag does not already exist.
6. Confirm the tag resolves to the exact commit that passed verification.
7. Create a draft release, attach the artifacts, and publish it.

The release job uses GitHub Actions' repository token with the required release permission. No npm publishing token or separate game-hosting account is needed. The workflow does not publish an npm package or deploy any consuming website.

Check the Actions result and the release's asset list. A tag alone is not proof that the release succeeded.

If publishing fails after a draft was created, the workflow leaves that draft for inspection. Review the failed run and its verified artifacts, attach any missing assets to that same draft, then finish publishing it through GitHub's release controls. An automatic rerun deliberately refuses an existing release/draft. Do not delete a published release, overwrite its assets, or force the tag to get past an error. If the release is already published, make the correction in a new version.

If a release-branch run creates the tag but fails before creating a draft, review the tag's commit and that run's verified artifacts before completing the release manually. A retry deliberately refuses the existing tag rather than treating it as a new publication request.

## Prepare the next version

For example, to prepare a compatible patch after `1.0.4`:

```bash
npm version patch --no-git-tag-version
```

This updates the package metadata and lockfile without creating a tag. Update the changelog, documented version examples, and versioned integration templates as needed for the new release. Build and test the actual generated ZIP:

```bash
npm run check
npm run release:build
```

Commit the reviewed files and push through the repository's usual review process. Once the final release commit is on `main`, create and push the matching annotated tag, or create the matching release branch at that exact commit. For this example, use tag `v1.0.5` or branch `release/v1.0.5`.

Do not change the previous version's folder or assets. Keep release notes specific about behavior changes, compatibility, and migration steps.

## Pin a consuming site

Use an exact release download, for example:

```text
https://github.com/coded-dot-design/swarm-protocol/releases/download/v1.0.4/swarm-protocol-drop-in-1.0.4.zip
```

The URL becomes available once that release is published. Download the ZIP and its `SHA256SUMS.txt` from the same release. To verify the downloaded ZIP, run the checksum command from their shared directory:

```bash
# macOS
shasum -a 256 -c SHA256SUMS.txt

# Linux
sha256sum -c SHA256SUMS.txt
```

Copy the complete `public/swarm-protocol/1.0.4/` directory into the site's own `public` directory and use the supplied Astro component. The component's explicit version is the site's pin. A new GitHub release does not update the copied files or change that pin.

Do not use `/releases/latest/`, a branch archive, or a floating CDN URL when you need a fixed version. The prebuilt drop-in ZIP is the installation artifact; GitHub's automatic source-code ZIP is for development and must be built first.

## Upgrade and roll back

1. Keep the old release folder in the consuming site.
2. Add the new complete version folder alongside it.
3. Copy your selector, score-storage, and scheduling choices into the new installer configuration.
4. Change the version in the site's `SwarmDropIn.astro` to the new folder.
5. Test the site locally, including navigation, forms, touch input, and Escape restoration, then deploy through the site's usual process.

To roll back, change the component back to the retained older folder and deploy the site. Load only one version at a time. Do not replace individual chunks across versions; each folder is a complete release.

npm distribution can be added later with exact package-version installation. It will be another way to obtain the same runtime; it is not required for the current drop-in workflow.
