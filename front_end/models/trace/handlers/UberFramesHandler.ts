// Copyright 2022 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as Platform from '../../../core/platform/platform.js';
import * as Helpers from '../helpers/helpers.js';
import * as Types from '../types/types.js';

import {data as metaHandlerData} from './MetaHandler.js';
import {type HandlerName} from './types.js';

// Each thread contains events. Events indicate the thread and process IDs, which are
// used to store the event in the correct process thread entry below.
const eventsInProcessThread = new Map<Types.Events.ProcessID, Map<Types.Events.ThreadID, Types.Events.Snapshot[]>>();

// these types are wrong
let relevantEvts: Types.Events.Event[] = [];
const gpuEvents: Types.Events.Event[] = [];
const asyncEvts: Types.Events.Event[] = [];
let syntheticEvents: Types.Events.SyntheticPipelineReporterPair[] = [];
const waterFallEvents: Types.Events.Event[] = [];
let eventLatencyIdToFrameSeq: Record<string, string> = {};
// export interface UberFramesData {
//   relevantEvts: readonly Types.Events.Event[],
//   syntheticEvents: readonly Types.Events.SyntheticNestableAsync[];
// }

export type UberFramesData = {
  nonWaterfallEvts: readonly Types.Events.Event[],
  waterFallEvts: readonly Types.Events.Event[],
  eventLatencyIdToFrameSeq: Record<string, string>,
};

export function reset(): void {
  eventsInProcessThread.clear();
  relevantEvts.length = 0;
  gpuEvents.length = 0;
  syntheticEvents.length = 0;
  asyncEvts.length = 0;
  waterFallEvents.length = 0;
  eventLatencyIdToFrameSeq = {};
}


