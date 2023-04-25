// Copyright 2022 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as SDK from '../../../../front_end/core/sdk/sdk.js';
import * as TraceModel from '../../../../front_end/models/trace/trace.js';
import type * as TimelineModel from '../../../../front_end/models/timeline_model/timeline_model.js';
import * as Timeline from '../../../../front_end/panels/timeline/timeline.js';
import * as PerfUI from '../../../../front_end/ui/legacy/components/perf_ui/perf_ui.js';
import {initializeGlobalVars} from './EnvironmentHelpers.js';

import {FakeStorage} from './TimelineHelpers.js';
interface CompressionStream extends ReadableWritablePair<Uint8Array, Uint8Array> {}
interface DecompressionStream extends ReadableWritablePair<Uint8Array, Uint8Array> {}
declare const CompressionStream: {
  prototype: CompressionStream,
  new (type: string): CompressionStream,
};

declare const DecompressionStream: {
  prototype: DecompressionStream,
  new (type: string): DecompressionStream,
};

function codec(buffer: ArrayBuffer, codecStream: CompressionStream|DecompressionStream): Promise<ArrayBuffer> {
  const {readable, writable} = new TransformStream();
  const codecReadable = readable.pipeThrough(codecStream);

  const writer = writable.getWriter();
  void writer.write(buffer);
  void writer.close();

  // Wrap in a response for convenience.
  const response = new Response(codecReadable);
  return response.arrayBuffer();
}

function decodeGzipBuffer(buffer: ArrayBuffer): Promise<ArrayBuffer> {
  return codec(buffer, new DecompressionStream('gzip'));
}

export async function loadTraceEventsLegacyEventPayload(name: string):
    Promise<readonly SDK.TracingManager.EventPayload[]> {
  const events = await loadEventsFromTraceFile(name);
  // Convince TypeScript that these are really EventPayload events, so they can
  // be used when testing OPP code that expects EventPayload events.
  return events as unknown as Array<SDK.TracingManager.EventPayload>;
}

// The contents of the trace files do not get modified at all, so in tests we
// are safe to cache their contents once we've loaded them once.
const traceFileCache = new Map<string, TraceModel.TraceModel.TraceFileContents>();


// Adapted from https://github.com/kevva/is-gzip/blob/master/index.js
const isGzip = (buf: ArrayBuffer) => {
  const view = new Uint8Array(buf);
  if (!view || view.length < 3) {
    return false;
  }
  return view[0] === 0x1F && view[1] === 0x8B && view[2] === 0x08;
};

export async function loadTraceFileFromURL(url: URL): Promise<TraceModel.TraceModel.TraceFileContents> {
  const cachedFile = traceFileCache.get(url.toString());
  if (cachedFile) {
    return cachedFile;
  }
  const response = await fetch(url);
  if (response.status !== 200) {
    throw new Error(`Unable to load ${url}`);
  }

  let buffer = await response.arrayBuffer();
  const isGzipEncoded = isGzip(buffer);
  if (isGzipEncoded) {
    buffer = await decodeGzipBuffer(buffer);
  }
  const decoder = new TextDecoder('utf-8');
  const contents = JSON.parse(decoder.decode(buffer)) as TraceModel.TraceModel.TraceFileContents;
  // traceFileCache.set(url.toString(), contents);
  return contents;
}
export async function loadTraceFileFromFixtures(name: string): Promise<TraceModel.TraceModel.TraceFileContents> {

  if (name.startsWith('http://')) {
    return await loadTraceFileFromURL(new URL(name));
  }

  const urlForTest = new URL(`/fixtures/traces/${name}`, window.location.origin);
  const urlForComponentExample = new URL(`/test/unittests/fixtures/traces/${name}`, window.location.origin);
  try {
    // Attempt to fetch file from unit test server.
    return await loadTraceFileFromURL(urlForTest);
  } catch (e) {
    // If file wasn't found on test server, attempt a fetch from
    // component server.
    return await loadTraceFileFromURL(urlForComponentExample);
  }
}

