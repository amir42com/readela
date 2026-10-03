// Page integration: reads the conversation, marks blocks with the direction
// the core decides, and keeps the marks current while content streams in.
//
// Readela's whole footprint in the page is a set of `data-readela-*`
// attributes (plus, on a list or quotation that needs mirroring, a few
// `--readela-*` custom properties). Text nodes, element structure, page-owned
// attributes and page-owned styles are never written, so removing the
// footprint restores the page's own presentation exactly.

import { isAddressText, measureScripts, normalizePreferences, resolveDirection } from "../core/index.js";
import { ELEMENT_MARKS, MARK, MIRROR_PROPERTIES, PROTECTED, ROOT_MARKS } from "./style.js";

const TEXT_BLOCKS = "p, li, h1, h2, h3, h4, h5, h6, dt, dd, th, td, caption, summary, figcaption";
const LISTS = "ul, ol";
const CONTAINERS = "ul, ol, table, blockquote";
const MIRRORED = "ul, ol, blockquote";

// Elements whose boundaries separate words when text is gathered.
const WORD_BOUNDARIES = `${TEXT_BLOCKS}, div, br, tr, hr`;

// Streaming produces many small mutations; they are handled together.
const FLUSH_DELAY_MS = 60;

const ELEMENT = 1;
const TEXT = 3;

/**
 * @param {object} options
 * @param {Document} options.document
 * @param {{ scope: string, within?: string, extraBlocks?: string, exclude: string }} options.site
 *   a site adapter; see `sites/index.js` for the contract
 * @param {() => boolean} [options.isAlive] returns false once the extension
 *   that owns this reader is gone; the reader then removes its footprint.
 */
export function createReader({ document, site, isAlive = () => true }) {
  const view = document.defaultView;
  const candidates = [TEXT_BLOCKS, CONTAINERS, "pre", site.extraBlocks].filter(Boolean).join(", ");
  const anyMark = ELEMENT_MARKS.map((name) => `[${name}]`).join(", ");

  let preferences = null; // null while stopped
  let observer = null;
  let timer = null;
  const pending = new Set();
  let mirrorChecked = new WeakSet(); // lists and quotations already examined by mirrorFor

  const scopeElement = () => document.querySelector(site.scope) ?? document.body;

  function setMark(element, name, value) {
    if (value === null) {
      if (element.hasAttribute(name)) element.removeAttribute(name);
    } else if (element.getAttribute(name) !== value) {
      element.setAttribute(name, value);
    }
  }

  function clearMarks(element) {
    if (element.hasAttribute(MARK.mirror)) {
      for (const property of MIRROR_PROPERTIES) element.style.removeProperty(property);
      if (element.getAttribute("style") === "") element.removeAttribute("style");
    }
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
    if (element.matches("pre")) return null;

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
    const pageDirection = view.getComputedStyle(document.documentElement).direction;
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

  function processTree(root) {
    const scope = scopeElement();
    const elements = root.matches(candidates) ? [root] : [];
    elements.push(...root.querySelectorAll(candidates));

    // Writes first, in document order, so each block can read its ancestors' marks.
    const marked = [];
    for (const element of elements) {
      if (!isEligible(element, scope)) {
        clearMarks(element);
        continue;
      }
      const direction = directionFor(element);
      setMark(element, MARK.dir, direction);
      const outermost =
        (direction !== null || element.matches("pre")) &&
        !element.parentElement?.closest(`[${MARK.dir}], [${MARK.top}]`);
      setMark(element, MARK.top, outermost ? "" : null);
      if (direction !== null) marked.push(element);
    }

    for (const link of root.querySelectorAll("a")) {
      const inMarkedBlock = link.closest(`[${MARK.dir}]`) !== null;
      setMark(link, MARK.ltr, inMarkedBlock && isAddressText(link.textContent) ? "" : null);
    }

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
      if (direction === view.getComputedStyle(document.documentElement).direction) continue;
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

  function flush() {
    timer = null;
    if (preferences === null) return;
    if (!isAlive()) {
      stop();
      return;
    }

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
    pending.clear();

    for (const root of roots) {
      let covered = false;
      for (const other of roots) covered ||= other !== root && other.contains(root);
      if (!covered) processTree(root);
    }
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

  function setRootMarks() {
    for (const [preference, name] of Object.entries(ROOT_MARKS)) {
      const value = preferences[preference];
      setMark(document.documentElement, name, value === "page" ? null : value);
    }
  }

  /** Remove Readela's footprint and release its observer. Safe to call repeatedly. */
  function stop() {
    preferences = null;
    observer?.disconnect();
    observer = null;
    if (timer !== null) view.clearTimeout(timer);
    timer = null;
    pending.clear();
    mirrorChecked = new WeakSet();

    for (const element of document.querySelectorAll(anyMark)) clearMarks(element);
    for (const name of Object.values(ROOT_MARKS)) setMark(document.documentElement, name, null);
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

    preferences = normalized;
    setRootMarks();
    if (observer === null) {
      observer = new view.MutationObserver(onMutations);
      observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    }
    processTree(scopeElement());
  }

  return { apply, stop };
}
