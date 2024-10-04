// Copyright 2024 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as Common from '../../../core/common/common.js';
import * as i18n from '../../../core/i18n/i18n.js';
import type * as Platform from '../../../core/platform/platform.js';
import * as SDK from '../../../core/sdk/sdk.js';
import type * as Protocol from '../../../generated/protocol.js';
import * as Helpers from '../../../models/trace/helpers/helpers.js';
import * as Trace from '../../../models/trace/trace.js';
import * as LegacyComponents from '../../../ui/legacy/components/utils/utils.js';
import * as UI from '../../../ui/legacy/legacy.js';
import * as LitHtml from '../../../ui/lit-html/lit-html.js';
import {CLSRect} from '../CLSLinkifier.js';

import * as EntryName from './EntryName.js';
import * as Insights from './insights/insights.js';
import layoutShiftDetailsStyles from './layoutShiftDetails.css.js';

const MAX_URL_LENGTH = 20;

const UIStrings = {
  /**
   * @description Text indicating an insight.
   */
  insight: 'Insight',
  /**
   * @description Title indicating the Layout shift culprits insight.
   */
  layoutShiftCulprits: 'Layout shift culprits',
  /**
   * @description Text referring to the start time of a given event.
   */
  startTime: 'Start time',
  /**
   * @description Text for a table header referring to the score of a Layout Shift event.
   */
  shiftScore: 'Shift score',
  /**
   * @description Text for a table header referring to the elements shifted for a Layout Shift event.
   */
  elementsShifted: 'Elements shifted',
  /**
   * @description Text for a table header referring to the culprit of a Layout Shift event.
   */
  culprit: 'Culprit',
  /**
   * @description Text for a culprit type of Injected iframe.
   */
  injectedIframe: 'Injected iframe',
  /**
   * @description Text for a culprit type of Font request.
   */
  fontRequest: 'Font request',
  /**
   * @description Text for a culprit type of non-composited animation.
   */
  nonCompositedAnimation: 'Non-composited animation',
  /**
   * @description Text referring to an animation.
   */
  animation: 'Animation',
  /**
   * @description Text referring to the duration of a given event.
   */
  duration: 'Duration',
  /**
   * @description Text referring to a parent cluster.
   */
  parentCluster: 'Parent cluster',
  /**
   * @description Text referring to a layout shift cluster and its start time.
   * @example {32 ms} PH1
   */
  cluster: 'Layout shift cluster @ {PH1}',
};