export async function loadEventsFromTraceFile(name: string):
    Promise<readonly TraceModel.Types.TraceEvents.TraceEventData[]> {
  const trace = await loadTraceFileFromFixtures(name);
  if ('traceEvents' in trace) {
    return trace.traceEvents;
  }
  return trace;
}

interface ModelDataResult {
  metadata: TraceModel.TraceModel.TraceFileMetaData;
  traceParsedData: TraceModel.Handlers.Types.TraceParseData;
}
const modelDataCache = new Map<string, ModelDataResult>();
async function generateModelDataForTraceFile(name: string, emulateFreshRecording = false): Promise<ModelDataResult> {
  const cachedData = modelDataCache.get(name);
  if (cachedData) {
    return cachedData;
  }
  const traceEvents = await loadEventsFromTraceFile(name);

  return new Promise((resolve, reject) => {
    const model = TraceModel.TraceModel.Model.createWithAllHandlers();
    model.addEventListener(TraceModel.TraceModel.ModelUpdateEvent.eventName, (event: Event) => {
      const {data} = event as TraceModel.TraceModel.ModelUpdateEvent;

      // When we receive the final update from the model, update the recording
      // state back to waiting.
      if (TraceModel.TraceModel.isModelUpdateDataComplete(data)) {
        const metadata = model.metadata(0);
        const traceParsedData = model.traceParsedData(0);
        if (metadata && traceParsedData) {
          const result: ModelDataResult = {
            metadata,
            traceParsedData,
          };
          modelDataCache.set(name, result);
          resolve(result);
        } else {
          reject(new Error('Unable to load trace'));
        }
      }
    });

    void model.parse(traceEvents, {metadata: {}, isFreshRecording: emulateFreshRecording}).catch(e => console.error(e));
  });
}

/**
 * Parsing some trace files easily takes up more than our default Mocha timeout
 * which is 2seconds. So for most tests that include parsing a trace, we have to
 * increase the timeout. We use this function to ensure we set a consistent
 * timeout across all trace model tests.
 **/
export function setTraceModelTimeout(context: Mocha.Context|Mocha.Suite): void {
  context.timeout(1000000000_000);
}

export async function loadModelDataFromTraceFile(name: string): Promise<TraceModel.Handlers.Types.TraceParseData> {
  let trace: TraceModel.Handlers.Types.TraceParseData;
  try {
    trace = (await generateModelDataForTraceFile(name)).traceParsedData;
  } catch (error) {
    throw new Error(`Failed to load trace file: ${name}. Is it in test/unittests/fixtures/traces?`);
  }

  return trace;
}

// This mock class is used for instancing a flame chart in the helpers.
// Its implementation is empty because the methods aren't used by the
// helpers, only the mere definition.
class MockFlameChartDelegate implements PerfUI.FlameChart.FlameChartDelegate {
  windowChanged(_startTime: number, _endTime: number, _animate: boolean): void {
  }
  updateRangeSelection(_startTime: number, _endTime: number): void {
  }
  updateSelectedGroup(_flameChart: PerfUI.FlameChart.FlameChart, _group: PerfUI.FlameChart.Group|null): void {
  }
}

/**
 * Draws a set of tracks track in the flame chart using the new system.
 * For this to work, every track that will be rendered must have a
 * corresponding track appender registered in the
 * CompatibilityTracksAppender.
 *
 * @param traceFileName The name of the trace file to be loaded into the
 * flame chart.
 * @param trackAppenderNames A Set with the names of the tracks to be
 * rendered. For example, Set("Timings").
 * @returns a flame chart element and its corresponding data provider.
 */
