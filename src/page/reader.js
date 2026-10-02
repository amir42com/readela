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
 * @param {{ scope: string, extraBlocks?: string, exclude: string }} options.site
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
    return element.matches("pre") ? !element.parentElement?.closest(PROTECTED) : !element.closest(PROTECTED);
  }

  // The page pinned the text to the physical side opposite the reading start.
  function needsStartAlignment(element, direction) {
    if (element.style.textAlign || element.hasAttribute("align")) return false;
    const align = view.getComputedStyle(element).textAlign;
    return direction === "rtl" ? align === "left" : align === "right";
  }

  // The page indents this list or quotation on the physical side opposite the
  // reading start. Returns the same spacing and border expressed on logical
  // sides, or null when the page's own layout already follows the direction.
  function mirrorFor(element, direction) {
    const style = view.getComputedStyle(element);
    const [start, end] = direction === "rtl" ? ["Right", "Left"] : ["Left", "Right"];
    const extent = (side) =>
      parseFloat(style[`padding${side}`]) + parseFloat(style[`margin${side}`]) + parseFloat(style[`border${side}Width`]);
    if (!(extent(end) > extent(start))) return null;

    const border = (side) => `${style[`border${side}Width`]} ${style[`border${side}Style`]} ${style[`border${side}Color`]}`;
    return {
      "--readela-padding-start": style[`padding${end}`],
      "--readela-padding-end": style[`padding${start}`],
      "--readela-margin-start": style[`margin${end}`],
      "--readela-margin-end": style[`margin${start}`],
      "--readela-border-start": border(end),
      "--readela-border-end": border(start),
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

    // Then layout reads, gathered before any further write.
    const corrections = [];
    for (const element of marked) {
      const direction = element.getAttribute(MARK.dir);
      if (element.matches(MIRRORED)) {
        if (element.hasAttribute(MARK.mirror)) continue;
        const mirror = mirrorFor(element, direction);
        if (mirror) corrections.push(() => applyMirror(element, mirror));
      } else if (!element.matches("table") && !element.hasAttribute(MARK.align)) {
        if (needsStartAlignment(element, direction)) corrections.push(() => setMark(element, MARK.align, ""));
      }
    }
    for (const correct of corrections) correct();
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
