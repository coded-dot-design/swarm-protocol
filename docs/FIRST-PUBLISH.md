# Publish the prepared first release

Target repository: `coded-dot-design/swarm-protocol`, public, with MIT licensing.
First release: `v1.0.4`. The repository and remote release have not been created by this local preparation.

The GitHub connection in ChatGPT can finish this once it is available with permission to create a repository in the organization. You can also use the following commands locally, or give this folder and these instructions to your local coding agent.

## 1. Open the source folder

Extract `swarm-protocol-github-ready-1.0.4.zip` and open its `swarm-protocol` folder. This archive contains the complete development source, workflows, and the already-built drop-in ZIP under `artifacts/`. The generated artifacts are ignored by Git; the release workflow rebuilds them from the tagged source.

Use Node 22 and Python 3 to rebuild:

```sh
npm ci
npm run check
npm run release:build
```

## 2. Commit and create the GitHub repository

Use the official GitHub CLI with your own account. If needed, run `gh auth login` and complete its normal browser authentication. Do not put a token into a source file.

For this fresh source folder, which has no Git history:

```sh
git init -b main
git add .
git commit -m "Prepare Swarm Protocol 1.0.4"

gh repo create coded-dot-design/swarm-protocol \
  --public \
  --source=. \
  --remote=origin \
  --push \
  --description "A lightweight, opt-in webpage game with a self-hosted drop-in release."
```

Use your normal Git author configuration for the commit. If the repository already exists, work in its existing clone and preserve its history instead of recreating it or force-pushing this folder.

## 3. Enable immutable releases before publishing

In the repository's **Settings**, find **Releases** and select **Enable release immutability**. An administrator can also use:

```sh
gh api --method PUT repos/coded-dot-design/swarm-protocol/immutable-releases
gh api repos/coded-dot-design/swarm-protocol/immutable-releases
```

Confirm the setting succeeded before the first release. It protects future published release tags and assets; documentation or workflow files alone do not enable it.

## 4. Tag this version

```sh
git tag -a v1.0.4 -m "Swarm Protocol 1.0.4"
git push origin v1.0.4
```

Do not recreate a tag that already exists. The **Release** GitHub Actions workflow verifies the tag, runs checks, creates the ZIP and checksum, opens a draft release, uploads its assets, then publishes it. It does not publish npm packages or deploy a consuming website.

Inspect the workflow and final release:

```sh
gh run list --repo coded-dot-design/swarm-protocol --workflow release.yml
gh release view v1.0.4 --repo coded-dot-design/swarm-protocol
```

Confirm the published release contains `swarm-protocol-drop-in-1.0.4.zip` and `SHA256SUMS.txt`. The first command only lists runs; wait for the release run to finish successfully before treating publication as complete.

For later updates and pinning older releases, see [RELEASING.md](./RELEASING.md).

References: [GitHub CLI repository creation](https://cli.github.com/manual/gh_repo_create) · [Enable release immutability](https://docs.github.com/en/code-security/how-tos/secure-your-supply-chain/establish-provenance-and-integrity/prevent-release-changes) · [Repository REST API](https://docs.github.com/rest/repos/repos#enable-immutable-releases).
