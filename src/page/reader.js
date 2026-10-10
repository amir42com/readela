// Page integration: reads the conversation, marks its blocks for the reading
// aspects that are switched on, keeps the marks current while content streams
// in, and keeps the saved place (the reader's bookmark).
//
// Readela's whole footprint in the page is a set of `data-readela-*`
// attributes, plus a few `--readela-*` custom properties: on a list or
// quotation that needs mirroring, on a rounded unit that keeps the site's
// presentation under a reading theme, and on the root element while a reading
// theme or Readela Sans is on. Text nodes, element structure, page-owned
// attributes and page-owned styles are never written, so removing the
// footprint restores the page's own presentation exactly.

import {
  POSITION_STEPS,
  blockKind,
  changesPage,
  colourAlpha,
  conversationId,
  conversationKey,
  createPlace,
  findMark,
  fingerprint,
  indexMarks,
  isAddressText,
  locatePlace,
  measureScripts,
  messageKey,
  normalizeMarks,
  normalizePreferences,
  removeMark,
  resolveDirection,
  rowFingerprint,
  samePlace,
  saveMark,
} from "../core/index.js";
import {
  ELEMENT_MARKS,
  FLOWING,
  ISLAND_RADIUS,
  MARK,
  MIRROR_PROPERTIES,
  PROTECTED,
  ROOT_MARKS,
  SITE_PROPERTIES,
  TEXT_BLOCKS,
} from "./style.js";

const LISTS = "ul, ol";
const CONTAINERS = "ul, ol, table, blockquote";
const MIRRORED = "ul, ol, blockquote";

// Elements whose boundaries separate words when text is gathered.
const WORD_BOUNDARIES = `${TEXT_BLOCKS}, div, br, tr, hr`;

// A response that holds somewhere to type is never a reading surface.
const TYPING = 'form, textarea, [contenteditable]:not([contenteditable="false"]), [role="textbox"]';

// A part of a response that holds one of these is an application of its own,
// not text in a wrapper, and keeps the site's presentation as a whole.
const RICH = `iframe, canvas, video, audio, object, embed, ${TYPING}`;

// Text on these is a control's label, not something a unit shows to be read.
const CONTROLS = 'button, [role="button"], select, label, svg';

// Streaming produces many small mutations; they are handled together.
const FLUSH_DELAY_MS = 60;

// A saved place that is not on the page yet is looked for again as content
// arrives, at most this often.
const PLACE_RETRY_MS = 500;

// A site changes conversation without loading a page. Where the browser says
// so itself (the Navigation API), nothing runs until it does. Elsewhere the
// address is compared with the one last seen on a beat, this often, while the
// page is in view, and nothing else is done on a beat unless it changed.
// After a change the conversation region is looked at again on the next few
// beats, because a site can show a conversation it kept hidden a moment after
// the address; then the beats stop again where the browser reports changes.
const ROUTE_CHECK_MS = 1000;
const ROUTE_SETTLE_BEATS = 4;

// How long the place stays emphasised after Return.
const FLASH_MS = 1800;

// Return, when the place is in a response that is not in the document: the
// conversation's scrolling region is searched in at most this many stops and
// this much time. One stop waits for the page to settle: at least the minimum,
// a little longer for a first change to the document where none has come yet,
// then until the document has been quiet for a moment, at most the maximum.
// At the beginning of what is loaded, the page is given GROW_MS to load what
// came before.
//
// The time is what a long conversation needs on a site that loads its earlier
// part a few turns at a time, each load a request of its own: thirty seconds
// reach back in the order of a hundred turns. Nothing is reported as found
// unless the place itself is then seen clearly in view within ARRIVE_MS.
const SEARCH_STOPS = 90;
const SEARCH_MS = 30000;
const SETTLE_MIN_MS = 120;
const SETTLE_WAIT_MS = 360;
const SETTLE_MAX_MS = 700;
const QUIET_MS = 100;
const GROW_MS = 2500;
const ROW_JUMPS = 10;
const ARRIVE_MS = 2500;

// A stretch of a walk where nothing is in the document: this share of a screen.
const STRIDE = 0.8;
// Turns further apart than this are not one unbroken run.
const GAP = 32;
// Within this many pixels of an end of the scrolling region is at that end: a
// browser reports the region's size in whole pixels and its position in parts.
const EDGE = 2;

// The reading area. A cover lies within COVER_REACH pixels of an edge of the
// scrolling region and takes up at most COVER_SHARE of its height; what is
// read begins SAFE_INSET pixels clear of it. LINE is the least of a block that
// has to be in view for the block to count as there.
const COVER_REACH = 8;
const COVER_SHARE = 0.4;
const SAFE_INSET = 8;
const LINE = 24;

// Addresses of rows whose conversation key is remembered, at most.
const ROW_MEMORY = 2000;

// The reader taking over stops a search: these arrive only from real input.
const TAKEOVER = ["wheel", "touchstart", "pointerdown", "keydown"];

const ELEMENT = 1;
const TEXT = 3;

/**
 * @param {object} options
 * @param {Document} options.document
 * @param {object} options.site a site adapter; see `sites/index.js` for the contract
 * @param {() => boolean} [options.isAlive] returns false once the extension
 *   that owns this reader is gone; the reader then removes its footprint.
 * @param {(change: (marks: object) => object) => Promise<object>} [options.store]
 *   changes the stored places and resolves with what is stored afterwards;
 *   see `changeMarks` in the browser layer
 */
