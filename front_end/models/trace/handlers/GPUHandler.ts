// Copyright 2022 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as Helpers from '../helpers/helpers.js';
import * as Types from '../types/types.js';

import {data as metaHandlerData} from './MetaHandler.js';
import {type HandlerName, HandlerState} from './types.js';

let handlerState = HandlerState.NOT_READY;

// Each thread contains events. Events indicate the thread and process IDs, which are
// used to store the event in the correct process thread entry below.
const eventsInProcessThread = new Map<Types.Events.ProcessID, Map<Types.Events.ThreadID, Types.Events.GPUTask[]>>();

let mainGPUThreadTasks: Types.Events.GPUTask[] = [];

export function reset(): void {
  eventsInProcessThread.clear();
  mainGPUThreadTasks = [];

  handlerState = HandlerState.READY_TO_HANDLE;
}

export function handleEvent(event: Types.Events.Event): void {
  if (handlerState !== HandlerState.READY_TO_HANDLE) {
    throw new Error('GPU Handler was not reset');
  }

  if (!Types.Events.isGPUTask(event)) {
    return;
  }

  Helpers.Trace.addEventToProcessThread(event, eventsInProcessThread);
}

export async function finalize(): Promise<void> {
  if (handlerState !== HandlerState.READY_TO_HANDLE) {
    throw new Error('GPU Handler was not reset');
  }

  const {gpuProcessId, gpuThreadId} = metaHandlerData();
  const gpuThreadsForProcess = eventsInProcessThread.get(gpuProcessId);
  if (gpuThreadsForProcess && gpuThreadId) {
    mainGPUThreadTasks = gpuThreadsForProcess.get(gpuThreadId) || [];
  }
  handlerState = HandlerState.FINALIZED;
}

export interface GPUHandlerReturnData {
  mainGPUThreadTasks: readonly Types.Events.GPUTask[];
}

export function data(): GPUHandlerReturnData {
  if (handlerState !== HandlerState.FINALIZED) {
    throw new Error('GPU Handler is not finalized');
  }
  return {
    mainGPUThreadTasks,
  };
}

export function deps(): HandlerName[] {
  return ['Meta'];
}
