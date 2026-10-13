// The synthetic pages the store listing images are taken from.
//
// Each is a conversation page written for the listing. None is a real
// conversation, and none comes from either site: the text was written here,
// from what the README says Readela does. The pages carry the element and
// attribute names the site adapters look for (the same ones the end-to-end
// fixtures reproduce, see test/e2e/fixtures/), so the built extension treats
// them as it treats the sites, and they use no logo, name or artwork of
// either site. Their own look is plain: the fonts, sizes and line heights of
// the end-to-end fixtures, light and dark, and a serif for a reply on the
// page shaped like claude.ai, as a reply is set there.
//
// A page is shown in a small window, so that its text is large in the image.
// The list of conversations is there only on the page that shows a bookmark
// in it, and the box a message is written in only where one page fills the
// image; where two captures stand side by side the room goes to the reply.

const esc = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// ---------------------------------------------------------------------------
// A page shaped like chatgpt.com.

const CHATGPT_STYLE = `
  html, body { height: 100%; }
  body { margin: 0; font: 16px/1.75 system-ui, "Segoe UI", sans-serif; color: #0d0d0d; background: #fff; overflow: hidden; }
  .layout { display: flex; height: 100%; }
  nav { flex: none; width: 150px; padding: 12px 6px; background: #f9f9f9; box-sizing: border-box; }
  .nav-head { margin: 0 0 6px 12px; font-size: 13px; line-height: 20px; color: #8f8f8f; }
  .row { position: relative; padding: 7px 8px 7px 14px; border-radius: 10px; }
  .row.shown { background: #ececec; }
  .row-link { display: flex; align-items: center; color: inherit; text-decoration: none; font-size: 14px; line-height: 20px; }
  .row-link::before { content: ""; position: absolute; inset: 0; }
  .row-link span { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .page { flex: 1; min-width: 0; }
  main { display: flex; flex-direction: column; height: 100%; background: #fff; }
  .scroll { flex: 1; min-height: 0; overflow: hidden auto; scrollbar-width: none; }
  .bar { position: sticky; top: 0; z-index: 2; display: flex; justify-content: space-between; align-items: center; height: 44px; padding: 0 16px; background-color: #fff; }
  .bar-title { font-size: 17px; font-weight: 600; color: #5d5d5d; }
  .bar button { border: 1px solid #0002; border-radius: 16px; padding: 3px 12px; background: none; color: inherit; font: inherit; font-size: 13px; }
  .thread { max-width: 720px; margin: 0 auto; padding: 4px 22px 16px; }
  .unit { margin-bottom: 14px; }
  .user-row { display: flex; justify-content: flex-end; }
  [data-user-message-bubble] { max-width: 86%; padding: 8px 16px; background: #f4f4f4; border-radius: 20px; }
  .whitespace-pre-wrap { white-space: pre-wrap; }
  .sr-only { position: absolute; width: 1px; height: 1px; margin: 0; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; }
  p { margin: 0 0 12px; }
  ul, ol { margin: 0 0 12px; padding-inline-start: 26px; }
  li { margin-bottom: 4px; }
  li::marker { color: #8f8f8f; }
  [data-markdown-copy="inline-code"] { padding: 1px 6px; border-radius: 6px; background: rgb(128 128 128 / 0.14); font-family: ui-monospace, Consolas, monospace; font-size: 0.9em; }
  form { flex: none; margin: 0; padding: 6px 22px 14px; }
  .pill { display: flex; align-items: center; justify-content: space-between; max-width: 676px; margin: 0 auto; height: 44px; padding: 0 8px 0 18px; border: 1px solid #0002; border-radius: 24px; box-sizing: border-box; box-shadow: 0 2px 8px #0000000d; }
  .pill [contenteditable] { flex: 1; outline: none; }
  .pill [contenteditable]::before { content: "Ask anything"; color: #8f8f8f; }
  .pill button { width: 30px; height: 30px; border: 0; border-radius: 50%; background: #0d0d0d; }
  @media (prefers-color-scheme: dark) {
    body { color: #ececec; background: #212121; }
    nav { background: #181818; }
    .row.shown { background: #2f2f2f; }
    main, .bar { background-color: #212121; }
    .bar-title { color: #b4b4b4; }
    .bar button, .pill { border-color: #fff3; }
    [data-user-message-bubble] { background: #303030; }
    .pill { background: #303030; box-shadow: none; }
    .pill button { background: #ececec; }
  }
`;

