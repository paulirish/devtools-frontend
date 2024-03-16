// Copyright 2022 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

const {assert} = chai;

import * as Platform from '../../core/platform/platform.js';
import type * as Protocol from '../../generated/protocol.js';
import * as TimelineModel from '../timeline_model/timeline_model.js';
import * as TraceEngine from '../trace/trace.js';
import {describeWithEnvironment} from '../../testing/EnvironmentHelpers.js';
import {
  DevToolsTimelineCategory,
  makeFakeSDKEventFromPayload,
  StubbedThread,
} from '../../testing/TraceHelpers.js';
import {TraceLoader} from '../../testing/TraceLoader.js';

// Various events listing processes and threads used by all the tests.
const preamble = [
  {
    'args': {'name': 'CrBrowserMain'},
    'cat': '__metadata',
    'name': 'thread_name',
    'ph': 'M',
    'pid': 1537480,
    'tid': 1537480,
    'ts': 0,
  },
  {
    'args': {'name': 'CrRendererMain'},
    'cat': '__metadata',
    'name': 'thread_name',
    'ph': 'M',
    'pid': 1537729,
    'tid': 1,
    'ts': 0,
  },
  {
    'args': {'name': 'AuctionV8HelperThread'},
    'cat': '__metadata',
    'name': 'thread_name',
    'ph': 'M',
    'pid': 1538739,
    'tid': 7,
    'ts': 0,
  },
  {
    'args': {'name': 'AuctionV8HelperThread'},
    'cat': '__metadata',
    'name': 'thread_name',
    'ph': 'M',
    'pid': 1538738,
    'tid': 7,
    'ts': 0,
  },
  // A child thread in the worklet process which has some events, it's supposed to
  // be skipped.
  {
    'args': {'name': 'Chrome_ChildIOThread'},
    'cat': '__metadata',
    'name': 'thread_name',
    'ph': 'M',
    'pid': 1538738,
    'tid': 4,
    'ts': 0,
  },
  {
    'args': {},
    'cat': 'disabled-by-default-devtools.timeline',
    'dur': 94,
    'name': 'RunTask',
    'ph': 'X',
    'pid': 1538738,
    'tdur': 93,
    'tid': 4,
    'ts': 962632609083,
    'tts': 3006,
  },
  {
    'args': {'name': 'Renderer'},
    'cat': '__metadata',
    'name': 'process_name',
    'ph': 'M',
    'pid': 1537729,
    'tid': 0,
    'ts': 0,
  },
  {
    'args': {'name': 'Browser'},
    'cat': '__metadata',
    'name': 'process_name',
    'ph': 'M',
    'pid': 1537480,
    'tid': 0,
    'ts': 0,
  },
  {
    'args': {'name': 'Service: auction_worklet.mojom.AuctionWorkletService'},
    'cat': '__metadata',
    'name': 'process_name',
    'ph': 'M',
    'pid': 1538739,
    'tid': 0,
    'ts': 0,
  },
  {
    'args': {'name': 'Service: auction_worklet.mojom.AuctionWorkletService'},
    'cat': '__metadata',
    'name': 'process_name',
    'ph': 'M',
    'pid': 1538738,
    'tid': 0,
    'ts': 0,
  },
  {
    'args': {
      'data': {
        'frameTreeNodeId': 7,
        'frames': [{
          'frame': '76213A7F71B7ACD4C6551AC68B888978',
          'name': '',
          'processId': 1537729,
          'url': 'https://192.168.0.105/run.html',
        }],
        'persistentIds': true,
      },
    },
    'cat': 'disabled-by-default-devtools.timeline',
    'name': 'TracingStartedInBrowser',
    'ph': 'I',
    'pid': 1537480,
    's': 't',
    'tid': 1537480,
    'ts': 962632191080,
    'tts': 23601918,
  },
  {
    'args': {
      'data': {
        'frame': '76213A7F71B7ACD4C6551AC68B888978',
        'name': '',
        'processId': 1537729,
        'url': 'https://192.168.0.105/run.html',
      },
    },
    'cat': 'disabled-by-default-devtools.timeline',
    'name': 'FrameCommittedInBrowser',
    'ph': 'I',
    'pid': 1537480,
    's': 't',
    'tid': 1537480,
    'ts': 962632244598,
    'tts': 23622650,
  },
];

class TrackSummary {
  name: string = '';
  type: TimelineModel.TimelineModel.TrackType = TimelineModel.TimelineModel.TrackType.Other;
  forMainFrame: boolean = false;
  url: Platform.DevToolsPath.UrlString = Platform.DevToolsPath.EmptyUrlString;
  threadName: string = '';
  threadId: number = -1;
  processId: number = -1;
  processName: string = '';
}

