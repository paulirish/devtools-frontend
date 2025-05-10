// Copyright 2022 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as Helpers from '../helpers/helpers.js';
import * as Types from '../types/types.js';

/**
 * IMPORTANT!
 * See UserTimings.md in this directory for some handy documentation on
 * UserTimings and the trace events we parse currently.
 **/
export type Timing = Types.Events.SyntheticEventPair<Types.Events.PairableAsync>|Types.Events.PerformanceMark|
                     Types.Events.ConsoleTimeStamp;
let allResolvedTimings: Timing[] = [];

// There are two events dispatched for performance.measure calls: one to
// represent the measured timing in the tracing clock (which we type as
// PerformanceMeasure) and another one for the call itself (which we
// type as UserTimingMeasure). The two events corresponding to the same
// call are linked together by a common trace_id. The reason two events
// are dispatched is because the first was originally added with the
// implementation of the performance.measure API and it uses an
// overridden timestamp and duration. To prevent breaking potential deps
// created since then, a second event was added instead of changing the
// params of the first.
const measureTraceByTraceId = new Map<number, Types.Events.UserTimingMeasure>();
const performanceMeasureEvents: Types.Events.PerformanceMeasure[] = [];
const performanceMarkEvents: Types.Events.PerformanceMark[] = [];

const consoleTimings: Array<Types.Events.ConsoleTimeBegin|Types.Events.ConsoleTimeEnd> = [];

const timestampEvents: Types.Events.ConsoleTimeStamp[] = [];

export interface UserTimingsData {
  /**
   * Events triggered with the performance.measure() API.
   * https://developer.mozilla.org/en-US/docs/Web/API/Performance/measure
   */
  performanceMeasures: readonly Types.Events.SyntheticUserTimingPair[];
  /**
   * Events triggered with the performance.mark() API.
   * https://developer.mozilla.org/en-US/docs/Web/API/Performance/mark
   */
  performanceMarks: readonly Types.Events.PerformanceMark[];
  /**
   * Events triggered with the console.time(), console.timeEnd() and
   * console.timeLog() API.
   * https://developer.mozilla.org/en-US/docs/Web/API/console/time
   */
  consoleTimings: readonly Types.Events.SyntheticConsoleTimingPair[];
  /**
   * Events triggered with the console.timeStamp() API
   * https://developer.mozilla.org/en-US/docs/Web/API/console/timeStamp
   */
  timestampEvents: readonly Types.Events.ConsoleTimeStamp[];
  /**
   * Events triggered to trace the call to performance.measure itself,
   * cached by trace_id.
   */
  measureTraceByTraceId: Map<number, Types.Events.UserTimingMeasure>;
  /**
   * All of the UserTiming data, together in a sorted array.
   */
  allTimings: typeof allResolvedTimings;
}

export function reset(): void {
  allResolvedTimings.length = 0;
  performanceMeasureEvents.length = 0;
  performanceMarkEvents.length = 0;
  consoleTimings.length = 0;
  timestampEvents.length = 0;
  measureTraceByTraceId.clear();
}

/**
 * Similar to the default {@see Helpers.Trace.eventTimeComparator}
 * but with a twist:
 * In case of equal start and end times, always put the second event
 * first.
 *
 * Explanation:
 * User timing entries come as trace events dispatched when
 * performance.measure/mark is called. The trace events buffered in
 * devtools frontend are sorted by the start time. If their start time
 * is the same, then the event for the first call will appear first.
 *
 * When entries are meant to be stacked, the corresponding
 * performance.measure calls usually are done in bottom-up direction:
 * calls for children first and for parent later (because the call
 * is usually done when the measured task is over). This means that
 * when two user timing events have the start and end time, usually the
 * second event is the parent of the first. Hence the switch.
 *
 */
function userTimingComparator(
    a: Helpers.Trace.TimeSpan, b: Helpers.Trace.TimeSpan, originalArray: Helpers.Trace.TimeSpan[]): number {
  const aBeginTime = a.ts;
  const bBeginTime = b.ts;
  if (aBeginTime < bBeginTime) {
    return -1;
  }
  if (aBeginTime > bBeginTime) {
    return 1;
  }
  const aDuration = a.dur ?? 0;
  const bDuration = b.dur ?? 0;
  const aEndTime = aBeginTime + aDuration;
  const bEndTime = bBeginTime + bDuration;
  if (aEndTime > bEndTime) {
    return -1;
  }
  if (aEndTime < bEndTime) {
    return 1;
  }
  // Prefer the event located in a further position in the original array.
  return originalArray.indexOf(b) - originalArray.indexOf(a);
}

export function handleEvent(event: Types.Events.Event): void {
  if (Types.Events.isUserTimingMeasure(event)) {
    // This provides a JS Sample and nothing else. We get measure data (name, detail) from `PerformanceMeasure` event pair. See measureTraceByTraceId comment
    measureTraceByTraceId.set(event.args.traceId, event);
    return;
  }

  if (Types.Events.isUserTiming(event)) {
    if (Types.Events.isPerformanceMeasure(event)) {
      performanceMeasureEvents.push(event);
      return;
    }

    if (Types.Events.isPerformanceMark(event)) {
      performanceMarkEvents.push(event);
      return;
    }
  }
  if (Types.Events.isConsoleTime(event)) {
    consoleTimings.push(event);
    return;
  }
  if (Types.Events.isConsoleTimeStamp(event)) {
    timestampEvents.push(event);
    return;
  }
}

export async function finalize(): Promise<void> {
  const pairedAsyncEvents = [...performanceMeasureEvents, ...consoleTimings];
  const pairedSyntheticEvents = Helpers.Trace.createMatchedSortedSyntheticEvents(pairedAsyncEvents);

  // Combine the paired synthetic events (measures and console timings) with performance marks and timestamps
  allResolvedTimings = [...pairedSyntheticEvents, ...performanceMarkEvents, ...timestampEvents];
  // Sort all of them together using the custom comparator.
  allResolvedTimings.sort((a, b) => userTimingComparator(a, b, allResolvedTimings));
}

export function data(): UserTimingsData {
  return {
    performanceMeasures: allResolvedTimings.filter(Types.Events.isSyntheticUserTiming) as
        Types.Events.SyntheticUserTimingPair[],
    consoleTimings: allResolvedTimings.filter(Types.Events.isSyntheticConsoleTiming) as
        Types.Events.SyntheticConsoleTimingPair[],
    performanceMarks: allResolvedTimings.filter(Types.Events.isPerformanceMark),
    timestampEvents: allResolvedTimings.filter(Types.Events.isConsoleTimeStamp),
    allTimings: allResolvedTimings,
    measureTraceByTraceId: new Map(measureTraceByTraceId),
  };
}
