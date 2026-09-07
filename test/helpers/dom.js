// Test setup helper: installs a DOMParser on the global object so that
// public/app/parser.js (which calls `new DOMParser()` at parse-time, relying
// on a browser-provided global) works under plain Node.
//
// jsdom is used deliberately over linkedom: linkedom produces zero children
// in `document.body` for both of this repo's real bookmark export fixtures
// (malformed Netscape Bookmark HTML), which would make tests written against
// it meaningless.
//
// Import this module FIRST in any test file that imports parser.js, e.g.:
//
//   import '../helpers/dom.js';
//   import { parseBookmarks } from '../../public/app/parser.js';
//
// The side effect (setting global.DOMParser) runs as soon as this module is
// evaluated, which Node guarantees happens before the importing module's own
// body runs.

import { JSDOM } from 'jsdom';

global.DOMParser = new JSDOM('').window.DOMParser;
