// Copyright 2024 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/* eslint-disable rulesdir/es_modules_import */

import fs from 'node:fs';

// empty impl of these front_end/core/common/Progress.ts
class Progress {
  setTotalWork(_totalWork) {
  }
  setTitle(_title) {
  }
  setWorked(_worked, _title) {
  }
  incrementWorked(_worked) {
  }
  done() {
  }
  isCanceled() {
    return false;
  }
}
class CompositeProgress {
  constructor(parent) {
  }
  childDone() {
  }
  createSubProgress(weight) {
    return new Progress();
  }
  update() {
  }
}

import * as HAR from './out/delme/har.mjs';

const harTxt = fs.readFileSync('./www.paulirish.com.har', 'utf-8');
const harRoot = new HAR.HARFormat.HARRoot(JSON.parse(harTxt));
const reqs = HAR.Importer.Importer.requestsFromHARLog(harRoot.log);


const progress = new CompositeProgress(new Progress());
const harTxt2 = await HAR.Writer.Writer.harStringForRequests(reqs, progress);

console.log({harTxt2});