export async function getMainFlameChartWithTracks(
    traceFileName: string, trackAppenderNames: Set<Timeline.CompatibilityTracksAppender.TrackAppenderName>,
    expanded: boolean): Promise<{
  flameChart: PerfUI.FlameChart.FlameChart,
  dataProvider: Timeline.TimelineFlameChartDataProvider.TimelineFlameChartDataProvider,
}> {
  await initializeGlobalVars();

  const {traceParsedData, performanceModel} = await allModelsFromFile(traceFileName);

  const dataProvider = new Timeline.TimelineFlameChartDataProvider.TimelineFlameChartDataProvider();
  // The data provider still needs a reference to the legacy model to
  // work properly.
  dataProvider.setModel(performanceModel, traceParsedData);
  const tracksAppender = dataProvider.compatibilityTracksAppenderInstance();
  tracksAppender.setVisibleTracks(trackAppenderNames);
  dataProvider.buildFromTrackAppenders(/* expandedTracks?= */ expanded ? trackAppenderNames : undefined);
  const delegate = new MockFlameChartDelegate();
  const flameChart = new PerfUI.FlameChart.FlameChart(dataProvider, delegate);
  const minTime = TraceModel.Helpers.Timing.microSecondsToMilliseconds(traceParsedData.Meta.traceBounds.min);
  const maxTime = TraceModel.Helpers.Timing.microSecondsToMilliseconds(traceParsedData.Meta.traceBounds.max);
  flameChart.setWindowTimes(minTime, maxTime);
  flameChart.markAsRoot();
  flameChart.update();
  return {flameChart, dataProvider};
}
/**
 * Draws a track in the flame chart using the legacy system. For this to work,
 * a codepath to append the track must be available in the implementation of
 * TimelineFlameChartDataProvider.appendLegacyTrackData.
 *
 * @param traceFileName The name of the trace file to be loaded to the flame
 * chart.
 * @param trackType the legacy "type" of the track to be rendered. For
 * example: "GPU"
 * @returns a flame chart element and its corresponding data provider.
 */
export async function getMainFlameChartWithLegacyTrack(
    traceFileName: string, trackType: TimelineModel.TimelineModel.TrackType, expanded: boolean): Promise<{
  flameChart: PerfUI.FlameChart.FlameChart,
  dataProvider: Timeline.TimelineFlameChartDataProvider.TimelineFlameChartDataProvider,
}> {
  await initializeGlobalVars();

  const {traceParsedData, performanceModel, timelineModel} = await allModelsFromFile(traceFileName);

  const dataProvider = new Timeline.TimelineFlameChartDataProvider.TimelineFlameChartDataProvider();
  // The data provider still needs a reference to the legacy model to
  // work properly.
  dataProvider.setModel(performanceModel, traceParsedData);
  const track = timelineModel.tracks().find(track => track.type === trackType);
  if (!track) {
    throw new Error(`Legacy track with of type ${trackType} not found in timeline model.`);
  }
  dataProvider.appendLegacyTrackData(track, expanded);
  const delegate = new MockFlameChartDelegate();
  const flameChart = new PerfUI.FlameChart.FlameChart(dataProvider, delegate);
  const minTime = TraceModel.Helpers.Timing.microSecondsToMilliseconds(traceParsedData.Meta.traceBounds.min);
  const maxTime = TraceModel.Helpers.Timing.microSecondsToMilliseconds(traceParsedData.Meta.traceBounds.max);
  flameChart.setWindowTimes(minTime, maxTime);
  flameChart.markAsRoot();
  flameChart.update();
  return {flameChart, dataProvider};
}

export async function allModelsFromFile(file: string): Promise<{
  tracingModel: SDK.TracingModel.TracingModel,
  timelineModel: TimelineModel.TimelineModel.TimelineModelImpl,
  performanceModel: Timeline.PerformanceModel.PerformanceModel,
  traceParsedData: TraceModel.Handlers.Types.TraceParseData,
}> {
  const traceParsedData = await loadModelDataFromTraceFile(file);
  const events = await loadTraceEventsLegacyEventPayload(file);
  const tracingModel = new SDK.TracingModel.TracingModel(new FakeStorage());
  const performanceModel = new Timeline.PerformanceModel.PerformanceModel();
  tracingModel.addEvents(events);
  tracingModel.tracingComplete();
  await performanceModel.setTracingModel(tracingModel);
  const timelineModel = performanceModel.timelineModel();
  return {
    tracingModel,
    timelineModel,
    performanceModel,
    traceParsedData,
  };
}

