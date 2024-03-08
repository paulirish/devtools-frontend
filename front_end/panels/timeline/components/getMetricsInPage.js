// Copyright 2023 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
//
// This code is JS not TS because it gets stringified and executed via CDP and
// RunTime.Evaluate. Therefore we cannot use any TypeScript here.

// globals __chromium_devtools_metrics_reporter

export async function getMetricsInPage() {
  // Adapated from https://gist.github.com/mmocny/8e7fb5c0fbe03c8bed2e61ea49a95863
  function measureInteractions() {
    let worst_inp = 0;

    const observer = new PerformanceObserver(list => {
      for (const entry_ of list.getEntries()) {
        const entry = /** @type {PerformanceEventTiming} */ (entry_);
        if (!entry.interactionId) {
          continue;
        }

        // Event Timing entries do not have a renderTime (yet), but its useful to expose one
        entry.renderTime = entry.startTime + entry.duration;

        // Worst INP is typically ~= real INP since most page loads the p98 thing isn't important
        worst_inp = Math.max(entry.duration, worst_inp);

        const monoStyle = 'color: grey; font-family: Consolas,monospace';
        const resetStyle = '';
        /** @param {number} score */
        const scoreToStyle = score => {
          if (score <= 200) {
            return 'color: green';
          }
          if (score <= 500) {
            return 'color: yellow';
          }
          return 'color: red';
        };
        // eslint-disable-next-line no-console
        console.log(
            `%c[Interaction: ${entry.name.padEnd(12)}] %cDuration: %c${entry.duration}`, monoStyle, resetStyle,
            scoreToStyle(entry.duration));

        __chromium_devtools_metrics_reporter(JSON.stringify({payload: entry.toJSON()}));
      }
    });

    observer.observe({type: 'event', durationThreshold: 0, buffered: true});

    return observer;
  }
  measureInteractions();

  // LCP
  const obs = new PerformanceObserver(entryList => {
    for (const entry of entryList.getEntries()) {
      __chromium_devtools_metrics_reporter(JSON.stringify({payload: entry.toJSON()}));
    }
  });

  const entryTypes = ['largest-contentful-paint', 'paint'];  // 'layout-shift'
  for (const type of entryTypes) {
    obs.observe({type, buffered: true, durationThreshold: 0, includeSoftNavigationObservations: true});
  }
}
