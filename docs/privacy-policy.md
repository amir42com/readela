# Readela privacy policy

**Readela by Amir42** — browser extension for Chrome and Firefox.
This policy applies from version 0.2.0 and was last changed on 2026-10-03.
Its history is visible in the public repository, and the technical controls
behind it are in [privacy-and-permissions.md](privacy-and-permissions.md).

## In short

Readela works entirely inside your browser. It reads the text of the
conversation shown on `chatgpt.com` and `claude.ai` to decide which direction
each paragraph should be read in, and it changes only how that text is
presented. It does not send anything anywhere, it does not keep any of the
text, and the only thing it saves is your own settings, on your own device.

## What Readela reads, and what happens to it

- **Website content.** On `chatgpt.com` and `claude.ai`, Readela reads the
  text of the conversation on the page (messages, headings, lists, quotations,
  tables) so it can count the words in each writing script and choose a
  reading direction. Editable fields, such as the message composer, are never
  read.
- **Processed in memory only.** The text is used at that moment, inside the
  page, and nothing is kept. Readela does not store, log, copy or transmit
  conversation content, page addresses or your browsing history.
- **Changed in presentation only.** Readela adds presentation markers to the
  page; the underlying text, your selection and what you copy are unchanged,
  and turning Readela off restores the page exactly.

## What Readela stores

One small settings object, saved in the browser's local extension storage on
your device: whether Readela is on, the direction mode, and your font, text
size and line spacing choices. The same settings apply on both supported sites.
They are not synchronised to any account and are removed when you remove the
extension. No message content, site, address or history is stored.

## What Readela does not do

- No server or backend: the extension makes no network request at all.
- No analytics, telemetry, crash reporting or usage statistics.
- No advertising, tracking, profiling or fingerprinting.
- No remote or downloaded code; all code ships inside the extension package.
- No bundled or downloaded fonts: font choices use fonts already installed on
  your device.
- No accounts, sign-in or payment.
- No sale, sharing or transfer of any information to anyone, and no use of
  any information for purposes unrelated to presenting the page.

## Permissions and site access

| Permission | Why Readela needs it |
| --- | --- |
| Access to `chatgpt.com` and `claude.ai` | To read the conversation text on those two sites and present it with the right direction and typography. No other site is accessed. |
| `storage` | To remember your settings on this device. |

Nothing else is requested. The current manifest and source code are public, so
these statements can be checked.

## Store disclosures

- **Chrome Web Store.** Google asks developers to disclose how an extension
  handles user data even when the data stays on the device. Readela handles
  *website content* only in the way described above: locally, in memory, and
  never stored or transmitted. It is not sold, not transferred to third
  parties, not used for purposes unrelated to the extension's single purpose,
  and not used to determine creditworthiness or for lending.
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
