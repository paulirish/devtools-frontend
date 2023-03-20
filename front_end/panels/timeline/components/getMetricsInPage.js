// Copyright 2023 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
//
// This code is JS not TS because it gets stringified and executed via CDP and
// RunTime.Evaluate. Therefore we cannot use any TypeScript here.

export async function getMetricsInPage() {
  /*
 * A snippet for measuing Interaction to Next Paint (INP).
 * Michal Mocny (mmocny@google.com).
* Taken and adapted from https://gist.github.com/mmocny/235399a5da32aede1f69489145a647bb
 *
 * Using Event Timing API, and using ideas from recent developments towards a new responsiveness metric.
 * See: https://web.dev/responsiveness
 *
 * This snippet can be used to measure all interactions with the page, measure the total "Interaction to Next Paint" time
 * for each, then, because we are measuring all interactions, record the ~98th percentile worst interaction overall.
 * We found this works better than recording just the single worst interaction for sites with over 50 interactons.
 */

  // The TS API does not define interactionId on PerformanceEntry
  /**
   * @typedef {Object} WithInteractionId
   * @property {number|undefined} interactionId
   *
   * @typedef {PerformanceEntry & WithInteractionId} PerfEntryWithInteractionId
   */

  const EVERY_N = 50;
  const MAX_ENTRIES = 10;
  /**
   * @type {PerfEntryWithInteractionId[]}
   */
  const largestINPEntries = [];
  let minKnownInteractionId = Number.POSITIVE_INFINITY;
  let maxKnownInteractionId = 0;

  /**
   * @param {PerfEntryWithInteractionId} entry
   */
  function addInteractionEntryToINPList(entry) {
    // Add this entry only if its larger than what we already know about.
    if (largestINPEntries.length < MAX_ENTRIES ||
        entry.duration > largestINPEntries[largestINPEntries.length - 1].duration) {
      // If we already have an interaction with this same ID, replace it rather than append it.
      const existing = largestINPEntries.findIndex(other => entry.interactionId === other.interactionId);
      if (existing >= 0) {
        // Only replace if this one is actually longer
        if (entry.duration > largestINPEntries[existing].duration) {
          largestINPEntries[existing] = entry;
        }
      } else {
        largestINPEntries.push(entry);
      }
      largestINPEntries.sort((a, b) => b.duration - a.duration);
      largestINPEntries.splice(MAX_ENTRIES);
    }
  }

  function getCurrentINPEntry() {
    const interactionCount = estimateInteractionCount();
    const which = Math.min(largestINPEntries.length - 1, Math.floor(interactionCount / EVERY_N));
    return largestINPEntries[which];
  }

  /**
   * @param {number} interactionId
   */
  function updateInteractionIds(interactionId) {
    minKnownInteractionId = Math.min(minKnownInteractionId, interactionId);
    maxKnownInteractionId = Math.max(maxKnownInteractionId, interactionId);
  }

  function estimateInteractionCount() {
    // const drag = performance.eventCounts.get('dragstart');
    // const tap = performance.eventCounts.get('pointerup');
    // const keyboard = performance.eventCounts.get('keydown');
    // // This estimate does well on desktop, poorly on mobile (due to crbug.com/1157118 ?)
    // return tap + drag + keyboard;

    // This works well when PO buffering works well
    return (maxKnownInteractionId > 0) ? ((maxKnownInteractionId - minKnownInteractionId) / 7) + 1 : 0;
  }

  /**
   * @param {{ (entry: PerfEntryWithInteractionId): void; (arg0: PerfEntryWithInteractionId): void; }} callback
   */
  function trackInteractions(callback) {
    const observer = new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        const withId = /** @type {PerfEntryWithInteractionId} */ (entry);
        if (!withId.interactionId) {
          continue;
        }

        updateInteractionIds(withId.interactionId);
        addInteractionEntryToINPList(withId);
        callback(withId);
      }
    });

    observer.observe({type: 'event', buffered: true});
  }

  // Will get called multuple times, every time INP changes
  /**
   * @param {{ ({ value, entries, interactionCount }: { value: any; entries: any; interactionCount: any; }): void; (arg0: { value: number; entries: PerfEntryWithInteractionId[]; interactionCount: number; }): void; }} callback
   */
  function getINP(callback) {
    /**
     * @type {PerfEntryWithInteractionId | undefined}
     */
    let previousINP = undefined;
    trackInteractions((/** @type {PerfEntryWithInteractionId} */ entry) => {
      const inpEntry = getCurrentINPEntry();
      if (!previousINP || previousINP.duration !== inpEntry.duration) {
        previousINP = inpEntry;
        callback({
          value: inpEntry.duration,
          entries: [inpEntry],
          interactionCount: estimateInteractionCount(),
        });
      }
    });
  }
  const data = {lcpCandidates: /**  @type {Array<PerformanceEntry>} */ ([])};
  await /** @type {Promise<void>} */ (new Promise(resolve => {
    new PerformanceObserver(entryList => {
      for (const entry of entryList.getEntries()) {
        data.lcpCandidates.push(entry.toJSON());
      }
      resolve();
    }).observe({type: 'largest-contentful-paint', buffered: true});
  }));

  await /** @type {Promise<void>} */ (new Promise(resolve => {
    /* Usage Example */
    getINP(({value, entries, interactionCount}) => {
      const currentINP = entries[0];

      // RenderTime is an estimate, because duration is rounded, and may get rounded keydown
      // In rare cases it can be less than processingEnd and that breaks performance.measure().
      // Lets make sure its at least 4ms in those cases so you can just barely see it.
      const presentationTime = currentINP.startTime + currentINP.duration;
      const adjustedPresentationTime = Math.max(currentINP.processingEnd + 4, presentationTime);

      // @ts-ignore
      data.inp = {
        entry: currentINP.toJSON(),
        presentationTime: adjustedPresentationTime,
      };
      // TODO: this is broken, if we have not had any interactions then this will never resolve, because the callback never gets called. We should upate the code to log the interactions into some array, rather than execute only on callback?
      resolve();
    });
  }));

  return data;
}
