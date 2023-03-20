// Copyright (c) 2023 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as SDK from '../../../core/sdk/sdk.js';
import type * as Protocol from '../../../generated/protocol.js';
import type * as Common from '../../../core/common/common.js';
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

  #mainTarget: SDK.Target.Target|null = null;
  #mainFrameID: Protocol.Page.FrameId|null = null;

  async connectedCallback(): Promise<void> {
    const mainTarget = (SDK.TargetManager.TargetManager.instance().primaryPageTarget());
    this.#mainTarget = mainTarget;
    if (!mainTarget) {
      console.log('could not get main target');
      return;
    }
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
    const resourceTreeModel = this.#getResourceTreeModel();
    await resourceTreeModel.setLifecycleEventsEnabled(false);
    resourceTreeModel.removeEventListener(SDK.ResourceTreeModel.Events.LifecycleEvent, this.#onPageLifecycleEventBound);
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
    console.log('eva', evaluationResult, evaluationResult.getError());
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
    }}>click me to re-evaluate</button>`, this.#shadow, {host: this});
    // clang-format on
  }
}

ComponentHelpers.CustomElements.defineComponent('devtools-timeline-current-page-metrics', CurrentPageMetrics);
