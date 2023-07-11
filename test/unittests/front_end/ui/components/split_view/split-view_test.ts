// Copyright 2023 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

const {assert} = chai;

import * as SplitView from '../../../../../../front_end/ui/components/split_view/split_view.js';

import {renderElementIntoDOM} from '../../../helpers/DOMHelpers.js';

describe('SplitView', () => {
  it('should resize split view', async () => {
    const view = new SplitView.SplitView.SplitView();
    renderElementIntoDOM(view);
    view.style.width = '800px';
    view.style.height = '600px';

    const resizer = view.shadowRoot?.querySelector(
                        '#resizer',
                        ) as HTMLDivElement;
    assert.ok(resizer);

    assert.strictEqual(
        view.style.getPropertyValue('--current-main-area-size'),
        '60%',
    );

    let rect = resizer.getBoundingClientRect();
    resizer.dispatchEvent(
        new MouseEvent('mousedown', {
          clientX: rect.x + rect.width / 2,
          clientY: rect.y + rect.height / 2,
        }),
    );

    rect = view.getBoundingClientRect();
    window.dispatchEvent(
        new MouseEvent('mousemove', {
          clientX: rect.x + rect.width / 4,
          clientY: rect.y + rect.height / 4,
        }),
    );

    window.dispatchEvent(new MouseEvent('mouseup'));
    // Exact value might be different based on the environment.
    assert.notStrictEqual(
        view.style.getPropertyValue('--current-main-area-size'),
        '60%',
    );
  });

  it('should change layout to vertical on resize to narrow view', async () => {
    const view = new SplitView.SplitView.SplitView();
    renderElementIntoDOM(view);
    view.style.width = '800px';
    view.style.height = '600px';

    const resizer = view.shadowRoot?.querySelector(
                        '#resizer',
                        ) as HTMLDivElement;
    assert.ok(resizer);

    view.style.width = '600px';
    view.style.height = '800px';

    const rect = resizer.getBoundingClientRect();
    assert.strictEqual(rect.width, 600);
    assert.strictEqual(rect.height, 3);
  });

  it('should keep horizontal layout on short viewports', () => {
    const view = new SplitView.SplitView.SplitView();
    renderElementIntoDOM(view);
    view.style.width = '800px';
    view.style.height = '600px';

    const resizer = view.shadowRoot?.querySelector(
                        '#resizer',
                        ) as HTMLDivElement;
    assert.ok(resizer);

    view.style.width = '600px';
    view.style.height = '550px';

    const rect = resizer.getBoundingClientRect();
    assert.strictEqual(rect.width, 3);
    assert.strictEqual(rect.height, 550);
  });
});