// We create here a cross-test base trace event. It is assumed that each
// test will import this default event and copy-override properties at will.
export const defaultTraceEvent: TraceModel.Types.TraceEvents.TraceEventData = {
  name: 'process_name',
  tid: TraceModel.Types.TraceEvents.ThreadID(0),
  pid: TraceModel.Types.TraceEvents.ProcessID(0),
  ts: TraceModel.Types.Timing.MicroSeconds(0),
  cat: 'test',
  ph: TraceModel.Types.TraceEvents.Phase.METADATA,
};

/**
 * Gets the tree in a thread.
 * @see RendererHandler.ts
 */
export function getTree(thread: TraceModel.Handlers.ModelHandlers.Renderer.RendererThread):
    TraceModel.Handlers.ModelHandlers.Renderer.RendererEventTree {
  const tree = thread.tree;
  if (!tree) {
    assert(false, `Couldn't get tree in thread ${thread.name}`);
    return null as never;
  }
  return tree;
}

/**
 * Gets the n-th root from a tree in a thread.
 * @see RendererHandler.ts
 */
export function getRootAt(thread: TraceModel.Handlers.ModelHandlers.Renderer.RendererThread, index: number):
    TraceModel.Handlers.ModelHandlers.Renderer.RendererEventNode {
  const tree = getTree(thread);
  const nodeId = [...tree.roots][index];
  if (nodeId === undefined) {
    assert(false, `Couldn't get the id of the root at index ${index} in thread ${thread.name}`);
    return null as never;
  }
  return getNodeFor(thread, nodeId);
}

/**
 * Gets the node with an id from a tree in a thread.
 * @see RendererHandler.ts
 */
export function getNodeFor(
    thread: TraceModel.Handlers.ModelHandlers.Renderer.RendererThread,
    nodeId: TraceModel.Handlers.ModelHandlers.Renderer.RendererEventNodeId):
    TraceModel.Handlers.ModelHandlers.Renderer.RendererEventNode {
  const tree = getTree(thread);
  const node = tree.nodes.get(nodeId);
  if (!node) {
    assert(false, `Couldn't get the node with id ${nodeId} in thread ${thread.name}`);
    return null as never;
  }
  return node;
}

/**
 * Gets the event for a node from a tree in a thread.
 * @see RendererHandler.ts
 */
export function getEventFor(
    thread: TraceModel.Handlers.ModelHandlers.Renderer.RendererThread,
    node: TraceModel.Handlers.ModelHandlers.Renderer.RendererEventNode):
    TraceModel.Handlers.ModelHandlers.Renderer.RendererEvent {
  const event = thread.events[node.eventIndex];
  if (!event) {
    assert(false, `Couldn't get the event at index ${node.eventIndex} for node in thread ${thread.name}`);
    return null as never;
  }
  return event;
}

/**
 * Gets all the `events` for the `nodes` with `ids`.
 */
export function getEventsIn(
    ids: IterableIterator<TraceModel.Handlers.ModelHandlers.Renderer.RendererEventNodeId>,
    nodes:
        Map<TraceModel.Handlers.ModelHandlers.Renderer.RendererEventNodeId,
            TraceModel.Handlers.ModelHandlers.Renderer.RendererEventNode>,
    events: TraceModel.Types.TraceEvents.TraceEventData[]): TraceModel.Types.TraceEvents.TraceEventData[] {
  return [...ids].map(id => nodes.get(id)).flatMap(node => node ? [events[node.eventIndex]] : []);
}
/**
 * Pretty-prints the tree in a thread.
 */
