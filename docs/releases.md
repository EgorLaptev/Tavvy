# Release build metadata

This file records metadata for release builds and their published Firefox extension ZIPs.
Release notes are in [CHANGELOG.md](../CHANGELOG.md). ZIPs produced by
`npm run package:firefox` are unsigned; Mozilla signing changes the package
and therefore its size and hash. A later rebuild can also have a different hash,
so these values identify the exact archive listed, not every build of a version.

## 0.2.13 — Gentle Capybara

- Release date: 2026-11-08
- Release source: `v0.2.13`
- Artifact: `tavvy_tabs_group-0.2.13.zip`
- Published size: 116,496 bytes
- Published SHA-256: `a9958079886aae880ed8526cf43edc34a2bf86796ac743b3cc4bcfa4357ba491`
- Checksums: https://github.com/EgorLaptev/Tavvy/releases/download/v0.2.13/SHA256SUMS
- Verification: [Release workflow](https://github.com/EgorLaptev/Tavvy/actions/runs/42472580938) passed tests, Firefox validation and isolated Firefox smoke test.
- Signature: unsigned

## 0.2.12 — Brave Gecko

- Release date: 2026-11-07
- Release source: `v0.2.12`
- Artifact: `tavvy_tabs_group-0.2.12.zip`
- Published size: 112,032 bytes
- Published SHA-256: `08d870730e8a65a6fd8aabfea99909b7bf5c2a264af6b03a707e9b977e637f90`
- Checksums: https://github.com/EgorLaptev/Tavvy/releases/download/v0.2.12/SHA256SUMS
- Verification: [Release workflow](https://github.com/EgorLaptev/Tavvy/actions/runs/42385102763) passed.
- Signature: unsigned

## 0.2.11 — Sunny Meerkat

- Release date: 2026-11-06
- Release source: `v0.2.11`
- Artifact: `tavvy_tabs_group-0.2.11.zip`
- Published size: 111,750 bytes
- Published SHA-256: `a833099ed1a1b52dd20fdb7ac7dde664c2328d5d853645b1475b7ae43a55e743`
- Checksums: https://github.com/EgorLaptev/Tavvy/releases/download/v0.2.11/SHA256SUMS
- Verification: [Release workflow](https://github.com/EgorLaptev/Tavvy/actions/runs/42196311705) passed.
- Signature: unsigned

## 0.2.10 — Clever Quokka

- Release date: 2026-11-06
- Release source: `v0.2.10` (the archive was built before this metadata file was added; extension source is unchanged)
- Artifact: `tavvy_tabs_group-0.2.10.zip`
- Size: 111,631 bytes (109.0 KiB)
- SHA-256: `4b87e9f512eeaba1e32b1d8dff3c357482177c8bc8a917e44f6559ef41ffff67`
- Verification: 114 tests passed; Firefox extension validation passed with no warnings; isolated Firefox smoke test passed.
- Signature: unsigned

## Previous local packages

The following unsigned ZIPs were found in `build/packages`. Their manifest
versions match the table. Commit IDs identify the corresponding release tags;
the exact source and checks used for these historical package builds have not
been verified. Version 0.2.0 has no local Git tag.

| Version | Release commit | Size (bytes) | SHA-256 |
| --- | --- | ---: | --- |
| 0.2.9 | `c7659b6` | 172,403 | `85a49824b8da42269c11202de8629469b95fc3e6b786a1d8475a95ea126da22b` |
| 0.2.8 | `dbd79ea` | 167,393 | `8c5c7ffd69489cf1e5f9131a2a7820c231c2505713c33765bdde491703550133` |
| 0.2.7 | `d56b010` | 148,939 | `f45919a961aca9fc251759626d1bac29d23b6891ac44e02bd476e0e143c71135` |
| 0.2.6 | `2c445b2` | 75,466 | `ad7427a3f9b29448407d484ff0bb6e8b3dda5f7ca39d98ced4095d9ebb053d75` |
| 0.2.5 | `97a874a` | 72,525 | `87fa0af2e2042f7784d5d3135c2ec068d26d981646da3f085754204a89e05fb6` |
| 0.2.4 | `fcfa7c3` | 69,983 | `2c93da3e3793075471afc465b9304ff581d9efe4838e0d04d79c8f5163108b1f` |
| 0.2.3 | `4aa3faa` | 70,572 | `54362879f2b23ebd051f87c93c688be254f85ab875a689bd2130c31f25d506fb` |
| 0.2.2 | `0bbfec8` | 68,840 | `81159c1d6411600f1388fa2ef6c863e5e7887aaa84732cde1829de3c62aa80e4` |
| 0.2.1 | `5a05883` | 58,169 | `f12b3d5cd006aa24b2d0c0e628aa4e08760d182d27c0f03379c3fd5c24fe6c21` |
| 0.2.0 | — | 31,026 | `50e2e1db796c1d6135ada4b5783dce358e842f342d2f5045bac53a465dc431f0` |

Before pushing a release tag, add its section with the version, name, date,
source tag, expected artifact name, checksum URL, verification and unsigned
status. The checksum URL is populated by the release workflow after publishing;
do not guess the hash or size of an archive that has not yet been built. Record
the published artifact size and SHA-256 later if desired. Never reuse the hash
of an unsigned package to identify a Mozilla-signed one.

## Preparing a release entry

Add an entry to this file in the release preparation commit, using the same
version, name and date as `CHANGELOG.md`. For example:

```markdown
## 1.2.3 — Playful Name

- Release date: 2026-11-08
- Release source: `v1.2.3`
- Artifact: `tavvy_tabs_group-1.2.3.zip`
- Checksums: https://github.com/EgorLaptev/Tavvy/releases/download/v1.2.3/SHA256SUMS
- Verification: npm test, Firefox validation and isolated Firefox smoke test passed.
- Signature: unsigned
```

The checksum link becomes available after the release is published. Record only
checks actually completed; the release workflow repeats them before publication.

## Release workflow

1. Start a release branch from the latest `main`, for example `release/0.2.11`. A replacement branch can use a suffix such as `release/0.2.11-clean`.
2. Commit each task separately using Conventional Commits, such as `feat: add search`
   or `fix(settings): save theme`. Keep user-visible changes in
   `CHANGELOG.md` under Unreleased. After branch CI succeeds, Actions creates
   or updates a PR to `main` with the changelog and commit list. Manual text
   outside the generated markers is preserved.
3. Prepare the release in its own commit: synchronize versions, add the
   playful version name and its translations, date the changelog section, and
   add the matching release metadata section in `docs/releases.md`. The
   pre-push hook and release workflow validate both documents.
4. Run the relevant tests, Firefox validation and the isolated Firefox smoke
   test. Rebase the branch onto the latest `main`, then merge it into `main`
   with `--ff-only`. Do not force-push or rewrite shared commits.
5. Push `main`, create the matching `vX.Y.Z` tag on the merged release commit,
   and push the tag. GitHub Actions checks that the tag is reachable from
   `main`, reruns tests and Firefox validation, builds the unsigned ZIP, and
   publishes a GitHub Release with its changelog, package, AMO source archive
   and `SHA256SUMS` covering both ZIPs. The source archive contains the tagged
   source, reviewer instructions and the release build environment.

The tag must match all version fields and a dated changelog section. The
workflow runs the Firefox smoke test, but does not sign packages or overwrite an
existing GitHub Release. GitHub's generated ZIP may have a different hash
from a local build; the release's checksum refers to the attached ZIP.

Creating PRs with `GITHUB_TOKEN` requires the repository setting **Allow
GitHub Actions to create and approve pull requests** under Actions → General →
Workflow permissions. This setting also permits approvals, although this
workflow only creates and edits PRs. Branch pushes run CI directly; do not
rely on the bot-created PR event to run additional workflows. The PR is for
review; integrate with the documented local rebase and fast-forward flow.

Dependabot proposes npm and GitHub Actions updates weekly against the default
branch after its configuration reaches `main`. Review dependency changes and
bring accepted updates into the active release branch; do not merge directly
into `main` outside the release workflow.
