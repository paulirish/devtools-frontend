// Copyright (c) 2023 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as SDK from '../../../core/sdk/sdk.js';
import type * as Protocol from '../../../generated/protocol.js';
import type * as Common from '../../../core/common/common.js';
import * as ComponentHelpers from '../../../ui/components/helpers/helpers.js';
import * as LitHtml from '../../../ui/lit-html/lit-html.js';
import {
  ColdColorScheme,
  HotColorScheme,
  TickingFlameChart,
  type Event,
  type EventProperties,
} from '../../media/TickingFlameChart.js';
import {getMetricsInPage} from './getMetricsInPage.js';
import {RuntimeModel} from '../../../core/sdk/RuntimeModel.js';
import * as ProtocolProxyApi from '../../../generated/protocol-proxy-api.js';


declare global {
  interface HTMLElementTagNameMap {
    'devtools-timeline-current-page-metrics': CurrentPageMetrics;
  }
}

const PAGE_METRICS_CODE_TO_EVALUATE = `
  // Evaluated in an IIFE to avoid polluting the global scope of the page we're evaluating.
  (function() {
      if (typeof __chromium_devtools_metrics_reporter !== 'function') console.warn('ruhroh');

      async function getData() {
        ${getMetricsInPage.toString()}
        const result = await getMetricsInPage()
        return result;
      };

      return getData();
    })();
    `;


export class PlayerEventsTimeline extends TickingFlameChart {
  private normalizedTimestamp: number;
  private playbackStatusLastEvent: Event|null;
  private audioBufferingStateEvent: Event|null;
  private videoBufferingStateEvent: Event|null;

  constructor() {
    super();

    this.addGroup('somegroup', 2);
    this.addGroup('okay', 2);  // video on top, audio on bottom

    this.playbackStatusLastEvent = null;
    this.audioBufferingStateEvent = null;
    this.videoBufferingStateEvent = null;
    setTimeout(() => this.addEvent(200), 500);
    setTimeout(() => this.addEvent(200), 1000);
    setTimeout(() => this.addEvent(200), 1500);
    setTimeout(() => this.addEvent(200), 2000);
  }

  private addEvent(normalizedTime: number): void {
    this.startEvent({
      level: 0,
      startTime: normalizedTime,
      name: 'Play',
    } as EventProperties);
  }
}

export class CurrentPageMetrics extends HTMLElement {
  static readonly litTagName = LitHtml.literal`devtools-timeline-current-page-metrics`;
  readonly #shadow = this.attachShadow({mode: 'open'});
  readonly #renderBound = this.#render.bind(this);
  readonly #onPageLifecycleEventBound = this.#onPageLifecycleEvent.bind(this);
  readonly timelineView  = new PlayerEventsTimeline();



  #currentPageMetrics = [];
  #mainTarget: SDK.Target.Target|null = null;
  #mainFrameID: Protocol.Page.FrameId|null = null;

  async connectedCallback(): Promise<void> {
    const mainTarget = (SDK.TargetManager.TargetManager.instance().primaryPageTarget());
    this.#mainTarget = mainTarget;
    if (!mainTarget) {
      console.log('could not get main target');
      return;
    }

    const runtimeModel = this.#mainTarget.model(RuntimeModel);
    runtimeModel?.bindingCalled;

    SDK.TargetManager.TargetManager.instance().addModelListener(
      SDK.RuntimeModel.RuntimeModel,
      SDK.RuntimeModel.Events.BindingCalled,
      this.#onBindingCalled,
      this
    );

    await runtimeModel?.addBinding({name: '__chromium_devtools_metrics_reporter'});

    const frameTreeResponse = await mainTarget.pageAgent().invoke_getFrameTree();
    const mainFrameID = frameTreeResponse.frameTree.frame.id;
    this.#mainFrameID = mainFrameID;

    const resourceTreeModel = this.#getResourceTreeModel();
    resourceTreeModel.addEventListener(SDK.ResourceTreeModel.Events.LifecycleEvent, this.#onPageLifecycleEventBound);
    await resourceTreeModel.setLifecycleEventsEnabled(true);
    // TODO: listen to the page URL changing and run the code again?
    void ComponentHelpers.ScheduledRender.scheduleRender(this, this.#renderBound);
  }

  async disconnectedCallback(): Promise<void> {

    SDK.TargetManager.TargetManager.instance().removeModelListener(
      SDK.RuntimeModel.RuntimeModel,
      SDK.RuntimeModel.Events.BindingCalled,
      this.#onBindingCalled,
      this
    );

    const resourceTreeModel = this.#getResourceTreeModel();
    await resourceTreeModel.setLifecycleEventsEnabled(false);
    resourceTreeModel.removeEventListener(SDK.ResourceTreeModel.Events.LifecycleEvent, this.#onPageLifecycleEventBound);
  }


  #onBindingCalled(event: ProtocolProxyApi.RuntimeApi.BindingCalledEvent): void {
    const {data} = event;
    if (data.name !== '__chromium_devtools_metrics_reporter') return;
    const obj = JSON.parse(event.data.payload);
    this.#currentPageMetrics.push(obj)
    console.log('binding', obj);
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
    if (event.data.name === 'load') {
      void this.#getPageMetrics();
      return;
    }
  }

  async #getPageMetrics(): Promise<void> {
    if (!this.#mainTarget) {
      return;
    }

    const evaluationResult = await this.#mainTarget.runtimeAgent().invoke_evaluate({
      returnByValue: true,
      awaitPromise: true,
      expression: PAGE_METRICS_CODE_TO_EVALUATE,
    });
    const err = evaluationResult.getError();
    if (err) {
      return console.error(err);
    }

    console.log('eva', evaluationResult, evaluationResult.getError());

    // this.#currentPageMetrics = evaluationResult.result.value;
    this.#render();
  }

  #getResourceTreeModel(): SDK.ResourceTreeModel.ResourceTreeModel {
    if (!this.#mainTarget) {
      throw new Error('No main target available');
    }
    const model = this.#mainTarget.model(SDK.ResourceTreeModel.ResourceTreeModel);
    if (!model) {
      throw new Error('Could not get ResourceTreeModel');
    }
    return model;
  }

  #render(): void {
    globalThis.tv = this.timelineView;
    this.timelineView.element.style.height = '200px';
    // this.timelineView.show();
    // clang-format off
    LitHtml.render(LitHtml.html`<button @click=${(): void => {
      void this.#getPageMetrics();
    }}>click me to re-evaluate</button>
      ${this.#renderPageMetrics()}
    `, this.#shadow, {host: this});
    // clang-format on
    this.#shadow.appendChild(this.timelineView.element);
  }


  #renderPageMetrics(): LitHtml.TemplateResult {
    if (!this.#currentPageMetrics.length) return LitHtml.html``;
    return LitHtml.html`<p>${JSON.stringify(this.#currentPageMetrics)}</p>`
  }
}

ComponentHelpers.CustomElements.defineComponent('devtools-timeline-current-page-metrics', CurrentPageMetrics);