function summarize(track: TimelineModel.TimelineModel.Track): TrackSummary {
  return {
    name: track.name,
    type: track.type,
    forMainFrame: track.forMainFrame,
    url: track.url,
    threadName: track.thread ? track.thread.name() : '(no thread)',
    threadId: track.thread ? track.thread.id() : -1,
    processId: track.thread ? track.thread.process().id() : -1,
    processName: track.thread ? track.thread.process().name() : '(no thread)',
  };
}

function summarizeArray(tracks: TimelineModel.TimelineModel.Track[]): TrackSummary[] {
  return tracks.map(summarize);
}



describeWithEnvironment('TimelineData', function() {
  // function getAllTracingModelPayloadEvents(tracingModel: TraceEngine.Legacy.TracingModel):
  //     TraceEngine.Legacy.PayloadEvent[] {
  //   const allSDKEvents = tracingModel.sortedProcesses().flatMap(process => {
  //     return process.sortedThreads().flatMap(thread => thread.events().filter(TraceEngine.Legacy.eventHasPayload));
  //   });
  //   allSDKEvents.sort((eventA, eventB) => {
  //     if (eventA.startTime > eventB.startTime) {
  //       return 1;
  //     }
  //     if (eventB.startTime > eventA.startTime) {
  //       return -1;
  //     }
  //     return 0;
  //   });
  //   return allSDKEvents;
  // }

  it.only('stores data for an SDK.TracingModel.PayloadEvent using the raw payload as the key', async function() {
    const data = await TraceLoader.allModels(this, 'web-dev.json.gz');
    // const allSDKEvents = getAllTracingModelPayloadEvents(data.tracingModel);
    // The exact event we use is not important, so let's use t he firs t LCP event.
    // const lcpSDKEvent =
    //     allSDKEvents.find(event => event.name === TimelineModel.TimelineModel.RecordType.MarkLCPCandidate);
    // if (!lcpSDKEvent) {
    //   throw new Error('Could not find SDK Event.');
    // }
    // const dataForEvent = TimelineModel.TimelineModel.EventOnTimelineData.forEvent(lcpSDKEvent);
    // dataForEvent.backendNodeIds.push(123 as Protocol.DOM.BackendNodeId);

    // // Now find the same event from the new engine
    // const lcpNewEngineEvent = data.traceParsedData.PageLoadMetrics.allMarkerEvents.find(event => {
    //   return TraceEngine.Types.TraceEvents.isTraceEventLargestContentfulPaintCandidate(event);
    // });
    // if (!lcpNewEngineEvent) {
    //   throw new Error('Could not find LCP New engine event.');
    // }
    // // Make sure we got the matching events.
    // assert.strictEqual(lcpNewEngineEvent, lcpSDKEvent.rawPayload());

    // assert.strictEqual(
    //     TimelineModel.TimelineModel.EventOnTimelineData.forEvent(lcpSDKEvent).backendNodeIds,
    //     TimelineModel.TimelineModel.EventOnTimelineData.forEvent(lcpNewEngineEvent).backendNodeIds,
    // );
  });

  // it('stores data for a constructed event using the event as the key', async function() {
  //   const thread = StubbedThread.make(1);
  //   // None of the details here matter, we just need some constructed event.
  //   const fakeConstructedEvent = new TraceEngine.Legacy.ConstructedEvent(
  //       'blink.user_timing',
  //       'some-test-event',
  //       TraceEngine.Types.TraceEvents.Phase.INSTANT,
  //       100,
  //       thread,
  //   );
  //   const dataForEvent = TimelineModel.TimelineModel.EventOnTimelineData.forEvent(fakeConstructedEvent);
  //   dataForEvent.backendNodeIds.push(123 as Protocol.DOM.BackendNodeId);
  //   assert.strictEqual(dataForEvent, TimelineModel.TimelineModel.EventOnTimelineData.forEvent(fakeConstructedEvent));
  // });

  // it('extracts backend node ids and image url for a Decode Image event', async function() {
  //   const data = await TraceLoader.allModels(this, 'web-dev.json.gz');
  //   const allSDKEvents = getAllTracingModelPayloadEvents(data.tracingModel);

  //   const decodeImageEvent =
  //       allSDKEvents.find(event => event.name === TraceEngine.Types.TraceEvents.KnownEventName.DecodeImage);
  //   if (!decodeImageEvent) {
  //     throw new Error('Could not find Decode Image event Event.');
  //   }
  //   const dataForEvent = TimelineModel.TimelineModel.EventOnTimelineData.forEvent(decodeImageEvent);
  //   assert.strictEqual(dataForEvent.backendNodeIds[0], 240);
  //   assert.isTrue(dataForEvent.url?.includes('.jpg'));
  // });
});
