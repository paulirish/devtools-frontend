// Copyright 2020 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {assert} from 'chai';
import type {HTTPRequest} from 'puppeteer-core';

import {getBrowserAndPages, reloadDevTools} from '../../shared/helper.js';
import {mean, percentile} from '../helpers/perf-helper.js';
import {addBenchmarkResult, type Benchmark} from '../report/report.js';

describe('Boot performance', () => {
  const RUNS = 10;
  const testValues = {
    name: 'BootPerf',
    values: [] as number[],
  };

  after(() => {
    const values = testValues.values;
    const meanMeasure = Number(mean(values).toFixed(2));
    const percentile50 = Number(percentile(values, 0.5).toFixed(2));
    const percentile90 = Number(percentile(values, 0.9).toFixed(2));
    const percentile99 = Number(percentile(values, 0.99).toFixed(2));

    const benchmark: Benchmark = {
      key: {test: testValues.name, units: 'ms'},
      measurements: {
        stats: [
          {
            value: 'mean',
            measurement: meanMeasure,
          },
          {
            value: 'percentile50',
            measurement: percentile50,
          },
          {
            value: 'percentile90',
            measurement: percentile90,
          },
          {
            value: 'percentile99',
            measurement: percentile99,
          },
        ],
      },
    };
    addBenchmarkResult(benchmark);
    /* eslint-disable no-console */
    console.log(`Benchmark name: ${testValues.name}`);
    console.log(`Mean boot time: ${meanMeasure}ms`);
    console.log(`50th percentile boot time: ${percentile50}ms`);
    console.log(`90th percentile boot time: ${percentile90}ms`);
    console.log(`99th percentile boot time: ${percentile99}ms`);
    /* eslint-enable no-console */
  });

  for (let run = 1; run <= RUNS; run++) {
    it(`run ${run}/${RUNS}`, async () => {
      const start = performance.now();
      await reloadDevTools();

      // Ensure only 2 decimal places.
      const timeTaken = (performance.now() - start).toFixed(2);
      testValues.values.push(Number(timeTaken));
    });
  }
});

