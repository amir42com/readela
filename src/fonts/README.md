# Packaged fonts

Readela Sans is made of two fonts that are packaged with the extension, so
that reading does not depend on fonts installed on the device and nothing is
fetched from the network. Each is declared in the stylesheet for the
characters of its own script only:

- **Inter** for Latin and Latin Extended text;
- **Vazirmatn** for Arabic-script text (Persian, Arabic).

Hebrew and every other script use the device's own sans-serif fonts. Code keeps
its monospaced font and mathematics its renderer's fonts.

Both fonts are the upstream files, byte for byte: not subset, renamed inside
or otherwise modified. Each licence is shipped next to the fonts in every
package.

## Inter

| | |
| --- | --- |
| Font | Inter, variable (weight 100 to 900, optical size), upright and italic |
| Upstream | https://github.com/rsms/inter (homepage https://rsms.me/inter/) |
| Upstream version | 4.1 (tag `v4.1`, release of 2024-11-16) |
| Release archive | `Inter-4.1.zip`, 33,707,794 bytes, SHA-256 `9883fdd4a49d4fb66bd8177ba6625ef9a64aa45899767dde3d36aa425756b11e` |
| Upstream files | `web/InterVariable.woff2`, `web/InterVariable-Italic.woff2` |
| Files here | `InterVariable.woff2`, `InterVariable-Italic.woff2` |
| Size | 352,240 bytes and 387,976 bytes |
| SHA-256 | `693b77d4f32ee9b8bfc995589b5fad5e99adf2832738661f5402f9978429a8e3` (upright), `e564f652916db6c139570fefb9524a77c4d48f30c92928de9db19b6b5c7a262a` (italic) |
| Licence | SIL Open Font License 1.1, in `Inter-LICENSE.txt`, the archive's `LICENSE.txt` (SHA-256 `262481e844521b326f5ecd053e59b98c8b2da78c8ee1bdbb6e8174305e54935a`) |
| Copyright | Copyright (c) 2016 The Inter Project Authors (https://github.com/rsms/inter) |

On 2026-10-10 the release archive was taken from the repository's release page
and the three files were extracted from it unchanged. The licence declares no
Reserved Font Name.

The two variable files were chosen over single-weight files because the sites
set reading text in several weights (regular, medium, semibold, bold) and in
italic: the pair gives each of them, and a true italic, from the designer's own
outlines. The alternative, four single-weight files (regular, italic, semibold,
bold; about 459,000 bytes), would leave medium text and bold italics to be
approximated by the browser.

## Vazirmatn

| | |
| --- | --- |
| Font | Vazirmatn, Non-Latin build, variable weight (100 to 900) |
| Upstream | https://github.com/rastikerdar/vazirmatn |
| Upstream version | v33.003 (tag `v33.003`, release of 2022-06-22) |
| Upstream file | `misc/Non-Latin/fonts/webfonts/Vazirmatn-NL[wght].woff2` |
| File here | `Vazirmatn-NL-wght.woff2` |
| Size | 47,972 bytes |
| SHA-256 | `cdef5578ea583313cbea060a14aa107955a99717a861971b860cb564dfe1bbf5` |
| Licence | SIL Open Font License 1.1, in `OFL.txt` (SHA-256 `17e355067c8284f47743a1ee3b1ef7ff684ff0601eda357f9353b10b3016ab31`) |
| Copyright | Copyright 2015 The Vazirmatn Project Authors (https://github.com/rastikerdar/vazirmatn) |

Only the file name differs from upstream, because square brackets are awkward
in an extension resource path. On 2026-10-10 the same bytes were read from the
repository at the tag and from the release archive `vazirmatn-v33.003.zip`
(SHA-256 `0a9afd41967e6f57096a56a181a23f81a2b999b62f1f2a4e4b26736580854fdb`),
and the two digests were equal. `OFL.txt` is the upstream licence file from the
same tag, also unmodified; it carries the copyright notice.

The Non-Latin build has no Latin letters. Vazirmatn has no italic of its own;
emphasised Arabic-script text is slanted by the browser, as it is on the sites.

## Updating

Replace a font and its licence from one upstream release, record the new
version, sizes and digests here, and run the tests.