/**
 * @param {object} page
 * @param {string} page.title the conversation's title, shown in the bar
 * @param {{ path: string, title: string, shown?: boolean }[]} [page.rows] the list of conversations, where the page shows one
 * @param {boolean} [page.composer] whether the box a message is written in is shown
 * @param {string} page.user HTML of the reader's message
 * @param {string} page.reply HTML of the reply
 */
function chatgptPage({ title, rows = [], composer = true, user, reply }) {
  const list = rows
    .map(
      ({ path, title: name, shown }) =>
        `<div role="listitem"><div class="row${shown ? " shown" : ""}" role="group"><a class="row-link" data-interactive-row-link="true" href="${path}" draggable="false"><span data-thread-title="true">${esc(name)}</span></a></div></div>`,
    )
    .join("\n          ");
  const nav =
    rows.length === 0
      ? ""
      : `
      <nav aria-label="Chat history">
        <p class="nav-head">Chats</p>
        <div role="list">
          ${list}
        </div>
      </nav>`;
  const form = composer
    ? `
          <form><div class="pill"><div contenteditable="true" aria-label="Message"></div><button type="button" aria-label="Send"></button></div></form>`
    : "";
  return `<!doctype html>
<html lang="en" dir="ltr">
  <head>
    <meta charset="utf-8" />
    <title>${esc(title)}</title>
    <link rel="icon" href="data:," />
    <style>${CHATGPT_STYLE}</style>
  </head>
  <body>
    <div class="layout">${nav}
      <div class="page" data-app-shell-active-page="true">
        <main>
          <div class="scroll" data-app-action-timeline-scroll="" role="region" aria-label="Conversation" tabindex="0"><div class="content">
            <div class="bar" role="toolbar"><span class="bar-title">${esc(title)}</span><button type="button">Share</button></div>
            <div class="thread">
              <div class="turn" data-turn-key="listing-turn">
                <h4 class="sr-only">You said:</h4>
                <div class="unit user-row"><div data-user-message-bubble="true"><div><div class="whitespace-pre-wrap" dir="auto">${user}</div></div></div></div>
                <div class="unit">
                  <h4 class="sr-only">The reply:</h4>
                  <div dir="auto" data-markdown-text-style="assistant-message">${reply}</div>
                </div>
              </div>
            </div>
          </div></div>${form}
        </main>
      </div>
    </div>
  </body>
</html>
`;
}

// ---------------------------------------------------------------------------
// A page shaped like claude.ai.

