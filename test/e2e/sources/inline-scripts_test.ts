// Copyright 2023 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {assert} from 'chai';

import {
  click,
  getBrowserAndPages,
  waitFor,
} from '../../shared/helper.js';
import {
  addBreakpointForLine,
  getCallFrameNames,
  openSourceCodeEditorForFile,
  PAUSE_INDICATOR_SELECTOR,
  RESUME_BUTTON,
} from '../helpers/sources-helpers.js';

describe('The Sources Tab', () => {
  // Skip this test until the flakiness is fixed.
  it.skip('[crbug.com/40276401]: sets the breakpoint in the first script for multiple inline scripts', async () => {
    const {target} = getBrowserAndPages();
    await openSourceCodeEditorForFile('inline-scripts.html', 'inline-scripts.html');
    await addBreakpointForLine(4);
    await addBreakpointForLine(11);

    await target.reload();
    await waitFor(PAUSE_INDICATOR_SELECTOR);

    let names = await getCallFrameNames();
    assert.strictEqual(names[0], 'f1');

    await click(RESUME_BUTTON);

    names = await getCallFrameNames();
    assert.strictEqual(names[0], 'f4');
  });
});
