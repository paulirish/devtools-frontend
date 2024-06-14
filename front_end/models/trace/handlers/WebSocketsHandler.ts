// Copyright 2024 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as Types from '../types/types.js';

import {data as metaHandlerData} from './MetaHandler.js';
import {HandlerState} from './types.js';

let handlerState = HandlerState.UNINITIALIZED;

export interface WebSocketTraceDataForFrame {
  frame: string;
  webSocketIdentifier: number;
  events: Types.TraceEvents.WebSocketEvent[];
}
export interface WebSocketTraceDataForWorker {
  workerId: string;
  webSocketIdentifier: number;
  events: Types.TraceEvents.WebSocketEvent[];
}
export type WebSocketTraceData = WebSocketTraceDataForFrame|WebSocketTraceDataForWorker;
export interface WebSocketsData {
  traceData: WebSocketTraceData[];
}

const synthEvents = [];
const webSocketData: Map<number, WebSocketTraceData> = new Map();
export function reset(): void {
  handlerState = HandlerState.INITIALIZED;
  synthEvents.length = 0;
  webSocketData.clear();
}

export function handleEvent(event: Types.TraceEvents.TraceEventData): void {
  if (handlerState !== HandlerState.INITIALIZED) {
    throw new Error('WebSockets Handler is not initialized');
  }

  if (Types.TraceEvents.isTraceEventWebSocketCreate(event) || Types.TraceEvents.isTraceEventWebSocketInfo(event) ||
      Types.TraceEvents.isTraceEventWebSocketTransfer(event)) {
    const identifier = event.args.data.identifier;
    if (!webSocketData.has(identifier)) {
      if (event.args.data.frame) {
        webSocketData.set(identifier, {
          frame: event.args.data.frame,
          webSocketIdentifier: identifier,
          events: [],
        });
      } else if (event.args.data.workerId) {
        webSocketData.set(identifier, {
          workerId: event.args.data.workerId,
          webSocketIdentifier: identifier,
          events: [],
        });
      }
    }

    webSocketData.get(identifier)?.events.push(event);
  }
}

function createSyntheticWebSocketConnectionEvent(
    startEvent: Types.TraceEvents.TraceEventWebSocketCreate|null,
    endEvent: Types.TraceEvents.TraceEventWebSocketDestroy|null, firstRecordedEvent: Types.TraceEvents.WebSocketEvent,
    allEvents: Types.TraceEvents.WebSocketEvent[]): Types.TraceEvents.SyntheticWebSocketConnectionEvent {
  const {traceBounds} = metaHandlerData();
  const startTs = startEvent ? startEvent.ts : traceBounds.min;
  const endTs = endEvent ? endEvent.ts : traceBounds.max;
  const duration = endTs - startTs;
  const mainEvent = startEvent || endEvent || firstRecordedEvent;
  return {
    name: 'SyntheticWebSocketConnectionEvent',
    cat: mainEvent.cat,
    ph: mainEvent.ph,
    ts: startTs,
    dur: duration as Types.Timing.MicroSeconds,
    pid: mainEvent.pid,
    tid: mainEvent.tid,
    s: mainEvent.s,
    args: {
      data: {
        mimeType: 'text/javascript',
        identifier: mainEvent.args.data.identifier,
        url: mainEvent.args.data.url ?? '',
        nestedEvents: allEvents.filter(event => event !== startEvent && event !== endEvent),
      },
    },
  };
}

export async function finalize(): Promise<void> {
  if (handlerState !== HandlerState.INITIALIZED) {
    throw new Error('WebSockets handler is not initialized');
  }
  // Creating a synthetic WebSocket event for each WebSocket connection
  webSocketData.forEach(data => {
    let startEvent: Types.TraceEvents.WebSocketEvent|null = null;
    let endEvent: Types.TraceEvents.TraceEventWebSocketDestroy|null = null;
    if (data.events.length > 0 && Types.TraceEvents.isSyntheticWebSocketConnectionEvent(data.events[0])) {
      // drop the synthetic event if it already exists. We will create a new one with updated duration
      data.events.shift();
    }
    for (const event of data.events) {
      if (Types.TraceEvents.isTraceEventWebSocketCreate(event)) {
        startEvent = event;
      }
      if (Types.TraceEvents.isTraceEventWebSocketDestroy(event)) {
        endEvent = event;
      }
    }
    const syntheticWebSocketConnectionEvent =
        createSyntheticWebSocketConnectionEvent(startEvent, endEvent, data.events[0], data.events);
    data.events.unshift(syntheticWebSocketConnectionEvent);
    synthEvents.push(syntheticWebSocketConnectionEvent);
  });
  handlerState = HandlerState.FINALIZED;
}

export function data(): WebSocketsData {
  if (handlerState !== HandlerState.FINALIZED) {
    throw new Error('WebSockets handler is not finalized');
  }

  return {
    synthEvents,
  };
}
