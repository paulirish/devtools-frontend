// Copyright 2022 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

const {assert} = chai;
import * as Root from '../../../../../../front_end/core/root/root.js';
import {describeWithEnvironment} from '../../../helpers/EnvironmentHelpers.js';
import * as TraceModel from '../../../../../../front_end/models/trace/trace.js';
import {TraceLoader} from '../../../helpers/TraceLoader.js';

describeWithEnvironment('GPUHandler', function() {
  it('finds all the GPU Tasks for the main GPU Thread', async function() {
    TraceModel.Handlers.ModelHandlers.Meta.initialize();
    TraceModel.Handlers.ModelHandlers.GPU.initialize();
    const events = await TraceLoader.rawEvents(this, 'one-second-interaction.json.gz');

    for (const event of events) {
      TraceModel.Handlers.ModelHandlers.Meta.handleEvent(event);
      TraceModel.Handlers.ModelHandlers.GPU.handleEvent(event);
    }
    await TraceModel.Handlers.ModelHandlers.Meta.finalize();
    await TraceModel.Handlers.ModelHandlers.GPU.finalize();

    const gpuEvents = TraceModel.Handlers.ModelHandlers.GPU.data().mainGPUThreadTasks;
    assert.lengthOf(gpuEvents, 33);
  });

  it('finds all the GPU Tasks, with timelineShowAllEvents enabled', async function() {
    // Need to set the experiment before initializing.
    Root.Runtime.experiments.enableForTest('timelineShowAllEvents');
    TraceModel.Handlers.ModelHandlers.Meta.initialize();
    TraceModel.Handlers.ModelHandlers.GPU.initialize();
    const events = await TraceLoader.rawEvents(this, 'one-second-interaction.json.gz');

    for (const event of events) {
      TraceModel.Handlers.ModelHandlers.Meta.handleEvent(event);
      TraceModel.Handlers.ModelHandlers.GPU.handleEvent(event);
    }
    await TraceModel.Handlers.ModelHandlers.Meta.finalize();
    await TraceModel.Handlers.ModelHandlers.GPU.finalize();

    const gpuEvents = TraceModel.Handlers.ModelHandlers.GPU.data().mainGPUThreadTasks;
    assert.lengthOf(gpuEvents, 167);
    Root.Runtime.experiments.disableForTest('timelineShowAllEvents');
  });
});
