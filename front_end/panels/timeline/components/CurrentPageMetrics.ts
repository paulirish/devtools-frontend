// Copyright (c) 2023 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import type * as Common from '../../../core/common/common.js';
import {RuntimeModel} from '../../../core/sdk/RuntimeModel.js';
import * as SDK from '../../../core/sdk/sdk.js';
import * as ProtocolProxyApi from '../../../generated/protocol-proxy-api.js';
import type * as Protocol from '../../../generated/protocol.js';
import * as ComponentHelpers from '../../../ui/components/helpers/helpers.js';
import * as LitHtml from '../../../ui/lit-html/lit-html.js';
import {
  ColdColorScheme,
  type Event,
  type EventProperties,
  HotColorScheme,
  TickingFlameChart,
} from '../../media/TickingFlameChart.js';

import {getMetricsInPage} from './getMetricsInPage.js';

declare global {
  interface HTMLElementTagNameMap {
    'devtools-timeline-current-page-metrics': CurrentPageMetrics;
  }
}

const PAGE_METRICS_CODE_TO_EVALUATE = `
  // Evaluated in an IIFE to avoid polluting the global scope of the page we're evaluating.
  (function() {
    if (typeof __chromium_devtools_metrics_reporter !== 'function') console.warn('ruhroh');

    (${getMetricsInPage.toString()})();
    return 1;
  })();
`;


export class PlayerEventsTimeline extends TickingFlameChart {
  private normalizedTimestamp: number;
  private playbackStatusLastEvent: Event|null;
  private audioBufferingStateEvent: Event|null;
  private videoBufferingStateEvent: Event|null;

  private currentPageMetrics: CurrentPageMetrics;

  constructor() {
    super();

    this.currentPageMetrics = new CurrentPageMetrics();
    const onEventBound = this.onEvent.bind(this);
    setTimeout(() => {
      this.currentPageMetrics.init(onEventBound);
    }, 1000);  // lol. so bad.

    this.addGroup('somegroup', 2);
    this.addGroup('okay', 2);  // video on top, audio on bottom


    this.playbackStatusLastEvent = null;
    this.audioBufferingStateEvent = null;
    this.videoBufferingStateEvent = null;


    this.startEvent({
      level: 0,
      startTime: 0,
      duration: 0,
      name: `Time Origin`,
    });

    // setTimeout(() => this.addPlayEvent(200), 500);
    // setTimeout(() => this.addPlayEvent(200), 1000);
    // setTimeout(() => this.addPlayEvent(200), 1500);
    // setTimeout(() => this.addPlayEvent(200), 2000);
  }

  private addPlayEvent(normalizedTime: number): void {
    this.startEvent({
      level: 0,
      startTime: normalizedTime,
      name: 'Play',
    } as EventProperties);
  }

  onEvent(item: any): void {
    console.log('its an item', item);
    const payload = item.payload;
    if (!payload)
      return;

    this.startEvent({
      level: 0,
      startTime: payload.startTime,
      duration: payload.duration,
      name: `${payload.entryType} ${payload.name}`,
    });
  }
}

export class CurrentPageMetrics extends HTMLElement {
  static readonly litTagName = LitHtml.literal`devtools-timeline-current-page-metrics`;
  readonly #shadow = this.attachShadow({mode: 'open'});
  readonly #renderBound = this.#render.bind(this);
  readonly #onPageLifecycleEventBound = this.#onPageLifecycleEvent.bind(this);
  readonly timelineView = new PlayerEventsTimeline();



  #currentPerfEntries: Array<{payload: PerformanceEventTiming}> = [];
  #mainTarget: SDK.Target.Target|null = null;
  #mainFrameID: Protocol.Page.FrameId|null = null;
  onEventBound: any;

