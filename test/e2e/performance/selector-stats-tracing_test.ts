// Copyright 2024 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {assert} from 'chai';

import {getBrowserAndPages, step} from '../../shared/helper.js';
import {reloadDevTools} from '../helpers/cross-tool-helper.js';
import {getDataGrid, getDataGridRows, getInnerTextOfDataGridCells} from '../helpers/datagrid-helpers.js';
import {
  disableCSSSelectorStats,
  enableCSSSelectorStats,
  getRenderingTimeFromSummary,
  navigateToPerformanceTab,
  navigateToSelectorStatsTab,
  reloadAndRecord,
  selectRecalculateStylesEvent,
  startRecording,
  stopRecording,
} from '../helpers/performance-helpers.js';

// Flaky
describe.skip('[crbug.com/414579835] The Performance panel', function() {
  // These tests move between panels, which takes time.
  if (this.timeout() !== 0) {
    this.timeout(30000);
  }

  async function cssSelectorStatsRecording(testName: string) {
    const {target} = getBrowserAndPages();
    await navigateToPerformanceTab(testName);
    await enableCSSSelectorStats();
    await startRecording();
    await target.reload();
    await stopRecording();
  }

  it('Includes a selector stats table in recalculate style events', async () => {
    await cssSelectorStatsRecording('empty');

    await step('Open select stats for a recorded "Recalculate styles" event', async () => {
      await selectRecalculateStylesEvent();
      await navigateToSelectorStatsTab();
    });

    await step('Check that the selector stats table was rendered successfully', async () => {
      // Since the exact selector text, order, and match counts are implementation defined,
      // we are just checking whether any rows are rendered. This indicates that the trace events
      // we receive from the backend have the expected object structure. If the structure ever
      // changes, the data grid will fail to render and cause this test to fail.
      const rows =
          await getDataGridRows(1 /* expectedNumberOfRows*/, undefined /* root*/, false /* matchExactNumberOfRows*/);
      assert.isAtLeast(rows.length, 1, 'Selector stats table should contain at least one row');
    });
  });

  // Flaking on multiple bots on CQ.
  it.skip('[crbug.com/349787448] CSS selector stats performance test', async () => {
    // set a tentative threshold of 50%
    const timeDiffPercentageMax = 0.5;

    await navigateToPerformanceTab('selectorStats/page-with-style-perf-test');
    await disableCSSSelectorStats();
    await reloadAndRecord();
    const [recordingTimeWithSelectorStatsDisabled, chartName] = await getRenderingTimeFromSummary();
    assert.strictEqual(chartName, 'Rendering');

    await reloadDevTools({selectedPanel: {name: 'timeline'}});
    await enableCSSSelectorStats();
    await reloadAndRecord();
    const [recordingTimeWithSelectorStatsEnabled] = await getRenderingTimeFromSummary();

    const timeDiffPercentage = (recordingTimeWithSelectorStatsEnabled - recordingTimeWithSelectorStatsDisabled) /
        recordingTimeWithSelectorStatsDisabled;
    assert.isAtMost(timeDiffPercentage, timeDiffPercentageMax);
  });

  it('CSS style invalidation results verification', async () => {
    await navigateToPerformanceTab('selectorStats/css-style-invalidation');
    await enableCSSSelectorStats();

    await startRecording();

    // click the 'add/remove article' button and 'toggle emphasis' button to trigger CSS style invalidation
    const {target, frontend} = await getBrowserAndPages();

    target.bringToFront();
    await target.click('#addRemoveArticle');
    await target.click('#toggleEmphasis');

    frontend.bringToFront();
    await stopRecording();

    await navigateToSelectorStatsTab();
    const dataGrid = await getDataGrid(undefined /* root*/);
    const dataGridText =
        await getInnerTextOfDataGridCells(dataGrid, 1 /* expectedNumberOfRows */, false /* matchExactNumberOfRows */);

    // the total number of CSS style invalidations
    assert.strictEqual(dataGridText[0][1], '75');
  });
});
