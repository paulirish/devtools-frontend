// Copyright 2022 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as Root from '../../../core/root/root.js';

import {data as metaHandlerData} from './MetaHandler.js';

import {type TraceEventHandlerName, HandlerState} from './types.js';

import * as Types from '../types/types.js';
import * as Helpers from '../helpers/helpers.js';

let handlerState = HandlerState.UNINITIALIZED;

// Each thread contains events. Events indicate the thread and process IDs, which are
// used to store the event in the correct process thread entry below.
const eventsInProcessThread =
    new Map<Types.TraceEvents.ProcessID, Map<Types.TraceEvents.ThreadID, Types.TraceEvents.TraceEventGPUTask[]>>();

let mainGPUThreadTasks: Types.TraceEvents.TraceEventGPUTask[] = [];

let gpuProcessId: Types.TraceEvents.ProcessID = Types.TraceEvents.ProcessID(-1);
let gpuMainThreadId: Types.TraceEvents.ThreadID = Types.TraceEvents.ThreadID(-1);
let showAllEvents: boolean = false;

export function reset(): void {
  eventsInProcessThread.clear();
  mainGPUThreadTasks = [];
  gpuProcessId = Types.TraceEvents.ProcessID(-1);
  gpuMainThreadId = Types.TraceEvents.ThreadID(-1);
  showAllEvents = false;

  handlerState = HandlerState.UNINITIALIZED;
}

export function initialize(): void {
  if (handlerState !== HandlerState.UNINITIALIZED) {
    throw new Error('GPU Handler was not reset before being initialized');
  }
  showAllEvents = Root.Runtime.experiments.isEnabled('timelineShowAllEvents');

  handlerState = HandlerState.INITIALIZED;
}

export function handleEvent(event: Types.TraceEvents.TraceEventData): void {
  if (handlerState !== HandlerState.INITIALIZED) {
    throw new Error('GPU Handler is not initialized');
  }

  // The GPU process and thread IDs will be in the very beginning of the JSON trace
  // So we can rely on having that information before we process all other events
  // https://source.chromium.org/chromium/chromium/src/+/main:third_party/perfetto/src/trace_processor/export_json.cc;l=111;drc=4e2303cb84f29df580d050a410932f406806cdf2
  if (gpuProcessId === -1 && Types.TraceEvents.isProcessName(event) &&
      (event.args.name === 'Gpu' || event.args.name === 'GPU Process')) {
    gpuProcessId = event.pid;
    return;
  }

  if (gpuMainThreadId === -1 && Types.TraceEvents.isThreadName(event) && event.args.name === 'CrGpuMain') {
    gpuMainThreadId = event.tid;
    return;
  }

  if (event.pid !== gpuProcessId) {
    return;
  }

  // TODO(paulirish): We should only show GPU events where event.args.data.renderer_pid is an inspected renderer
  // It's very possible to have GPU events for other tabs/windows.
  if (Types.TraceEvents.isTraceEventGPUTask(event)) {
    Helpers.Trace.addEventToProcessThread(event, eventsInProcessThread);
  } else if (showAllEvents) {
    Helpers.Trace.addEventToProcessThread(event, eventsInProcessThread);
  }
}

export async function finalize(): Promise<void> {
  if (handlerState !== HandlerState.INITIALIZED) {
    throw new Error('GPU Handler is not initialized');
  }

  const {gpuProcessId: metaGpuPid, gpuThreadId: metaGpuTid} = metaHandlerData();
  if (metaGpuPid !== gpuProcessId || metaGpuTid !== gpuMainThreadId) {
    console.assert(false, 'GPU mismatch between handler and meta');
  }

  const gpuThreadsForProcess = eventsInProcessThread.get(gpuProcessId);
  if (gpuThreadsForProcess && gpuMainThreadId) {
    // TODO(paulirish): Include other GPU threads in showAllEvents case.
    mainGPUThreadTasks = gpuThreadsForProcess.get(gpuMainThreadId) || [];
    mainGPUThreadTasks.sort((event1, event2) => event1.ts - event2.ts);
  }
  handlerState = HandlerState.FINALIZED;
}

export interface GPUHandlerReturnData {
  mainGPUThreadTasks: readonly Types.TraceEvents.TraceEventGPUTask[];
}

export function data(): GPUHandlerReturnData {
  if (handlerState !== HandlerState.FINALIZED) {
    throw new Error('GPU Handler is not finalized');
  }
  return {
    mainGPUThreadTasks: [...mainGPUThreadTasks],
  };
}

export function deps(): TraceEventHandlerName[] {
  return ['Meta'];
}