  constructor() {
    super();
    void this.setup();
  }
  async setup(): Promise<void> {
    const wait = (ms = 100): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));
    await wait(500);  // HACK. need something better for waiting for target reference

    const mainTarget = (SDK.TargetManager.TargetManager.instance().primaryPageTarget());
    this.#mainTarget = mainTarget;
    this.onEventBound = onEventBound;
    if (!mainTarget) {
      // eslint-disable-next-line no-console
      console.log('could not get main target');
      return;
    }
    this.#mainTarget = mainTarget;

    const runtimeModel = this.#mainTarget.model(SDK.RuntimeModel.RuntimeModel);
    SDK.TargetManager.TargetManager.instance().addModelListener(
        SDK.RuntimeModel.RuntimeModel, SDK.RuntimeModel.Events.BindingCalled, this.#onBindingCalled, this);

    await runtimeModel?.addBinding({name: '__chromium_devtools_metrics_reporter'});
    const frameTreeResponse = await mainTarget.pageAgent().invoke_getFrameTree();
    this.#mainFrameID = frameTreeResponse.frameTree.frame.id;

    const resourceTreeModel = this.#mainTarget?.model(SDK.ResourceTreeModel.ResourceTreeModel);
    resourceTreeModel?.addEventListener(SDK.ResourceTreeModel.Events.LifecycleEvent, this.#onPageLifecycleEventBound);
    await resourceTreeModel?.setLifecycleEventsEnabled(true);

    void this.#invokePerfObserver();
    void ComponentHelpers.ScheduledRender.scheduleRender(this, this.#renderBound);
  }

  // TODO: wire this up
  async destroyStufff(): Promise<void> {
    SDK.TargetManager.TargetManager.instance().removeModelListener(
        SDK.RuntimeModel.RuntimeModel, SDK.RuntimeModel.Events.BindingCalled, this.#onBindingCalled, this);

    const resourceTreeModel = this.#mainTarget?.model(SDK.ResourceTreeModel.ResourceTreeModel);
    await resourceTreeModel?.setLifecycleEventsEnabled(false);
    resourceTreeModel?.removeEventListener(
        SDK.ResourceTreeModel.Events.LifecycleEvent, this.#onPageLifecycleEventBound);
  }

  #onBindingCalled(event: {data: Protocol.Runtime.BindingCalledEvent}): void {
    const {data} = event;
    if (data.name !== '__chromium_devtools_metrics_reporter') {
      return;
    }
    const entry = JSON.parse(event.data.payload).payload;
    if (!this.#currentPerfEntries.find(m => entry.startTime === m.startTime && entry.name === m.name)) {
      this.#currentPerfEntries.push(entry);
    }
    this.onEventBound(entry);
    this.#render();
  }

  #onPageLifecycleEvent(event: Common.EventTarget.EventTargetEvent<{frameId: Protocol.Page.FrameId, name: string}>):
      void {
    if (!this.#mainFrameID) {
      return;
    }
    if (event.data.frameId !== this.#mainFrameID) {
      return;
    }
    // eslint-disable-next-line no-console
    console.log('lifecycle event', event);

    // TODO: actually get this working appropriately. because lifecycle-wise it's all wrong.
    // On new page loads, reset the stats and execute the perf Observer
    this.#currentPerfEntries.splice(0, this.#currentPerfEntries.length);
    void this.#invokePerfObserver();
  }

  async #invokePerfObserver(): Promise<void> {
    if (!this.#mainTarget) {
      return;
    }

    const evaluationResult = await this.#mainTarget.runtimeAgent().invoke_evaluate({
      returnByValue: true,
      expression: PAGE_METRICS_CODE_TO_EVALUATE,
    });
    const err = evaluationResult.getError();
    if (err) {
      return console.error(err);
    }

    this.#render();
  }

  #render(): void {
    // globalThis.tv = this.timelineView;
    // this.timelineView.element.style.height = '200px';
    // this.timelineView.show();
    // clang-format off
    LitHtml.render(LitHtml.html`<button @click=${(): void => {
      void this.#invokePerfObserver();
    }}>click me to re-evaluate</button>
      ${this.#renderPageMetrics()}
    `, this.#shadow, {host: this});
    // clang-format on
    // this.#shadow.appendChild(this.timelineView.element);
  }


  #renderPageMetrics(): LitHtml.TemplateResult {
    if (!this.#currentPerfEntries.length)
      return LitHtml.html``;
    return LitHtml.html`<p>${JSON.stringify(this.#currentPerfEntries)}</p>`
  }
}

customElements.define('devtools-timeline-current-page-metrics', CurrentPageMetrics);
