// Copyright 2022 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as Root from '../../../core/root/root.js';
import * as Helpers from '../helpers/helpers.js';
import * as Types from '../types/types.js';

import {data as metaHandlerData, initialGpuProcessId} from './MetaHandler.js';
import {HandlerState, type TraceEventHandlerName} from './types.js';

let handlerState = HandlerState.UNINITIALIZED;

// Each thread contains events. Events indicate the thread and process IDs, which are
// used to store the event in the correct process thread entry below.
const eventsInProcessThread =
    new Map<Types.TraceEvents.ProcessID, Map<Types.TraceEvents.ThreadID, Types.TraceEvents.TraceEventGPUTask[]>>();

let mainGPUThreadTasks: Types.TraceEvents.TraceEventGPUTask[] = [];

let showAllEvents: boolean = false;

export function reset(): void {
  eventsInProcessThread.clear();
  mainGPUThreadTasks = [];
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

  if (event.pid !== initialGpuProcessId()) {
    return;
  }

  // TODO(paulirish): In the standard, non-show-all-events case, we should only
  // show GPU events where event.args.data.renderer_pid is an inspected renderer
  // It's very common to have GPU events for other tabs/windows (the processFilter doesn't apply)
  if (showAllEvents || Types.TraceEvents.isTraceEventGPUTask(event)) {
    Helpers.Trace.addEventToProcessThread(event, eventsInProcessThread);
  }
}

export async function finalize(): Promise<void> {
  if (handlerState !== HandlerState.INITIALIZED) {
    throw new Error('GPU Handler is not initialized');
  }

  const {gpuProcessId, gpuThreadId} = metaHandlerData();
  const gpuThreadsForProcess = eventsInProcessThread.get(gpuProcessId);
  if (gpuThreadsForProcess && gpuThreadId) {
    mainGPUThreadTasks = gpuThreadsForProcess.get(gpuThreadId) || [];
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
