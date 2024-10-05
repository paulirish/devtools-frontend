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
   * @description Text referring to a parent cluster.
   */
  parentCluster: 'Parent cluster',
  /**
   * @description Text referring to a layout shift cluster and its start time.
   * @example {32 ms} PH1
   */
  cluster: 'Layout shift cluster @ {PH1}',
  /**
   * @description Text referring to a layout shift and its start time.
   * @example {32 ms} PH1
   */
  layoutShift: 'Layout shift @ {PH1}',
  /**
   * @description Text referring to the total cumulative score of a layout shift cluster.
   */
  total: 'Total',
};

const str_ = i18n.i18n.registerUIStrings('panels/timeline/components/LayoutShiftDetails.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);

export class LayoutShiftDetails extends HTMLElement {
  static readonly litTagName = LitHtml.literal`devtools-performance-layout-shift-details`;
  readonly #shadow = this.attachShadow({mode: 'open'});

  #event: Trace.Types.Events.SyntheticLayoutShift|Trace.Types.Events.SyntheticLayoutShiftCluster|null = null;
  #rowEvents: Trace.Types.Events.SyntheticLayoutShift[] = [];
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
        <span class="culprit">
        <span class="culprit-type">${i18nString(UIStrings.nonCompositedAnimation)}: </span>
        <span class="culprit-value devtools-link" @click=${() => this.#clickEvent(event)}>${i18nString(UIStrings.animation)}</span>
      </span>`;
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

  #renderStartTime(
      shift: Trace.Types.Events.SyntheticLayoutShift, parsedTrace: Trace.Handlers.Types.ParsedTrace,
      useShiftReference: boolean): LitHtml.TemplateResult|null {
    const ts = Trace.Types.Timing.MicroSeconds(shift.ts - parsedTrace.Meta.traceBounds.min);
    if (!useShiftReference) {
      return LitHtml.html`${i18n.TimeUtilities.preciseMillisToString(Helpers.Timing.microSecondsToMilliseconds(ts))}`;
    }
    const shiftTs = i18n.TimeUtilities.formatMicroSecondsTime(ts);
    // clang-format off
    return LitHtml.html`
         <span class="devtools-link" @click=${() => this.#clickEvent(shift)}>${i18nString(UIStrings.layoutShift, {PH1: shiftTs})}</span>`;
    // clang-format off
  }

  #renderShiftRow(
      shift: Trace.Types.Events.SyntheticLayoutShift,
      parsedTrace: Trace.Handlers.Types.ParsedTrace,
      elementsShifted: Trace.Types.Events.TraceImpactedNode[],
      rootCauses: Trace.Insights.InsightRunners.CumulativeLayoutShift.LayoutShiftRootCausesData|undefined,
      useShiftReference: boolean): {output: LitHtml.TemplateResult|null, foundRootCause: boolean} {
    const score = shift.args.data?.weighted_score_delta;
    if (!score) {
      return {output: null, foundRootCause: false};
    }
    const hasCulprits = Boolean(rootCauses &&
        (rootCauses.fontRequests.length || rootCauses.iframeIds.length || rootCauses.nonCompositedAnimations.length));

    // clang-format off
    return {
      output: LitHtml.html`
      <tr class="shift-row">
        <td>${this.#renderStartTime(shift, parsedTrace, useShiftReference)}</td>
        <td>${(score.toFixed(4))}</td>
        ${this.#isFreshRecording ? LitHtml.html`
          <td>
            <div class="elements-shifted">
              ${this.#renderShiftedElements(elementsShifted)}
            </div>
          </td>` : LitHtml.nothing}
        ${hasCulprits && this.#isFreshRecording ? LitHtml.html`
          <td class="culprits">
            ${this.#renderRootCauseValues(rootCauses)}
          </td>` : LitHtml.nothing}
      </tr>`,
      foundRootCause: hasCulprits};
    // clang-format on
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
    const insightsId = layoutShift.args.data?.navigationId ?? Trace.Types.Events.NO_NAVIGATION;
    const clsInsight = traceInsightsSets.get(insightsId)?.data.CumulativeLayoutShift;
    if (clsInsight instanceof Error) {
      return null;
    }

    const rootCauses = clsInsight?.shifts?.get(layoutShift);
    const elementsShifted = layoutShift.args.data?.impacted_nodes ?? [];
    const hasCulprits = rootCauses &&
        (rootCauses.fontRequests.length || rootCauses.iframeIds.length || rootCauses.nonCompositedAnimations.length);
    const hasShiftedElements = elementsShifted?.length;

    this.#rowEvents = [layoutShift];
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
          ${this.#renderShiftRow(layoutShift, parsedTrace, elementsShifted, rootCauses, false).output}
        </tbody>
      </table>
      ${this.#renderParentCluster(parentCluster, parsedTrace)}
    `;
    // clang-format on
  }

  #renderClusterDetails(
      cluster: Trace.Types.Events.SyntheticLayoutShiftCluster,
      traceInsightsSets: Trace.Insights.Types.TraceInsightSets|null,
      parsedTrace: Trace.Handlers.Types.ParsedTrace): LitHtml.TemplateResult|null {
    if (!traceInsightsSets) {
      return null;
    }
    const insightsId = cluster.navigationId ?? Trace.Types.Events.NO_NAVIGATION;
    const clsInsight = traceInsightsSets.get(insightsId)?.data.CumulativeLayoutShift;
    if (clsInsight instanceof Error) {
      return null;
    }

    this.#rowEvents = cluster.events;
    let hasCulprits = false;
    // clang-format off
    const shiftRows = LitHtml.html`
      ${cluster.events.map(shift => {
        const rootCauses = clsInsight?.shifts?.get(shift);
        const elementsShifted = shift.args.data?.impacted_nodes ?? [];
        const {output, foundRootCause} = this.#renderShiftRow(shift, parsedTrace, elementsShifted, rootCauses, true);
        if (foundRootCause) {
          hasCulprits = true;
        }
        return output;
      })}
    `;
    // clang-format on

    // clang-format off
        return LitHtml.html`
          <table class="layout-shift-details-table">
            <thead class="table-title">
              <tr>
                <th>${i18nString(UIStrings.startTime)}</th>
                <th>${i18nString(UIStrings.shiftScore)}</th>
                ${this.#isFreshRecording ? LitHtml.html`
                  <th>${i18nString(UIStrings.elementsShifted)}</th>` : LitHtml.nothing}
                ${hasCulprits && this.#isFreshRecording ? LitHtml.html`
                  <th>${i18nString(UIStrings.culprit)}</th> ` : LitHtml.nothing}
              </tr>
            </thead>
            <tbody>
              ${shiftRows}
              <td class="total-row">${i18nString(UIStrings.total)}</td>
              <td class="total-row">${(cluster.clusterCumulativeScore.toPrecision(4))}</td>
            </tbody>
          </table>
        `;
    // clang-format on
  }

  async #render(): Promise<void> {
    if (!this.#event || !this.#parsedTrace) {
      return;
    }
    // clang-format off
    const output = LitHtml.html`
      <div class="layout-shift-summary-details">
        <div
          class="event-details"
          @mouseover=${this.#togglePopover}
          @mouseleave=${this.#togglePopover}
        >
          ${this.#renderTitle(this.#event)}
          ${Trace.Types.Events.isSyntheticLayoutShift(this.#event)
            ? this.#renderShiftDetails(this.#event, this.#traceInsightsSets, this.#parsedTrace)
            : this.#renderClusterDetails(this.#event, this.#traceInsightsSets, this.#parsedTrace)
          }
        </div>
        <div class="insight-categories">
          ${this.#renderInsightChip()}
        </div>
      </div>
    `;
    // clang-format on
    LitHtml.render(output, this.#shadow, {host: this});
  }

  #togglePopover(e: MouseEvent): void {
    if (!(e.target instanceof HTMLElement)) {
      return;
    }

    const rowEl = e.target.closest('tr');
    if (!rowEl || !rowEl.parentElement) {
      return;
    }
    const index = [...rowEl.parentElement.children].indexOf(rowEl);
    if (index === -1) {
      return;
    }

    const event = this.#rowEvents[index];
    const payload = {event, show: e.type === 'mouseover'};
    // gotta call showPopoverForSearchResult somehow
    // o rmaybe its just updatePopoverForEntry(entryIndex) directly.

    // TLFlameView calls this.mainFlameChart.showPopoverForSearchResult(
    this.dispatchEvent(new CustomEvent('toggle-popover', {detail: payload, bubbles: true, composed: true}));
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'devtools-performance-layout-shift-details': LayoutShiftDetails;
  }
}

customElements.define('devtools-performance-layout-shift-details', LayoutShiftDetails);


export function createShiftViz(
    event: Trace.Types.Events.SyntheticLayoutShift, parsedTrace: Trace.Handlers.Types.ParsedTrace,
    maxSize: UI.Geometry.Size): HTMLElement|undefined {
  //TODO: maybe remove maxSize
  const screenshots = event.parsedData.screenshots;
  const viewport = parsedTrace.Meta.viewportRect;

  const beforeUri = screenshots.before?.args.dataUri;
  const afterUri = screenshots.after?.args.dataUri;
  if (!beforeUri || !afterUri || !viewport) {
    return;
  }

  const vizContainer = document.createElement('div');
  vizContainer.classList.add('layout-shift-viz');


  Promise.all([afterUri, beforeUri].map(UI.UIUtils.loadImage)).then(([afterImage, beforeImage]) => {
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

    // Helper to re-scale rectangles, removing DPR effect
    const scaleRect = (rect: Trace.Types.Events.TraceRect): DOMRect => {
      const {width: vw, height: vh} = viewport;
      return new DOMRect(
          rect[0] / dpr,
          rect[1] / dpr,
          rect[2] / dpr,
          rect[3] / dpr,
      );
    };
    const beforeRects = (event.args.data?.impacted_nodes?.map(node => scaleRect(node.old_rect)) ?? []);
    const afterRects = (event.args.data?.impacted_nodes?.map(node => scaleRect(node.new_rect)) ?? []);


    // Calculate scaling factor based on maxSize.
    // If this is being size constrained, it needs to be done in JS (rather than css max-width, etc)....
    // That's because this function is complete before it's added to the DOM.. so we can't query offsetHeight for its resolved size…
    const maxSizeScaleFactor =
        Math.min(maxSize.width / beforeImage.naturalWidth, maxSize.height / beforeImage.naturalHeight, 1);
    afterImage = afterImage || beforeImage;
    afterImage.style.width = beforeImage.style.width = `${beforeImage.naturalWidth * maxSizeScaleFactor}px`;
    afterImage.style.height = beforeImage.style.height = `${beforeImage.naturalHeight * maxSizeScaleFactor}px`;
    afterImage.classList.add('layout-shift-viz-screenshot--after');
    vizContainer.append(beforeImage, afterImage);

    // Fade in the 'after' screenshot
    setTimeout(() => {
      afterImage.style.opacity = '1';
    }, 1000);

    // Create and position individual rects representing each impacted_node within a shift
    beforeRects.forEach((beforeRect, i) => {
      const rectEl = document.createElement('div');
      rectEl.classList.add('layout-shift-viz-rect');

      let currentRect = beforeRect;
      // If it's a 0x0x0x0 rect, then set to new, so we can fade it in from the new position instead.
      if ([beforeRect.width, beforeRect.height, beforeRect.x, beforeRect.y].every(v => v === 0)) {
        currentRect = afterRects[i];
        rectEl.style.opacity = '0';
      } else {
        rectEl.style.opacity = '0.4';
      }

      const cssPixelToScreenshotScaleFactor =
          Math.min(beforeImage.naturalWidth / viewport.width, beforeImage.naturalHeight / viewport.height, 1)
      const setRectPosition = (rect: DOMRect) => {
        rectEl.style.left = `${rect.x * maxSizeScaleFactor * cssPixelToScreenshotScaleFactor}px`;
        rectEl.style.top = `${rect.y * maxSizeScaleFactor * cssPixelToScreenshotScaleFactor}px`;
        rectEl.style.width = `${rect.width * maxSizeScaleFactor * cssPixelToScreenshotScaleFactor}px`;
        rectEl.style.height = `${rect.height * maxSizeScaleFactor * cssPixelToScreenshotScaleFactor}px`;
      };

      setRectPosition(currentRect);
      vizContainer.appendChild(rectEl);

      // Animate to the after rectangle position.
      setTimeout(() => {
        setRectPosition(afterRects[i]);
        rectEl.style.opacity = '0.4';
      }, 1000);
    });  // end of handling rects

    return vizContainer;
  });
  return vizContainer;
}
