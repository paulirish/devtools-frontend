// Copyright 2023 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as Platform from '../../../core/platform/platform.js';
import * as Helpers from '../helpers/helpers.js';
import * as Types from '../types/types.js';

import type {HandlerName} from './types.js';
import {data as userInteractionsHandlerData} from './UserInteractionsHandler.js';
import {data as workersData} from './WorkersHandler.js';

export interface WarningsData {
  // Tracks warnings keyed by the event.
  perEvent: WeakMap<Types.Events.Event, Warning[]>;
  // The same data in reverse: for each type of warning, track the events.
  // Useful if we need to enumerate events by type of issue
  perWarning: Map<Warning, Types.Events.Event[]>;
}

export type Warning = 'LONG_TASK'|'IDLE_CALLBACK_OVER_TIME'|'FORCED_REFLOW'|'LONG_INTERACTION';

let warningsPerEvent: WarningsData['perEvent'] = new WeakMap();
let eventsPerWarning: WarningsData['perWarning'] = new Map();

interface ThreadReflowState {
  /**
   * Tracks the stack formed by nested trace events on this thread up to a given point.
   */
  allEventsStack: Types.Events.Complete[];
  /**
   * Tracks the stack formed by JS invocation trace events on this thread up to a given point.
   * F.e. FunctionCall, EvaluateScript, V8Execute.
   * Not to be confused with ProfileCalls.
   */
  jsInvokeStack: Types.Events.Complete[];
  /**
   * Tracks reflow events in the current task on this thread.
   */
  taskReflowEvents: Types.Events.Complete[];
}

const makeThreadReflowState = (): ThreadReflowState => ({
  allEventsStack: [],
  jsInvokeStack: [],
  taskReflowEvents: [],
});

const makeThreadReflowStateMap = (): Map<Types.Events.ThreadID, ThreadReflowState> => new Map();

/**
 * Per-(pid, tid) forced-reflow tracking state so events on one thread (for
 * example `v8.parseOnBackground` on a V8 worker thread) cannot pollute stacks
 * or task boundaries on another thread.
 */
let reflowStateByThread = new Map<Types.Events.ProcessID, Map<Types.Events.ThreadID, ThreadReflowState>>();
/**
 * Tracks events containing long running tasks. These are compared later against the worker thread pool to filter out long tasks from worker threads.
 */
let longTaskEvents: Types.Events.Event[] = [];

export const FORCED_REFLOW_THRESHOLD: Types.Timing.Micro = Helpers.Timing.milliToMicro(Types.Timing.Milli(30));

export const LONG_MAIN_THREAD_TASK_THRESHOLD: Types.Timing.Micro = Helpers.Timing.milliToMicro(Types.Timing.Milli(50));

export function reset(): void {
  warningsPerEvent = new WeakMap();
  eventsPerWarning = new Map();
  reflowStateByThread = new Map();
  longTaskEvents = [];
}

function getThreadReflowState(pid: Types.Events.ProcessID, tid: Types.Events.ThreadID): ThreadReflowState {
  const byThread = Platform.MapUtilities.getWithDefault(reflowStateByThread, pid, makeThreadReflowStateMap);
  return Platform.MapUtilities.getWithDefault(byThread, tid, makeThreadReflowState);
}

function flushTaskReflowEvents(taskReflowEvents: Types.Events.Complete[]): void {
  if (!taskReflowEvents.length) {
    return;
  }
  const totalTime = taskReflowEvents.reduce((time, event) => time + (event.dur || 0), 0);
  if (totalTime >= FORCED_REFLOW_THRESHOLD) {
    taskReflowEvents.forEach(reflowEvent => storeWarning(reflowEvent, 'FORCED_REFLOW'));
  }
  taskReflowEvents.length = 0;
}

function storeWarning(event: Types.Events.Event, warning: Warning): void {
  const existingWarnings = Platform.MapUtilities.getWithDefault(warningsPerEvent, event, () => []);
  existingWarnings.push(warning);
  warningsPerEvent.set(event, existingWarnings);

  const existingEvents = Platform.MapUtilities.getWithDefault(eventsPerWarning, warning, () => []);
  existingEvents.push(event);
  eventsPerWarning.set(warning, existingEvents);
}

