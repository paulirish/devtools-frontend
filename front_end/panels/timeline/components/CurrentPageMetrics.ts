// Copyright (c) 2023 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import type * as Common from '../../../core/common/common.js';
import * as SDK from '../../../core/sdk/sdk.js';
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

    (${getMetricsInPage.toString()})();
    return 1;
  })();
`;

export class CurrentPageMetrics extends HTMLElement {
  static readonly litTagName = LitHtml.literal`devtools-timeline-current-page-metrics`;
  readonly #shadow = this.attachShadow({mode: 'open'});
  readonly #renderBound = this.#render.bind(this);
  readonly #onPageLifecycleEventBound = this.#onPageLifecycleEvent.bind(this);

  #currentPerfEntries: Array<{payload: PerformanceEventTiming}> = [];
  #mainTarget: SDK.Target.Target|null = null;
  #mainFrameID: Protocol.Page.FrameId|null = null;

  constructor() {
    super();
    void this.setup();
  }
  async setup(): Promise<void> {
    const wait = (ms = 100): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));
    await wait(500);  // HACK. need something better for waiting for target reference

    const mainTarget = (SDK.TargetManager.TargetManager.instance().primaryPageTarget());
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
    const list =
        this.#currentPerfEntries.map(m => LitHtml.html`<li><b>${m.entryType}</b>: <small>${JSON.stringify(m)}</small>`);
    LitHtml.render(LitHtml.html`<ul>${list}</ul>`, this.#shadow, {host: this});
  }
}

customElements.define('devtools-timeline-current-page-metrics', CurrentPageMetrics);
