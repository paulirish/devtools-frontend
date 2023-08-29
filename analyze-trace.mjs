// Copyright 2023 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import fs from 'node:fs';
import zlib from 'zlib';


globalThis.location = new URL('devtools://devtools/bundled/devtools_app.html');
globalThis.navigator = {
  language: 'en-US'
};

// Read the first 3 bytes looking for the gzip signature in the file header
function isGzip(ab) {
  const buf = new Uint8Array(ab);
  if (!buf || buf.length < 3) {
    return false;
  }

  // https://www.rfc-editor.org/rfc/rfc1952#page-6
  return buf[0] === 0x1F && buf[1] === 0x8B && buf[2] === 0x08;
}

const TraceModel = await import('./out/Default/gen/cooltrace/trace.mjs');

const processor = TraceModel.Processor.TraceProcessor.createWithAllHandlers();
console.log(fs.statSync('./test/unittests/fixtures/traces/basic.json.gz'));
let fileBuf = fs.readFileSync('./test/unittests/fixtures/traces/basic.json.gz');
let data;
if (isGzip(fileBuf)) {
  data = zlib.gunzipSync(fileBuf);
} else {
  data = fileBuf.toString('utf8');
}
const json = JSON.parse(data);
const traceEvents = json.traceEvents ?? json;

console.assert(Array.isArray(traceEvents));

console.log(processor.status);
await processor.parse(traceEvents);
console.log(processor.status);

console.log(processor.data);