const str_ = i18n.i18n.registerUIStrings('panels/timeline/components/LayoutShiftDetails.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);

export class LayoutShiftDetails extends HTMLElement {
  static readonly litTagName = LitHtml.literal`devtools-performance-layout-shift-details`;
  readonly #shadow = this.attachShadow({mode: 'open'});

  #event: Trace.Types.Events.SyntheticLayoutShift|Trace.Types.Events.SyntheticLayoutShiftCluster|null = null;
  #traceInsightsSets: Trace.Insights.Types.TraceInsightSets|null = null;
  #parsedTrace: Trace.Handlers.Types.ParsedTrace|null = null;
  #isFreshRecording: Boolean = false;

  connectedCallback(): void {
    this.#shadow.adoptedStyleSheets = [layoutShiftDetailsStyles];
    // Styles for linkifier button.
    UI.UIUtils.injectTextButtonStyles(this.#shadow);
    this.#render();
  }

  setData(
      event: Trace.Types.Events.SyntheticLayoutShift|Trace.Types.Events.SyntheticLayoutShiftCluster,
      traceInsightsSets: Trace.Insights.Types.TraceInsightSets|null, parsedTrace: Trace.Handlers.Types.ParsedTrace|null,
      isFreshRecording: Boolean): void {
    if (this.#event === event) {
      return;
    }
    this.#event = event;
    this.#traceInsightsSets = traceInsightsSets;
    this.#parsedTrace = parsedTrace;
    this.#isFreshRecording = isFreshRecording;
    this.#render();
  }

  #renderInsightChip(): LitHtml.TemplateResult|null {
    if (!this.#event) {
      return null;
    }

    // clang-format off
    return LitHtml.html`
      <div class="insight-chip">
        <div class="insight-keyword">${i18nString(UIStrings.insight)} </div>${i18nString(UIStrings.layoutShiftCulprits)}</div>
    `;
    // clang-format on
  }

  #renderTitle(event: Trace.Types.Events.SyntheticLayoutShift|
               Trace.Types.Events.SyntheticLayoutShiftCluster): LitHtml.TemplateResult {
    const title = EntryName.nameForEntry(event);
    return LitHtml.html`
      <div class="layout-shift-details-title">
        <div class="layout-shift-event-title"></div>
        ${title}
      </div>
    `;
  }

  #renderShiftedElements(elementsShifted: Trace.Types.Events.TraceImpactedNode[]|undefined): LitHtml.LitTemplate {
    // clang-format off
    return LitHtml.html`
      ${elementsShifted?.map(el => {
        if (el.node_id !== undefined) {
          return LitHtml.html`
            <${Insights.NodeLink.NodeLink.litTagName}
              .data=${{
                backendNodeId: el.node_id,
              } as Insights.NodeLink.NodeLinkData}>
            </${Insights.NodeLink.NodeLink.litTagName}>`;
        }
          return LitHtml.nothing;
      })}`;
    // clang-format on
  }

  #renderIframe(iframeId: string): LitHtml.TemplateResult|null {
    const domLoadingId = iframeId as Protocol.Page.FrameId;
    if (!domLoadingId) {
      return null;
    }

    const domLoadingFrame = SDK.FrameManager.FrameManager.instance().getFrame(domLoadingId);
    if (!domLoadingFrame) {
      return null;
    }
    const el = LegacyComponents.Linkifier.Linkifier.linkifyRevealable(domLoadingFrame, domLoadingFrame.displayName());
    // clang-format off
    return LitHtml.html`
    <span class="culprit"><span class="culprit-type">${i18nString(UIStrings.injectedIframe)}: </span><span class="culprit-value">${el}</span></span>`;
    // clang-format on
  }

  #renderFontRequest(request: Trace.Types.Events.SyntheticNetworkRequest): LitHtml.TemplateResult|null {
    const options = {
      tabStop: true,
      showColumnNumber: false,
      inlineFrameIndex: 0,
      maxLength: MAX_URL_LENGTH,
    };

    const linkifiedURL = LegacyComponents.Linkifier.Linkifier.linkifyURL(
        request.args.data.url as Platform.DevToolsPath.UrlString, options);

    // clang-format off
    return LitHtml.html`
    <span class="culprit"><span class="culprit-type">${i18nString(UIStrings.fontRequest)}: </span><span class="culprit-value">${linkifiedURL}</span></span>`;
    // clang-format on
  }

  #clickEvent(event: Trace.Types.Events.Event): void {
    this.dispatchEvent(new Insights.Helpers.EventReferenceClick(event));
  }

  #renderAnimation(failure: Trace.Insights.InsightRunners.CumulativeLayoutShift.NoncompositedAnimationFailure):
      LitHtml.TemplateResult|null {
    const event = failure.animation;
    if (!event) {
      return null;
    }
    // clang-format off
    return LitHtml.html`
      ${LitHtml.html`
        <span class="culprit">
        <span class="culprit-type">${i18nString(UIStrings.nonCompositedAnimation)}: </span>
        <span class="culprit-value devtools-link" @click=${() => this.#clickEvent(event)}>${i18nString(UIStrings.animation)}</span>
      </span>`
    }`;
    // clang-format on
  }

  #renderRootCauseValues(rootCauses: Trace.Insights.InsightRunners.CumulativeLayoutShift.LayoutShiftRootCausesData|
                         undefined): LitHtml.TemplateResult|null {
    return LitHtml.html`
      ${rootCauses?.fontRequests.map(fontReq => this.#renderFontRequest(fontReq))}
      ${rootCauses?.iframeIds.map(iframe => this.#renderIframe(iframe))}
      ${rootCauses?.nonCompositedAnimations.map(failure => this.#renderAnimation(failure))}
    `;
  }

  #renderParentCluster(
      cluster: Trace.Types.Events.SyntheticLayoutShiftCluster|undefined,
      parsedTrace: Trace.Handlers.Types.ParsedTrace): LitHtml.TemplateResult|null {
    if (!cluster) {
      return null;
    }
    const ts = Trace.Types.Timing.MicroSeconds(cluster.ts - (parsedTrace?.Meta.traceBounds.min ?? 0));
    const clusterTs = i18n.TimeUtilities.formatMicroSecondsTime(ts);

    // clang-format off
    return LitHtml.html`
      <span class="parent-cluster">${i18nString(UIStrings.parentCluster)}:
         <span class="devtools-link" @click=${() => this.#clickEvent(cluster)}>${i18nString(UIStrings.cluster, {PH1: clusterTs})}</span>
      </span>`;
    // clang-format on
  }

  #renderShiftDetails(
      layoutShift: Trace.Types.Events.SyntheticLayoutShift,
      traceInsightsSets: Trace.Insights.Types.TraceInsightSets|null,
      parsedTrace: Trace.Handlers.Types.ParsedTrace,
      ): LitHtml.TemplateResult|null {
    if (!traceInsightsSets) {
      return null;
    }
    const score = layoutShift.args.data?.weighted_score_delta;
    if (!score) {
      return null;
    }

    const ts = Trace.Types.Timing.MicroSeconds(layoutShift.ts - parsedTrace.Meta.traceBounds.min);
    const insightsId = layoutShift.args.data?.navigationId ?? Trace.Types.Events.NO_NAVIGATION;
    const clsInsight = traceInsightsSets.get(insightsId)?.data.CumulativeLayoutShift;
    if (clsInsight instanceof Error) {
      return null;
    }

    const rootCauses = clsInsight?.shifts?.get(layoutShift);
    const elementsShifted = layoutShift.args.data?.impacted_nodes;
    const hasCulprits = rootCauses &&
        (rootCauses.fontRequests.length || rootCauses.iframeIds.length || rootCauses.nonCompositedAnimations.length);
    const hasShiftedElements = elementsShifted?.length;

    const parentCluster = clsInsight?.clusters.find(cluster => {
      return cluster.events.find(event => event === layoutShift);
    });

    // clang-format off
    return LitHtml.html`
      <table class="layout-shift-details-table">
        <thead class="table-title">
          <tr>
            <th>${i18nString(UIStrings.startTime)}</th>
            <th>${i18nString(UIStrings.shiftScore)}</th>
            ${hasShiftedElements && this.#isFreshRecording ? LitHtml.html`
              <th>${i18nString(UIStrings.elementsShifted)}</th>` : LitHtml.nothing}
            ${hasCulprits && this.#isFreshRecording ? LitHtml.html`
              <th>${i18nString(UIStrings.culprit)}</th> ` : LitHtml.nothing}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>${i18n.TimeUtilities.preciseMillisToString(Helpers.Timing.microSecondsToMilliseconds(ts))}</td>
            <td>${(score.toPrecision(4))}</td>
            ${this.#isFreshRecording ? LitHtml.html`
              <td>
                <div class="elements-shifted">
                  ${this.#renderShiftedElements(elementsShifted)}
                </div>
              </td>` : LitHtml.nothing}
            ${this.#isFreshRecording ? LitHtml.html`
              <td class="culprits">
                ${this.#renderRootCauseValues(rootCauses)}
              </td>` : LitHtml.nothing}
          </tr>
        </tbody>
      </table>
      ${this.#renderParentCluster(parentCluster, parsedTrace)}
    `;
    // clang-format on
  }

  #renderClusterDetails(
      cluster: Trace.Types.Events.SyntheticLayoutShiftCluster,
      parsedTrace: Trace.Handlers.Types.ParsedTrace): LitHtml.TemplateResult|null {
    const ts = Trace.Types.Timing.MicroSeconds(cluster.ts - parsedTrace.Meta.traceBounds.min);
    const dur = cluster.dur ?? Trace.Types.Timing.MicroSeconds(0);

    // clang-format off
    return LitHtml.html`
        <div class="cluster-details">
            <div class="details-row"><div class="title">${i18nString(UIStrings.startTime)}</div><div class="value">${i18n.TimeUtilities.preciseMillisToString(Helpers.Timing.microSecondsToMilliseconds(ts))}</div></div>
            <div class="details-row"><div class="title">${i18nString(UIStrings.duration)}</div><div class="value">${i18n.TimeUtilities.preciseMillisToString(Helpers.Timing.microSecondsToMilliseconds(dur))}</div></div>
        </div>
    `;
    // clang-format on
  }

  #renderDetails(
      event: Trace.Types.Events.SyntheticLayoutShift|Trace.Types.Events.SyntheticLayoutShiftCluster,
      traceInsightsSets: Trace.Insights.Types.TraceInsightSets|null,
      parsedTrace: Trace.Handlers.Types.ParsedTrace,
      ): LitHtml.TemplateResult|null {
    if (Trace.Types.Events.isSyntheticLayoutShift(event)) {
      return this.#renderShiftDetails(event, traceInsightsSets, parsedTrace);
    }
    return this.#renderClusterDetails(event, parsedTrace);
  }

  async #render(): Promise<void> {
    if (!this.#event || !this.#parsedTrace) {
      return;
    }
    // clang-format off
    const output = LitHtml.html`
      <div class="layout-shift-summary-details">
        <div class="event-details">
          ${this.#renderTitle(this.#event)}
          ${this.#renderDetails(this.#event, this.#traceInsightsSets, this.#parsedTrace)}
          ${await this.#renderScreenshotThumbnail(this.#event)}
        </div>
        <div class="insight-categories">
          ${this.#renderInsightChip()}
        </div>
      </div>
    `;
    // clang-format on
    LitHtml.render(output, this.#shadow, {host: this});
  }

  async #renderScreenshotThumbnail(event: Trace.Types.Events.SyntheticLayoutShift|
                                   Trace.Types.Events.SyntheticLayoutShiftCluster):
      Promise<LitHtml.TemplateResult|undefined> {
    if (!this.#parsedTrace || Trace.Types.Events.isSyntheticLayoutShiftCluster(event)) {
      return;
    }

    const maxSize = new UI.Geometry.Size(300, 300);
    const gif = await createShiftViz(event, this.#parsedTrace, maxSize);
    return LitHtml.html`${gif?.elem ?? ''}`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'devtools-performance-layout-shift-details': LayoutShiftDetails;
  }
}

