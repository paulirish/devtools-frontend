// Copyright 2023 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Run this first:
//    front_end/models/trace/build-trace-engine-lib.sh

import fs from 'fs';
import zlib from 'zlib';

loadBrowserPolyfills(); // Must precede the import (for `location` and `navigator`)

export const TraceModel = await import('./out/Default/gen/trace_engine/trace.mjs');

// If run as CLI, parse the argv trace (or a fallback)
if (import.meta.url.endsWith(process.argv[1])) {
  const filename = process.argv.at(2) ?? './test/unittests/fixtures/traces/invalid-animation-events.json.gz';
  const traceEvents = loadTraceEventsFromFile(filename);

  // Primary usage:
  const processor = TraceModel.Processor.TraceProcessor.createWithAllHandlers(); // aka `fullTraceEngine`
  await processor.parse(traceEvents);

  console.log(processor.data);
}

/**
 * @param {string=} filename
 * @returns TraceEvent[]
 */
function loadTraceEventsFromFile(filename) {
  const fileBuf = fs.readFileSync(filename);
  let data;
  if (isGzip(fileBuf)) {
    data = zlib.gunzipSync(fileBuf);
  } else {
    data = fileBuf.toString('utf8');
  }
  const json = JSON.parse(data);
  const traceEvents = json.traceEvents ?? json;
  console.assert(Array.isArray(traceEvents));
  return traceEvents;
}

/**
 * Read the first 3 bytes looking for the gzip signature in the file header
 * https://www.rfc-editor.org/rfc/rfc1952#page-6
 * @param {ArrayBuffer} ab
 * @returns boolean
 */
function isGzip(ab) {
  const buf = new Uint8Array(ab);
  if (!buf || buf.length < 3) {
    return false;
  }
  return buf[0] === 0x1F && buf[1] === 0x8B && buf[2] === 0x08;
}

function loadBrowserPolyfills() {

  // devtools assumes clientside :(
  globalThis.location = new URL('devtools://devtools/bundled/devtools_app.html');
  globalThis.navigator = {
    language: 'en-US'
  };

  // Everything else in here is the DOMRect polyfill
  // https://raw.githubusercontent.com/JakeChampion/polyfill-library/master/polyfills/DOMRect/polyfill.js

  (function (global) {
    function number(v) {
      return v === undefined ? 0 : Number(v);
    }

    function different(u, v) {
      return u !== v && !(isNaN(u) && isNaN(v));
    }

    function DOMRect(xArg, yArg, wArg, hArg) {
      let x, y, width, height, left, right, top, bottom;

      x = number(xArg);
      y = number(yArg);
      width = number(wArg);
      height = number(hArg);

      Object.defineProperties(this, {
        x: {
          get: function () { return x; },
          set: function (newX) {
            if (different(x, newX)) {
              x = newX;
              left = right = undefined;
            }
          },
          enumerable: true
        },
        y: {
          get: function () { return y; },
          set: function (newY) {
            if (different(y, newY)) {
              y = newY;
              top = bottom = undefined;
            }
          },
          enumerable: true
        },
        width: {
          get: function () { return width; },
          set: function (newWidth) {
            if (different(width, newWidth)) {
              width = newWidth;
              left = right = undefined;
            }
          },
          enumerable: true
        },
        height: {
          get: function () { return height; },
          set: function (newHeight) {
            if (different(height, newHeight)) {
              height = newHeight;
              top = bottom = undefined;
            }
          },
          enumerable: true
        },
        left: {
          get: function () {
            if (left === undefined) {
              left = x + Math.min(0, width);
            }
            return left;
          },
          enumerable: true
        },
        right: {
          get: function () {
            if (right === undefined) {
              right = x + Math.max(0, width);
            }
            return right;
          },
          enumerable: true
        },
        top: {
          get: function () {
            if (top === undefined) {
              top = y + Math.min(0, height);
            }
            return top;
          },
          enumerable: true
        },
        bottom: {
          get: function () {
            if (bottom === undefined) {
              bottom = y + Math.max(0, height);
            }
            return bottom;
          },
          enumerable: true
        }
      });
    }

    globalThis.DOMRect = DOMRect;
  })(globalThis);
}