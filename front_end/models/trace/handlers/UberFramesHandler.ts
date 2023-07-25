// Copyright 2022 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {data as metaHandlerData} from './MetaHandler.js';
import {type TraceEventHandlerName} from './types.js';

import * as Helpers from '../helpers/helpers.js';
import * as Types from '../types/types.js';

// Each thread contains events. Events indicate the thread and process IDs, which are
// used to store the event in the correct process thread entry below.
const eventsInProcessThread =
    new Map<Types.TraceEvents.ProcessID, Map<Types.TraceEvents.ThreadID, Types.TraceEvents.TraceEventSnapshot[]>>();

let relevantEvts: Types.TraceEvents.TraceEventSnapshot[] = [];
export function reset(): void {
  eventsInProcessThread.clear();
  relevantEvts.length = 0;
}


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
];

export function handleEvent(event: Types.TraceEvents.TraceEventData): void {

  if (
    event.name === 'Screenshot'
    || Types.TraceEvents.isTraceEventGPUTask(event)
    || event.cat === 'blink.user_timing'
    || someRelevantTraceEventTypes.some(type => event.name === type)
  ) {
    relevantEvts.push(event);
    Helpers.Trace.addEventToProcessThread(event, eventsInProcessThread);
  }

}

export async function finalize(): Promise<void> {
  const {browserProcessId, browserThreadId} = metaHandlerData();
  const browserThreads = eventsInProcessThread.get(browserProcessId);
  // if (browserThreads) {
  //   relevantEvts = browserThreads.get(browserThreadId) || [];
  // }
}

export function data(): Types.TraceEvents.TraceEventSnapshot[] {
  return [...relevantEvts];
}

export function deps(): TraceEventHandlerName[] {
  return ['Meta'];
}
