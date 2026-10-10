// Supported sites and site selection.
//
// Site contract — each adapter is plain data:
//   name         display name
//   hosts        exact host names served; the manifest matches exactly these
//   scope        selector of the region that holds the conversation
//                (<body> is used when it matches nothing)
//   within       optional selector; when set, only blocks inside a matching
//                element are read
//   surface      optional selector; when set, a reading theme colours only
//                containers inside (or matching) it
//   extraBlocks  optional selector of text containers that are not
//                paragraph-like elements
//   exclude      selector of everything that is never read or changed

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
