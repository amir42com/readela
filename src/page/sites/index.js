// Supported sites and site selection.
//
// Site contract — each adapter is plain data and says who owns what on the
// page. Whatever an adapter does not name stays the site's.
//
//   id            short stable name, part of a conversation's stored identity
//   name          display name
//   hosts         exact host names served; the manifest matches exactly these
//
//   Application shell — the site's, never read or changed:
//   exclude       selector of navigation, headers, the composer and every
//                 other editable field, controls and dialogs
//
//   Conversation:
//   scope         selector of the region that holds a conversation. A site
//                 can keep earlier conversations in the document, hidden; the
//                 first match that is rendered is the one shown (<body> is
//                 used when nothing matches)
//   conversation  routes of a conversation as regular expressions on the
//                 address path, each capturing the conversation's identifier
//   scroller      optional selector of the region that scrolls the
//                 conversation; the nearest scrolling ancestor is used
//                 otherwise
//
//   Messages:
//   within        optional selector; when set, only blocks inside a matching
//                 element are read
//   user          selector of the reader's own message. Its direction and
//                 typography follow the reading settings; its appearance is
//                 the site's, inside and out
//   extraBlocks   optional selector of text containers that are not
//                 paragraph-like elements
//   prose         selector of the roots of a response's text. These are the
//                 only reading surfaces: a reading theme colours nothing
//                 else, and a place can be saved nowhere else
//   capsule       selector of units inside a response that keep the site's
//                 presentation as a whole (a code block with its header and
//                 controls). A `pre` element always does
//   turn          optional name of the attribute by which the site identifies
//                 a turn or message; the element carrying it holds the
//                 response, and its value must survive a reload
//   order         optional name of the attribute that numbers a row of the
//                 conversation, on the row or a container of it

import { chatgpt } from "./chatgpt.js";
import { claude } from "./claude.js";

export const SITES = Object.freeze([chatgpt, claude]);

/**
 * The adapter for a host name, or null when the host is not supported.
 * Matching is exact: a subdomain or a look-alike host is not a supported site.
 *
 * @param {string} hostname
 */
export function siteFor(hostname) {
  return SITES.find((site) => site.hosts.includes(hostname)) ?? null;
}

/** Manifest match patterns for the supported sites. */
export function matchPatterns() {
  return SITES.flatMap((site) => site.hosts.map((host) => `https://${host}/*`));
}
