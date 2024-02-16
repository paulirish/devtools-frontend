// Copyright 2022 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as Helpers from '../helpers/helpers.js';
import * as Types from '../types/types.js';

import {HandlerState} from './types.js';

/**
 * IMPORTANT!
 * See UserTimings.md in this directory for some handy documentation on
 * UserTimings and the trace events we parse currently.
 **/
let syntheticEvents: Types.TraceEvents.SyntheticEventPair<Types.TraceEvents.TraceEventPairableAsync>[] = [];
const performanceMeasureEvents: Types.TraceEvents.TraceEventPerformanceMeasure[] = [];
const performanceMarkEvents: Types.TraceEvents.TraceEventPerformanceMark[] = [];

const consoleTimings: (Types.TraceEvents.TraceEventConsoleTimeBegin|Types.TraceEvents.TraceEventConsoleTimeEnd)[] = [];

const timestampEvents: Types.TraceEvents.TraceEventTimeStamp[] = [];

export interface UserTimingsData {
  /**
   * Events triggered with the performance.measure() API.
   * https://developer.mozilla.org/en-US/docs/Web/API/Performance/measure
   */
  performanceMeasures: readonly Types.TraceEvents.SyntheticUserTimingPair[];
  /**
   * Events triggered with the performance.mark() API.
   * https://developer.mozilla.org/en-US/docs/Web/API/Performance/mark
   */
  performanceMarks: readonly Types.TraceEvents.TraceEventPerformanceMark[];
  /**
   * Events triggered with the console.time(), console.timeEnd() and
   * console.timeLog() API.
   * https://developer.mozilla.org/en-US/docs/Web/API/console/time
   */
  consoleTimings: readonly Types.TraceEvents.SyntheticConsoleTimingPair[];
  /**
   * Events triggered with the console.timeStamp() API
   * https://developer.mozilla.org/en-US/docs/Web/API/console/timeStamp
   */
  timestampEvents: readonly Types.TraceEvents.TraceEventTimeStamp[];
}
let handlerState = HandlerState.UNINITIALIZED;

export function reset(): void {
  syntheticEvents.length = 0;
  performanceMeasureEvents.length = 0;
  performanceMarkEvents.length = 0;
  consoleTimings.length = 0;
  timestampEvents.length = 0;
  handlerState = HandlerState.INITIALIZED;
}

export function handleEvent(event: Types.TraceEvents.TraceEventData): void {
  if (handlerState !== HandlerState.INITIALIZED) {
    throw new Error('UserTimings handler is not initialized');
  }

  // Early exit micro-optimization
  if (!(event.cat === 'blink.user_timing' || event.cat === 'blink.console' ||
        event.name === Types.TraceEvents.KnownEventName.TimeStamp)) {
    return;
  }

  if (Types.TraceEvents.isTraceEventPerformanceMeasure(event)) {
    performanceMeasureEvents.push(event);
    return;
  }
  if (Types.TraceEvents.isTraceEventPerformanceMark(event)) {
    performanceMarkEvents.push(event);
  }
  if (Types.TraceEvents.isTraceEventConsoleTime(event)) {
    consoleTimings.push(event);
  }
  if (Types.TraceEvents.isTraceEventTimeStamp(event)) {
    timestampEvents.push(event);
  }
}

export async function finalize(): Promise<void> {
  if (handlerState !== HandlerState.INITIALIZED) {
    throw new Error('UserTimings handler is not initialized');
  }

  const asyncEvents = [...performanceMeasureEvents, ...consoleTimings];
  syntheticEvents = Helpers.Trace.createMatchedSortedSyntheticEvents(asyncEvents);
  handlerState = HandlerState.FINALIZED;
}

export function data(): UserTimingsData {
  if (handlerState !== HandlerState.FINALIZED) {
    throw new Error('UserTimings handler is not finalized');
  }

  return {
    performanceMeasures: syntheticEvents.filter(e => e.cat === 'blink.user_timing') as
        Types.TraceEvents.SyntheticUserTimingPair[],
    consoleTimings: syntheticEvents.filter(e => e.cat === 'blink.console') as
        Types.TraceEvents.SyntheticConsoleTimingPair[],
    performanceMarks: [...performanceMarkEvents],
    timestampEvents: [...timestampEvents],
  };
}
