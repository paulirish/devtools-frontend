// Copyright (c) 2023 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import type * as Common from '../../../core/common/common.js';
import {RuntimeModel} from '../../../core/sdk/RuntimeModel.js';
import * as SDK from '../../../core/sdk/sdk.js';
import type * as ProtocolProxyApi from '../../../generated/protocol-proxy-api.js';
import type * as Protocol from '../../../generated/protocol.js';
import * as ComponentHelpers from '../../../ui/components/helpers/helpers.js';
import * as LitHtml from '../../../ui/lit-html/lit-html.js';

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

      async function getData() {
        ${getMetricsInPage.toString()}
        const result = await getMetricsInPage()
        return result;
      };

      return getData();
    })();
    `;

export class CurrentPageMetrics extends HTMLElement {
  static readonly litTagName = LitHtml.literal`devtools-timeline-current-page-metrics`;
  readonly #shadow = this.attachShadow({mode: 'open'});
  readonly #renderBound = this.#render.bind(this);
  readonly #onPageLifecycleEventBound = this.#onPageLifecycleEvent.bind(this);

  #currentPageMetrics = [{empty: 0}];
  #mainTarget: SDK.Target.Target|null = null;
  #mainFrameID: Protocol.Page.FrameId|null = null;

  constructor() {
    super();
    void this.setup();
  }
  async setup(): Promise<void> {
    const wait = (ms = 100) => new Promise(resolve => setTimeout(resolve, ms));
    await wait(500);  // HACK. need something better for waiting for target reference

    const mainTarget = (SDK.TargetManager.TargetManager.instance().primaryPageTarget());
    if (!mainTarget) {
      console.log('could not get main target');
      return;
    }
    this.#mainTarget = mainTarget;
    console.log('we have a main target.');

    const runtimeModel = this.#mainTarget.model(RuntimeModel);
    SDK.TargetManager.TargetManager.instance().addModelListener(
        SDK.RuntimeModel.RuntimeModel, SDK.RuntimeModel.Events.BindingCalled, this.#onBindingCalled, this);

    await runtimeModel?.addBinding({name: '__chromium_devtools_metrics_reporter'});
    const frameTreeResponse = await mainTarget.pageAgent().invoke_getFrameTree();
    const mainFrameID = frameTreeResponse.frameTree.frame.id;
    this.#mainFrameID = mainFrameID;

    const resourceTreeModel = this.#getResourceTreeModel();
    resourceTreeModel.addEventListener(SDK.ResourceTreeModel.Events.LifecycleEvent, this.#onPageLifecycleEventBound);
    await resourceTreeModel.setLifecycleEventsEnabled(true);

    this.#getPageMetrics();
    // TODO: listen to the page URL changing and run the code again?
    void ComponentHelpers.ScheduledRender.scheduleRender(this, this.#renderBound);
  }

  // TODO: wire this up
  async destroyStufff(): Promise<void> {
    SDK.TargetManager.TargetManager.instance().removeModelListener(
        SDK.RuntimeModel.RuntimeModel, SDK.RuntimeModel.Events.BindingCalled, this.#onBindingCalled, this);

    const resourceTreeModel = this.#getResourceTreeModel();
    await resourceTreeModel.setLifecycleEventsEnabled(false);
    resourceTreeModel.removeEventListener(SDK.ResourceTreeModel.Events.LifecycleEvent, this.#onPageLifecycleEventBound);
  }

  #onBindingCalled(event: ProtocolProxyApi.RuntimeApi.BindingCalledEvent): void {
    const {data} = event;
    if (data.name !== '__chromium_devtools_metrics_reporter') {
      return;
    }
    const obj = JSON.parse(event.data.payload);
    this.#currentPageMetrics.push(obj);
    console.log('binding called', obj);
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
    await this.#mainTarget.runtimeAgent().invoke_evaluate({expression: 'console.log({dpr: window.devicePixelRatio})'});

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
    // clang-format off
    LitHtml.render(LitHtml.html`<button @click=${(): void => {
      void this.#getPageMetrics();
    }}>refresh? (probably unneeded)</button>
      ${this.#renderPageMetrics()}
    `, this.#shadow, {host: this});
    // clang-format on
  }

  #renderPageMetrics(): LitHtml.TemplateResult {
    if (!this.#currentPageMetrics.length) {
      return LitHtml.html``;
    }
    return LitHtml.html`<p>${JSON.stringify(this.#currentPageMetrics)}</p>`;
  }
}

customElements.define('devtools-timeline-current-page-metrics', CurrentPageMetrics);