export function createReader({
  document,
  site,
  isAlive = () => true,
  store = () => Promise.reject(new Error("no store")),
}) {
  const view = document.defaultView;
  const root = document.documentElement;
  const candidates = [TEXT_BLOCKS, CONTAINERS, "pre", site.extraBlocks].filter(Boolean).join(", ");
  const markable = TEXT_BLOCKS;
  // Units inside a response that keep the site's presentation as a whole.
  const kept = ["pre", site.capsule].filter(Boolean).join(", ");
  // Code and mathematics, with whatever else the site renders as inline code:
  // not words of the sentence when its direction is decided.
  const protectedText = [PROTECTED, site.token].filter(Boolean).join(", ");
  const anyMark = ELEMENT_MARKS.map((name) => `[${name}]`).join(", ");

  let preferences = null; // null while stopped
  let observer = null;
  let siteWatcher = null; // follows the site's own theme while a reading theme is on
  let timer = null;
  let routeTimer = null;
  // Whether the browser reports a change of address by itself.
  const routeEvents = typeof view.navigation?.addEventListener === "function";
  let pathSeen = null; // the address path at the last beat
  let beatsLeft = 0; // beats on which the region is still looked at after a change
  const pending = new Set();
  let mirrorChecked = new WeakSet(); // lists and quotations already examined for mirroring
  let freshIslands = []; // kept units marked in this pass and not yet examined
  let scopeSeen = null; // the conversation region the marks were made for
  let routeSeen = null;
  let changedAt = 0; // when the document last changed

  // The stored places, by conversation: asked for often, built when they change.
  let saved = indexMarks(normalizeMarks(undefined));
  let place = null; // { key, element, quality } while the saved place is shown
  let placeLookedAt = 0;
  let placeTimer = null;
  let flashTimer = null;
  let search = null; // { stop } while a place is being searched for
  const turnKeys = new WeakMap(); // turn element -> { value, key }
  const rowKeys = new Map(); // address of a row -> { key, row }: its conversation, its own fingerprint
  let rowsChanged = false; // a row of the site's lists came, went or changed
  let rowSeen = null; // { key, row, at }: the row the site marked as this conversation's, when first seen

  const isRendered = (element) => element.getClientRects().length > 0;
  const pause = (ms) => new Promise((resolve) => view.setTimeout(resolve, ms));
  const reading = () => preferences !== null && changesPage(preferences);
  const theming = () => preferences !== null && preferences.theme !== "page";

  // The region that holds the conversation shown. A site can keep other
  // conversations in the document, hidden; they are not this one.
  function scopeElement() {
    const found = document.querySelectorAll(site.scope);
    for (const element of found) if (isRendered(element)) return element;
    return found[0] ?? document.body;
  }

  function setMark(element, name, value) {
    if (value === null) {
      if (element.hasAttribute(name)) element.removeAttribute(name);
    } else if (element.getAttribute(name) !== value) {
      element.setAttribute(name, value);
    }
  }

  function removeProperties(element, properties) {
    for (const property of properties) element.style.removeProperty(property);
    if (element.getAttribute("style") === "") element.removeAttribute("style");
  }

  function clearIsland(element) {
    if (!element.hasAttribute(MARK.island)) return;
    if (element.getAttribute(MARK.island).includes("round")) removeProperties(element, [ISLAND_RADIUS]);
    element.removeAttribute(MARK.island);
  }

  function clearMarks(element) {
    if (element.hasAttribute(MARK.mirror)) removeProperties(element, MIRROR_PROPERTIES);
    clearIsland(element);
    for (const name of ELEMENT_MARKS) setMark(element, name, null);
  }

  // Text of an element for measurement. Subtrees matching `skip` are left out.
  function textOf(element, skip) {
    const walker = document.createTreeWalker(element, view.NodeFilter.SHOW_ELEMENT | view.NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (node.nodeType === TEXT) return view.NodeFilter.FILTER_ACCEPT;
        if (node.matches(skip)) return view.NodeFilter.FILTER_REJECT;
        return node.matches(WORD_BOUNDARIES) ? view.NodeFilter.FILTER_ACCEPT : view.NodeFilter.FILTER_SKIP;
      },
    });
    let text = "";
    while (walker.nextNode()) text += walker.currentNode.nodeType === TEXT ? walker.currentNode.data : " ";
    return text;
  }

  // Direction used when a block has no words of its own: the enclosing marked
  // container, otherwise the nearest marked block before it.
  function contextFor(element) {
    const container = element.parentElement?.closest(`[${MARK.dir}]`);
    if (container) return container.getAttribute(MARK.dir);
    let sibling = element.previousElementSibling;
    for (let steps = 0; sibling && steps < 8; steps += 1, sibling = sibling.previousElementSibling) {
      const direction = sibling.getAttribute(MARK.dir);
      if (direction) return direction;
    }
    return null;
  }

  function directionFor(element) {
    if (preferences.direction === "page" || element.matches("pre")) return null;

    // A list presents as one unit so markers, indentation and item text agree;
    // a table likewise, so its column order and cell text agree.
    if (element.matches("li")) return element.parentElement?.closest(LISTS)?.getAttribute(MARK.dir) ?? null;
    if (element.matches("th, td, caption")) return element.closest("table")?.getAttribute(MARK.dir) ?? null;

    let skip = protectedText;
    if (element.matches(LISTS)) {
      skip = `${protectedText}, ${LISTS}`; // nested lists decide for themselves
    } else if (!element.matches(CONTAINERS)) {
      const owner = element.parentElement?.closest("li, th, td, blockquote");
      if (owner && !owner.matches("blockquote")) return owner.getAttribute(MARK.dir);
    }

    return resolveDirection({
      counts: measureScripts(textOf(element, skip)),
      mode: preferences.direction,
      context: contextFor(element),
    });
  }

  function isEligible(element, scope) {
    if (!scope.contains(element) || element.closest(site.exclude)) return false;
    if (site.within && !element.closest(site.within)) return false;
    if (element.matches("pre")) return !element.parentElement?.closest(PROTECTED);
    // Text inside a unit the site presents as a whole is not reading text.
    if (site.capsule && element.closest(site.capsule)) return false;
    return !element.closest(PROTECTED);
  }

  // The page pinned the text to the physical side opposite the reading start.
  function needsStartAlignment(element, direction) {
    if (element.style.textAlign || element.hasAttribute("align")) return false;
    const align = view.getComputedStyle(element).textAlign;
    return direction === "rtl" ? align === "left" : align === "right";
  }

  // Spacing and border of an element on each physical side, as laid out now.
  function sideLayout(element) {
    const style = view.getComputedStyle(element);
    const side = (name) => ({
      padding: style[`padding${name}`],
      margin: style[`margin${name}`],
      border: `${style[`border${name}Width`]} ${style[`border${name}Style`]} ${style[`border${name}Color`]}`,
    });
    return { Left: side("Left"), Right: side("Right") };
  }

  // A list or quotation whose direction differs from the page's needs its
  // indentation and border on the other side. Where the page describes them
  // with logical properties they move by themselves. Where it pins them to a
  // physical side they do not: the layout is then identical under both
  // directions, and this returns it re-expressed on logical sides. Returns
  // null when nothing has to be mirrored.
  //
  // `ours` is the element's layout under its own direction and `pages` its
  // layout under the page's.
  function mirrorFor(ours, pages, pageDirection) {
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    if (!same(ours, pages) || same(pages.Left, pages.Right)) return null;

    const [start, end] = pageDirection === "rtl" ? [pages.Right, pages.Left] : [pages.Left, pages.Right];
    return {
      "--readela-padding-start": start.padding,
      "--readela-padding-end": end.padding,
      "--readela-margin-start": start.margin,
      "--readela-margin-end": end.margin,
      "--readela-border-start": start.border,
      "--readela-border-end": end.border,
    };
  }

  // ---------------------------------------------------------------------------
  // Reading surface
  //
  // Ownership under a reading theme. The application shell and the reader's
  // own messages are the site's. The roots of a response's text, which the
  // site adapter names, are Readela's: they become the reading surface. Inside
  // a surface, reading blocks are reading text; a wrapper that only holds
  // reading blocks (around a table, say) is part of the surface; everything
  // else is a unit that stays the site's, whole. Where the adapter recognises
  // no root, nothing is coloured.

  // The site's own background and text colour around the conversation, for the
  // parts of a response that keep the site's presentation under a theme.
  function measureSite(scope = scopeElement()) {
    // Where nothing behind the conversation is painted, the browser's own
    // page colour is what shows.
    let surface = "Canvas";
    for (let element = scope; element; element = element.parentElement) {
      const colour = view.getComputedStyle(element).backgroundColor;
      if (colourAlpha(colour) === 1) {
        surface = colour;
        break;
      }
    }
    const values = { [SITE_PROPERTIES.surface]: surface, [SITE_PROPERTIES.text]: view.getComputedStyle(scope).color };
    for (const [property, value] of Object.entries(values)) {
      if (root.style.getPropertyValue(property) !== value) root.style.setProperty(property, value);
    }
  }

  // The site's own font around the conversation, for a unit inside reading
  // text that keeps the site's presentation while Readela Sans is on. The
  // conversation region itself is never given a font, so what is read is the
  // site's.
  function measureFont(scope = scopeElement()) {
    if (preferences.font === "page") {
      if (root.style.getPropertyValue(SITE_PROPERTIES.font) !== "") removeProperties(root, [SITE_PROPERTIES.font]);
      return;
    }
    const value = view.getComputedStyle(scope).fontFamily;
    if (root.style.getPropertyValue(SITE_PROPERTIES.font) !== value) root.style.setProperty(SITE_PROPERTIES.font, value);
  }

  // Whether `element`, a root of response text by the adapter's word, is one
  // Readela may own: inside the conversation shown, outside everything that is
  // never touched, and neither in nor around a message of the reader's own or
  // somewhere to type.
  function ownsProse(element, scope) {
    if (element === scope || !scope.contains(element) || element.closest(site.exclude)) return false;
    if (element.parentElement?.closest(site.prose)) return false; // part of the root around it
    if (site.user && (element.closest(site.user) || element.querySelector(site.user))) return false;
    return element.querySelector(TYPING) === null;
  }

  // The corner radii of an element as one `border-radius` value, or null when
  // every corner is square.
  function cornerRadii(style) {
    const corners = [
      style.borderTopLeftRadius,
      style.borderTopRightRadius,
      style.borderBottomRightRadius,
      style.borderBottomLeftRadius,
    ].map((corner) => corner.split(" "));
    if (corners.every((corner) => corner.every((part) => parseFloat(part) === 0))) return null;
    const across = corners.map((corner) => corner[0]).join(" ");
    const down = corners.map((corner) => corner[1] ?? corner[0]).join(" ");
    return across === down ? across : `${across} / ${down}`;
  }

  // What a kept part of a response is made of: the element itself, or the
  // element it wraps exactly, whichever first has a background or rounded
  // corners of its own. Read before Readela colours anything here.
  function unitIn(element) {
    const frame = element.getBoundingClientRect();
    const same = (box) =>
      ["left", "right", "top", "bottom"].every((side) => Math.abs(box[side] - frame[side]) <= 1.5);
    for (let node = element, depth = 0; node !== null && depth < 4; node = node.firstElementChild, depth += 1) {
      if (depth > 0 && !same(node.getBoundingClientRect())) return null;
      const style = view.getComputedStyle(node);
      const radius = cornerRadii(style);
      const alpha = colourAlpha(style.backgroundColor);
      if (alpha > 0 || radius !== null) return { opaque: alpha === 1, radius };
    }
    return null;
  }

  // Whether a unit shows text of its own, other than the labels of controls.
  function showsText(element) {
    const walker = document.createTreeWalker(element, view.NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node.data.trim() !== "" && !node.parentElement?.closest(CONTROLS)) return true;
    }
    return false;
  }

  // A unit that stays the site's, with a note of what it needs for that. One
  // that brings an opaque background of its own needs nothing behind it, and
  // neither does one that shows no text (an image, a row of controls); any
  // other gets the site's own background behind it ("surface"), in the unit's
  // own shape where that is rounded ("round"), so its text stays readable and
  // no corner of another colour shows around it. One whose text takes its
  // colour from around it would take the theme's, and keeps the site's
  // instead ("text"); one that sets a colour of its own keeps that.
  //
  // A unit is marked when it is first seen and examined afterwards, with every
  // other unit seen in the same pass: reading a unit's own box and colours
  // makes the browser lay the page out, and it should do so once for all of
  // them, not once for each between two writes.
  function markIsland(element) {
    if (element.hasAttribute(MARK.island)) return; // examined when it was first seen
    // Marked as the site's first, so no rule for reading text is in the way
    // when its own colours are read.
    element.setAttribute(MARK.island, "");
    freshIslands.push(element);
  }

  function examineIslands() {
    if (freshIslands.length === 0) return;
    const fresh = freshIslands;
    freshIslands = [];
    // Everything is read before anything more is written.
    const noted = fresh
      .filter((element) => element.isConnected && element.getAttribute(MARK.island) === "")
      .map((element) => {
        const needs = [];
        let radius = null;
        const unit = unitIn(element);
        if (!unit?.opaque && showsText(element)) {
          needs.push("surface");
          if (unit?.radius) {
            radius = unit.radius;
            needs.push("round");
          }
        }
        const around = element.parentElement;
        if (around && view.getComputedStyle(element).color === view.getComputedStyle(around).color) needs.push("text");
        return { element, needs, radius };
      });
    for (const { element, needs, radius } of noted) {
      if (radius !== null) element.style.setProperty(ISLAND_RADIUS, radius);
      setMark(element, MARK.island, needs.join(" "));
    }
  }

  function markSurface(sheet) {
    const wanted = new Set([sheet]);
    const keep = (element) => {
      wanted.add(element);
      setMark(element, MARK.sheet, null);
      markIsland(element);
    };
    const walk = (container) => {
      for (const child of container.children) {
        if (child.matches(kept)) {
          keep(child);
        } else if (child.hasAttribute(MARK.top)) {
          // Reading text. A unit inside it (a code block in a list item) is kept.
          for (const unit of child.querySelectorAll(kept)) {
            const outer = unit.parentElement.closest(kept);
            if (!(outer && child.contains(outer))) keep(unit);
          }
        } else if (child.matches(FLOWING)) {
          continue;
        } else if (child.querySelector(`[${MARK.top}]:not(pre)`) !== null && child.querySelector(RICH) === null) {
          // A wrapper that holds reading blocks is part of the surface.
          wanted.add(child);
          clearIsland(child);
          setMark(child, MARK.sheet, "inner");
          walk(child);
        } else {
          keep(child);
        }
      }
    };
    clearIsland(sheet);
    setMark(sheet, MARK.sheet, "");
    walk(sheet);
    for (const element of sheet.querySelectorAll(`[${MARK.sheet}], [${MARK.island}]`)) {
      if (wanted.has(element)) continue;
      clearIsland(element);
      setMark(element, MARK.sheet, null);
    }
  }

  function unmarkSurface(sheet) {
    for (const element of [sheet, ...sheet.querySelectorAll(`[${MARK.sheet}], [${MARK.island}]`)]) {
      clearIsland(element);
      setMark(element, MARK.sheet, null);
    }
  }

  // Bring the reading surfaces in and around `tree` up to date.
  function markSurfaces(tree, scope) {
    if (!site.prose) return;
    // A root inside another root is part of it.
    const outermost = (element) => {
      let found = element;
      for (let outer = element; outer; outer = outer.parentElement?.closest(site.prose)) found = outer;
      return found;
    };
    const roots = new Set();
    const around = tree.closest(site.prose);
    if (around) roots.add(outermost(around));
    for (const element of tree.querySelectorAll(site.prose)) roots.add(outermost(element));
    const marked = [...tree.querySelectorAll(`[${MARK.sheet}=""]`)];
    for (const sheet of marked) if (!roots.has(sheet)) unmarkSurface(sheet);
    for (const sheet of roots) {
      if (ownsProse(sheet, scope)) markSurface(sheet);
      else if (sheet.hasAttribute(MARK.sheet)) unmarkSurface(sheet);
    }
  }

  // The site can change its own theme without touching the conversation: by
  // an attribute on the root element, or by following the system's light or
  // dark setting. Either is followed while a reading theme is on, and only then.
  function watchSite() {
    if (theming() === (siteWatcher !== null)) return;
    if (siteWatcher !== null) {
      siteWatcher.stop();
      siteWatcher = null;
      return;
    }
    const attributes = new view.MutationObserver(() => measureSite());
    attributes.observe(root, { attributes: true });
    const scheme = view.matchMedia("(prefers-color-scheme: dark)");
    scheme.addEventListener("change", measureSite);
    siteWatcher = {
      stop() {
        attributes.disconnect();
        scheme.removeEventListener("change", measureSite);
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Blocks

  // `scope` is the conversation region, found once for a pass over several trees.
  function processTree(tree, scope = scopeElement()) {
    const elements = tree.matches(candidates) ? [tree] : [];
    elements.push(...tree.querySelectorAll(candidates));

    // Writes first, in document order, so each block can read its ancestors' marks.
    const marked = [];
    for (const element of elements) {
      if (!isEligible(element, scope)) {
        clearMarks(element);
        continue;
      }
      const direction = directionFor(element);
      setMark(element, MARK.dir, direction);
      const outermost = !element.parentElement?.closest(`[${MARK.top}]`);
      setMark(element, MARK.top, outermost ? "" : null);
      if (direction !== null) marked.push(element);
    }

    for (const link of tree.querySelectorAll("a")) {
      const inMarkedBlock = link.closest(`[${MARK.dir}]`) !== null;
      setMark(link, MARK.ltr, inMarkedBlock && isAddressText(link.textContent) ? "" : null);
    }

    // A unit the site presents as a whole keeps its own typography, and what
    // the site renders as inline code without a code element is treated as
    // inline code.
    for (const [selector, mark] of [[site.capsule, MARK.unit], [site.token, MARK.token]]) {
      if (!selector) continue;
      const found = [...tree.querySelectorAll(selector)];
      if (tree.matches(selector)) found.push(tree);
      for (const element of found) {
        const ours = scope.contains(element) && !element.closest(site.exclude) && (!site.within || element.closest(site.within) !== null);
        setMark(element, mark, ours ? "" : null);
      }
    }

    if (theming()) markSurfaces(tree, scope);

    // Then alignment reads, gathered before any further write.
    const misaligned = [];
    const containers = [];
    for (const element of marked) {
      if (element.matches(MIRRORED)) {
        if (!element.hasAttribute(MARK.mirror) && !mirrorChecked.has(element)) containers.push(element);
      } else if (!element.matches("table") && !element.hasAttribute(MARK.align)) {
        if (needsStartAlignment(element, element.getAttribute(MARK.dir))) misaligned.push(element);
      }
    }
    for (const element of misaligned) setMark(element, MARK.align, "");

    // Last, the mirror check, once per list or quotation that reads against
    // the page's direction. Each is measured under its own direction and under
    // the page's; they are measured together, so the browser works out the
    // styles twice for all of them and not twice for each.
    if (containers.length === 0) return;
    const pageDirection = view.getComputedStyle(root).direction;
    const against = containers.filter((element) => element.getAttribute(MARK.dir) !== pageDirection);
    if (against.length === 0) return;
    const directions = against.map((element) => element.getAttribute(MARK.dir));
    const ours = against.map(sideLayout);
    for (const element of against) setMark(element, MARK.dir, pageDirection);
    const pages = against.map(sideLayout);
    for (const [index, element] of against.entries()) setMark(element, MARK.dir, directions[index]);
    for (const [index, element] of against.entries()) {
      mirrorChecked.add(element);
      const mirror = mirrorFor(ours[index], pages[index], pageDirection);
      if (mirror) applyMirror(element, mirror);
    }
  }

  function applyMirror(element, mirror) {
    for (const [property, value] of Object.entries(mirror)) element.style.setProperty(property, value);
    setMark(element, MARK.mirror, "");
  }

  function outermostCandidate(node, scope) {
    let found = null;
    for (let element = node; element; element = element.parentElement) {
      if (element.matches(candidates)) found = element;
      if (element === scope) break;
    }
    return found;
  }

  // Remove every block mark and keep the saved place, which does not depend
  // on the reading aspects.
  function clearBlocks() {
    mirrorChecked = new WeakSet();
    const shown = place?.element.getAttribute(MARK.place) ?? null;
    const flashing = place?.element.hasAttribute(MARK.flash) ?? false;
    for (const element of document.querySelectorAll(anyMark)) clearMarks(element);
    removeProperties(root, Object.values(SITE_PROPERTIES));
    if (shown !== null) place.element.setAttribute(MARK.place, shown);
    if (flashing) place.element.setAttribute(MARK.flash, "");
  }

  // ---------------------------------------------------------------------------
  // Saved place

  const conversation = () => conversationId(site.conversation, document.location.pathname);

  // The region that scrolls the conversation.
  function scrollerElement() {
    const scope = scopeElement();
    if (site.scroller) {
      const named = scope.closest(site.scroller) ?? [...scope.querySelectorAll(site.scroller)].find(isRendered);
      if (named) return named;
    }
    const from = (site.prose && scope.querySelector(site.prose)) || scope;
    for (let element = from.parentElement; element && element !== document.body && element !== root; element = element.parentElement) {
      const overflow = view.getComputedStyle(element).overflowY;
      if ((overflow === "auto" || overflow === "scroll") && element.scrollHeight > element.clientHeight + 1) return element;
    }
    return document.scrollingElement ?? root;
  }

  // The conversation's scrolling region in one coordinate system. A site can
  // lay the conversation out from its end (a reversed flex column); the
  // browser then counts scrollTop from 0 at the end into negative numbers
  // towards the beginning, and a positive value does nothing. Here a position
  // is always the distance from the beginning of the conversation, whichever
  // way the site lays it out.
  function scrolling(scroller) {
    const style = view.getComputedStyle(scroller);
    const reversed =
      scroller.scrollTop < -0.5 || (style.display.includes("flex") && style.flexDirection === "column-reverse");
    const range = () => Math.max(0, scroller.scrollHeight - scroller.clientHeight);
    const start = () => (reversed ? -range() : 0);
    return {
      range,
      get offset() {
        return scroller.scrollTop - start();
      },
      moveTo(offset) {
        scroller.scrollTop = start() + Math.min(range(), Math.max(0, offset));
      },
      moveBy(distance, behavior = "auto") {
        scroller.scrollBy({ top: distance, behavior });
      },
    };
  }

  // The part of the window in which the conversation can be read clearly: the
  // scrolling region, less whatever the site keeps over its top and bottom
  // edges, less a small inset. A cover is found from the page's geometry, not
  // by asking what a pointer would hit: a header can lie over the text and let
  // the pointer through. A cover is a positioned element that lies across an
  // edge of the region, is a good part of its width and a small part of its
  // height, and does not scroll with the conversation. Something painted
  // behind the text can be taken for one; the only cost is a place a little
  // further down.
  function readingArea() {
    const scroller = scrollerElement();
    const page = scroller === (document.scrollingElement ?? root);
    const frame = page
      ? { top: 0, bottom: view.innerHeight, left: 0, right: view.innerWidth }
      : scroller.getBoundingClientRect();
    const edge = { top: Math.max(0, frame.top), bottom: Math.min(view.innerHeight, frame.bottom) };
    const height = edge.bottom - edge.top;
    const width = frame.right - frame.left;
    let top = edge.top;
    let bottom = edge.bottom;
    if (height > 0 && width > 0) {
      for (const element of document.body.querySelectorAll("*")) {
        const box = element.getBoundingClientRect();
        if (box.height < 4 || box.height > height * COVER_SHARE || box.width < width * 0.3) continue;
        if (box.right <= frame.left + 16 || box.left >= frame.right - 16) continue;
        const over = box.top <= edge.top + COVER_REACH && box.bottom > top;
        const under = box.bottom >= edge.bottom - COVER_REACH && box.top < bottom;
        if (!over && !under) continue;
        const style = view.getComputedStyle(element);
        const position = style.position;
        if (position !== "fixed" && position !== "sticky" && position !== "absolute") continue;
        if (style.visibility === "hidden" || style.opacity === "0") continue;
        // What is placed in the conversation's own content moves with it.
        if (position === "absolute" && (page || (scroller.contains(element) && element.offsetParent !== scroller))) continue;
        if (over) top = Math.max(top, box.bottom);
        else bottom = Math.min(bottom, box.top);
      }
    }
    return { top: top + SAFE_INSET, bottom: bottom - SAFE_INSET, edge };
  }

  // Larger than a text kept only for screen readers, and not hidden.
  function isReadable(element) {
    const box = element.getBoundingClientRect();
    if (box.width <= 2 || box.height <= 2) return false;
    return element.checkVisibility?.({ visibilityProperty: true }) ?? true;
  }

  // The key of the turn that holds a root of response text, where the site
  // identifies turns.
  function turnOf(prose, scope) {
    const turn = site.turn ? prose.closest(`[${site.turn}]`) : null;
    if (turn === null || !scope.contains(turn)) return { holder: prose, key: null };
    const value = turn.getAttribute(site.turn);
    let known = turnKeys.get(turn);
    if (known?.value !== value) turnKeys.set(turn, (known = { value, key: messageKey(value) }));
    return { holder: known.key === null ? prose : turn, key: known.key };
  }

  function orderOf(holder) {
    if (!site.order) return null;
    const value = Number.parseInt(holder.closest(`[${site.order}]`)?.getAttribute(site.order) ?? "", 10);
    return Number.isInteger(value) && value >= 0 ? value : null;
  }

  // The responses now on the page, in order. A response is the roots of
  // response text that one turn holds; its blocks are read only when asked for.
  function responses() {
    const scope = scopeElement();
    const found = [];
    if (!site.prose) return found;
    for (const prose of scope.querySelectorAll(site.prose)) {
      if (!ownsProse(prose, scope) || !isRendered(prose)) continue;
      const { holder, key } = turnOf(prose, scope);
      let response = found.at(-1);
      if (response?.holder !== holder) {
        response = {
          holder,
          key,
          ordinal: orderOf(holder),
          roots: [],
          list: null,
          // The blocks a reader reads: paragraph-like elements that hold text
          // and no smaller paragraph-like element, outside every kept unit.
          get blocks() {
            if (this.list !== null) return this.list;
            this.list = [];
            for (const part of this.roots) {
              for (const element of part.querySelectorAll(markable)) {
                if (element.querySelector(markable) !== null || !isEligible(element, scope)) continue;
                const f = fingerprint(element.textContent);
                if (f !== null && isReadable(element)) this.list.push({ element, f, t: blockKind(element.localName) });
              }
            }
            return this.list;
          },
        };
        found.push(response);
      }
      response.roots.push(prose);
    }
    return found;
  }

  function hidePlace() {
    if (place === null) return;
    setMark(place.element, MARK.place, null);
    setMark(place.element, MARK.flash, null);
    place = null;
  }

  function showPlace(element, quality, key) {
    if (place !== null && place.element !== element) hidePlace();
    setMark(element, MARK.place, quality);
    place = { key, element, quality };
  }

  // Find the saved place of this conversation on the page as it is now.
  function locate() {
    placeLookedAt = Date.now();
    const id = conversation();
    const key = id === null ? null : conversationKey(site.id, id);
    const record = key === null ? null : (saved.byKey.get(key) ?? null);
    if (record === null) {
      hidePlace();
      return { status: id === null ? "nowhere" : "none" };
    }
    const found = responses();
    const answer = locatePlace(record, found);
    if (answer.status !== "exact" && answer.status !== "approximate") {
      hidePlace();
      return { status: answer.status, record };
    }
    const { element } = found[answer.message].blocks[answer.block];
    showPlace(element, answer.status, key);
    return { status: answer.status, element, record };
  }

  // Keep the place shown while content arrives, re-renders or the
  // conversation changes. Costs next to nothing where no place is saved.
  function keepPlace() {
    if (preferences === null) return;
    const id = conversation();
    const key = id === null ? null : conversationKey(site.id, id);
    const record = key === null ? null : (saved.byKey.get(key) ?? null);
    if (record === null) {
      hidePlace();
      return;
    }
    // A place that was found exactly is still the place only while it is on
    // the page with the text it was saved with.
    const settled =
      place !== null &&
      place.key === key &&
      place.quality === "exact" &&
      place.element.isConnected &&
      fingerprint(place.element.textContent) === record.f;
    if (settled) return;
    const wait = PLACE_RETRY_MS - (Date.now() - placeLookedAt);
    if (wait <= 0) {
      locate();
    } else if (placeTimer === null) {
      placeTimer = view.setTimeout(() => {
        placeTimer = null;
        keepPlace();
      }, wait);
    }
  }

  // Whether a point of a block is the block's own on screen: nothing that takes
  // the pointer (a menu, a dialog) lies over it there.
  function shows(element, x, y) {
    const hit = document.elementFromPoint(Math.min(view.innerWidth - 1, Math.max(0, x)), y);
    return hit !== null && element.contains(hit);
  }

  // Whether a block begins clearly in the reading area: its first line is
  // below whatever covers the top, and at least a line of it is above the
  // bottom.
  function beginsIn(area, box) {
    return box.top >= area.top - 0.5 && box.top <= area.bottom - Math.min(box.height, LINE);
  }

  // The block to save. A selection in view says exactly which: the readable
  // block that holds it. Without one it is the first readable block that
  // begins clearly in the reading area, so the reader sees all of what was
  // saved; a block that merely reaches into view from above, under the site's
  // header, is passed over. Only where no block begins in view (one long
  // paragraph fills the screen) is it the block being read at the top. Nothing
  // is guessed about where the reader is looking.
  function blockToSave(found) {
    const area = readingArea();
    const inSight = (box) => box.bottom > area.edge.top + 1 && box.top < area.edge.bottom - 1;

    const selection = document.getSelection?.();
    if (selection && !selection.isCollapsed && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      for (const response of found) {
        if (!response.roots.some((part) => range.intersectsNode(part))) continue;
        const index = response.blocks.findIndex(({ element }) => range.intersectsNode(element));
        if (index !== -1 && inSight(response.blocks[index].element.getBoundingClientRect())) return { response, index };
      }
    }

    let reading = null;
    for (const response of found) {
      if (!response.roots.some((part) => inSight(part.getBoundingClientRect()))) continue;
      for (const [index, { element }] of response.blocks.entries()) {
        const box = element.getBoundingClientRect();
        if (!inSight(box)) continue;
        const x = box.left + box.width / 2;
        if (beginsIn(area, box) && shows(element, x, box.top + Math.min(box.height / 2, 10))) return { response, index };
        const fills = box.top < area.top && box.bottom > area.top + LINE;
        if (reading === null && fills && shows(element, x, area.top + LINE / 2)) reading = { response, index };
      }
    }
    return reading;
  }

  // Where a block is along the conversation, from 0 to 1.
  function positionOf(element) {
    const scroller = scrollerElement();
    if (!(scroller.scrollHeight > 0)) return 0;
    const frame = scroller === (document.scrollingElement ?? root) ? 0 : scroller.getBoundingClientRect().top;
    return (element.getBoundingClientRect().top - frame + scrolling(scroller).offset) / scroller.scrollHeight;
  }

  function flash(element) {
    if (flashTimer !== null) view.clearTimeout(flashTimer);
    for (const other of document.querySelectorAll(`[${MARK.flash}]`)) if (other !== element) setMark(other, MARK.flash, null);
    setMark(element, MARK.flash, "");
    flashTimer = view.setTimeout(() => {
      flashTimer = null;
      setMark(element, MARK.flash, null);
    }, FLASH_MS);
  }

  // Wait for the page to settle after the conversation was scrolled.
  async function settle() {
    const began = Date.now();
    await pause(SETTLE_MIN_MS);
    // Nothing has changed yet: the page may still be bringing content in.
    while (changedAt < began && Date.now() - began < SETTLE_WAIT_MS) await pause(40);
    while (Date.now() - changedAt < QUIET_MS && Date.now() - began < SETTLE_MAX_MS) await pause(40);
  }

  // Look through the conversation for the response a place was saved in, when
  // that response is not in the document. A site can keep only the responses
  // near the viewport in the document, and can load the earlier part of a
  // conversation only when its beginning is scrolled into view.
  //
  // The conversation's own scrolling region is moved, and the page is asked
  // again after each move:
  //   1. where the site numbers its rows, a few jumps straight towards the
  //      row the place was saved in;
  //   2. then a walk in the direction the place is expected in, and after
  //      that in the other, each from where the reader was. A walk goes one
  //      stretch at a time. A stretch ends at the edge of what the site has
  //      in the document on that side, so nothing lies between two stops that
  //      was never in the document, and it is most of one screen where
  //      nothing is. At the beginning the page is given a moment to load what
  //      came before; if the conversation grows, the walk goes on.
  //
  // The search ends when the place is found, when the reader does anything,
  // when the conversation or Readela's state changes, and at its limits.
  // Unless it found the place or was taken over, it puts the conversation
  // back where it was.
  async function searchFor(record) {
    const scroller = scrollerElement();
    const page = scroller === (document.scrollingElement ?? root);
    const motion = scrolling(scroller);
    const frame = () => (page ? { top: 0, bottom: view.innerHeight } : scroller.getBoundingClientRect());
    const screen = () => (page ? view.innerHeight : scroller.clientHeight);

    const origin = { offset: motion.offset, fromEnd: motion.range() - motion.offset };
    const restore = () =>
      motion.moveTo(origin.fromEnd < origin.offset ? motion.range() - origin.fromEnd : origin.offset);
    const route = conversation();
    let stopped = false;
    const stop = () => {
      stopped = true;
    };
    const live = () => !stopped && preferences !== null && conversation() === route;
    for (const name of TAKEOVER) view.addEventListener(name, stop, { capture: true, passive: true });
    search = { stop };

    const began = Date.now();
    let stops = 0;
    const spent = () => stops >= SEARCH_STOPS || Date.now() - began > SEARCH_MS;
    let found = { status: "absent" };
    // One stop: move, let the page settle, ask again. True while the search goes on.
    const look = async (offset) => {
      stops += 1;
      motion.moveTo(offset);
      await settle();
      if (!live()) return false;
      found = locate();
      return found.status === "absent";
    };

    // The rows the site numbers, and the one nearest to the saved row.
    const nearestRow = () => {
      if (record.n === null) return null;
      const rows = responses().filter((response) => response.ordinal !== null);
      if (rows.length === 0) return null;
      const row = rows.reduce((best, other) =>
        Math.abs(other.ordinal - record.n) < Math.abs(best.ordinal - record.n) ? other : best,
      );
      return { row, rows, gap: record.n - row.ordinal };
    };

    // 1. By row number. The number only says which way to go and roughly how far.
    const jump = async () => {
      for (let jumps = 0; jumps < ROW_JUMPS && !spent(); jumps += 1) {
        const near = nearestRow();
        if (near === null || Math.abs(near.gap) <= 2) return true;
        const heights = near.rows.map((row) => row.holder.getBoundingClientRect().height);
        const average = heights.reduce((sum, height) => sum + height, 0) / heights.length;
        const from = near.row.holder.getBoundingClientRect().top - frame().top + motion.offset;
        if (!(await look(from + near.gap * average * 0.8 - screen() / 4))) return false;
      }
      return true;
    };

    // What the site has in the document around the viewport on one side: how
    // far the unbroken run of turns reaches beyond the edge of the viewport.
    const reach = (direction) => {
      const edges = frame();
      // Rows where the site numbers them, turns where it marks them, else the responses.
      const part = site.order ?? site.turn;
      const boxes = (part ? [...scopeElement().querySelectorAll(`[${part}]`)] : responses().map((response) => response.holder))
        .filter(isRendered)
        .map((element) => element.getBoundingClientRect())
        .sort((first, second) => first.top - second.top);
      let run = null;
      for (const box of direction < 0 ? boxes.reverse() : boxes) {
        if (run === null) {
          if (box.bottom > edges.top && box.top < edges.bottom) run = box;
        } else if (direction < 0 ? run.top - box.bottom <= GAP && box.top < run.top : box.top - run.bottom <= GAP && box.bottom > run.bottom) {
          run = { top: Math.min(run.top, box.top), bottom: Math.max(run.bottom, box.bottom) };
        }
      }
      if (run === null) return 0;
      return Math.max(0, direction < 0 ? edges.top - run.top : run.bottom - edges.bottom);
    };

    // Whether the conversation grows at its beginning within a moment.
    const grows = async () => {
      const before = motion.range();
      const until = Date.now() + GROW_MS;
      while (live() && Date.now() < until) {
        await pause(80);
        if (motion.range() > before + 4) {
          await settle();
          return live();
        }
      }
      return false;
    };

    // 2. A walk towards the beginning (-1) or the end (+1). True while the search goes on.
    // The end of the region is where the position says so, within the
    // rounding of what a browser reports, and wherever a move no longer moves.
    const walk = async (direction) => {
      let held = false;
      for (;;) {
        if (spent()) return false;
        const at = motion.offset;
        const end = held || (direction < 0 ? at <= EDGE : at >= motion.range() - EDGE);
        if (end) {
          if (direction > 0 || !(await grows())) return live();
          held = false;
          found = locate();
          if (found.status !== "absent") return false;
          continue;
        }
        const stretch = Math.max(screen() * STRIDE, reach(direction) + screen() * 0.6);
        if (!(await look(at + direction * stretch))) return false;
        held = Math.abs(motion.offset - at) < 1;
      }
    };

    // Which way first: by row number where there is one, otherwise by where
    // the place was along the conversation when it was saved.
    const first = () => {
      const near = nearestRow();
      if (near !== null && near.gap !== 0) return Math.sign(near.gap);
      const here = (motion.offset + screen() / 2) / Math.max(1, scroller.scrollHeight);
      return record.p / POSITION_STEPS < here ? -1 : 1;
    };

    try {
      if (motion.range() > 0) {
        if (await jump()) {
          const direction = first();
          if (await walk(direction)) {
            restore();
            await settle();
            if (live()) await walk(-direction);
          }
        }
      }
      if (!live()) return { status: "stopped" };
      if (!found.element) {
        restore();
        found = found.status === "absent" || spent() ? { status: "absent" } : found;
      }
      return found;
    } finally {
      for (const name of TAKEOVER) view.removeEventListener(name, stop, { capture: true });
      if (search?.stop === stop) search = null;
    }
  }

  // Bring a place into view and confirm it is there to be read: its beginning
  // a little below whatever covers the top of the reading area, with some of
  // what precedes it still in view. Returns what was found there, or null: a
  // place is reported as reached only when it is seen clearly.
  async function arrive(element, immediate) {
    const calm = immediate || view.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
    const motion = scrolling(scrollerElement());
    const put = (target, behavior) => {
      const area = readingArea();
      const box = target.getBoundingClientRect();
      const room = area.bottom - area.top;
      const lead = Math.min(room * 0.2, 120);
      // A block taller than the room below the lead begins at the top of the area.
      const want = area.top + (box.height > room - lead ? Math.min(lead, 4) : lead);
      if (Math.abs(box.top - want) >= 1) motion.moveBy(box.top - want, behavior);
      return area;
    };
    const rest = async (target) => {
      const began = Date.now();
      let top = null;
      while (Date.now() - began < ARRIVE_MS) {
        await pause(90);
        if (preferences === null || !target.isConnected) return;
        const now = target.getBoundingClientRect().top;
        if (top !== null && Math.abs(now - top) < 1) return;
        top = now;
      }
    };

    put(element, calm ? "auto" : "smooth");
    await rest(element);
    // The page may have rendered the block again on the way, or moved it.
    for (let tries = 0; tries < 3; tries += 1) {
      if (preferences === null) return null;
      const again = locate();
      if (!again.element) return null;
      const area = readingArea();
      if (beginsIn(area, again.element.getBoundingClientRect())) {
        flash(again.element);
        return again;
      }
      put(again.element, "auto");
      await rest(again.element);
    }
    return null;
  }

  /** Whether this conversation has a saved place. */
  function placeStatus() {
    if (preferences === null) return { status: "off" };
    const { status } = locate();
    return { status: status === "nowhere" || status === "none" ? status : "saved" };
  }

  /**
   * Save the place the reader is at as this conversation's saved place.
   * Nothing is shown and nothing is reported as saved before the browser has
   * stored it. A conversation that has no place yet is refused when every
   * place is in use; no other place is given up for it.
   */
  async function savePlace() {
    if (preferences === null) return { status: "off" };
    const id = conversation();
    if (id === null) return { status: "nowhere" };
    const found = responses();
    const target = blockToSave(found);
    if (target === null) return { status: "nothing" };

    const key = conversationKey(site.id, id);
    const { response, index } = target;
    const record = { ...createPlace(response, index, positionOf(response.blocks[index].element)), k: key };
    // A place that could not be told from an identical one is not saved.
    const check = locatePlace(record, found);
    if (check.status !== "exact" || found[check.message] !== response || check.block !== index) {
      return { status: "ambiguous" };
    }
    if (saved.full && !saved.byKey.has(key)) return { status: "full" };
    // The row of this conversation in the site's list, where its address
    // does not say so itself; one that was known is kept until another is seen.
    const row = ownRow() ?? saved.byKey.get(key)?.r ?? null;
    if (row !== null) record.r = row;

    search?.stop();
    let stored;
    try {
      stored = await store((current) => saveMark(current, key, record));
    } catch {
      return { status: "failed" };
    }
    const now = indexMarks(stored);
    if (!samePlace(now.byKey.get(key) ?? null, record)) {
      return { status: now.full && !now.byKey.has(key) ? "full" : "failed" };
    }
    saved = now;
    if (preferences === null) return { status: "saved" };
    watch();
    markRows();
    return { status: "saved", element: locate().element ?? null };
  }

  /**
   * Bring the saved place into view. Nothing is reported as reached unless the
   * place is trusted and seen clearly in view; a place that is not found stays
   * saved.
   */
  async function returnToPlace() {
    if (preferences === null) return { status: "off" };
    search?.stop();
    let found = locate();
    const searched = found.status === "absent";
    if (searched) found = await searchFor(found.record);
    if (found.status === "stopped" || found.status === "nowhere" || found.status === "none") return { status: found.status };
    if (!found.element) return { status: "unresolved" };
    const reached = await arrive(found.element, searched);
    if (reached === null) return { status: "unresolved" };
    return { status: reached.status === "exact" ? "arrived" : "approximate" };
  }

  /** Forget this conversation's saved place, once the browser has removed it. */
  async function clearPlace() {
    if (preferences === null) return { status: "off" };
    const id = conversation();
    if (id === null) return { status: "nowhere" };
    const key = conversationKey(site.id, id);
    search?.stop();
    let stored;
    try {
      stored = await store((current) => removeMark(current, key));
    } catch {
      return { status: "failed" };
    }
    const now = indexMarks(stored);
    if (now.byKey.has(key)) return { status: "failed" };
    saved = now;
    hidePlace();
    watch();
    markRows();
    return { status: "none" };
  }

  // ---------------------------------------------------------------------------
  // Bookmarked conversations in the site's own lists
  //
  // The one thing Readela does outside the conversation: the link of a
  // conversation that has a saved place, in the sidebar or history the site
  // shows, gets one attribute, and the stylesheet draws a small bookmark in
  // the row from it. Only the link's address path is read, in memory. No
  // title, label or address is kept, and nothing else about a row is changed.
  //
  // A row is recognised in one of two ways. Where its address names the
  // conversation, the same key the place is stored under is derived from it.
  // Where it does not (a site can list a conversation under an address other
  // than the one it shows it at), the site's own mark on the row of the
  // conversation shown says which row it is, and a fingerprint of that row's
  // address path is kept with the place.

  function rowOf(link) {
    const address = link.getAttribute("href") ?? "";
    const known = rowKeys.get(address);
    if (known !== undefined) return known;
    const found = { key: null, row: null };
    try {
      const url = new URL(address, document.location.href);
      if (site.hosts.includes(url.hostname)) {
        const id = conversationId(site.conversation, url.pathname);
        if (id !== null) found.key = conversationKey(site.id, id);
        else found.row = rowFingerprint(site.id, url.pathname);
      }
    } catch {
      // Not an address: no row of a conversation.
    }
    if (rowKeys.size >= ROW_MEMORY) rowKeys.clear();
    rowKeys.set(address, found);
    return found;
  }

  // The bookmark is drawn in the row a link sits in, which has to be the box
  // the link is positioned in; where it is not, the row is left unmarked.
  function sitsInRow(link) {
    const row = link.offsetParent;
    if (row === null || !row.contains(link)) return false;
    return row.getBoundingClientRect().height <= link.getBoundingClientRect().height * 3 + 24;
  }

  // The fingerprint of the row the site marks as the conversation shown,
  // where there is exactly one and its address does not name a conversation.
  function ownRow() {
    if (!site.rows || !site.rowShown) return null;
    let found = null;
    for (const link of document.querySelectorAll(site.rows)) {
      if (!link.matches(site.rowShown) || !isRendered(link)) continue;
      if (found !== null) return null;
      found = rowOf(link);
    }
    return found === null || found.key !== null ? null : found.row;
  }

  function markRows() {
    rowsChanged = false;
    if (!site.rows) return;
    const marked = document.querySelectorAll(`[${MARK.saved}]`);
    if (preferences === null || saved.size === 0) {
      for (const link of marked) link.removeAttribute(MARK.saved);
      return;
    }
    const wanted = new Set();
    for (const link of document.querySelectorAll(site.rows)) {
      const { key, row } = rowOf(link);
      if (!(key !== null ? saved.byKey.has(key) : row !== null && saved.rows.has(row))) continue;
      if (!link.hasAttribute(MARK.saved) && !sitsInRow(link)) continue;
      wanted.add(link);
      setMark(link, MARK.saved, site.rowPlacement ?? "");
    }
    for (const link of marked) if (!wanted.has(link)) link.removeAttribute(MARK.saved);
  }

  // Where a row is recognised by its fingerprint: keep the fingerprint of the
  // row the site marks as this conversation's with the place. It is written
  // when the same row has been seen for this conversation on two beats, and
  // the stored place names none or another. Only that one value changes.
  function learnRow() {
    if (preferences === null || !site.rowShown) return;
    const id = conversation();
    const key = id === null ? null : conversationKey(site.id, id);
    const record = key === null ? null : (saved.byKey.get(key) ?? null);
    const row = record === null ? null : ownRow();
    if (row === null || record.r === row) {
      rowSeen = null;
      return;
    }
    if (rowSeen === null || rowSeen.key !== key || rowSeen.row !== row) {
      rowSeen = { key, row, at: Date.now() };
      wake(2); // look once more
      return;
    }
    if (Date.now() - rowSeen.at < ROUTE_CHECK_MS / 2) return;
    rowSeen = null;
    store((current) => {
      const now = findMark(current, key);
      return now === null ? current : saveMark(current, key, { ...now, r: row });
    }).then(
      (stored) => {
        if (preferences !== null) setMarks(stored);
      },
      () => {},
    );
  }

  /**
   * Save or update the place as `savePlace` does, for a command that comes
   * without the popup: the saved paragraph says so itself, for a moment.
   */
  async function quickSave() {
    const answer = await savePlace();
    if (answer.status === "saved" && answer.element && preferences !== null) flash(answer.element);
    return answer;
  }

  /** Take the stored places, at start and whenever they change in storage. */
  function setMarks(next) {
    saved = indexMarks(normalizeMarks(next));
    if (preferences === null) return;
    watch();
    markRows();
    // The row of this conversation may be one the changed places do not name.
    wake(2);
    placeLookedAt = 0;
    keepPlace();
  }

  // ---------------------------------------------------------------------------
  // Following the page
  //
  // What keeps Readela current, and nothing more:
  //   - changes to the document, gathered and handled together (flush);
  //   - a change of address, which a site makes without loading a page: by
  //     the browser's own event for it, or, where there is none, by comparing
  //     the address once a second while the page is in view (beat);
  //   - the stored preferences and places, as they change.
  // Off, and with every aspect Original and nothing saved, none of this runs.

  // Move the marks to the conversation now shown, where that has changed, and
  // bring the site's lists up to date where their rows have.
  function follow() {
    if (preferences === null) return;
    const scope = scopeElement();
    if (scope !== scopeSeen) {
      scopeSeen = scope;
      if (place !== null && !scope.contains(place.element)) hidePlace();
      for (const element of document.querySelectorAll(anyMark)) {
        if (!scope.contains(element)) clearMarks(element);
      }
      if (reading()) {
        if (theming()) measureSite(scope);
        measureFont(scope);
        processTree(scope, scope);
        examineIslands();
      }
    }
    const route = conversation();
    if (route !== routeSeen) {
      routeSeen = route;
      search?.stop();
      placeLookedAt = 0;
    }
    if (rowsChanged) {
      markRows();
      learnRow();
    }
  }

  // One beat. Where the browser does not report it, the address is compared
  // with the one last seen. Only after a change, and on the few beats that
  // follow it, is anything else looked at.
  function beat() {
    if (preferences === null) return;
    if (!isAlive()) {
      stop();
      return;
    }
    const path = document.location.pathname;
    if (path !== pathSeen) {
      pathSeen = path;
      beatsLeft = ROUTE_SETTLE_BEATS;
    }
    if (beatsLeft > 0) {
      beatsLeft -= 1;
      follow();
      learnRow();
      keepPlace();
    }
    keepBeat();
  }

  // Look at the page again on the next `beats` beats.
  function wake(beats) {
    beatsLeft = Math.max(beatsLeft, beats);
    keepBeat();
  }

  // The browser's own word that the address changed. It arrives while the
  // site is still changing it, so nothing is looked at here: the next beats do.
  function onRoute() {
    if (preferences === null) return;
    wake(ROUTE_SETTLE_BEATS);
    if (timer === null) timer = view.setTimeout(flush, FLUSH_DELAY_MS);
  }

  function flush() {
    timer = null;
    if (preferences === null) return;
    if (!isAlive()) {
      stop();
      return;
    }

    follow();
    if (reading() && pending.size > 0) {
      const scope = scopeSeen; // found by follow, a moment ago
      if (theming()) measureSite(scope);
      const roots = new Set();
      for (const node of pending) {
        if (!node.isConnected) continue;
        if (!scope.contains(node)) {
          if (node.contains(scope)) roots.add(scope);
          continue;
        }
        if (node.closest(site.exclude)) continue;
        // A kept unit whose content changed is examined again as the site made it.
        const unit = node.closest(`[${MARK.island}]`);
        if (unit) clearIsland(unit);
        // Changes that neither sit in nor bring in readable content are skipped.
        if (site.within && !node.closest(site.within) && !node.querySelector(site.within)) continue;
        roots.add(outermostCandidate(node, scope) ?? node);
      }
      for (const tree of roots) {
        let covered = false;
        for (const other of roots) covered ||= other !== tree && other.contains(tree);
        if (!covered) processTree(tree, scope);
      }
      examineIslands();
    }
    pending.clear();
    keepPlace();
  }

  function onMutations(records) {
    changedAt = Date.now();
    for (const record of records) {
      const { target } = record;
      if (record.type === "attributes") {
        // The address of a link in the site's lists changed in place.
        if (site.rows && target.matches(site.rows)) rowsChanged = true;
        continue;
      }
      // What is typed is none of the reader's business: nothing in an
      // editable field is ever read, and typing changes it key by key.
      const holder = target.nodeType === ELEMENT ? target : target.parentElement;
      if (holder === null || holder.isContentEditable) continue;
      if (record.type === "characterData") {
        pending.add(holder);
        continue;
      }
      let textChanged = record.removedNodes.length > 0;
      for (const node of record.addedNodes) {
        if (node.nodeType !== ELEMENT) {
          textChanged = true;
          continue;
        }
        pending.add(node);
        if (site.rows && !rowsChanged && (node.matches(site.rows) || node.querySelector(site.rows) !== null)) {
          rowsChanged = true;
        }
      }
      // A block whose own text changed is measured again; a plain wrapper
      // that only lost children is not worth a pass over everything in it.
      if (textChanged && target.nodeType === ELEMENT && target.closest(candidates)) pending.add(target);
    }
    if ((pending.size > 0 || rowsChanged) && timer === null) timer = view.setTimeout(flush, FLUSH_DELAY_MS);
  }

  // The beat runs only while the page is observed and in view, and, where the
  // browser reports changes of address, only while there is something left to
  // look at. A page that comes back into view is looked at once, at once.
  function keepBeat() {
    const wanted = observer !== null && document.visibilityState !== "hidden" && (!routeEvents || beatsLeft > 0);
    if (wanted && routeTimer === null) {
      routeTimer = view.setInterval(beat, ROUTE_CHECK_MS);
    } else if (!wanted && routeTimer !== null) {
      view.clearInterval(routeTimer);
      routeTimer = null;
    }
  }

  function onVisibility() {
    if (observer === null || document.visibilityState === "hidden") {
      keepBeat();
      return;
    }
    wake(1);
    beat();
  }

  // The page is observed only while there is something to keep current: a
  // reading aspect that changes the page, or a saved place.
  function watch() {
    const needed = preferences !== null && (reading() || saved.size > 0);
    if (needed && observer === null) {
      observer = new view.MutationObserver(onMutations);
      // The address of a link is the one attribute observed, for the rows of
      // the site's lists.
      observer.observe(root, { childList: true, subtree: true, characterData: true, attributeFilter: ["href"] });
      document.addEventListener("visibilitychange", onVisibility);
      if (routeEvents) view.navigation.addEventListener("currententrychange", onRoute);
      pathSeen = document.location.pathname;
      wake(ROUTE_SETTLE_BEATS);
    } else if (!needed && observer !== null) {
      observer.disconnect();
      observer = null;
      document.removeEventListener("visibilitychange", onVisibility);
      if (routeEvents) view.navigation.removeEventListener("currententrychange", onRoute);
      beatsLeft = 0;
      keepBeat();
      if (timer !== null) view.clearTimeout(timer);
      timer = null;
      pending.clear();
    }
  }

  function setRootMarks() {
    for (const [preference, name] of Object.entries(ROOT_MARKS)) {
      const value = preferences[preference];
      setMark(root, name, value === "page" ? null : value);
    }
  }

  /** Remove Readela's footprint and release everything it holds. Safe to call repeatedly. */
  function stop() {
    preferences = null;
    search?.stop();
    observer?.disconnect();
    observer = null;
    document.removeEventListener("visibilitychange", onVisibility);
    if (routeEvents) view.navigation.removeEventListener("currententrychange", onRoute);
    beatsLeft = 0;
    keepBeat();
    watchSite();
    for (const pendingTimer of [timer, placeTimer, flashTimer]) {
      if (pendingTimer !== null) view.clearTimeout(pendingTimer);
    }
    timer = null;
    placeTimer = null;
    flashTimer = null;
    pending.clear();
    mirrorChecked = new WeakSet();
    freshIslands = [];
    place = null;
    scopeSeen = null;
    routeSeen = null;
    pathSeen = null;
    beatsLeft = 0;
    rowSeen = null;
    rowKeys.clear();
    markRows();

    for (const element of document.querySelectorAll(anyMark)) clearMarks(element);
    for (const name of Object.values(ROOT_MARKS)) setMark(root, name, null);
    removeProperties(root, Object.values(SITE_PROPERTIES));
  }

  /**
   * Present the page according to `next`. Calling it again with the same or
   * different preferences updates in place; it never adds a second observer.
   *
   * @param {unknown} next reading preferences (validated here)
   */
  function apply(next) {
    const normalized = normalizePreferences(next);
    if (!normalized.enabled) {
      stop();
      return;
    }

    // Marks made for another direction or theme are not carried over.
    const restyled =
      preferences !== null && (preferences.direction !== normalized.direction || preferences.theme !== normalized.theme);
    preferences = normalized;
    setRootMarks();
    watchSite();
    if (restyled || !reading()) clearBlocks();
    scopeSeen = scopeElement();
    routeSeen = conversation();
    if (reading()) {
      if (theming()) measureSite(scopeSeen);
      measureFont(scopeSeen);
      processTree(scopeSeen, scopeSeen);
      examineIslands();
    }
    watch();
    markRows();
    placeLookedAt = 0;
    keepPlace();
  }

  return { apply, stop, setMarks, placeStatus, savePlace, quickSave, returnToPlace, clearPlace };
}