customElements.define('devtools-performance-layout-shift-details', LayoutShiftDetails);


type ShiftViz = {
  elem: HTMLElement,
  width: number,
  height: number
};

export async function createShiftViz(
    event: Trace.Types.Events.SyntheticLayoutShift, parsedTrace: Trace.Handlers.Types.ParsedTrace,
    maxSize: UI.Geometry.Size): Promise<ShiftViz|undefined> {
  const screenshots = event.parsedData.screenshots;
  const viewport = parsedTrace.Meta.viewportRect;

  const beforeUri = screenshots.before?.args.dataUri;
  const afterUri = screenshots.after?.args.dataUri;
  if (!beforeUri || !afterUri || !viewport) {
    return;
  }

  const [afterImage, beforeImage] =
      await Promise.all([UI.UIUtils.loadImage(afterUri), UI.UIUtils.loadImage(beforeUri)]);
  if (!beforeImage) {
    return;
  }

  /** The Layout Instability API in Blink, which reports the LayoutShift trace events, is not based on CSS pixels but
   * physical pixels. As such the values in the impacted_nodes field need to be normalized to CSS units in order to
   * map them to the viewport dimensions, which we get in CSS pixels. We do that by dividing the values by the devicePixelRatio.
   * See https://crbug.com/1300309
   */
  const dpr = parsedTrace.Meta.devicePixelRatio;
  if (dpr === undefined) {
    return;
  }

  const beforeRects =
      event.args.data?.impacted_nodes?.map(
          node => new DOMRect(
              node.old_rect[0] / dpr, node.old_rect[1] / dpr, node.old_rect[2] / dpr, node.old_rect[3] / dpr)) ??
      [];
  const afterRects =
      event.args.data?.impacted_nodes?.map(
          node => new DOMRect(
              node.new_rect[0] / dpr, node.new_rect[1] / dpr, node.new_rect[2] / dpr, node.new_rect[3] / dpr)) ??
      [];

  const screenshotContainer = document.createElement('div');
  screenshotContainer.classList.add('layout-shift-viz');
  screenshotContainer.appendChild(beforeImage);

  /**
   * If this is being size constrained, it needs to be done in JS (rather than css max-width, etc)....
   * That's because this function is complete before it's added to the DOM.. so we can't query offsetHeight for its resolved size…
   * This number represents how much the screenshot image (generally fits in a 500x500 box) is scaled down for display in the UI
   */
  const displayScaleFactor =
      Math.min(maxSize.width / beforeImage.naturalWidth, maxSize.height / beforeImage.naturalHeight, 1);
  const width = beforeImage.naturalWidth * displayScaleFactor;
  const height = beforeImage.naturalHeight * displayScaleFactor;
  beforeImage.style.width = `${width}px`;
  beforeImage.style.height = `${height}px`;

  // Set up before rects
  const rectEls = beforeRects.map((beforeRect, i) => {
    const rectEl = document.createElement('div');
    rectEl.classList.add('layout-shift-viz-rect');

    // If it's a 0x0x0x0 rect, then set to the _after_ position, so we can fade it in from there instead.
    if ([beforeRect.width, beforeRect.height, beforeRect.x, beforeRect.y].every(v => v === 0)) {
      beforeRect = afterRects[i];
      rectEl.style.opacity = '0';
    } else {
      rectEl.style.opacity = '1';
    }

    // These two values will be extremely close: (beforeImage.naturalHeight / viewport.height) and (beforeImage.naturalHeight / viewport.height)
    // They represent the scaling factor from original page viewport CSS pixels to screenshot pixels.
    const scaledRectX = beforeRect.x * beforeImage.naturalWidth / viewport.width * displayScaleFactor;
    const scaledRectY = beforeRect.y * beforeImage.naturalHeight / viewport.height * displayScaleFactor;
    const scaledRectWidth = beforeRect.width * beforeImage.naturalWidth / viewport.width * displayScaleFactor;
    const scaledRectHeight = beforeRect.height * beforeImage.naturalHeight / viewport.height * displayScaleFactor;
    rectEl.style.left = `${scaledRectX}px`;
    rectEl.style.top = `${scaledRectY}px`;
    rectEl.style.width = `${scaledRectWidth}px`;
    rectEl.style.height = `${scaledRectHeight}px`;
    rectEl.style.opacity = '0.4';

    screenshotContainer.appendChild(rectEl);
    return rectEl;
  });

  if (afterImage) {
    afterImage.classList.add('layout-shift-screenshot-after');
    screenshotContainer.appendChild(afterImage);
    afterImage.style.width = beforeImage.style.width;
    afterImage.style.height = beforeImage.style.height;
    // TODO(paulirish): hook up dialog
    // afterImage.addEventListener('click', () => { new ScreenshotGifDialog(event, parsedTrace); });
  }

  // // Update for the after rect positions after a bit.
  // setTimeout(() => {
  //   rectEls.forEach((rectEl, i) => {
  //     const afterRect = afterRects[i];
  //     const scaledRectX = afterRect.x * beforeImage.naturalWidth / viewport.width * displayScaleFactor;
  //     const scaledRectY = afterRect.y * beforeImage.naturalHeight / viewport.height * displayScaleFactor;
  //     const scaledRectWidth = afterRect.width * beforeImage.naturalWidth / viewport.width * displayScaleFactor;
  //     const scaledRectHeight = afterRect.height * beforeImage.naturalHeight / viewport.height * displayScaleFactor;
  //     rectEl.style.left = `${scaledRectX}px`;
  //     rectEl.style.top = `${scaledRectY}px`;
  //     rectEl.style.width = `${scaledRectWidth}px`;
  //     rectEl.style.height = `${scaledRectHeight}px`;
  //     rectEl.style.opacity = '0.4';
  //   });
  //   if (afterImage) {
  //     afterImage.style.opacity = '1';
  //   }
  // }, 1000);

  // instead of the settimeout above i want to use the web animations API with the animate() method invoked on each of these rects. we'll define a animationTimeline that will orchestrate all of them. it will repeat indefinitely with a 1s delay between each iteration.
  rectEls.forEach((rectEl, i) => {
    const afterRect = afterRects[i];
    const scaledRectX = afterRect.x * beforeImage.naturalWidth / viewport.width * displayScaleFactor;
    const scaledRectY = afterRect.y * beforeImage.naturalHeight / viewport.height * displayScaleFactor;
    const scaledRectWidth = afterRect.width * beforeImage.naturalWidth / viewport.width * displayScaleFactor;
    const scaledRectHeight = afterRect.height * beforeImage.naturalHeight / viewport.height * displayScaleFactor;
    rectEl.animate(
        [
          {
            left: `${scaledRectX}px`,
            top: `${scaledRectY}px`,
            width: `${scaledRectWidth}px`,
            height: `${scaledRectHeight}px`,
            opacity: '0.4'
          },
        ],
        {
          duration: 1000,
          iterations: Infinity,
          easing: 'ease-in-out',
          delay: 1000,
          fill: 'both',
        });
  });

  if (afterImage) {
    afterImage.animate(
        [
          {opacity: '0'},
          {opacity: '1'},
        ],
        {
          duration: 1000,
          iterations: Infinity,
          easing: 'ease-in-out',
          delay: 1000,
          fill: 'both',
        });
  }

  return {elem: screenshotContainer, width, height};
}
