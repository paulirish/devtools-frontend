// Copyright 2022 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as Helpers from '../helpers/helpers.js';
import * as Types from '../types/types.js';

import {data as metaHandlerData} from './MetaHandler.js';
import {type TraceEventHandlerName} from './types.js';

// Each thread contains events. Events indicate the thread and process IDs, which are
// used to store the event in the correct process thread entry below.
const eventsInProcessThread =
    new Map<Types.TraceEvents.ProcessID, Map<Types.TraceEvents.ThreadID, Types.TraceEvents.TraceEventSnapshot[]>>();
const unpairedAsyncEvents: Types.TraceEvents.TraceEventNestableAsync[] = [];

let snapshots: Types.TraceEvents.TraceEventSnapshot[] = [];
export function reset(): void {
  eventsInProcessThread.clear();
  snapshots.length = 0;
  unpairedAsyncEvents.length = 0;
}

export function handleEvent(event: Types.TraceEvents.TraceEventData): void {
  if (event.name === 'Screenshot') {
    Helpers.Trace.addEventToProcessThread(event, eventsInProcessThread);
  } else if (event.name === 'PipelineReporter') {
    unpairedAsyncEvents.push(event);
  }

}

export async function finalize(): Promise<void> {
  const {browserProcessId, browserThreadId} = metaHandlerData();
  const syntheticEvents = Helpers.Trace.createMatchedSortedSyntheticEvents(unpairedAsyncEvents);


  const browserThreads = eventsInProcessThread.get(browserProcessId);
  if (browserThreads) {
    snapshots = browserThreads.get(browserThreadId) || [];
    for (const snapshot of snapshots) {
      const frame_sequence = snapshot.args.frame_sequence;
      const matchingPipelineReporter = syntheticEvents.find(e => e.args?.data.beginEvent.args.chrome_frame_reporter.frame_sequence === frame_sequence);
      if (matchingPipelineReporter) {
        snapshot.ts = Types.Timing.MicroSeconds(matchingPipelineReporter.ts + matchingPipelineReporter.dur);
      }
    }
  }
}

export function data(): Types.TraceEvents.TraceEventSnapshot[] {
  return [...snapshots];
}

export function deps(): TraceEventHandlerName[] {
  return ['Meta'];
}