const CLAUDE_STYLE = `
  html, body { height: 100%; }
  body { margin: 0; font: 16px/1.65 system-ui, "Segoe UI", sans-serif; color: #141413; background: #faf9f5; overflow: hidden; }
  .column { position: relative; display: flex; flex-direction: column; height: 100%; }
  .chat-header { position: absolute; z-index: 11; top: 0; left: 0; right: 0; height: 44px; padding: 0 18px; display: flex; align-items: center; font-size: 15px; font-weight: 600; color: #3d3d3a; pointer-events: none; }
  .chat-header-band { position: absolute; z-index: -1; inset: 0; background: #faf9f5; }
  [data-autoscroll-container] { flex: 1; min-height: 0; overflow: hidden auto; scrollbar-width: none; padding: 50px 22px 12px; }
  .transcript { max-width: 720px; margin: 0 auto; }
  [data-testid="transcript-row"] { position: relative; display: flow-root; margin-bottom: 14px; }
  .bubble { width: fit-content; margin: 0 0 0 auto; max-width: 86%; padding: 8px 14px; background: #f0eee6; border-radius: 12px; }
  .clip { overflow: hidden; }
  .whitespace-pre-wrap { white-space: pre-wrap; }
  .font-claude-response { font-family: Georgia, "Times New Roman", serif; }
  p { margin: 0 0 12px; }
  ul.ps-7, ol.ps-7 { margin: 0 0 12px; padding-inline-start: 1.75rem; }
  li { margin-bottom: 4px; }
  code { font-family: ui-monospace, Consolas, monospace; font-size: 0.9em; }
  p code, li code { padding: 1px 5px; border-radius: 6px; background: rgb(20 20 19 / 0.07); }
  fieldset { flex: none; max-width: 720px; width: calc(100% - 44px); box-sizing: border-box; margin: 0 auto 14px; padding: 0 8px 0 16px; height: 46px; display: flex; align-items: center; justify-content: space-between; border: 1px solid rgb(20 20 19 / 0.15); border-radius: 16px; background: #fff; box-shadow: 0 2px 8px #0000000d; }
  .ProseMirror { flex: 1; outline: none; }
  .ProseMirror::before { content: "Reply…"; color: #87867f; }
  fieldset button { width: 30px; height: 30px; border: 0; border-radius: 9px; background: #c6613f; }
  @media (prefers-color-scheme: dark) {
    body { color: #f0eee6; background: #262624; }
    .chat-header { color: #c2c0b6; }
    .chat-header-band { background: #262624; }
    .bubble { background: #141413; }
    p code, li code { background: color(srgb 1 1 1 / 0.08); }
    fieldset { border-color: color(srgb 1 1 1 / 0.15); background: #30302e; box-shadow: none; }
    .ProseMirror::before { color: #9c9a92; }
  }
`;

/**
 * @param {object} page
 * @param {string} page.title the conversation's title, shown in the header
 * @param {boolean} [page.composer] whether the box a message is written in is shown
 * @param {string} page.user HTML of the reader's message
 * @param {string} page.reply HTML of the reply
 */
function claudePage({ title, composer = true, user, reply }) {
  const box = composer
    ? `
      <fieldset><div class="ProseMirror" contenteditable="true" data-testid="chat-input" aria-label="Write your prompt"></div><button type="button" aria-label="Send"></button></fieldset>`
    : "";
  return `<!doctype html>
<html lang="en" dir="ltr">
  <head>
    <meta charset="utf-8" />
    <title>${esc(title)}</title>
    <link rel="icon" href="data:," />
    <style>${CLAUDE_STYLE}</style>
  </head>
  <body>
    <div class="column" data-testid="chat-column">
      <div class="chat-header" data-testid="chat-header"><div class="chat-header-band"></div><span>${esc(title)}</span></div>
      <div data-autoscroll-container="true">
        <div class="transcript" role="feed" aria-label="Conversation">
          <div data-testid="transcript-row" data-index="0" data-perf-row="human">
            <div role="article" aria-setsize="2" aria-posinset="1">
              <div data-cds="UserMessage" data-turn-key="listing-turn-0">
                <div class="bubble"><div class="clip"><div data-testid="user-message" class="whitespace-pre-wrap">${user}</div></div></div>
              </div>
            </div>
          </div>
          <div data-testid="transcript-row" data-index="1" data-perf-row="assistant" data-last-message="true">
            <div role="article" aria-setsize="2" aria-posinset="2">
              <div data-cds="AssistantMessage" data-testid="assistant-message" data-turn-key="listing-turn-1" data-is-streaming="false">
                <div class="font-claude-response"><div data-cds="Prose">
                  <div class="standard-markdown">${reply}</div>
                </div></div>
              </div>
            </div>
          </div>
        </div>
      </div>${box}
    </div>
  </body>
</html>
`;
}

// ---------------------------------------------------------------------------
// The conversations. What they say is what the README says, in other words.

// 1. What Readela is for, in English.
const comfort = chatgptPage({
  title: "Easier reading",
  user: "What makes long answers easier to read?",
  reply: `
                    <ol>
                      <li><strong>A calmer page.</strong> Warm, off-white paper in place of bright white.</li>
                      <li><strong>A clear font.</strong> The same open shapes on every device.</li>
                      <li><strong>Room to breathe.</strong> Larger text and open line spacing.</li>
                    </ol>`,
});

