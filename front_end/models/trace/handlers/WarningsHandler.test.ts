// Copyright 2023 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {assert} from 'chai';
import {beforeEach, describe, it} from 'mocha';

import {setupLocaleHooks} from '../../../testing/LocaleHelpers.js';
import {makeCompleteEvent, makeFlowPhaseEvent, makeInstantEvent} from '../../../testing/TraceHelpersCore.js';
import {TraceLoader} from '../../../testing/TraceLoader.js';
import * as Trace from '../trace.js';

describe('WarningsHandler', function() {
  setupLocaleHooks();
  beforeEach(() => {
    Trace.Handlers.ModelHandlers.UserInteractions.reset();
    Trace.Handlers.ModelHandlers.Workers.reset();
    Trace.Handlers.ModelHandlers.Warnings.reset();
  });

  it('identifies long tasks', async function() {
    // We run the entire model here as the WarningsHandler actually depends on the WorkersHandler.
    const {data} = await TraceLoader.traceEngine(this, 'slow-interaction-keydown.json.gz');
    const {perWarning} = data.Warnings;
    const events = perWarning.get('LONG_TASK');
    // We expect one long task.
    assert.strictEqual(events?.length, 1);
    const event = events?.at(0);
    assert.strictEqual(event?.name, Trace.Types.Events.Name.RUN_TASK);
  });

  it('does not identify worker long tasks', async function() {
    // We run the entire model here as the WarningsHandler actually depends on the WorkersHandler.
    const {data} = await TraceLoader.traceEngine(this, 'long-task-from-worker-thread.json.gz');
    const {perWarning} = data.Warnings;
    const events = perWarning.get('LONG_TASK');
    // We expect no long task warnings (because worker tasks don't count).
    assert.isUndefined(events?.length);
  });

  it('identifies idle callbacks that ran over the allotted time', async function() {
    const events = await TraceLoader.rawEvents(this, 'idle-callback.json.gz');
    for (const event of events) {
      Trace.Handlers.ModelHandlers.Warnings.handleEvent(event);
    }
    const data = Trace.Handlers.ModelHandlers.Warnings.data();
    const longIdleCallbacks = data.perWarning.get('IDLE_CALLBACK_OVER_TIME') || [];
    assert.lengthOf(longIdleCallbacks, 1);
    const event = longIdleCallbacks[0];
    assert.deepEqual(data.perEvent.get(event), ['IDLE_CALLBACK_OVER_TIME']);
  });

  it('identifies reflows that take over 30ms', async function() {
    const events = await TraceLoader.rawEvents(this, 'large-layout-small-recalc.json.gz');
    for (const event of events) {
      Trace.Handlers.ModelHandlers.Warnings.handleEvent(event);
    }
    const data = Trace.Handlers.ModelHandlers.Warnings.data();
    const forcedReflow = data.perWarning.get('FORCED_REFLOW') || [];
    assert.lengthOf(forcedReflow, 2);
    const stylesRecalc = forcedReflow[0];
    const layout = forcedReflow[1];
    assert.deepEqual(data.perEvent.get(stylesRecalc), ['FORCED_REFLOW']);
    assert.deepEqual(data.perEvent.get(layout), ['FORCED_REFLOW']);
    assert.strictEqual(stylesRecalc.name, Trace.Types.Events.Name.RECALC_STYLE);
    assert.strictEqual(layout.name, Trace.Types.Events.Name.LAYOUT);
  });

  it('ignores reflows that are not forced by JS', async function() {
    const events = await TraceLoader.rawEvents(this, 'large-recalc-style.json.gz');
    for (const event of events) {
      Trace.Handlers.ModelHandlers.Warnings.handleEvent(event);
    }
    const data = Trace.Handlers.ModelHandlers.Warnings.data();
    const forcedStyle = data.perWarning.get('FORCED_REFLOW') || [];
    assert.lengthOf(forcedStyle, 0);
  });

  it('ignores reflows overlapping a JS event on another thread', async function() {
    const pid = 100;
    const mainTid = 1;
    const workerTid = 2;
    const events: Trace.Types.Events.Event[] = [
      // Background V8 parse on a worker thread overlaps the main-thread layout.
      makeCompleteEvent('v8.parseOnBackground', 1_000, 60_000, 'v8', pid, workerTid),
      makeCompleteEvent(Trace.Types.Events.Name.RUN_TASK, 2_000, 45_000, 'toplevel', pid, mainTid),
      makeCompleteEvent(Trace.Types.Events.Name.RECALC_STYLE, 3_000, 15_000, 'blink', pid, mainTid),
      makeCompleteEvent(Trace.Types.Events.Name.LAYOUT, 19_000, 25_000, 'blink', pid, mainTid),
      makeCompleteEvent(Trace.Types.Events.Name.RUN_TASK, 70_000, 5_000, 'toplevel', pid, mainTid),
    ];
    for (const event of events) {
      Trace.Handlers.ModelHandlers.Warnings.handleEvent(event);
    }
    await Trace.Handlers.ModelHandlers.Warnings.finalize();
    const data = Trace.Handlers.ModelHandlers.Warnings.data();
    assert.lengthOf(data.perWarning.get('FORCED_REFLOW') || [], 0);
  });

  it('does not combine sub-threshold JS reflows across tasks when another thread spans them', async function() {
    const pid = 100;
    const mainTid = 1;
    const workerTid = 2;
    const events: Trace.Types.Events.Event[] = [
      makeCompleteEvent('v8.parseOnBackground', 1_000, 100_000, 'v8', pid, workerTid),
      // Task 1: 20ms forced reflow (below the 30ms threshold).
      makeCompleteEvent(Trace.Types.Events.Name.RUN_TASK, 2_000, 25_000, 'toplevel', pid, mainTid),
      makeCompleteEvent(Trace.Types.Events.Name.FUNCTION_CALL, 3_000, 22_000, 'devtools.timeline', pid, mainTid),
      makeCompleteEvent(Trace.Types.Events.Name.LAYOUT, 4_000, 20_000, 'blink', pid, mainTid),
      // Task 2: another 20ms forced reflow (also below 30ms on its own).
      makeCompleteEvent(Trace.Types.Events.Name.RUN_TASK, 30_000, 25_000, 'toplevel', pid, mainTid),
      makeCompleteEvent(Trace.Types.Events.Name.FUNCTION_CALL, 31_000, 22_000, 'devtools.timeline', pid, mainTid),
      makeCompleteEvent(Trace.Types.Events.Name.LAYOUT, 32_000, 20_000, 'blink', pid, mainTid),
      makeCompleteEvent(Trace.Types.Events.Name.RUN_TASK, 60_000, 5_000, 'toplevel', pid, mainTid),
    ];
    for (const event of events) {
      Trace.Handlers.ModelHandlers.Warnings.handleEvent(event);
    }
    await Trace.Handlers.ModelHandlers.Warnings.finalize();
    const data = Trace.Handlers.ModelHandlers.Warnings.data();
    assert.lengthOf(data.perWarning.get('FORCED_REFLOW') || [], 0);
  });

  it('isolates forced-reflow tracking across processes sharing a thread ID', async function() {
    const sharedTid = 1;
    const events: Trace.Types.Events.Event[] = [
      makeCompleteEvent(Trace.Types.Events.Name.FUNCTION_CALL, 1_000, 60_000, 'devtools.timeline', 100, sharedTid),
      makeCompleteEvent(Trace.Types.Events.Name.RUN_TASK, 2_000, 45_000, 'toplevel', 200, sharedTid),
      makeCompleteEvent(Trace.Types.Events.Name.LAYOUT, 3_000, 35_000, 'blink', 200, sharedTid),
      makeCompleteEvent(Trace.Types.Events.Name.RUN_TASK, 70_000, 5_000, 'toplevel', 200, sharedTid),
    ];
    for (const event of events) {
      Trace.Handlers.ModelHandlers.Warnings.handleEvent(event);
    }
    await Trace.Handlers.ModelHandlers.Warnings.finalize();
    const data = Trace.Handlers.ModelHandlers.Warnings.data();
    assert.lengthOf(data.perWarning.get('FORCED_REFLOW') || [], 0);
  });

  it('flushes forced reflows from the final task during finalize', async function() {
    const pid = 100;
    const mainTid = 1;
    const layout = makeCompleteEvent(Trace.Types.Events.Name.LAYOUT, 4_000, 35_000, 'blink', pid, mainTid);
    const events: Trace.Types.Events.Event[] = [
      makeCompleteEvent(Trace.Types.Events.Name.RUN_TASK, 2_000, 45_000, 'toplevel', pid, mainTid),
      makeCompleteEvent(Trace.Types.Events.Name.FUNCTION_CALL, 3_000, 40_000, 'devtools.timeline', pid, mainTid),
      layout,
    ];
    for (const event of events) {
      Trace.Handlers.ModelHandlers.Warnings.handleEvent(event);
    }
    await Trace.Handlers.ModelHandlers.Warnings.finalize();
    const data = Trace.Handlers.ModelHandlers.Warnings.data();
    assert.deepEqual(data.perWarning.get('FORCED_REFLOW'), [layout]);
  });

  it('flushes adjacent tasks starting at the exact end timestamp of the previous task', async function() {
    const pid = 100;
    const mainTid = 1;
    const events: Trace.Types.Events.Event[] = [
      // Task 1 ends at 26_000 with a 20ms forced reflow (below the 30ms threshold).
      makeCompleteEvent(Trace.Types.Events.Name.RUN_TASK, 1_000, 25_000, 'toplevel', pid, mainTid),
      makeCompleteEvent(Trace.Types.Events.Name.FUNCTION_CALL, 2_000, 22_000, 'devtools.timeline', pid, mainTid),
      makeCompleteEvent(Trace.Types.Events.Name.LAYOUT, 3_000, 20_000, 'blink', pid, mainTid),
      // Task 2 starts at exactly 26_000 with another 20ms forced reflow.
      makeCompleteEvent(Trace.Types.Events.Name.RUN_TASK, 26_000, 25_000, 'toplevel', pid, mainTid),
      makeCompleteEvent(Trace.Types.Events.Name.FUNCTION_CALL, 27_000, 22_000, 'devtools.timeline', pid, mainTid),
      makeCompleteEvent(Trace.Types.Events.Name.LAYOUT, 28_000, 20_000, 'blink', pid, mainTid),
    ];
    for (const event of events) {
      Trace.Handlers.ModelHandlers.Warnings.handleEvent(event);
    }
    await Trace.Handlers.ModelHandlers.Warnings.finalize();
    const data = Trace.Handlers.ModelHandlers.Warnings.data();
    assert.lengthOf(data.perWarning.get('FORCED_REFLOW') || [], 0);
  });

  it('ignores non-complete events when tracking forced reflow stacks', async function() {
    const pid = 100;
    const mainTid = 1;
    const events: Trace.Types.Events.Event[] = [
      // Task 1: 20ms forced reflow (sub-threshold).
      makeCompleteEvent(Trace.Types.Events.Name.RUN_TASK, 1_000, 25_000, 'toplevel', pid, mainTid),
      makeCompleteEvent(Trace.Types.Events.Name.FUNCTION_CALL, 2_000, 22_000, 'devtools.timeline', pid, mainTid),
      makeCompleteEvent(Trace.Types.Events.Name.LAYOUT, 3_000, 20_000, 'blink', pid, mainTid),
      // Out-of-order instant event ahead of Task 2 should not prevent Task 1 from flushing.
      makeInstantEvent('largestContentfulPaint::Candidate', 40_000, 'loading', pid, mainTid),
      // Task 2: another 20ms forced reflow (also sub-threshold on its own).
      makeCompleteEvent(Trace.Types.Events.Name.RUN_TASK, 30_000, 25_000, 'toplevel', pid, mainTid),
      makeCompleteEvent(Trace.Types.Events.Name.FUNCTION_CALL, 31_000, 22_000, 'devtools.timeline', pid, mainTid),
      makeCompleteEvent(Trace.Types.Events.Name.LAYOUT, 32_000, 20_000, 'blink', pid, mainTid),
      // Out-of-order V8 flow event ahead of a non-JS layout should not pin jsInvokeStack.
      makeFlowPhaseEvent(
          'v8::Debugger::AsyncTaskScheduled', 120_000, 'v8', Trace.Types.Events.Phase.FLOW_START, 1, pid, mainTid),
      makeCompleteEvent(Trace.Types.Events.Name.RUN_TASK, 60_000, 45_000, 'toplevel', pid, mainTid),
      makeCompleteEvent(Trace.Types.Events.Name.LAYOUT, 61_000, 35_000, 'blink', pid, mainTid),
    ];
    for (const event of events) {
      Trace.Handlers.ModelHandlers.Warnings.handleEvent(event);
    }
    await Trace.Handlers.ModelHandlers.Warnings.finalize();
    const data = Trace.Handlers.ModelHandlers.Warnings.data();
    assert.lengthOf(data.perWarning.get('FORCED_REFLOW') || [], 0);
  });

  it('identifies long interactions', async function() {
    // We run the entire model here as the WarningsHandler actually depends on the UserInteractionsHandler to fetch this data
    const {data} = await TraceLoader.traceEngine(this, 'one-second-interaction.json.gz');

    // These events do exist on the UserInteractionsHandler, but we also put
    // them into the WarningsHandler so that the warnings handler can be the
    // source of truth and the way to look up all warnings for a given event.
    const {interactionsOverThreshold} = data.UserInteractions;

    for (const interaction of interactionsOverThreshold) {
      const warnings = data.Warnings.perEvent.get(interaction);
      assert.deepEqual(warnings, ['LONG_INTERACTION']);
    }
  });
});
