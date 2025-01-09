// Copyright 2020 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// import {performance} from 'node:perf_hooks';
import {assert} from 'chai';
import {HTTPRequest} from 'puppeteer-core';

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

describe.only('Module graph', () => {
  it('is under control', async () => {
    const {frontend} = getBrowserAndPages();

    const requests: HTTPRequest[] = []
    frontend.on('request', request => requests.push(request));

    await reloadDevTools();

    await frontend.waitForNetworkIdle()

    const scripts = requests.filter((request) => request.url().endsWith('.js'))
    console.log(scripts.length)

    console.log(scripts[100].url(), scripts[100].initiator());
    logScriptGraph(scripts);
    // console.log(scripts.map((request) => request.name).slice(0, 100));
    assert.isAtMost(scripts.length, 915);
    // debugger
    // console.log({entries});



    function logScriptGraph(scripts: HTTPRequest[]) {
      // Build a map of URL to scripts for easy lookup.
      const scriptMap = new Map(scripts.map((script) => [script.url(), script]))
      const seen = new Set();  // Keep track of logged scripts to avoid duplicates

      function logScriptWithIndentation(script: HTTPRequest, indentLevel = 0) {
        if (seen.has(script.url())) {
          return;
        }
        seen.add(script.url());

        const indent = '│ '.repeat(indentLevel);
        const path = script.url().split('front_end/')[1];
        console.log(`${indent}├${path}`);

        // Find children and recursively log them
        for (const childScript of scripts) {
          const initiator = childScript.initiator();
          if (initiator && initiator.type === 'script' && initiator.url === script.url()) {
            logScriptWithIndentation(childScript, indentLevel + 1);
          }
        }
      }

      logScriptWithIndentation(scripts[0]);
    }
  });
});
