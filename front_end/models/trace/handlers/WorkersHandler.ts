// Copyright 2023 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as Types from '../types/types.js';

import {HandlerState} from './types.js';

export interface WorkersData {
  workerSessionIdEvents: readonly Types.Events.TracingSessionIdForWorker[];
  workerIdByThread: Map<Types.Events.ThreadID, Types.Events.WorkerId>;
  workerURLById: Map<Types.Events.WorkerId, string>;
}
let handlerState = HandlerState.NOT_READY;

const sessionIdEvents: Types.Events.TracingSessionIdForWorker[] = [];
const workerIdByThread: Map<Types.Events.ThreadID, Types.Events.WorkerId> = new Map();
const workerURLById: Map<Types.Events.WorkerId, string> = new Map();


export function reset(): void {
  sessionIdEvents.length = 0;
  workerIdByThread.clear();
  workerURLById.clear();
  handlerState = HandlerState.READY_TO_HANDLE;
}

export function handleEvent(event: Types.Events.Event): void {
  if (handlerState !== HandlerState.READY_TO_HANDLE) {
    throw new Error('Workers Handler was not reset');
  }
  if (Types.Events.isTracingSessionIdForWorker(event)) {
    sessionIdEvents.push(event);
  }
}

export async function finalize(): Promise<void> {
  if (handlerState !== HandlerState.READY_TO_HANDLE) {
    throw new Error('Handler was not reset');
  }
  for (const sessionIdEvent of sessionIdEvents) {
    if (!sessionIdEvent.args.data) {
      continue;
    }
    workerIdByThread.set(sessionIdEvent.args.data.workerThreadId, sessionIdEvent.args.data.workerId);
    workerURLById.set(sessionIdEvent.args.data.workerId, sessionIdEvent.args.data.url);
  }
  handlerState = HandlerState.FINALIZED;
}

export function data(): WorkersData {
  if (handlerState !== HandlerState.FINALIZED) {
    throw new Error('Workers Handler is not finalized');
  }

  return {
    workerSessionIdEvents: sessionIdEvents,
    workerIdByThread,
    workerURLById,
  };
}