// 2. The reading font, with a phrase in Persian and one in Arabic.
const typeface = chatgptPage({
  title: "Readela Sans",
  user: "What is Readela Sans?",
  reply: `
                    <p dir="auto">Readela Sans pairs two open typefaces that come with the extension: <strong>Inter</strong> for Latin text, <strong>Vazirmatn</strong> for Persian and Arabic.</p>
                    <p dir="auto">So «خواندن راحت‌تر» and «قراءة أكثر راحة» sit naturally inside an English sentence.</p>
                    <p dir="auto">Code keeps its own font: <span data-markdown-copy="inline-code" dir="ltr">line-height: 1.75</span></p>`,
});

// 3. Night, said in three languages.
const night = claudePage({
  title: "Night",
  user: "Describe Night in English, Persian and Arabic.",
  reply: `
                    <p class="whitespace-normal break-words">Night shows responses as warm, light text on a dark page, so a long read in a dim room is easier on the eyes.</p>
                    <p class="whitespace-normal break-words">حالت Night متن پاسخ‌ها را با رنگ روشن و گرم روی زمینهٔ تیره نشان می‌دهد تا خواندن طولانی در نور کم راحت‌تر باشد.</p>
                    <p class="whitespace-normal break-words">يعرض وضع Night نصّ الردود بلون فاتح دافئ على خلفية داكنة، لتكون القراءة الطويلة في الضوء الخافت أكثر راحة.</p>`,
});

// 4. Direction: sentences that begin with a word in Latin letters, a list,
// figures and code.
const direction = claudePage({
  title: "Text direction",
  composer: false,
  user: "Explain Auto direction.",
  reply: `
                    <p class="whitespace-normal break-words">Auto جهت هر پاراگراف را از روی واژه‌های خودش تعیین می‌کند، نه از روی اولین واژه.</p>
                    <ul class="list-disc ps-7">
                      <li class="whitespace-normal break-words">CSS و HTML سر جای خود می‌مانند.</li>
                      <li class="whitespace-normal break-words">عددها هم همین‌طور: 125% و 1.75.</li>
                    </ul>
                    <p class="whitespace-normal break-words">Readela يحدّد اتجاه كل فقرة من كلماتها، حتى لو بدأت بكلمة إنجليزية.</p>
                    <p class="whitespace-normal break-words">English stays left-to-right, and so does code: <code>line-height: 1.75</code></p>`,
});

// 5. The bookmark. Three conversations of the list get one.
const BOOKMARK_ROWS = [
  { path: "/c/readela-listing-comfort", title: "Easier reading" },
  { path: "/c/readela-listing-bookmark", title: "Bookmark", shown: true },
  { path: "/c/readela-listing-typeface", title: "Readela Sans" },
  { path: "/c/readela-listing-notes", title: "Study notes" },
  { path: "/c/readela-listing-week", title: "Reading list" },
];
const bookmark = chatgptPage({
  title: "Bookmark",
  rows: BOOKMARK_ROWS,
  user: "How does Bookmark work?",
  reply: `
                    <p dir="auto">Save place marks the paragraph you are reading.</p>
                    <p dir="auto" id="saved">Return brings you back to it later, after a restart of the browser too.</p>
                    <p dir="auto">A small bookmark shows beside the conversation in the list.</p>`,
});
// Two more conversations of the list, opened only to bookmark them.
const other = (title) =>
  chatgptPage({ title, rows: BOOKMARK_ROWS, user: "Where did I stop?", reply: `<p dir="auto" id="saved">A paragraph of ${esc(title)} to come back to.</p>` });

/** Each page with the address it is served at. */
export const PAGES = Object.freeze({
  comfort: { url: "https://chatgpt.com/c/readela-listing-comfort", html: comfort },
  typeface: { url: "https://chatgpt.com/c/readela-listing-typeface", html: typeface },
  night: { url: "https://claude.ai/chat/readela-listing-night", html: night },
  direction: { url: "https://claude.ai/chat/readela-listing-direction", html: direction },
  bookmark: { url: "https://chatgpt.com/c/readela-listing-bookmark", html: bookmark },
  notes: { url: "https://chatgpt.com/c/readela-listing-notes", html: other("Study notes") },
  week: { url: "https://chatgpt.com/c/readela-listing-week", html: other("Reading list") },
});
