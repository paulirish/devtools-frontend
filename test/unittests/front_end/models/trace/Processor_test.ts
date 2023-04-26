// Copyright 2023 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as TraceModel from '../../../../../front_end/models/trace/trace.js';

const {assert} = chai;

import {loadEventsFromTraceFile, setTraceModelTimeout, traceFilenames} from '../../helpers/TraceHelpers.js';

const wait = (ms = 100) => new Promise(resolve => setTimeout(resolve, ms));

// flagged as problematic before.
const knownBad = `
trace_full_trace_with_animations_slow_machine.json.gz
lantern-traces/unthrottled-assets/www_t_online_de.trace.json
clsartifacts/0021/defaultPass.trace.json
clsartifacts/045/defaultPass.trace.json
clsartifacts/080/defaultPass.trace.json
clsartifacts/044/defaultPass.trace.json
clsartifacts/0013/defaultPass.trace.json
tracecafe-stored-traces/traces/aNErDEVsVP
tracecafe-stored-traces/traces/KDY70t1SCW
tracecafe-stored-traces/traces/PBOCPCjQFF
tracecafe-stored-traces/traces/dB2iaQRTWg
tracecafe-stored-traces/traces/gWhf8rl75C
tracecafe-stored-traces/traces/n9RDopu6ps
lantern-data/https---www-ning-com--mobile-unthrottled-6-trace.json
lantern-data/https---en-softonic-com-mobile-unthrottled-4-trace.json
lantern-data/https---www-mlb-com--mobile-unthrottled-7-trace.json
lantern-data/https---birdsarentreal-com-mobile-unthrottled-4-trace.json
lantern-data/https---www-irs-gov--mobile-unthrottled-7-trace.json
lh-fixtures/devtools-homepage-w-screenshots-trace.json
lh-fixtures/progressive-app-m60.json
lh-fixtures/progressive-app.json
lh-fixtures/tracingstarted-after-navstart.json
lh-fixtures/site-with-redirect.json
lh-fixtures/load.json
Profile-20211014T091602.json
arizona-framedestroyed.json
adobe-oom-traces/Venus_full_stack_trace_during_save_operation.json
pauliirsh-enhancedtrace.devtools.json
trace_Fri_Aug_07_2020_11.09.00_AM.json
trace_editgallery.json.gz
blah.json.gz
tracecafe-stored-traces/traces/yWdmByAM1Q
tracecafe-stored-traces/traces/ghAXmOs106
`.trim().split('\n');


const oomTraces = [
  "adobe-oom-traces/aide_128k_debug_stack.json",
  "adobe-oom-traces/aide_blkSize_128k.json",
  "adobe-oom-traces/Venus_full_stack_trace_during_save_operation.json",
  ];

// cd ~/Downloads/traces && server --cors
const urlPrefix = 'http://localhost:9435/'

