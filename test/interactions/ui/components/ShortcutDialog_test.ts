// Copyright 2023 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {loadComponentDocExample} from '../../../../test/interactions/helpers/shared.js';
import {waitFor} from '../../../../test/shared/helper.js';
import {
  assertElementScreenshotUnchanged,
  waitForDialogAnimationEnd,
} from '../../../shared/screenshots.js';

describe('Shortcut dialog screenshot tests', () => {
  itScreenshot('renders the shortcut dialog button', async () => {
    await loadComponentDocExample('dialog/shortcut_dialog.html');
    const container = await waitFor('#container');
    await assertElementScreenshotUnchanged(container, 'dialog/shortcut_dialog_closed.png');
  });

  itScreenshot('renders the shortcut dialog', async () => {
    await loadComponentDocExample('dialog/shortcut_dialog.html');
    const container = await waitFor('#container');
    const showButton = await waitFor('devtools-button', container);
    const animationEndPromise = waitForDialogAnimationEnd();
    await showButton.click();
    await animationEndPromise;
    await assertElementScreenshotUnchanged(container, 'dialog/shortcut_dialog_open.png');
  });

  itScreenshot('click the close button and close the shortcut dialog', async () => {
    await loadComponentDocExample('dialog/shortcut_dialog.html');
    const container = await waitFor('#container');

    const showButton = await waitFor('devtools-button', container);
    const animationEndPromise = waitForDialogAnimationEnd();
    await showButton.click();
    await animationEndPromise;

    const dialog = await waitFor('devtools-dialog');
    const closeButton = await waitFor('devtools-button', dialog);
    await closeButton.click();
    await assertElementScreenshotUnchanged(container, 'dialog/shortcut_dialog_closed_after_open.png');
  });
});
