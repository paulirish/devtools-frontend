// Copyright 2022 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

const {assert} = chai;
import * as TraceModel from '../../../../../../front_end/models/trace/trace.js';
import {defaultTraceEvent} from '../../../helpers/TraceHelpers.js';
import {TraceLoader} from '../../../helpers/TraceLoader.js';

describe('UberFramesHandler', function() {
  const baseEvent = {
    ...defaultTraceEvent,
    name: 'UberFrames',
    // Ensure that the UberFramess are held against the pid & tid values
    // that match the Browser process and CrBrowserMain in defaultTraceEvents.
    pid: TraceModel.Types.TraceEvents.ProcessID(8017),
    tid: TraceModel.Types.TraceEvents.ThreadID(775),
    ts: TraceModel.Types.Timing.MicroSeconds(0),
    args: {},
    cat: 'test',
    ph: TraceModel.Types.TraceEvents.Phase.OBJECT_SNAPSHOT,
  };

  let baseEvents: readonly TraceModel.Types.TraceEvents.TraceEventData[];

  beforeEach(async () => {
    const defaultTraceEvents = await TraceLoader.rawEvents(this, 'basic.json.gz');

    baseEvents = [
      ...defaultTraceEvents,
      {...baseEvent, ts: TraceModel.Types.Timing.MicroSeconds(100)},
      {...baseEvent, ts: TraceModel.Types.Timing.MicroSeconds(200)},
    ];

    // The UberFrames handler requires the meta handler because it needs
    // to know the browser process and thread IDs. Here, then, we reset
    // and later we will pass events to the meta handler, otherwise the
    // UberFramess handler will fail.
    TraceModel.Handlers.ModelHandlers.Meta.reset();
    TraceModel.Handlers.ModelHandlers.Meta.initialize();

    TraceModel.Handlers.ModelHandlers.UberFramess.reset();
  });

  describe('frames', () => {
    it('obtains them if present', async () => {
      for (const event of baseEvents) {
        TraceModel.Handlers.ModelHandlers.Meta.handleEvent(event);
        TraceModel.Handlers.ModelHandlers.UberFramess.handleEvent(event);
      }

      await TraceModel.Handlers.ModelHandlers.Meta.finalize();
      await TraceModel.Handlers.ModelHandlers.UberFramess.finalize();

      const data = TraceModel.Handlers.ModelHandlers.UberFramess.data();
      assert.strictEqual(data.length, 2);
    });
  });
});



describe('GPUHandler', function() {
  beforeEach(() => {
    TraceModel.Handlers.ModelHandlers.Meta.initialize();
    TraceModel.Handlers.ModelHandlers.GPU.initialize();
  });

  it('finds all the GPU Tasks for the main GPU Thread', async function() {
    const events = await TraceLoader.rawEvents(this, 'threejs-gpu.json.gz');

    for (const event of events) {
      TraceModel.Handlers.ModelHandlers.Meta.handleEvent(event);
      TraceModel.Handlers.ModelHandlers.GPU.handleEvent(event);
    }
    await TraceModel.Handlers.ModelHandlers.Meta.finalize();
    await TraceModel.Handlers.ModelHandlers.GPU.finalize();

    const gpuEvents = TraceModel.Handlers.ModelHandlers.GPU.data().mainGPUThreadTasks;
    assert.lengthOf(gpuEvents, 201);
  });
});