describe('TraceProcessor', async function() {
  setTraceModelTimeout(this);
  let failures = [];
  this.afterEach(() => {
    console.log('bad ones', failures);
    failures = [];
  });

  it.only('can use a trace processor', async () => {
    const processor = TraceModel.Processor.TraceProcessor.createWithAllHandlers();


    const oneThousandTraces =  traceFilenames().sort(() => 0.5 - Math.random()) // shuffled
    const oneKFiltered = oneThousandTraces.filter(t => !knownBad.includes(t));

    const filenames = [
      // TODO: include all of ./test/unittests/fixtures/traces/
      ...knownBad,
      ...oneKFiltered,
      ].map(f => `${urlPrefix}${f.trim()}`)

    for (const filename of filenames) {
      await parseAndLog(filename);
    }

    // for (let i = 0; i < oomTraces.length; i++) {
    //   const filename = `${urlPrefix}${oomTraces[i]}`;
    //   await parseAndLog(filename);
    //   if (i + 1 === oomTraces.length) i = -1; // infinite loop lol.
    // }

    await wait(10000000);

    async function parseAndLog(filename: string) {
      console.log('\n         Reading: ' + filename.replace(urlPrefix, ''));
      let file;
      try {
        file = await loadEventsFromTraceFile(filename);
      } catch (e) {
        console.error('❌ JSON FAILURE WITH', filename, e );
        failures.push(filename);
        file = undefined;
        processor.reset();
        return;
      }
      // Check parsing after reset.
      processor.reset();
      assert.isNull(processor.data);
      try {
        await processor.parse(file);
      } catch(e) {
        console.error('❌ PARSE FAILURE WITH', filename, e );
        failures.push(filename);
        file = undefined;
        processor.reset();
        // throw e;
        return;
      } finally {

      }

      assert.isNotNull(processor.data);
      // Looks good. ish.
      const meta = processor.data?.Meta;
      console.log('', `- meta. range: ${(Math.round(meta.traceBounds.range / 1000)).toLocaleString()}ms. url: ${meta?.mainFrameURL.slice(0,80)} browser: pid ${meta?.browserProcessId} tid ${meta?.browserThreadId}, renderer tids: ${Array.from(meta.topLevelRendererIds)}`);
      // Cleanup.
      processor.reset();
    }
  });

  it('can be given a subset of handlers to run and will run just those along with the meta handler', async () => {
    const processor = new TraceModel.Processor.TraceProcessor({
      Animation: TraceModel.Handlers.ModelHandlers.Animation,
    });
    const file = await loadEventsFromTraceFile('animation.json.gz');
    await processor.parse(file);
    assert.isNotNull(processor.data);
    assert.deepEqual(Object.keys(processor.data || {}), ['Meta', 'Animation']);
  });

  it('does not error if the user does not enable the Meta handler when it is a dependency', async () => {
    assert.doesNotThrow(() => {
      new TraceModel.Processor.TraceProcessor({
        // Screenshots handler depends on Meta handler, so this is invalid.
        // However, the Processor automatically ensures the Meta handler is
        // enabled, so this should not cause an error.
        Screenshots: TraceModel.Handlers.ModelHandlers.Screenshots,
      });
    });
  });

  it('errors if the user does not provide the right handler dependencies', async () => {
    assert.throws(() => {
      new TraceModel.Processor.TraceProcessor({
        Renderer: TraceModel.Handlers.ModelHandlers.Renderer,
        // Invalid: the renderer depends on the samples handler, so the user should pass that in too.
      });
    }, /Required handler Samples not provided/);
  });

  it('emits periodic trace updates', async () => {
    const processor = new TraceModel.Processor.TraceProcessor(
        {
          Renderer: TraceModel.Handlers.ModelHandlers.Renderer,
          Samples: TraceModel.Handlers.ModelHandlers.Samples,
        },
        {
          // This trace is 8252 events long, lets emit 8 updates
          eventsPerChunk: 1_000,
        });

    let updateEventCount = 0;

    processor.addEventListener(TraceModel.Processor.TraceParseProgressEvent.eventName, () => {
      updateEventCount++;
    });

    const rawEvents = await loadEventsFromTraceFile('web-dev.json.gz');
    await processor.parse(rawEvents).then(() => {
      assert.strictEqual(updateEventCount, 8);
    });
  });

  describe('handler sorting', () => {
    const baseHandler = {
      data() {},
      handleEvent() {},
      reset() {},
    };

    function fillHandlers(
        handlersDeps: {[key: string]: {deps ? () : TraceModel.Handlers.Types.TraceEventHandlerName[]}}):
        {[key: string]: TraceModel.Handlers.Types.TraceEventHandler} {
      const handlers: {[key: string]: TraceModel.Handlers.Types.TraceEventHandler} = {};
      for (const handler in handlersDeps) {
        handlers[handler] = {...baseHandler, ...handlersDeps[handler]};
      }
      return handlers;
    }

    it('sorts handlers satisfying their dependencies 1', () => {
      const handlersDeps: {[key: string]: {deps ? () : TraceModel.Handlers.Types.TraceEventHandlerName[]}} = {
        'Meta': {},
        'GPU': {
          deps() {
            return ['Meta'];
          },
        },
        'LayoutShifts': {
          deps() {
            return ['GPU'];
          },
        },
        'NetworkRequests': {
          deps() {
            return ['LayoutShifts'];
          },
        },
        'PageLoadMetrics': {
          deps() {
            return ['Renderer', 'GPU'];
          },
        },
        'Renderer': {
          deps() {
            return ['Screenshots'];
          },
        },
        'Screenshots': {
          deps() {
            return ['NetworkRequests', 'LayoutShifts'];
          },
        },
      };
      const handlers = fillHandlers(handlersDeps);

      const expectedOrder =
          ['Meta', 'GPU', 'LayoutShifts', 'NetworkRequests', 'Screenshots', 'Renderer', 'PageLoadMetrics'];
      assert.deepEqual([...TraceModel.Processor.sortHandlers(handlers).keys()], expectedOrder);
    });
    it('sorts handlers satisfying their dependencies 2', () => {
      const handlersDeps: {[key: string]: {deps ? () : TraceModel.Handlers.Types.TraceEventHandlerName[]}} = {
        'GPU': {
          deps() {
            return ['LayoutShifts', 'NetworkRequests'];
          },
        },
        'LayoutShifts': {
          deps() {
            return ['NetworkRequests'];
          },
        },
        'NetworkRequests': {},
      };
      const handlers = fillHandlers(handlersDeps);

      const expectedOrder = ['NetworkRequests', 'LayoutShifts', 'GPU'];
      assert.deepEqual([...TraceModel.Processor.sortHandlers(handlers).keys()], expectedOrder);
    });
    it('throws an error when a dependency cycle is present among handlers', () => {
      const handlersDeps: {[key: string]: {deps ? () : TraceModel.Handlers.Types.TraceEventHandlerName[]}} = {
        'Meta': {},
        'GPU': {
          deps() {
            return ['Meta'];
          },
        },
        'LayoutShifts': {
          deps() {
            return ['GPU', 'Renderer'];
          },
        },
        'NetworkRequests': {
          deps() {
            return ['LayoutShifts'];
          },
        },
        'Renderer': {
          deps() {
            return ['NetworkRequests'];
          },
        },
      };
      const handlers = fillHandlers(handlersDeps);
      const cyclePath = 'LayoutShifts->Renderer->NetworkRequests->LayoutShifts';
      assert.throws(
          () => TraceModel.Processor.sortHandlers(handlers),
          `Found dependency cycle in trace event handlers: ${cyclePath}`);
    });
  });
});