describe('Module graph', () => {
  it('loads expected scripts', async () => {
    const {frontend} = getBrowserAndPages();
    const requests: HTTPRequest[] = [];
    frontend.on('request', request => requests.push(request));

    await reloadDevTools();
    await frontend.waitForNetworkIdle();
    const scripts = requests.filter(request => request.url().endsWith('.js'));

    function buildModuleGraph(scripts: HTTPRequest[]) {
      const lines: string[] = [];
      const childrenMap = new Map<string|undefined, HTTPRequest[]>();

      // Build a map of parent URLs to their children
      for (const script of scripts) {
        const initiator = script.initiator();
        if (initiator && initiator.type === 'script') {
          if (!childrenMap.has(initiator.url)) {
            childrenMap.set(initiator.url, []);
          }
          childrenMap.get(initiator.url)?.push(script);
        }
      }

      function logModule(script: HTTPRequest, indent: string = '') {
        const path = script.url().split('front_end/')[1];
        const parentUrl = script.initiator()?.url;
        const siblings = parentUrl ? childrenMap.get(parentUrl) : undefined;
        const isLastSibling = siblings ? siblings[siblings.length - 1].url() === script.url() : true;

        const branchChar = isLastSibling ? '└' : '├';
        lines.push(`${indent}${branchChar}${path}`);

        const children = childrenMap.get(script.url());
        if (children) {
          const newIndent = indent + (isLastSibling ? '  ' : '│ ');
          for (let i = 0; i < children.length; i++) {
            logModule(children[i], newIndent);
          }
        }
      }

      logModule(scripts[0]);
      return lines.join('\n');
    }

    const graphSerialized = buildModuleGraph(scripts);
    const expectedGraph = `

 └entrypoints/devtools_app/devtools_app.js
  ├entrypoints/shell/shell.js
  │ ├Images/Images.js
  │ ├core/dom_extension/dom_extension.js
  │ ├ui/legacy/components/object_ui/object_ui.js
  │ │ ├ui/components/text_editor/text_editor.js
  │ │ │ ├services/window_bounds/window_bounds.js
  │ │ │ └models/javascript_metadata/javascript_metadata.js
  │ │ └third_party/acorn/acorn.js
  │ ├ui/legacy/components/quick_open/quick_open.js
  │ │ ├third_party/diff/diff.js
  │ │ └ui/components/text_prompt/text_prompt.js
  │ └panels/console/console.js
  │   ├ui/components/code_highlighter/code_highlighter.js
  │   ├ui/components/issue_counter/issue_counter.js
  │   └ui/components/request_link_icon/request_link_icon.js
  ├core/i18n/i18n.js
  │ ├third_party/i18n/i18n.js
  │ │ └third_party/intl-messageformat/intl-messageformat.js
  │ └core/platform/platform.js
  ├ui/legacy/legacy.js
  │ ├ui/components/adorners/adorners.js
  │ └ui/components/settings/settings.js
  ├core/common/common.js
  ├core/root/root.js
  ├core/sdk/sdk.js
  ├models/extensions/extensions.js
  │ ├models/logs/logs.js
  │ ├ui/legacy/components/utils/utils.js
  │ ├ui/legacy/theme_support/theme_support.js
  │ ├models/bindings/bindings.js
  │ └models/har/har.js
  ├models/workspace/workspace.js
  │ ├core/host/host.js
  │ └models/text_utils/text_utils.js
  │   └third_party/codemirror.next/codemirror.next.js
  │     └third_party/codemirror.next/chunk/codemirror.js
  ├panels/network/forward/forward.js
  ├panels/security/security.js
  │ ├ui/components/switch/switch.js
  │ ├ui/components/cards/cards.js
  │ ├ui/components/chrome_link/chrome_link.js
  │ │ └ui/components/helpers/helpers.js
  │ ├ui/components/input/input.js
  │ └ui/legacy/components/data_grid/data_grid.js
  ├ui/components/legacy_wrapper/legacy_wrapper.js
  │ └ui/visual_logging/visual_logging.js
  │   └ui/components/render_coordinator/render_coordinator.js
  ├panels/application/preloading/helper/helper.js
  ├models/issues_manager/issues_manager.js
  │ ├third_party/marked/marked.js
  │ └third_party/third-party-web/third-party-web.js
  └entrypoints/main/main.js
    ├core/protocol_client/protocol_client.js
    ├models/autofill_manager/autofill_manager.js
    ├models/breakpoints/breakpoints.js
    │ ├models/formatter/formatter.js
    │ └models/source_map_scopes/source_map_scopes.js
    ├models/crux-manager/crux-manager.js
    │ └models/emulation/emulation.js
    ├models/live-metrics/live-metrics.js
    │ └models/live-metrics/web-vitals-injected/spec/spec.js
    ├models/persistence/persistence.js
    ├panels/snippets/snippets.js
    ├ui/components/buttons/buttons.js
    ├ui/components/icon_button/icon_button.js
    └ui/lit/lit.js
      └third_party/lit/lit.js

    `.trim();

    if (graphSerialized.includes('core/host/Platform.js')) {
      // In debug mode, there's current 915 modules loaded, enough that it'd be annoying to update the assertions here.
      // We only want to test this in Release mode.
      return;
    }
    if (graphSerialized !== expectedGraph) {
      // Output the actual graph, allowing engineers to more easily update the text golden, especially if failing on CQ bots.
      // eslint-disable-next-line no-console
      console.log('Update boot-perf_test.ts\'s expectedGraph with the following:\n\n', graphSerialized, '\n\n');
    }

    // Assert the above list matches DevTools' modules loaded.
    // This test allows you to explicitly acknowledge the impact of your change, and prevent
    // accidental imports that may slow down the bootup of DevTools UI.
    assert.strictEqual(
        graphSerialized, expectedGraph,
        'Module graph mismatch. Scroll up to `expectedGraph` for updated golden to paste.');
  });
});
