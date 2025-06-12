// Copyright 2025 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/** @typedef {import('./models/issues_manager/issues_manager.js')} IssuesManager */
/** @typedef {import('./generated/protocol.js')} Protocol */

import fs from 'node:fs';

/** @type {IssuesManager} */
import * as IssuesManager from '../out/TraceEngine/dist/models/issues_manager/issues_manager.js';

// polyfillDOMRect();

/**
 * @param {any} lighthouseArtifacts
 */
function analyzeLighthouseArtifacts(lighthouseArtifacts) {
  const protocolIssues = [];
  for (const [key, issues] of Object.entries(lighthouseArtifacts.InspectorIssues)) {
    const code = key[0].toUpperCase() + key.substring(1);

    for (const issue of issues) {
      protocolIssues.push({
        code,
        details: {[`${key}Details`]: issue},
      });
    }
  }

  // @ts-expect-error
  const issues = protocolIssues.flatMap(protocolIssue => IssuesManager.IssuesManager.createIssuesFromProtocolIssue(null, protocolIssue));
  return issues;
}

/**
 * @param {string} filename
 * @returns {ReturnType<analyzeLighthouseArtifacts>}
 */
export function analyzeInspectorIssues(filename) {
  const artifacts = JSON.parse(fs.readFileSync(filename, 'utf-8'));
  if (!artifacts.InspectorIssues) {
    throw new Error('expected Lighthouse artifacts');
  }

  return analyzeLighthouseArtifacts(artifacts);
}

// If run as CLI, parse the argv trace (or a fallback)
if (import.meta.url.endsWith(process?.argv[1])) {
  cli();
}

function cli() {
  const filename = process.argv.at(2);
  if (!filename) throw new Error('Provide filename');

  const issues = analyzeInspectorIssues(filename);
  console.log(issues);
}


// export function polyfillDOMRect() {
//   // devtools assumes clientside :(

//   // Everything else in here is the DOMRect polyfill
//   // https://raw.githubusercontent.com/JakeChampion/polyfill-library/master/polyfills/DOMRect/polyfill.js

//   (function(global) {
//     /** @param {number=} v */
//     function number(v) {
//       return v === undefined ? 0 : Number(v);
//     }
//     /**
//      * @param {number} u
//      * @param {number} v
//      */
//     function different(u, v) {
//       return u !== v && !(isNaN(u) && isNaN(v));
//     }

//     /**
//      * @param {number} xArg
//      * @param {number} yArg
//      * @param {number} wArg
//      * @param {number} hArg
//      * @this {DOMRect}
//      */
//     function DOMRect(xArg, yArg, wArg, hArg) {
//       let /** @type {number} */ x;
//       let /** @type {number} */ y;
//       let /** @type {number} */ width;
//       let /** @type {number} */ height;
//       let /** @type {number=} */ left;
//       let /** @type {number=} */ right;
//       let /** @type {number=} */ top;
//       let /** @type {number=} */ bottom;

//       x = number(xArg);
//       y = number(yArg);
//       width = number(wArg);
//       height = number(hArg);

//       Object.defineProperties(this, {
//         x: {
//           get: function() {
//             return x;
//           },
//           /** @param {number} newX */
//           set: function(newX) {
//             if (different(x, newX)) {
//               x = newX;
//               left = right = undefined;
//             }
//           },
//           enumerable: true
//         },
//         y: {
//           get: function() {
//             return y;
//           },
//           set: function(newY) {
//             if (different(y, newY)) {
//               y = newY;
//               top = bottom = undefined;
//             }
//           },
//           enumerable: true
//         },
//         width: {
//           get: function() {
//             return width;
//           },
//           set: function(newWidth) {
//             if (different(width, newWidth)) {
//               width = newWidth;
//               left = right = undefined;
//             }
//           },
//           enumerable: true
//         },
//         height: {
//           get: function() {
//             return height;
//           },
//           set: function(newHeight) {
//             if (different(height, newHeight)) {
//               height = newHeight;
//               top = bottom = undefined;
//             }
//           },
//           enumerable: true
//         },
//         left: {
//           get: function() {
//             if (left === undefined) {
//               left = x + Math.min(0, width);
//             }
//             return left;
//           },
//           enumerable: true
//         },
//         right: {
//           get: function() {
//             if (right === undefined) {
//               right = x + Math.max(0, width);
//             }
//             return right;
//           },
//           enumerable: true
//         },
//         top: {
//           get: function() {
//             if (top === undefined) {
//               top = y + Math.min(0, height);
//             }
//             return top;
//           },
//           enumerable: true
//         },
//         bottom: {
//           get: function() {
//             if (bottom === undefined) {
//               bottom = y + Math.max(0, height);
//             }
//             return bottom;
//           },
//           enumerable: true
//         }
//       });
//     }

//     // @ts-expect-error It's not identical.
//     globalThis.DOMRect = DOMRect;
//   })(globalThis);
// }
