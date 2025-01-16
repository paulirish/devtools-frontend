// Copyright 2022 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

const {assert} = chai;
import * as Trace from '../../../../../../front_end/models/trace/trace.js';
import {defaultTraceEvent} from '../../../helpers/TraceHelpers.js';
import {TraceLoader} from '../../../helpers/TraceLoader.js';

describe('UberFramesHandler', function() {
  const baseEvent = {
    ...defaultTraceEvent,
    name: 'UberFrames',
    // Ensure that the UberFramess are held against the pid & tid values
    // that match the Browser process and CrBrowserMain in defaultTraceEvents.
    pid: Trace.Types.Events.ProcessID(8017),
    tid: Trace.Types.Events.ThreadID(775),
    ts: Trace.Types.Timing.MicroSeconds(0),
    args: {},
    cat: 'test',
    ph: Trace.Types.Events.Phase.OBJECT_SNAPSHOT,
  };

  let baseEvents: readonly Trace.Types.Events.Event[];

  beforeEach(async function() {
    const defaultTraceEvents = await TraceLoader.rawEvents(this, 'basic.json.gz');

    baseEvents = [
      ...defaultTraceEvents,
      {...baseEvent, ts: Trace.Types.Timing.MicroSeconds(100)},
      {...baseEvent, ts: Trace.Types.Timing.MicroSeconds(200)},
    ];

    // The UberFrames handler requires the meta handler because it needs
    // to know the browser process and thread IDs. Here, then, we reset
    // and later we will pass events to the meta handler, otherwise the
    // UberFramess handler will fail.
    Trace.Handlers.ModelHandlers.Meta.reset();
    Trace.Handlers.ModelHandlers.Meta.initialize();

    Trace.Handlers.ModelHandlers.UberFramess.reset();
  });

  describe('frames', () => {
    it('obtains them if present', async () => {
      for (const event of baseEvents) {
        Trace.Handlers.ModelHandlers.Meta.handleEvent(event);
        Trace.Handlers.ModelHandlers.UberFramess.handleEvent(event);
      }

      await Trace.Handlers.ModelHandlers.Meta.finalize();
      await Trace.Handlers.ModelHandlers.UberFramess.finalize();

      const data = Trace.Handlers.ModelHandlers.UberFramess.data();
      assert.strictEqual(data.length, 2);
    });
  });
});

describe('GPUHandler', function() {
  beforeEach(() => {
    Trace.Handlers.ModelHandlers.Meta.initialize();
    Trace.Handlers.ModelHandlers.GPU.initialize();
  });

  it('finds all the GPU Tasks for the main GPU Thread', async function() {
    const events = await TraceLoader.rawEvents(this, 'threejs-gpu.json.gz');

    for (const event of events) {
      Trace.Handlers.ModelHandlers.Meta.handleEvent(event);
      Trace.Handlers.ModelHandlers.GPU.handleEvent(event);
    }
    await Trace.Handlers.ModelHandlers.Meta.finalize();
    await Trace.Handlers.ModelHandlers.GPU.finalize();

    const gpuEvents = Trace.Handlers.ModelHandlers.GPU.data().mainGPUThreadTasks;
    assert.lengthOf(gpuEvents, 201);
  });
});