export function handleEvent(event: Types.Events.Event): void {
  processForcedReflowWarning(event);
  if (event.name === Types.Events.Name.RUN_TASK) {
    const {duration} = Helpers.Timing.eventTimingsMicroSeconds(event);
    if (duration > LONG_MAIN_THREAD_TASK_THRESHOLD) {
      longTaskEvents.push(event);
    }
    return;
  }

  if (Types.Events.isFireIdleCallback(event)) {
    const {duration} = Helpers.Timing.eventTimingsMilliSeconds(event);
    if (duration > event.args.data.allottedMilliseconds) {
      storeWarning(event, 'IDLE_CALLBACK_OVER_TIME');
    }
    return;
  }
}

/**
 * Reflows* are added a warning to if:
 * 1. They are forced/sync, meaning they are invoked by JS and finish
 *    during the Script execution.
 * 2. Their duration exceeds a threshold.
 * - *Reflow: The style recalculation and layout steps in a render task.
 */
function processForcedReflowWarning(event: Types.Events.Event): void {
  // Only complete (X) events represent synchronous spans with duration; non-complete
  // events (instant, flow, async, metadata, unclosed begin) can arrive out of order
  // and would otherwise pin the per-thread stacks.
  if (!Types.Events.isComplete(event)) {
    return;
  }
  const state = getThreadReflowState(event.pid, event.tid);
  // Update the event and the JS invocation stacks for this thread.
  accomodateEventInStack(event, state.allEventsStack);
  accomodateEventInStack(
      event, state.jsInvokeStack, /* pushEventToStack */ event.dur > 0 && Types.Events.isJSInvocationEvent(event));
  if (state.jsInvokeStack.length) {
    // Current event falls inside a JS call on the same thread.
    if (event.name === Types.Events.Name.LAYOUT || event.name === Types.Events.Name.RECALC_STYLE) {
      // A forced reflow happened. However we need to check if
      // the threshold is surpassed to add a warning. Accumulate the
      // event to check for this after the current Task is over.
      state.taskReflowEvents.push(event);
      return;
    }
  }
  if (state.allEventsStack.length === 1) {
    // We hit a new task on this thread. Check if the forced reflows in the
    // previous task exceeded the threshold and add a warning if so.
    flushTaskReflowEvents(state.taskReflowEvents);
  }
}

/**
 * Updates a given trace event stack given a new event.
 */
function accomodateEventInStack(
    event: Types.Events.Complete, stack: Types.Events.Complete[], pushEventToStack = true): void {
  let nextItem = stack.at(-1);
  while (nextItem && event.ts >= nextItem.ts + (nextItem.dur || 0)) {
    stack.pop();
    nextItem = stack.at(-1);
  }
  if (!pushEventToStack) {
    return;
  }
  stack.push(event);
}

export function deps(): HandlerName[] {
  return ['UserInteractions', 'Workers'];
}

export async function finalize(): Promise<void> {
  for (const byThread of reflowStateByThread.values()) {
    for (const state of byThread.values()) {
      flushTaskReflowEvents(state.taskReflowEvents);
    }
  }
  reflowStateByThread.clear();
  // These events do exist on the UserInteractionsHandler, but we also put
  // them into the WarningsHandler so that the warnings handler can be the
  // source of truth and the way to look up all warnings for a given event.
  // Otherwise, we would have to look up warnings across multiple handlers for
  // a given event, which will start to get messy very quickly.
  const longInteractions = userInteractionsHandlerData().interactionsOverThreshold;
  for (const interaction of longInteractions) {
    storeWarning(interaction, 'LONG_INTERACTION');
  }

  for (const event of longTaskEvents) {
    if (!(event.tid, workersData().workerIdByThread.has(event.tid))) {
      storeWarning(event, 'LONG_TASK');
    }
  }
  longTaskEvents.length = 0;
}

export function data(): WarningsData {
  return {
    perEvent: warningsPerEvent,
    perWarning: eventsPerWarning,
  };
}