export function prettyPrint(
    thread: TraceModel.Handlers.ModelHandlers.Renderer.RendererThread,
    nodes: Set<TraceModel.Handlers.ModelHandlers.Renderer.RendererEventNodeId>,
    predicate: (
        node: TraceModel.Handlers.ModelHandlers.Renderer.RendererEventNode,
        event: TraceModel.Handlers.ModelHandlers.Renderer.RendererEvent) => boolean = () => true,
    indentation: number = 2, delimiter: string = ' ', prefix: string = '-', newline: string = '\n',
    out: string = ''): string {
  let skipped = false;
  for (const nodeId of nodes) {
    const node = getNodeFor(thread, nodeId);
    const event = getEventFor(thread, node);
    if (!predicate(node, event)) {
      out += `${!skipped ? newline : ''}.`;
      skipped = true;
      continue;
    }
    skipped = false;
    const spacing = new Array(node.depth * indentation).fill(delimiter).join('');
    const type = TraceModel.Types.TraceEvents.isTraceEventDispatch(event) ? `(${event.args.data?.type})` : false;
    const duration = TraceModel.Types.TraceEvents.isTraceEventInstant(event) ? '[I]' : `[${event.dur / 1000}ms]`;
    const info = [type, duration].filter(Boolean);
    out += `${newline}${spacing}${prefix}${event.name} ${info.join(' ')}`;
    out = prettyPrint(thread, node.childrenIds, predicate, indentation, delimiter, prefix, newline, out);
  }

  return out;
}

/**
 * Builds a mock TraceEventComplete.
 */
export function makeCompleteEvent(
    name: string, ts: number, dur: number, cat: string = '*', pid: number = 0,
    tid: number = 0): TraceModel.Types.TraceEvents.TraceEventComplete {
  return {
    args: {},
    cat,
    name,
    ph: TraceModel.Types.TraceEvents.Phase.COMPLETE,
    pid: TraceModel.Types.TraceEvents.ProcessID(pid),
    tid: TraceModel.Types.TraceEvents.ThreadID(tid),
    ts: TraceModel.Types.Timing.MicroSeconds(ts),
    dur: TraceModel.Types.Timing.MicroSeconds(dur),
  };
}

export function makeCompleteEventInMilliseconds(
    name: string, tsMillis: number, durMillis: number, cat: string = '*', pid: number = 0,
    tid: number = 0): TraceModel.Types.TraceEvents.TraceEventComplete {
  return makeCompleteEvent(
      name, TraceModel.Helpers.Timing.millisecondsToMicroseconds(TraceModel.Types.Timing.MilliSeconds(tsMillis)),
      TraceModel.Helpers.Timing.millisecondsToMicroseconds(TraceModel.Types.Timing.MilliSeconds(durMillis)), cat, pid,
      tid);
}

/**
 * Builds a mock TraceEventInstant.
 */
export function makeInstantEvent(
    name: string, ts: number, cat: string = '', pid: number = 0, tid: number = 0,
    s: TraceModel.Types.TraceEvents.TraceEventScope =
        TraceModel.Types.TraceEvents.TraceEventScope.THREAD): TraceModel.Types.TraceEvents.TraceEventInstant {
  return {
    args: {},
    cat,
    name,
    ph: TraceModel.Types.TraceEvents.Phase.INSTANT,
    pid: TraceModel.Types.TraceEvents.ProcessID(pid),
    tid: TraceModel.Types.TraceEvents.ThreadID(tid),
    ts: TraceModel.Types.Timing.MicroSeconds(ts),
    s,
  };
}


