// Copyright 2022 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {data as metaHandlerData} from './MetaHandler.js';
import {type TraceEventHandlerName} from './types.js';

import * as Platform from '../../../core/platform/platform.js';
import * as Helpers from '../helpers/helpers.js';
import * as Types from '../types/types.js';
import {HandlerState} from './types.js';

// Each thread contains events. Events indicate the thread and process IDs, which are
// used to store the event in the correct process thread entry below.
const eventsInProcessThread =
    new Map<Types.TraceEvents.ProcessID, Map<Types.TraceEvents.ThreadID, Types.TraceEvents.TraceEventSnapshot[]>>();

// these types are wrong
let relevantEvts: Types.TraceEvents.TraceEventSnapshot[] = [];
let asyncEvts: Types.TraceEvents.TraceEventSnapshot[] = [];
const syntheticEvents: Types.TraceEvents.TraceEventSyntheticNestableAsyncEvent[] = [];

// export interface UberFramesData {
//   relevantEvts: readonly Types.TraceEvents.TraceEventData[],
//   syntheticEvents: readonly Types.TraceEvents.TraceEventSyntheticNestableAsyncEvent[];
// }


export type UberFramesData = readonly Types.TraceEvents.TraceEventData[];

export function reset(): void {
  eventsInProcessThread.clear();
  relevantEvts.length = 0;
  syntheticEvents.length = 0;
  asyncEvts.length = 0;

  handlerState = HandlerState.INITIALIZED;
}


let handlerState = HandlerState.UNINITIALIZED;


const someStuff  = {
  CompositeLayers : 'CompositeLayers',
  RasterTask : 'RasterTask',
  ImageDecodeTask : 'ImageDecodeTask',
  ImageUploadTask : 'ImageUploadTask',
  DecodeImage : 'Decode Image',
  ResizeImage : 'Resize Image',
  DrawLazyPixelRef : 'Draw LazyPixelRef',
  DecodeLazyPixelRef : 'Decode LazyPixelRef',
};
const someRelevantTraceEventTypes = [
  ... Object.values(someStuff),
  'MainFrame.NotifyReadyToCommitOnImpl',
  'MainFrame.CommitComplete',
  'RasterizerTaskImpl::RunOnWorkerThread',
  'LayerTreeHostImpl::FinishCommit',
  'TileManager::FlushAndIssueSignals',
  'ProxyImpl::ScheduledActionDraw',
  'PipelineReporter',
  'RasterDecoderImpl::DoEndRasterCHROMIUM',
  'Frame',
  'SendBeginMainFrameToCommit'
];

export function handleEvent(event: Types.TraceEvents.TraceEventData): void {

  if (
    event.name === 'Screenshot'
    || Types.TraceEvents.isTraceEventGPUTask(event)
    || event.cat === 'blink.user_timing'
    || someRelevantTraceEventTypes.some(type => event.name === type)
  ) {
    if (event.ph === 'b' || event.ph === 'e') {
      asyncEvts.push(event);
    } else {
      relevantEvts.push(event);
    }
    Helpers.Trace.addEventToProcessThread(event, eventsInProcessThread);
  }

}

export async function finalize(): Promise<void> {
  const {browserProcessId, browserThreadId} = metaHandlerData();
  const browserThreads = eventsInProcessThread.get(browserProcessId);
  // if (browserThreads) {
  //   relevantEvts = browserThreads.get(browserThreadId) || [];
  // }


  if (handlerState !== HandlerState.INITIALIZED) {
    throw new Error('UberFrames handler is not initialized');
  }

  const matchedEvents: Map<string, {
    begin: Types.TraceEvents.TraceEventNestableAsyncBegin | null,
    end: Types.TraceEvents.TraceEventNestableAsyncEnd | null,
  }> = new Map();

  for (const event of [...asyncEvts]) {
    const id = Helpers.Trace.extractId(event);
    if (id === undefined) {
      continue;
    }
    // Create a synthetic id to prevent collisions across categories.
    // Console timings can be dispatched with the same id, so use the
    // event name as well to generate unique ids.
    const syntheticId = `${event.cat}:${id}:${event.name}`;
    const otherEventsWithID = Platform.MapUtilities.getWithDefault(matchedEvents, syntheticId, () => {
      return {begin: null, end: null};
    });
    const isStartEvent = event.ph === Types.TraceEvents.Phase.ASYNC_NESTABLE_START;
    const isEndEvent = event.ph === Types.TraceEvents.Phase.ASYNC_NESTABLE_END;

    if (isStartEvent) {
      otherEventsWithID.begin = event;
    } else if (isEndEvent) {
      otherEventsWithID.end = event;
    }
  }

  for (const [id, eventsPair] of matchedEvents.entries()) {
    if (!eventsPair.begin || !eventsPair.end) {
      // This should never happen, the backend only creates the events once it
      // has them both, so we should never get into this state.
      // If we do, something is very wrong, so let's just drop that problematic event.
      continue;
    }

    const event: Types.TraceEvents.TraceEventSyntheticNestableAsyncEvent = {
      cat: eventsPair.end.cat,
      ph: eventsPair.end.ph,
      pid: eventsPair.end.pid,
      tid: eventsPair.end.tid,
      id,
      // Both events have the same name, so it doesn't matter which we pick to
      // use as the description
      name: eventsPair.begin.name,
      dur: Types.Timing.MicroSeconds(eventsPair.end.ts - eventsPair.begin.ts),
      ts: eventsPair.begin.ts,
      args: {
        data: {
          beginEvent: eventsPair.begin,
          endEvent: eventsPair.end,
        },
      },
    };
    syntheticEvents.push(event);
  }
  syntheticEvents.sort((event1, event2) => {
    if (event1.ts > event2.ts) {
      return 1;
    }
    if (event2.ts > event1.ts) {
      return -1;
    }
    return 0;
  });
  handlerState = HandlerState.FINALIZED;
}

export function data(): UberFramesData {
  if (handlerState !== HandlerState.FINALIZED) {
    throw new Error('UberFrames handler is not finalized');
  }
  return [...relevantEvts, ...syntheticEvents].sort((event1, event2) => event1.ts - event2.ts);

}

export function deps(): TraceEventHandlerName[] {
  return ['Meta'];
}
