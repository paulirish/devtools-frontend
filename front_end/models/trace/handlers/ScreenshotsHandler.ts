// Copyright 2022 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as Helpers from '../helpers/helpers.js';
import * as Types from '../types/types.js';

import type {HandlerName} from './types.js';

// Each thread contains events. Events indicate the thread and process IDs, which are
// used to store the event in the correct process thread entry below.
const unpairedAsyncEvents: Types.Events.PipelineReporter[] = [];

const snapshotEvents: Types.Events.Screenshot[] = [];
const syntheticScreenshots: Types.Events.SyntheticScreenshot[] = [];
let frameSequenceToTs: Record<number, Types.Timing.MicroSeconds> = {};
const sourceToSequenceToTs: Record<number, Record<number, Types.Timing.MicroSeconds>> = {};

export function reset(): void {
  unpairedAsyncEvents.length = 0;
  snapshotEvents.length = 0;
  syntheticScreenshots.length = 0;
  frameSequenceToTs = {};
}

export function handleEvent(event: Types.Events.Event): void {
  if (Types.Events.isScreenshot(event)) {
    snapshotEvents.push(event);
  } else if (Types.Events.isPipelineReporter(event)) {
    unpairedAsyncEvents.push(event);
  }
}

export async function finalize(): Promise<void> {
  const pipelineReporterEvents = Helpers.Trace.createMatchedSortedSyntheticEvents(unpairedAsyncEvents);

  frameSequenceToTs = Object.fromEntries(pipelineReporterEvents.map(evt => {
    const frameSequenceId = evt.args.data.beginEvent.args.chrome_frame_reporter.frame_sequence;
    const sourceId = evt.args.data.beginEvent.args.chrome_frame_reporter.frame_source;
    const presentationTs = Types.Timing.MicroSeconds(evt.ts + evt.dur);

    sourceToSequenceToTs[sourceId] ??= {};
    sourceToSequenceToTs[sourceId][frameSequenceId] = presentationTs;

    return [frameSequenceId, presentationTs];
  }));


  for (const snapshotEvent of snapshotEvents) {
    const {cat, name, ph, pid, tid} = snapshotEvent;

    // console.log((getPresentationTimestamp(snapshotEvent) - snapshotEvent.ts) / 1000, 'ms adjusted to the right');

    const syntheticEvent = Helpers.SyntheticEvents.SyntheticEventsManager.registerSyntheticEvent<
        Types.Events.SyntheticScreenshot>({
      rawSourceEvent: snapshotEvent,
      cat,
      name,
      ph,
      pid,
      tid,
      // TODO(paulirish, crbug.com/41363012): investigate why getPresentationTimestamp(snapshotEvent) seems less accurate. Resolve screenshot timing innaccuracy.
      // `getPresentationTimestamp(snapshotEvent) - snapshotEvent.ts` is how many microsec the screenshot should be adjusted to the right/later
      ts: getPresentationTimestamp(snapshotEvent),
      args: {
        dataUri: `data:image/jpg;base64,${snapshotEvent.args.snapshot}`,
      },
    });
    syntheticScreenshots.push(syntheticEvent);
  }
}

/**
 * Correct the screenshot timestamps
 * The screenshot 'snapshot object' trace event has the "frame sequence number" attached as an ID.
 * We match that up with the "PipelineReporter" trace events as they terminate at presentation.
 * Presentation == when the pixels hit the screen. AKA Swap on the GPU
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function getPresentationTimestamp(screenshotEvent: Types.Events.Screenshot): Types.Timing.MicroSeconds {
  const frameSequence = parseInt(screenshotEvent.id, 16);
  // If it's 1, then it's an old trace (before https://crrev.com/c/4957973) and cannot be corrected.
  if (frameSequence === 1) {
    return screenshotEvent.ts;
  }
  // The screenshot trace event's `ts` reflects the "expected display time" which is ESTIMATE.
  // It is set by the compositor frame sink from the `expected_display_time`, which is based on a previously known
  // frame start PLUS the vsync interval (eg 16.6ms)
  const updatedTs = frameSequenceToTs[frameSequence];

  const {frame_sequence, source_id} = screenshotEvent.args;
  const BetterupdatedTs = sourceToSequenceToTs[source_id]?.[frame_sequence];

  if (BetterupdatedTs === undefined) {
    // console.log('better timestamp not found', source_id, frame_sequence);
  } else if (BetterupdatedTs !== updatedTs) {
    // console.log(
    // 'different result thanks to sourceid', source_id, frame_sequence, BetterupdatedTs - updatedTs, BetterupdatedTs,
    // updatedTs);
  } else {
    // console.log('better ts and reg timestamp are same.', source_id, frame_sequence);
  }

  // Do we always find a match? No...
  // We generally don't match the very first screenshot and, sometimes, the last
  // The very first screenshot is requested immediately (even if nothing is painting). As a result there's no compositor
  // instrumentation running alongside.
  // The last one is sometimes missing as because the trace terminates right before the associated PipelineReporter is emitted.
  return BetterupdatedTs ?? screenshotEvent.ts;
}

// TODO(crbug/41484172): should be readonly
export function data(): ({all: Types.Events.SyntheticScreenshot[]}) {
  return {all: syntheticScreenshots};
}

export function deps(): HandlerName[] {
  return ['Meta'];
}