const someStuff = {
  CompositeLayers: 'CompositeLayers',
  RasterTask: 'RasterTask',
  ImageDecodeTask: 'ImageDecodeTask',

  ImageUploadTask: 'ImageUploadTask',
  DecodeImage: 'Decode Image',
  ResizeImage: 'Resize Image',
  DrawLazyPixelRef: 'Draw LazyPixelRef',
  DecodeLazyPixelRef: 'Decode LazyPixelRef',

  BeginFrame: 'BeginFrame',
  RequestMainThreadFrame: 'RequestMainThreadFrame',
  NeedsBeginFrameChanged: 'NeedsBeginFrameChanged',
  BeginMainThreadFrame: 'BeginMainThreadFrame',
  ActivateLayerTree: 'ActivateLayerTree',
  DrawFrame: 'DrawFrame',
  DroppedFrame: 'DroppedFrame',
};
const someRelevantTraceEventTypes = [

  ...Object.values(someStuff),

  // timeline frame model
  'ActivateLayerTree',
  'BeginFrame',
  'BeginMainThreadFrame,',
  'CompositeLayers',
  'Commit',
  'DrawFrame',
  'DroppedFrame',
  'InvalidateLayout,',
  'LayerTreeHostImplSnapshot',
  'NeedsBeginFrameChanged',
  'Paint',
  'RequestMainThreadFrame',
  'ScheduleStyleRecalculation,',
  'ScrollLayer,',
  'SetLayerTreeId',

  'AnimationFrame',
  'AnimationFrame::Presentation',
  'AnimationFrame::FirstUIEvent',
  'AnimationFrame::Script::Compile',
  'AnimationFrame::Script::Execute',
  'AnimationFrame::Render',
  'AnimationFrame::StyleAndLayout',


  'MainFrame.NotifyReadyToCommitOnImpl',
  'MainFrame.CommitComplete',
  'RasterizerTaskImpl::RunOnWorkerThread',
  'LayerTreeHostImpl::FinishCommit',
  'TileManager::FlushAndIssueSignals',
  'ProxyImpl::ScheduledActionDraw',

  // LONG ones and ones i typically comment out
  'PipelineReporter',
  'SendBeginMainFrameToCommit',
  'BeginImplFrameToSendBeginMainFrame',                  // happens too much on dropped frames
  'SubmitCompositorFrameToPresentationCompositorFrame',  // parent phase in eventlatency
  // 'Graphics.Pipeline',

  'RasterDecoderImpl::DoEndRasterCHROMIUM',
  'Frame',

  // these are all pipeline reporter subitems. HOEVER they are also included in the eventlatency children too.
  'Activation',
  'BeginImplFrameToSendBeginMainFrame',
  'Commit',
  'EndActivateToSubmitCompositorFrame',
  'EndCommitToActivation',
  'ReceiveCompositorFrameToStartDraw',
  'SendBeginMainFrameToCommit',
  'StartDrawToSwapStart',
  'SubmitCompositorFrameToPresentationCompositorFrame',
  'SubmitToReceiveCompositorFrame',
  'Swap',

  'BeginFrame',
  'DroppedFrame',
  'RequestMainFrame',
  'BeginMainThreadFrame',
  'CompositeLayer',
  'Commit',
  'ActivateLayerTree',
  'DrawFrame',

  'EndCommitToActivation',
  'Swap',
  'SwapBuffers',  // the gpu one
  'Scheduler::BeginFrame',
  'DisplayScheduler::BeginFrame',
  'Scheduler::BeginImplFrame',

  'EventLatency',  // mocny said these are complicated. but.. they're also great.
  // https://docs.google.com/spreadsheets/d/1F6BPrtIMgDD4eKH-VxEqzZy8dOeh3U2EZaYjVlIv-Hk/edit?resourcekey=0-UtBlkaCsd0Oi1Z3bQqHqow#gid=557410449
  // TODO.. some of these are emitted separately on different trace categories.. so there's duplicates. ugh
  'GenerationToBrowserMain',
  'BrowserMainToRendererCompositor',
  'RendererCompositorQueueingDelay',
  'RendererCompositorProcessing',
  'RendererCompositorFinishedToEndActivate',
  'RendererCompositorFinishedToSendBeginMainFrame',
  'RendererCompositorFinishedToBeginImplFrame',
  'BeginImplFrameToSendBeginMainFrame',
  'RendererCompositorFinishedToCommit',
  'RendererCompositorFinishedToEndCommit',
  'RendererCompositorFinishedToActivation',
  'RendererCompositorFinishedToSubmitCompositorFrame',
  'RendererCompositorToMain',
  'RendererMainProcessing',
  'RendererMainFinishedToBeginImplFrame',
  'RendererMainFinishedToSendBeginMainFrame',
  'RendererMainFinishedToCommit',
  'RendererMainFinishedToEndCommit',
  'RendererMainFinishedToActivation',
  'RendererMainFinishedToEndActivate',
  'RendererMainFinishedToSubmitCompositorFrame',
  'SendBeginMainFrameToCommit',
  'Commit',
  'EndCommitToActivation',
  'Activation',
  'EndActivateToSubmitCompositorFrame',
  'SubmitCompositorFrameToPresentationCompositorFrame',
  'SubmitCompositorFrameToPresentationCompositorFrame sub-stages:',
  'SubmitToReceiveCompositorFrame',
  'ReceiveCompositorFrameToStartDraw',
  'StartDrawToSwapStart',
  'Swap',
  'SwapStartToBufferAvailable',
  'BufferAvailableToBufferReady',
  'BufferReadyToLatch',
  'LatchToSwapEnd',
  'SwapEndToPresentationCompositorFrame',

  'Screenshot',

  //
  'EventTiming',

  // my loaf branch
  'LongAnimationFrame-pi',
  'LongAnimationFrame-pi2',
  'LongAnimationFrame-no2',
  // 'LongAnimationFrame-no',
  // 'LongAnimationFrame-nopi',
  'LongAnimationFrame',
  'LoAF-renderStart',
  'LoAF-desiredRenderStart',
  'LoAF-styleAndLayoutStart',

  'ScreenshotMeta',
];

export const eventLatencyBreakdownTypeNames = [
  'GenerationToBrowserMain',
  'BrowserMainToRendererCompositor',
  'RendererCompositorQueueingDelay',
  'RendererCompositorProcessing',
  'RendererCompositorFinishedToEndActivate',
  'RendererCompositorFinishedToSendBeginMainFrame',
  'RendererCompositorFinishedToBeginImplFrame',
  'BeginImplFrameToSendBeginMainFrame',
  'RendererCompositorFinishedToCommit',
  'RendererCompositorFinishedToEndCommit',
  'RendererCompositorFinishedToActivation',
  'RendererCompositorFinishedToSubmitCompositorFrame',

  'RendererCompositorToMain',
  'RendererMainProcessing',
  'RendererMainFinishedToBeginImplFrame',
  'RendererMainFinishedToSendBeginMainFrame',
  'RendererMainFinishedToCommit',
  'RendererMainFinishedToEndCommit',
  'RendererMainFinishedToActivation',
  'RendererMainFinishedToEndActivate',
  'RendererMainFinishedToSubmitCompositorFrame',

  'SendBeginMainFrameToCommit',
  'Commit',
  'EndCommitToActivation',
  'Activation',
  'EndActivateToSubmitCompositorFrame',



  // 'SubmitCompositorFrameToPresentationCompositorFrame', // parent phase that can overlap
  'SubmitToReceiveCompositorFrame',
  'ReceiveCompositorFrameToStartDraw',
  'StartDrawToSwapStart',
  'Swap',
  'SwapStartToBufferAvailable',
  'BufferAvailableToBufferReady',
  'BufferReadyToLatch',
  'LatchToSwapEnd',
  'SwapEndToPresentationCompositorFrame',
];

