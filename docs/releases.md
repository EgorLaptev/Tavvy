# Release build metadata

This file records metadata for release builds and their published Firefox extension ZIPs.
Release notes are in [CHANGELOG.md](../CHANGELOG.md). ZIPs produced by
`npm run package:firefox` are unsigned; Mozilla signing changes the package
and therefore its size and hash. A later rebuild can also have a different hash,
so these values identify the exact archive listed, not every build of a version.

## 0.3.0 — Clever Chameleon

- Release date: 2026-11-09
- Release source: `v0.3.0`
- Artifact: `tavvy_tabs_group-0.3.0.zip`
- Published size: 120,979 bytes
- Published SHA-256: `1ab7b0ad880fd7c0b0ef97365a04b2d443bf71285ec48909b5438cecabca3b9d`
- Checksums: https://github.com/EgorLaptev/Tavvy/releases/download/v0.3.0/SHA256SUMS
- Verification: [Release workflow](https://github.com/EgorLaptev/Tavvy/actions/runs/42694988623) passed tests, Firefox validation and isolated Firefox smoke test.
- Signature: unsigned

## 0.2.16 — Playful Pangolin

- Release date: 2026-11-09
- Release source: `v0.2.16`
- Artifact: `tavvy_tabs_group-0.2.16.zip`
- Published size: 117,632 bytes
- Published SHA-256: `b3a2506033da6e65ee0e0a036fd3cb3c00f68aaafa7ae71bc8f964fe3ad73554`
- Checksums: https://github.com/EgorLaptev/Tavvy/releases/download/v0.2.16/SHA256SUMS
- Verification: [Release workflow](https://github.com/EgorLaptev/Tavvy/actions/runs/42663270666) passed tests, Firefox validation and isolated Firefox smoke test.
- Signature: unsigned

## 0.2.15 — Jolly Jerboa

- Release date: 2026-11-08
- Release source: `v0.2.15`
- Artifact: `tavvy_tabs_group-0.2.15.zip`
- Published size: 117,324 bytes
- Published SHA-256: `d725b539f7eadd7231b7746d6280b143d2ae99e339c7200ec51220f6b810d7df`
- Checksums: https://github.com/EgorLaptev/Tavvy/releases/download/v0.2.15/SHA256SUMS
- Verification: [Release workflow](https://github.com/EgorLaptev/Tavvy/actions/runs/42495709886) passed tests, Firefox validation and isolated Firefox smoke test.
- Signature: unsigned

## 0.2.14 — Merry Mole

- Release date: 2026-11-08
- Release source: `v0.2.14`
- Artifact: `tavvy_tabs_group-0.2.14.zip`
- Published size: 116,688 bytes
- Published SHA-256: `1166ca115e0f85afcb7a3ad95e421330f1509217429d76301f664d139fe5bf76`
- Checksums: https://github.com/EgorLaptev/Tavvy/releases/download/v0.2.14/SHA256SUMS
- Verification: [Release workflow](https://github.com/EgorLaptev/Tavvy/actions/runs/42474711208) passed tests, Firefox validation and isolated Firefox smoke test.
- Signature: unsigned

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

## Release packages

The table lists exact unsigned archives. Versions 0.2.11 and later are the
published GitHub Release assets; earlier rows refer to local packages and do
not establish that a published asset has the same size or hash. Commit IDs on
the historical rows identify the corresponding release tags, not necessarily
the source used to build those local archives. Version 0.2.0 has no local tag.

| Version | Release reference | Archive source | Size (bytes) | SHA-256 |
| --- | --- | --- | ---: | --- |
| 0.3.0 | `v0.3.0` | GitHub Release | 120,979 | `1ab7b0ad880fd7c0b0ef97365a04b2d443bf71285ec48909b5438cecabca3b9d` |
| 0.2.16 | `v0.2.16` | GitHub Release | 117,632 | `b3a2506033da6e65ee0e0a036fd3cb3c00f68aaafa7ae71bc8f964fe3ad73554` |
| 0.2.15 | `v0.2.15` | GitHub Release | 117,324 | `d725b539f7eadd7231b7746d6280b143d2ae99e339c7200ec51220f6b810d7df` |
| 0.2.14 | `v0.2.14` | GitHub Release | 116,688 | `1166ca115e0f85afcb7a3ad95e421330f1509217429d76301f664d139fe5bf76` |
| 0.2.13 | `v0.2.13` | GitHub Release | 116,496 | `a9958079886aae880ed8526cf43edc34a2bf86796ac743b3cc4bcfa4357ba491` |
| 0.2.12 | `v0.2.12` | GitHub Release | 112,032 | `08d870730e8a65a6fd8aabfea99909b7bf5c2a264af6b03a707e9b977e637f90` |
| 0.2.11 | `v0.2.11` | GitHub Release | 111,750 | `a833099ed1a1b52dd20fdb7ac7dde664c2328d5d853645b1475b7ae43a55e743` |
| 0.2.10 | `v0.2.10` | Local | 111,631 | `4b87e9f512eeaba1e32b1d8dff3c357482177c8bc8a917e44f6559ef41ffff67` |
| 0.2.9 | `c7659b6` | Local | 172,403 | `85a49824b8da42269c11202de8629469b95fc3e6b786a1d8475a95ea126da22b` |
| 0.2.8 | `dbd79ea` | Local | 167,393 | `8c5c7ffd69489cf1e5f9131a2a7820c231c2505713c33765bdde491703550133` |
| 0.2.7 | `d56b010` | Local | 148,939 | `f45919a961aca9fc251759626d1bac29d23b6891ac44e02bd476e0e143c71135` |
| 0.2.6 | `2c445b2` | Local | 75,466 | `ad7427a3f9b29448407d484ff0bb6e8b3dda5f7ca39d98ced4095d9ebb053d75` |
| 0.2.5 | `97a874a` | Local | 72,525 | `87fa0af2e2042f7784d5d3135c2ec068d26d981646da3f085754204a89e05fb6` |
| 0.2.4 | `fcfa7c3` | Local | 69,983 | `2c93da3e3793075471afc465b9304ff581d9efe4838e0e04d79c8f5163108b1f` |
| 0.2.3 | `4aa3faa` | Local | 70,572 | `54362879f2b23ebd051f87c93c688be254f85ab875a689bd2130c31f25d506fb` |
| 0.2.2 | `0bbfec8` | Local | 68,840 | `81159c1d6411600f1388fa2ef6c863e5e7887aaa84732cde1829de3ebb053d75` |
| 0.2.1 | `5a05883` | Local | 58,169 | `f12b3d5cd006aa24b2d0c0e628aa4e08760d182d27c0f03379c3fd5c24fe6c21` |
| 0.2.0 | — | Local | 31,026 | `50e2e1db796c1d6135ada4b5783dce358e842f342d2f5045bac53a465dc431f0` |
