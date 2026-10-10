# Readela privacy policy

**Readela by Amir42** — browser extension for Chrome and Firefox.
This policy applies from version 0.2.0 and was last changed on 2026-10-10 to
describe version 0.3.0. Where a statement applies only from version 0.3.0, it
says so. Its history is visible in the public repository, and the technical
controls behind it are in
[privacy-and-permissions.md](privacy-and-permissions.md).

## In short

Readela works entirely inside your browser. It reads the text of the
conversation shown on `chatgpt.com` and `claude.ai` to decide which direction
each paragraph should be read in and, from version 0.3.0, to find the place
you bookmarked. It changes only how that text is presented. It does not send
anything anywhere and it does not keep any of the text. It saves your own
settings and, from version 0.3.0, your bookmarks, on your own device.

## What Readela reads, and what happens to it

- **Website content.** On `chatgpt.com` and `claude.ai`, Readela reads the
  text of the conversation on the page (messages, headings, lists, quotations,
  tables) so it can count the words in each writing script, choose a reading
  direction and, from version 0.3.0, recognise a bookmarked paragraph. For that it
  also reads the conversation's address and the identifiers the site writes
  on its messages. Editable fields, such as the message composer, are never
  read.
- **The list of your conversations (from version 0.3.0).** To show a small
  bookmark beside the conversations you bookmarked, Readela reads the address
  of each conversation link in the site's own list and compares its
  fingerprint with your bookmarks. It does not read their titles.
- **No keys.** Readela does not read what you type or which keys you press.
  From version 0.3.0 you may give its bookmark command a keyboard shortcut in
  your browser's own shortcut settings; the browser keeps that shortcut and
  tells Readela only that the command was given.
- **Processed in memory only.** The text is used at that moment, inside the
  page, and nothing readable is kept. Readela does not store, log, copy or
  transmit conversation content, page addresses or your browsing history.
- **Changed in presentation only.** Readela adds presentation markers to the
  page; the underlying text, your selection and what you copy are unchanged,
  and turning Readela off restores the page exactly.

## What Readela stores

Everything Readela stores is in the browser's local extension storage on your
device. It is not synchronised to any account and is removed when you remove
the extension.

- **Your settings:** whether Readela is on, the direction mode, and your font,
  text size and line spacing choices; from version 0.3.0 also the reading
  appearance. The same settings apply on both supported sites.
- **Your bookmarks (from version 0.3.0):** only when you choose Bookmark (in
  the popup, or with the shortcut you gave the command), Readela saves where
  you stopped in that conversation, at most 1000 bookmarks and one per
  conversation. At that number Readela tells you and bookmarks no further
  conversation until you remove one; it never removes a bookmark by itself. A
  bookmark does not contain the
  text of the paragraph, the title or the address of the conversation. It contains
  short one-way fingerprints — of the conversation's identifier, of the
  message the paragraph is in, of the paragraph and of the paragraphs before
  and after it — and a few small numbers: the kind of paragraph, its position
  in the message, the message's row number where the site gives one, and
  roughly how far along the conversation it is. A fingerprint cannot be turned
  back into text. It is matching information kept on your device, not
  encryption. On Claude a bookmark also holds a fingerprint of the address of
  the conversation's row in the sidebar, so that the row can be marked; it
  can be added once when the sidebar shows which row that is. Remove deletes
  the bookmark of a conversation; a bookmark that cannot be found is kept
  until you remove or replace it.

No message content, site name, address or history is stored in readable form.

## What Readela does not do

- No server or backend: the extension makes no network request at all.
- No analytics, telemetry, crash reporting or usage statistics.
- No advertising, tracking, profiling or fingerprinting of you or your device.
- No remote or downloaded code; all code ships inside the extension package.
- No downloaded fonts. Up to version 0.2.1 font choices use fonts already
  installed on your device. From version 0.3.0 two open-source fonts ship
  inside the extension package: Inter for Latin text and Vazirmatn for
  Persian and Arabic text. They are loaded from the extension itself, never
  from the network.
- No accounts, sign-in or payment.
- No sale, sharing or transfer of any information to anyone, and no use of
  any information for purposes unrelated to presenting the page.

## Permissions and site access

| Permission | Why Readela needs it |
| --- | --- |
| Access to `chatgpt.com` and `claude.ai` | To read the conversation text on those two sites and present it with the right direction, colours and typography. No other site is accessed. |
| `storage` | To remember your settings and bookmarks on this device. |

Nothing else is requested. From version 0.3.0 the packaged font files are made
available to those two sites so their pages can display them; this is not a
permission and gives the sites no information about you. Also from version
0.3.0 Readela declares one command, to bookmark, which has no keyboard
shortcut unless you give it one in your browser; a small background part of
the extension passes that command to the page and does nothing else. The current manifest
and source code are public, so these statements can be checked.

## Store disclosures

- **Chrome Web Store.** Google asks developers to disclose how an extension
  handles user data even when the data stays on the device. Readela handles
  *website content* only in the way described above: locally, in memory, and
  never stored in readable form or transmitted. It is not sold, not
  transferred to third parties, not used for purposes unrelated to the
  extension's single purpose, and not used to determine creditworthiness or
  for lending.
- **Firefox Add-ons.** Readela declares to Firefox that it collects and
  transmits no data (`data_collection_permissions: required ["none"]`).

## Children

Readela collects no information from anyone, including children.

## Changes

If a future version changes what Readela reads, stores or requests, this
policy and the store listings are updated in the same release, and the change
is visible in the repository history.

## Contact

Questions about privacy or this extension: **hello@amir42.com**.
Source code and issue tracker: <https://github.com/amir42com/readela>.
Publisher: Amir42 — <https://amir42.com>.
