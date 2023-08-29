// Copyright 2023 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

globalThis.location = new URL('devtools://devtools/bundled/devtools_app.html');
globalThis.navigator = {
  language: 'en-US'
};

const TE = await import('./out/Default/gen/cooltrace/trace.mjs');

console.log(TE);
