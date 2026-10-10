// Page integration: reads the conversation, marks its blocks for the reading
// aspects that are switched on, keeps the marks current while content streams
// in, and shows the reading mark.
//
// Readela's whole footprint in the page is a set of `data-readela-*`
// attributes, plus a few `--readela-*` custom properties: on a list or
// quotation that needs mirroring, and on the root element while a reading
// theme is on. Text nodes, element structure, page-owned attributes and
// page-owned styles are never written, so removing the footprint restores the
// page's own presentation exactly.

import {
  changesPage,
  conversationKey,
  createMark,
  fingerprint,
  isAddressText,
  locateMark,
  measureScripts,
  normalizeMarks,
  normalizePreferences,
  removeMark,
  resolveDirection,
  saveMark,
} from "../core/index.js";
import {
  ELEMENT_MARKS,
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

// A container that holds somewhere to type is never a reading surface.
const TYPING = 'form, textarea, [contenteditable]:not([contenteditable="false"]), [role="textbox"]';

// Streaming produces many small mutations; they are handled together.
const FLUSH_DELAY_MS = 60;

// A saved mark that is not on the page yet is looked for again as content
// arrives, at most this often.
const PLACE_RETRY_MS = 500;

// How long the place stays emphasised after "Go to mark".
const FLASH_MS = 1800;

const ELEMENT = 1;
const TEXT = 3;

/**
 * @param {object} options
 * @param {Document} options.document
 * @param {{ scope: string, within?: string, surface?: string, extraBlocks?: string, exclude: string }} options.site
 *   a site adapter; see `sites/index.js` for the contract
 * @param {() => boolean} [options.isAlive] returns false once the extension
 *   that owns this reader is gone; the reader then removes its footprint.
 * @param {(marks: object) => void} [options.saveMarks] called with the whole
 *   marks object whenever the reader saves or clears a reading mark
 */
export function createReader({ document, site, isAlive = () => true, saveMarks = () => {} }) {
  const view = document.defaultView;
  const root = document.documentElement;
  const candidates = [TEXT_BLOCKS, CONTAINERS, "pre", site.extraBlocks].filter(Boolean).join(", ");
  const markable = [TEXT_BLOCKS, site.extraBlocks].filter(Boolean).join(", ");
  const anyMark = ELEMENT_MARKS.map((name) => `[${name}]`).join(", ");

  let preferences = null; // null while stopped
  let observer = null;
  let siteWatcher = null; // follows the site's own theme while a reading theme is on
  let timer = null;
  const pending = new Set();
  let mirrorChecked = new WeakSet(); // lists and quotations already examined by mirrorFor

  let marks = normalizeMarks(undefined);
  let place = null; // { key, element, quality } while the reading mark is shown
  let placeLookedAt = 0;
  let placeTimer = null;
  let flashTimer = null;

  const scopeElement = () => document.querySelector(site.scope) ?? document.body;
  const reading = () => preferences !== null && changesPage(preferences);
  const theming = () => preferences !== null && preferences.theme !== "page";

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

  function clearMarks(element) {
    if (element.hasAttribute(MARK.mirror)) removeProperties(element, MIRROR_PROPERTIES);
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

    let skip = PROTECTED;
    if (element.matches(LISTS)) {
      skip = `${PROTECTED}, ${LISTS}`; // nested lists decide for themselves
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
    return element.matches("pre") ? !element.parentElement?.closest(PROTECTED) : !element.closest(PROTECTED);
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
  function mirrorFor(element, direction) {
    const pageDirection = view.getComputedStyle(root).direction;
    const ours = sideLayout(element);
    setMark(element, MARK.dir, pageDirection);
    const pages = sideLayout(element);
    setMark(element, MARK.dir, direction);

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

  const isClear = (colour) => colour === "transparent" || /(?:,\s*0|\/\s*0)\)$/.test(colour);

  // The site's own background and text colour around the conversation, for the
  // parts of a response that keep the site's presentation under a theme.
  function measureSite() {
    const scope = scopeElement();
    let surface = "rgb(255, 255, 255)";
    for (let element = scope; element; element = element.parentElement) {
      const colour = view.getComputedStyle(element).backgroundColor;
      if (!isClear(colour)) {
        surface = colour;
        break;
      }
    }
    const values = { [SITE_PROPERTIES.surface]: surface, [SITE_PROPERTIES.text]: view.getComputedStyle(scope).color };
    for (const [property, value] of Object.entries(values)) {
      if (root.style.getPropertyValue(property) !== value) root.style.setProperty(property, value);
    }
  }

  // The reading surface of a block: the container that holds a response's
  // text. The reader's own messages and anything that holds somewhere to type
  // are left to the site. `verdicts` remembers containers already examined.
  function sheetOf(block, scope, verdicts) {
    if (block.matches("pre") || (site.extraBlocks && block.matches(site.extraBlocks))) return null;
    // A block taken out of the flow (a heading kept for screen readers, say)
    // is not part of what is read on the page.
    if (/^(?:absolute|fixed)$/.test(view.getComputedStyle(block).position)) return null;
    const parent = block.parentElement;
    if (!parent || parent === scope || parent === document.body || parent === root) return null;
    if (!verdicts.has(parent)) {
      const allowed = !site.surface || parent.closest(site.surface) !== null;
      verdicts.set(parent, allowed && parent.querySelector(TYPING) === null);
    }
    return verdicts.get(parent) ? parent : null;
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

  function markSheets(tree, tops, scope) {
    const verdicts = new Map();
    const wanted = new Set();
    for (const block of tops) {
      const sheet = sheetOf(block, scope, verdicts);
      if (sheet) wanted.add(sheet);
    }
    const known = [...tree.querySelectorAll(`[${MARK.sheet}]`)];
    if (tree.hasAttribute(MARK.sheet)) known.push(tree);
    for (const sheet of known) {
      const holds = [...sheet.children].some(
        (child) => child.hasAttribute(MARK.top) && sheetOf(child, scope, verdicts) === sheet,
      );
      if (holds) wanted.add(sheet);
      else setMark(sheet, MARK.sheet, null);
    }
    // A surface inside another one is part of it, not a second sheet.
    const settle = (sheet) => setMark(sheet, MARK.sheet, sheet.parentElement?.closest(`[${MARK.sheet}]`) ? "inner" : "");
    for (const sheet of wanted) if (!sheet.hasAttribute(MARK.sheet)) sheet.setAttribute(MARK.sheet, "");
    for (const sheet of wanted) {
      settle(sheet);
      for (const inner of sheet.querySelectorAll(`[${MARK.sheet}]`)) settle(inner);
    }
  }

  // ---------------------------------------------------------------------------
  // Blocks

  function processTree(tree) {
    const scope = scopeElement();
    const elements = tree.matches(candidates) ? [tree] : [];
    elements.push(...tree.querySelectorAll(candidates));

    // Writes first, in document order, so each block can read its ancestors' marks.
    const marked = [];
    const tops = [];
    for (const element of elements) {
      if (!isEligible(element, scope)) {
        clearMarks(element);
        continue;
      }
      const direction = directionFor(element);
      setMark(element, MARK.dir, direction);
      const outermost = !element.parentElement?.closest(`[${MARK.top}]`);
      setMark(element, MARK.top, outermost ? "" : null);
      if (outermost) tops.push(element);
      if (direction !== null) marked.push(element);
    }

    for (const link of tree.querySelectorAll("a")) {
      const inMarkedBlock = link.closest(`[${MARK.dir}]`) !== null;
      setMark(link, MARK.ltr, inMarkedBlock && isAddressText(link.textContent) ? "" : null);
    }

    if (theming()) markSheets(tree, tops, scope);

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
    // the page's direction.
    for (const element of containers) {
      const direction = element.getAttribute(MARK.dir);
      if (direction === view.getComputedStyle(root).direction) continue;
      mirrorChecked.add(element);
      const mirror = mirrorFor(element, direction);
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

  // Remove every block mark and keep the reading mark, which does not depend
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
  // Reading mark

  const conversation = () => conversationKey(document.location.hostname, document.location.pathname);
  const recordFor = (key) => marks.items.find((item) => item.k === key) ?? null;

  // The blocks a reader reads, in order: paragraph-like elements that hold
  // text and no smaller paragraph-like element.
  function readingBlocks() {
    const scope = scopeElement();
    const blocks = [];
    for (const element of scope.querySelectorAll(markable)) {
      if (!isEligible(element, scope) || element.querySelector(markable) !== null) continue;
      const print = fingerprint(element.textContent);
      if (print !== null) blocks.push({ element, print });
    }
    return blocks;
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

  // Find the saved mark of this conversation on the page as it is now.
  function locate() {
    placeLookedAt = Date.now();
    const key = conversation();
    const record = recordFor(key);
    if (record === null) {
      hidePlace();
      return { status: "none" };
    }
    const blocks = readingBlocks();
    const found = locateMark(record, blocks.map((block) => block.print));
    if (found === null) {
      hidePlace();
      return { status: "missing" };
    }
    const { element } = blocks[found.index];
    showPlace(element, found.quality, key);
    return { status: found.quality, element };
  }

  // Keep the mark on the page while content arrives, re-renders or the
  // conversation changes. Costs nothing where no mark is saved.
  function keepPlace() {
    if (preferences === null) return;
    const key = conversation();
    if (recordFor(key) === null) {
      hidePlace();
      return;
    }
    const settled = place !== null && place.key === key && place.quality === "exact" && place.element.isConnected;
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

  // The block the reader is at: the one holding a selection that is in view,
  // otherwise the first one whose beginning can be seen.
  function blockInView(blocks) {
    const height = view.innerHeight;
    const boxes = blocks.map(({ element }) => element.getBoundingClientRect());
    // Larger than a text kept only for screen readers, and within the window.
    const visible = (box) => box.height > 2 && box.width > 2 && box.bottom > 0 && box.top < height;

    const selection = document.getSelection?.();
    if (selection && !selection.isCollapsed && selection.rangeCount > 0) {
      const node = selection.getRangeAt(0).startContainer;
      const index = blocks.findIndex(({ element }) => element.contains(node));
      if (index !== -1 && visible(boxes[index])) return index;
    }

    let first = -1;
    for (let index = 0; index < blocks.length; index += 1) {
      const box = boxes[index];
      if (!visible(box)) continue;
      if (first === -1) first = index;
      if (box.top < 0) continue;
      // Not under something the site keeps on top, such as a fixed header.
      const hit = document.elementFromPoint(box.left + box.width / 2, box.top + Math.min(box.height / 2, 12));
      if (hit !== null && blocks[index].element.contains(hit)) return index;
    }
    return first;
  }

  function flash(element) {
    if (flashTimer !== null) view.clearTimeout(flashTimer);
    setMark(element, MARK.flash, "");
    flashTimer = view.setTimeout(() => {
      flashTimer = null;
      setMark(element, MARK.flash, null);
    }, FLASH_MS);
  }

  /** What is known about this conversation's reading mark. */
  function markStatus() {
    if (preferences === null) return { status: "off" };
    return { status: locate().status };
  }

  /** Save the place the reader is at as this conversation's reading mark. */
  function markHere() {
    if (preferences === null) return { status: "off" };
    const blocks = readingBlocks();
    const index = blockInView(blocks);
    if (index === -1) return { status: "nothing" };
    const key = conversation();
    marks = saveMark(marks, key, createMark(blocks.map((block) => block.print), index));
    saveMarks(marks);
    showPlace(blocks[index].element, "exact", key);
    watch();
    return { status: "exact" };
  }

  /** Bring the reading mark into view. Nothing moves unless the place is trusted. */
  function goToMark() {
    if (preferences === null) return { status: "off" };
    const found = locate();
    if (!found.element) return { status: found.status };
    const calm = view.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
    found.element.scrollIntoView({ block: "center", inline: "nearest", behavior: calm ? "auto" : "smooth" });
    flash(found.element);
    return { status: found.status };
  }

  /** Forget this conversation's reading mark. */
  function clearMark() {
    if (preferences === null) return { status: "off" };
    marks = removeMark(marks, conversation());
    saveMarks(marks);
    hidePlace();
    watch();
    return { status: "none" };
  }

  /** Take the stored marks, at start and whenever they change in storage. */
  function setMarks(next) {
    marks = normalizeMarks(next);
    if (preferences === null) return;
    watch();
    placeLookedAt = 0;
    keepPlace();
  }

  // ---------------------------------------------------------------------------
  // Following the page

  function flush() {
    timer = null;
    if (preferences === null) return;
    if (!isAlive()) {
      stop();
      return;
    }

    if (reading()) {
      if (theming()) measureSite();
      const scope = scopeElement();
      const roots = new Set();
      for (const node of pending) {
        if (!node.isConnected) continue;
        if (!scope.contains(node)) {
          if (node.contains(scope)) roots.add(scope);
          continue;
        }
        if (node.closest(site.exclude)) continue;
        // Changes that neither sit in nor bring in readable content are skipped.
        if (site.within && !node.closest(site.within) && !node.querySelector(site.within)) continue;
        roots.add(outermostCandidate(node, scope) ?? node);
      }
      for (const tree of roots) {
        let covered = false;
        for (const other of roots) covered ||= other !== tree && other.contains(tree);
        if (!covered) processTree(tree);
      }
    }
    pending.clear();
    keepPlace();
  }

  function onMutations(records) {
    for (const record of records) {
      if (record.type === "characterData") {
        if (record.target.parentElement) pending.add(record.target.parentElement);
        continue;
      }
      let textChanged = record.removedNodes.length > 0;
      for (const node of record.addedNodes) {
        if (node.nodeType === ELEMENT) pending.add(node);
        else textChanged = true;
      }
      // A block whose own text changed is measured again; a plain wrapper
      // that only lost children is not worth a pass over everything in it.
      if (textChanged && record.target.nodeType === ELEMENT && record.target.closest(candidates)) {
        pending.add(record.target);
      }
    }
    if (pending.size > 0 && timer === null) timer = view.setTimeout(flush, FLUSH_DELAY_MS);
  }

  // The page is observed only while there is something to keep current: a
  // reading aspect that changes the page, or a saved reading mark.
  function watch() {
    const needed = preferences !== null && (reading() || marks.items.length > 0);
    if (needed && observer === null) {
      observer = new view.MutationObserver(onMutations);
      observer.observe(root, { childList: true, subtree: true, characterData: true });
    } else if (!needed && observer !== null) {
      observer.disconnect();
      observer = null;
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

  /** Remove Readela's footprint and release its observer. Safe to call repeatedly. */
  function stop() {
    preferences = null;
    observer?.disconnect();
    observer = null;
    watchSite();
    for (const pendingTimer of [timer, placeTimer, flashTimer]) {
      if (pendingTimer !== null) view.clearTimeout(pendingTimer);
    }
    timer = null;
    placeTimer = null;
    flashTimer = null;
    pending.clear();
    mirrorChecked = new WeakSet();
    place = null;

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
    if (reading()) {
      if (theming()) measureSite();
      processTree(scopeElement());
    }
    watch();
    placeLookedAt = 0;
    keepPlace();
  }

  return { apply, stop, setMarks, markStatus, markHere, goToMark, clearMark };
}
