// Copyright 2021 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as SDK from '../../../../../front_end/core/sdk/sdk.js';
import * as TimelineModel from '../../../../../front_end/models/timeline_model/timeline_model.js';
import * as Timeline from '../../../../../front_end/panels/timeline/timeline.js';
import {createTarget} from '../../helpers/EnvironmentHelpers.js';
import {describeWithMockConnection} from '../../helpers/MockConnection.js';
import {FakeStorage} from '../../helpers/TimelineHelpers.js';
// import * as Components from '../../../../../front_end/ui/legacy/components/utils/utils.js';


const {assert} = chai;

describe('TimelineUIUtils', () => {
  let tracingModel: SDK.TracingModel.TracingModel;
  let process: SDK.TracingModel.Process;
  let thread: SDK.TracingModel.Thread;
  const SCRIPT_ID = 'SCRIPT_ID';

  beforeEach(() => {
    tracingModel = new SDK.TracingModel.TracingModel(new FakeStorage());
    process = new SDK.TracingModel.Process(tracingModel, 1);
    thread = new SDK.TracingModel.Thread(process, 1);
  });

  it('creates top frame location text for function calls', async () => {
    const event = new SDK.TracingModel.ConstructedEvent(
        'devtools.timeline', 'FunctionCall', SDK.TracingModel.Phase.Complete, 10, thread);

    event.addArgs({
      data: {
        functionName: 'test',
        url: 'test.js',
        scriptId: SCRIPT_ID,
        lineNumber: 0,
        columnNumber: 0,
      },
    });
    assert.strictEqual(
        'test.js:1:1', await Timeline.TimelineUIUtils.TimelineUIUtils.buildDetailsTextForTraceEvent(event));
  });

  it('creates top frame location text as a fallback', async () => {
    // 'TimerInstall' is chosen such that we run into the 'default' case.
    const event = new SDK.TracingModel.ConstructedEvent(
        'devtools.timeline', 'TimerInstall', SDK.TracingModel.Phase.Complete, 10, thread);

    event.addArgs({
      data: {
      stackTrace: [
          {
            functionName: 'test',
            url: 'test.js',
            scriptId: SCRIPT_ID,
            lineNumber: 0,
            columnNumber: 0,
          },
        ],
      },
    });
    const data = TimelineModel.TimelineModel.TimelineData.forEvent(event);
    data.stackTrace = event.args.data.stackTrace;
    assert.strictEqual(
        'test.js:1:1', await Timeline.TimelineUIUtils.TimelineUIUtils.buildDetailsTextForTraceEvent(event));

  });
});

describeWithMockConnection('TimelineUIUtils - mock connection', () => {
let Components: typeof ComponentsModule;
  let Bindings: typeof BindingsModule;
  let Workspace: typeof WorkspaceModule;

  before(async () => {
    Components = await import('../../../../../front_end/ui/legacy/components/utils/utils.js');
    Bindings = await import('../../../../../front_end/models/bindings/bindings.js');
    Workspace = await import('../../../../../front_end/models/workspace/workspace.js');
  });

  function setUpEnvironment() {
    const target = createTarget();
    const linkifier = new Components.Linkifier.Linkifier(100, false, () => {});
    linkifier.targetAdded(target);
    const workspace = Workspace.Workspace.WorkspaceImpl.instance();
    const forceNew = true;
    const targetManager = target.targetManager();
    const resourceMapping = new Bindings.ResourceMapping.ResourceMapping(targetManager, workspace);
    const debuggerWorkspaceBinding = Bindings.DebuggerWorkspaceBinding.DebuggerWorkspaceBinding.instance({
      forceNew,
      resourceMapping,
      targetManager,
    });
    Bindings.IgnoreListManager.IgnoreListManager.instance({forceNew, debuggerWorkspaceBinding});
    return {target, linkifier};
  }

  it('shows column number location for displayNameForURL callees', async () => {
    const tracingModel = new SDK.TracingModel.TracingModel(new FakeStorage());
    const process = new SDK.TracingModel.Process(tracingModel, 1);
    const thread = new SDK.TracingModel.Thread(process, 1);

    const timelineModel = new TimelineModel.TimelineModel.TimelineModelImpl();
    // tracingModel.addEvents((preamble as unknown as SDK.TracingManager.EventPayload[]).concat(events));


    const event =
        new SDK.TracingModel.Event('devtools.timeline', 'TimerInstall', SDK.TracingModel.Phase.Complete, 10, thread);

    event.addArgs({
      data: {
      stackTrace: [
          {
            functionName: 'test',
            url: 'test.js',
            scriptId: 'SCRIPT_ID',
            lineNumber: 0,
            columnNumber: 0,
          },
        ],
      },
    });
    const data = TimelineModel.TimelineModel.TimelineData.forEvent(event);
    data.stackTrace = event.args.data.stackTrace;


  //  const target = createTarget();
  // const linkifier = new Components.Linkifier.Linkifier(100, false, () => {});

    const eventpayload = {"args":{"data":{"frame":"8EEAB888EB856FBD78002731DBE4D448","singleShot":true,"stackTrace":[{"columnNumber":322,"functionName":"H","lineNumber":50,"scriptId":"16","url":"https://www.googletagmanager.com/gtag/js?id=G-PGXNGYWP8E"}],"timeout":0,"timerId":1}},"cat":"devtools.timeline","name":"TimerInstall","ph":"I","pid":14904,"s":"t","tid":259,"ts":445481332340,"tts":320419};

    tracingModel.addEvents([eventpayload]);
    tracingModel.tracingComplete();
    timelineModel.setEvents(tracingModel);
    timelineModel.isGenericTraceInternal = false;

    const  {target, linkifier} = setUpEnvironment();
    console.log({linkifier});
    const html = await Timeline.TimelineUIUtils.TimelineUIUtils.buildTraceEventDetails(event, timelineModel, linkifier, true);
    console.log(html);
  });

//   it('shows column number location for displayNameForURL callees', async () => {
//     const event = new SDK.TracingModel.Event('devtools.timeline', 'TimerInstall', SDK.TracingModel.Phase.Complete, 10, thread);


// // buildDetailsNodeForTraceEvent

//     const x = {
//       args: {
//         data: {
//           frame: '8EEAB888EB856FBD78002731DBE4D448',
//           singleShot: true,
//           stackTrace: [
//             {
//               columnNumber: 322,
//               functionName: 'H',
//               lineNumber: 50,
//               scriptId: '16',
//               url: 'https://www.googletagmanager.com/gtag/js?id=G-PGXNGYWP8E',
//             },
//           ],
//           timeout: 0,
//           timerId: 1,
//         },
//       },
//       cat: 'devtools.timeline',
//       name: 'TimerInstall',
//       ph: 'I',
//       pid: 14904,
//       s: 't',
//       tid: 259,
//       ts: 445481332340,
//       tts: 320419,
//     };
//   });

});