export function traceFilenames() {
  return [
  "1pct-2.json",
  "1pct-3.json",
  "1pct.json",
  "2px-2.json",
  "2px.json",
  "Chrome_110_trading_view_Profile-20230308T221633.json",
  "Chrome_111_trading_view_Profile-20230308T222839-navstart.json",
  "Chrome_111_trading_view_Profile-20230308T222839.json",
  "InputProfile-20220817T120203.json",
  "Pantheon-network-whiskers.json",
  "Profile-20200214T165958.json",
  "Profile-20200420T122902.json",
  "Profile-20200429T124248.json",
  "Profile-20200501T114609.json",
  "Profile-20200501T114616.json",
  "Profile-20200626T205619-slowmemes.json",
  "Profile-20200701T125749.json",
  "Profile-20200916T135544.json",
  "Profile-20201117T133918.json",
  "Profile-20201117T134456.json",
  "Profile-20201117T141907.json",
  "Profile-20210121T154232.json",
  "Profile-20210208T164520.json",
  "Profile-20210413T104018-copy.json",
  "Profile-20210613T123134.json",
  "Profile-20210915T085257.json",
  "Profile-20211005T105548.json",
  "Profile-20211014T091602.json",
  "Profile-20220302T074343.json",
  "Profile-20220323T101302.json",
  "Profile-20220426T163215.json",
  "Profile-20220426T171431.json",
  "Profile-20220426T193059.json",
  "Profile-20220429T132241.json",
  "Profile-20220516T115841.json",
  "Profile-20220713T110001.json.gz",
  "Profile-20220713T110041.json.gz",
  "Profile-20220714T160340.json.gz",
  "Profile-20220715T124520.json.gz",
  "Profile-20220720T114626.json",
  "Profile-20220720T151810.json.gz",
  "Profile-20220802T155143.json",
  "Profile-20220802T161718.json",
  "Profile-20220810T175433.json",
  "Profile-20220815T172812-notracingstarted.json",
  "Profile-20220815T172812.json",
  "Profile-20220815T173718.json",
  "Profile-20220817T120243.json",
  "Profile-20220822T091603.json",
  "Profile-20220822T091715.json",
  "Profile-20220823T083058 copy.json",
  "Profile-20220823T174417.json",
  "Profile-20221012T070335.json.gz",
  "Profile-20221021T150353.json",
  "Profile-20221031T102341.json.gz",
  "Profile-20221110T161321.json",
  "Profile-20221110T162202.json",
  "Profile-20221114T121607.json",
  "Profile-20221114T121703.json",
  "Profile-20221116T170544.json",
  "Profile-20221116T172419-bkingnearme.json",
  "Profile-20221116T172858paulirishdelme.json",
  "Profile-20230119T113544.json",
  "Profile-20230131T102229.json",
  "Profile-20230202T180210-rcs.json",
  "Profile-20230209T122849-adam.json",
  "Profile-minimal-unending-raster.json",
  "Trace-2023-04-06T19_02_51.405Z.json",
  "Trace-2023-04-06T19_23_46.371Z.json",
  "adobe-oom-traces",
  "airbnb.json",
  "aiweb-trace.json.gz",
  "allcats-small.json",
  "allcats.json",
  "alltabs-opp.json",
  "alltabz.gz",
  "arizona-framedestroyed.json",
  "arizona-framedestroyed2.json",
  "arizona-to-verge.json",
  "bad-js-sample-flamecharting.trace.json",
  "badtrace.json",
  "bestbuy-crashes-opp-piechart.json",
  "bestbuy-latencyinfoflow.json",
  "bestbuy-tapnav-android.json",
  "bestbuy-tapnav-desktop.json",
  "bestbuy.json",
  "bigboyithinkProfile-20220302T075442.json",
  "bk.json",
  "bk2.json",
  "blah.json.gz",
  "boring-paulirish-trace.json",
  "burgerking-mobile.json",
  "burgerking-sct-aft.json",
  "buttonfalse.json",
  "buttonfalse2.json",
  "buttontrue.json",
  "buttontrue2.json",
  "calibre.json.timing.trace.json",
  "caltrainschedul-allevents.json",
  "cdt-loadtrace-with-rcs.json",
  "cdt-reload-with-rcs.json",
  "chrome-net-export-log.json",
  "chrome110-crbug-1422846-got-a-maxcallstacksize-reproonce-on-zoomin.json",
  "chrome111-crbug-1422846-six-fn-invocations-merged-into-one.json",
  "chromestatus-trace.json",
  "clsartifacts",
  "cnnindo-click.json",
  "cnnindo-click.json.gz",
  "coldish-C.json",
  "coldish-load-netlog.json",
  "coldish-load.json",
  "cool.trace.json",
  "courant.json",
  "crocs-429-throttled.json",
  "defaultPass-somethign.trace.json",
  "defaultPass-tw.trace.json",
  "defaultPass-tw2.trace.json",
  "devtools-load-trace.json",
  "devtools-panelreload.json",
  "devtools-perf-panel-struggling.json",
  "download5mbimage.json",
  "elkzone.json",
  "example-com.json",
  "example-trace-unbounded-raster.json",
  "examplecom-dt-plusstar copy.json",
  "examplecom-dt-plusstar-noscreenshot.json",
  "examplecom-dt-plusstar-noscreenshot2.json",
  "examplecom-dt-plusstar.json",
  "examplecom-trace.json",
  "exampletrace.json",
  "facebook-dotcom-processPseudoId.trace.json",
  "failed-to-parse-cpu-profile.json",
  "first-illustrator-cc-cloud-landing-processPseudoId.trace.json",
  "flames-zoom-2d-all.json",
  "flames-zoom-gl-all.json",
  "functioncall-mini-splits.json",
  "g1-globo-long-interaction.json",
  "goodtrace.json",
  "google-covid-page.json",
  "google-meet-menu-click.json",
  "gwsgoldburgertrace.json",
  "had-recent-input.cjs-20220901142838.trace.json",
  "had-recent-input.cjs-20220901142914.trace.json",
  "ikea-latencyinfoflow.json",
  "illustrator-create-new-file.json",
  "ilweb-load-and-itwasquick.json",
  "ilweb-loadload-butwascompiling.json",
  "inp-debug-testcase-weird-association-of-int-to-mainthread.json",
  "inp-demo-lotsainteractions.json",
  "interrupted-onmessage-repro.json",
  "interrupted-onmessage-repro.json-4278-CrRendererMain.cpuprofile",
  "interrupted-onmessage-repro.json-4278-DedicatedWorker thread.cpuprofile",
  "intersection-obs-trace.json",
  "jansatta-profile-report.json",
  "janstta-profile-report-2.json",
  "jcrew-open-sidenav.json",
  "jsprofilegaps-trace.json",
  "kissmyparcel-truncate-segmenter.json",
  "kolhs.lhr.json.timing.trace.json",
  "lantern-data",
  "lantern-traces",
  "lh-fixtures",
  "lh-report-cpuprof-interrupted.json",
  "lh-report-cpuprof-interrupted2.json",
  "lh-trace-fails-in-rpp.json",
  "lhtrace.json",
  "load-existing-doc.json",
  "load-paulirish-then-example.json",
  "loading-a-trace-onbranch.json",
  "loading-existing-doc-goodtrace.json",
  "loadingtrace-in-npp.json",
  "loadingtrace-in-opp.json",
  "lol.json",
  "lol.json.gz",
  "max-call-stack-repro--orrr-i-cant-reprowithitanymore-bummer.json",
  "maybe-with-sequencemgrcat.json.gz",
  "memegen-Profile-20201015T183708-processPseudoId.json",
  "memgen-click-Profile-20201020T122216.json",
  "missing-events-allcats.json",
  "mybadtrace.json",
  "newriver-w-netlog.json",
  "nppdel.gz",
  "npptrace.gz",
  "npptrace.json.gz",
  "npr-sched-longtasks-cat.json",
  "oldnav-dt-trace-matches-netexport.json",
  "oldnavy-dt-but-star.json",
  "opp-loading-a-gzip-trace.json",
  "paintprofiler-and-layers.json",
  "parsing-prof.json",
  "pauliirsh-enhancedtrace.devtools.json",
  "pauliirshsometing.json",
  "paulirish-entry-timeProfile-20220429T193010.json",
  "paulirish-input-tweaked.json",
  "paulirish-input.json",
  "paulirish-load-layoutshifts.json",
  "paulirish-paint-is-when.json",
  "paulirish-withstarttimezmaybe.json",
  "paulirish-withstarttimezmaybe2.json",
  "paulirish-withstarttimezmaybe3.json",
  "paulirish.json",
  "paulirishtrace.json",
  "posttask-four-bare.json",
  "posttask-four-mini.json",
  "posttask.json",
  "pptr-trace.json",
  "pretty-small-trace.json",
  "process-change.json",
  "processPseudoId-treo-from-debugbear.json",
  "progressive-app-speedline.json",
  "psi-analysistrace.json",
  "psi-navback.json",
  "psi-thing.json",
  "psi-thing2.json",
  "psweb-brush-trace.json",
  "psweb-cold-load.json",
  "psweb-coldload-justload.json",
  "psweb-drag-brush.json",
  "psweb-trace-names.json",
  "raisedbuttonfalse.json",
  "raisedbuttontrue.json",
  "random-lookingforIRs.json",
  "scorecalc-slowgpu.json",
  "sendpendingaccessibilityevents.json",
  "short-example.json",
  "slow-focus-in-gmail.trace.json",
  "small.json",
  "smallishtrace-with-js-sampleproblem.json",
  "smallishtrace-with-js-sampleproblem.json.sorted.json",
  "snake-goodnetlog.json",
  "softnavs-on-moviesapp-bug-wayy-too-many-animations.json",
  "someairbnbHIL.trace.json",
  "somecouranttrace.json",
  "somepaulirish.json",
  "tailwindcss-select-docs-result.json",
  "theverge.json",
  "theverge2.json",
  "theverge3.json",
  "theverge4.json",
  "thevergerandom.json",
  "threetabs.gz",
  "timeline.json",
  "trace (1).json",
  "trace-with-gaps-crbug-1358972.json",
  "trace.json",
  "trace_Fri_Aug_07_2020_11.09.00_AM.json",
  "trace_Fri_Aug_07_2020_11.09.00_AM.json.gz",
  "trace_Mon_Apr_20_2020_3.09.45_PM.json",
  "trace_Tue_Jan_24_2023_3.52.10_PM.json",
  "trace_Tue_Jan_24_2023_3.52.10_PM.json.gz",
  "trace_Wed_Apr_14_2021_3.30.41_PM.json.gz",
  "trace_bigasstrace.json.gz",
  "trace_bigcanarytrace.json",
  "trace_bigcanarytrace.json.gz",
  "trace_bigdatauri.json.gz",
  "trace_coldish.json.gz",
  "trace_compute-intersections.json",
  "trace_compute-intersections.json copy.gz",
  "trace_cool.json.gz",
  "trace_editgallery.json.gz",
  "trace_exerkamp-alldisabledcats.json.gz",
  "trace_full_trace_with_animations_slow_machine.json.gz",
  "trace_globe.json",
  "trace_globe.json.gz",
  "trace_huge-gpu-janks.json.gz",
  "trace_jankyorn.json.gz",
  "trace_memoryinfra.json.gz",
  "trace_noblur.json.gz",
  "trace_old-navy-fulltrace.json",
  "trace_paulirish-tracing.json.gz",
  "trace_png_imgaes.json.gz",
  "trace_secondjankytrace.json.gz",
  "trace_snake-realtracing.json",
  "trace_solo_blur.json.gz",
  "trace_trace_full_trace_without_animations_slow_machine.json.gz",
  "trace_twitchjank.json.gz",
  "trace_twitchjankchangingtabs.json.gz",
  "trace_wixfull.json",
  "tracecafe-stored-traces",
  "tracecafedemo.json",
  "tracecats.defaultPass.trace.json",
  "traces-w-metrics",
  "traces-w-metrics.zip",
  "tracex_coldish.json",
  "tracex_coldish.json.gz",
  "tworendererers.gz",
  "ugh.json",
  "ui5repro.json",
  "uol.br-long-interaction.json",
  "vDKZvDMjYL - repro freezes and OOMs OPP sometimes (webpack profilingplugin)",
  "verge-hi-res.json",
  "verge-no-js.json",
  "verge-standard-res.json",
  "webgl-flames-zoom.json",
  "webgl-synchronous-ipc-things.json",
  "wix-onlycputhrottle.json",
  "worker-bubblesort.json",
  "wpttrace.json",
  "www.theverge.com_2022-10-06_15-09-29-0.trace.json",
  "ytthingtrace-from-npp.json"
];
}
