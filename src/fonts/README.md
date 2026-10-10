# Packaged font

Readela Sans shows Arabic-script text (Persian, Arabic) in **Vazirmatn**, which
is packaged with the extension so that reading does not depend on fonts
installed on the device.

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

The font file is the upstream file, byte for byte; it is not subset or
otherwise modified. Only its file name differs, because square brackets are
awkward in an extension resource path. On 2026-10-10 the same bytes were read
from the repository at the tag and from the release archive
`vazirmatn-v33.003.zip` (SHA-256
`0a9afd41967e6f57096a56a181a23f81a2b999b62f1f2a4e4b26736580854fdb`), and the
two digests were equal. `OFL.txt` is the upstream licence file from the same
tag, also unmodified; it carries the copyright notice and is shipped next to
the font in every package.

The Non-Latin build has no Latin letters, and the stylesheet declares the face
for Arabic-script characters only. Latin, Hebrew and every other script
therefore keep using the device's own fonts.

To update the font: replace both files from one upstream release, record the
new version, size and digests here, and run the tests.