export const waterfallTypes = new Map([
  ['EventLatency', 4],
  ['SendBeginMainFrameToCommit', 3],
  ['EndCommitToActivation', 2],
  ['Activation', 2],
  ['EndActivateToSubmitCompositorFrame', 2],
  ['SubmitCompositorFrameToPresentationCompositorFrame', 2],
]);

export function handleEvent(event: Types.Events.Event): void {
  if (Types.Events.isGPUTask(event)) {
    gpuEvents.push(event);
    Helpers.Trace.addEventToProcessThread(event, eventsInProcessThread);
  } else if (someRelevantTraceEventTypes.some(name => event.name === name)) {
    if (event.ph === 'b' || event.ph === 'e') {
      asyncEvts.push(event);
    } else {
      if (eventLatencyBreakdownTypeNames.includes(event.name)) {
        // we have two diff events named Commit, we'll exclude the normal mainthread one.
        if (event.name === 'Commit' && !event.cat.includes('cc')) {
        } else {
          waterFallEvents.push(event);
        }
      }
      relevantEvts.push(event);
    }
    Helpers.Trace.addEventToProcessThread(event, eventsInProcessThread);
  }
}

export async function finalize(): Promise<void> {
  const {browserProcessId, browserThreadId} = metaHandlerData();
  const browserThreads = eventsInProcessThread.get(browserProcessId);
  // if (browserThreads) {
  //   relevantEvts = browserThreads.get(browserThreadId) || [];
  // }

  // TODO: somehow exclude PipelineReporter events that are perfectly nested. (end ts's are often identical in these cases.)

  const {gpuProcessId, gpuThreadId, topLevelRendererIds} = metaHandlerData();
  // This cuts down GPU Task count .. 33% of what ift was.
  const ourRendererGPUTasks = gpuEvents.filter(e => topLevelRendererIds.has(e.args.data.renderer_pid));
  relevantEvts = [...relevantEvts, ...ourRendererGPUTasks];


  const syntheticPairs = Helpers.Trace.createMatchedSortedSyntheticEvents(asyncEvts);
  console.log({syntheticPairs});


  for (const event of syntheticPairs) {
    if (event.name === 'EventLatency') {
      eventLatencyIdToFrameSeq[event.args.data.beginEvent.id2.local] =
          event.args.data.beginEvent.args.event_latency.frame_sequence ?? null;
    }
    if (event.name === 'PipelineReporter') {
      eventLatencyIdToFrameSeq[event.args.data.beginEvent.id2.local] =
          event.args.data.beginEvent.args.chrome_frame_reporter.frame_sequence ?? null;
    }


    if (eventLatencyBreakdownTypeNames.includes(event.name)) {
      waterFallEvents.push(event);
    }
    syntheticEvents.push(event);
  }

  // drop pipelinereporter that werent presented. or browser process.
  // TODO: do this earlier? iunno
  // EDIT: disabled filtering since ubeframes is a mess anyway.
  syntheticEvents = syntheticEvents.filter(e => {
    return true;
    if (e.name !== 'PipelineReporter') {
      return true;
    }
    return topLevelRendererIds.has(e.pid) &&
        e.args.data.beginEvent.args.chrome_frame_reporter.frame_type !== 'FORKED' &&
        e.args.data.beginEvent.args.chrome_frame_reporter.state === 'STATE_PRESENTED_ALL';
  });
}

// TODO: is it okay to do work here? this is only called once? (or should i put the _work_ in finalize)
// so far looks like its only called once, so whatev.
export function data(): UberFramesData {
  const nonWaterfallEvts = [...relevantEvts, ...syntheticEvents].filter(e => !waterFallEvents.includes(e));

  return {
    nonWaterfallEvts: nonWaterfallEvts.sort((event1, event2) => event1.ts - event2.ts),
    waterFallEvts: [...waterFallEvents].sort((event1, event2) => event1.ts - event2.ts),
    eventLatencyIdToFrameSeq,
  };
}

export function deps(): HandlerName[] {
  return ['Meta'];
}
