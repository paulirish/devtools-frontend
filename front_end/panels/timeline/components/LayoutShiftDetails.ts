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

import {NodeLink} from './insights/insights.js';
import layoutShiftDetailsStyles from './layoutShiftDetails.css.js';

const MAX_URL_LENGTH = 20;

const UIStrings = {
  /**
   * @description Text for a Layout Shift event indictating that it is an insight.
   */
  insight: 'Insight',
  /**
   * @description Title for a Layout shift event insight.
   */
  layoutShiftCulprits: 'Layout shift culprits',
  /**
   * @description Text indicating a Layout shift.
   */
  layoutShift: 'Layout shift',
  /**
   * @description Text for a table header referring to the start time of a Layout Shift event.
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
};

const str_ = i18n.i18n.registerUIStrings('panels/timeline/components/LayoutShiftDetails.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);

export class LayoutShiftDetails extends HTMLElement {
  static readonly litTagName = LitHtml.literal`devtools-performance-layout-shift-details`;
  readonly #shadow = this.attachShadow({mode: 'open'});

  #layoutShift?: Trace.Types.Events.SyntheticLayoutShift|null;
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
      layoutShift: Trace.Types.Events.SyntheticLayoutShift,
      traceInsightsSets: Trace.Insights.Types.TraceInsightSets|null, parsedTrace: Trace.Handlers.Types.ParsedTrace|null,
      isFreshRecording: Boolean): void {
    if (this.#layoutShift === layoutShift) {
      return;
    }
    this.#layoutShift = layoutShift;
    this.#traceInsightsSets = traceInsightsSets;
    this.#parsedTrace = parsedTrace;
    this.#isFreshRecording = isFreshRecording;
    this.#render();
  }

  #renderInsightChip(): LitHtml.TemplateResult|null {
    if (!this.#layoutShift) {
      return null;
    }

    // clang-format off
    return LitHtml.html`
      <div class="insight-chip">
        <div class="insight-keyword">${i18nString(UIStrings.insight)} </div>${i18nString(UIStrings.layoutShiftCulprits)}
      </div>
    `;
    // clang-format on
  }

  #renderTitle(): LitHtml.TemplateResult {
    return LitHtml.html`
      <div class="layout-shift-details-title">
        <div class="layout-shift-event-title"></div>
        ${i18nString(UIStrings.layoutShift)}
      </div>
    `;
  }

  #renderShiftedElements(elementsShifted: Trace.Types.Events.TraceImpactedNode[]|undefined): LitHtml.LitTemplate {
    // clang-format off
    return LitHtml.html`
      ${elementsShifted?.map(el => {
        if (el.node_id !== undefined) {
          return LitHtml.html`
            <${NodeLink.NodeLink.litTagName}
              .data=${{
                backendNodeId: el.node_id,
              } as NodeLink.NodeLinkData}>
            </${NodeLink.NodeLink.litTagName}>`;
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
    <div class="culprit"><div class="culprit-type">${i18nString(UIStrings.injectedIframe)}:</div><div class="culprit-value">${el}</div></div>`;
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
    <div class="culprit"><div class="culprit-type">${i18nString(UIStrings.fontRequest)}:</div><div class="culprit-value">${linkifiedURL}</div></div>`;
    // clang-format on
  }

  #renderRootCauseValues(rootCauses: Trace.Insights.InsightRunners.CumulativeLayoutShift.LayoutShiftRootCausesData|
                         undefined): LitHtml.TemplateResult|null {
    return LitHtml.html`
      ${rootCauses?.fontRequests.map(fontReq => this.#renderFontRequest(fontReq))}
      ${rootCauses?.iframeIds.map(iframe => this.#renderIframe(iframe))}
    `;
  }

  #renderDetailsTable(
      layoutShift: Trace.Types.Events.SyntheticLayoutShift,
      traceInsightsSets: Trace.Insights.Types.TraceInsightSets,
      parsedTrace: Trace.Handlers.Types.ParsedTrace,
      ): LitHtml.TemplateResult|null {
    const score = layoutShift.args.data?.weighted_score_delta;
    if (!score) {
      return null;
    }

    const ts = Trace.Types.Timing.MicroSeconds(layoutShift.ts - parsedTrace.Meta.traceBounds.min);
    const insightsId = layoutShift.args.data?.navigationId ?? Trace.Insights.Types.NO_NAVIGATION;
    const clsInsight = traceInsightsSets.get(insightsId)?.data.CumulativeLayoutShift;
    if (clsInsight instanceof Error) {
      return null;
    }

    const rootCauses = clsInsight?.shifts?.get(layoutShift);
    const elementsShifted = layoutShift.args.data?.impacted_nodes;
    const hasCulprits = rootCauses && (rootCauses.fontRequests.length > 0 || rootCauses.iframeIds.length > 0);
    const hasShiftedElements = elementsShifted && elementsShifted.length > 0;

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
              </td>` : LitHtml.nothing
            }
            ${this.#isFreshRecording ? LitHtml.html`
              <td class="culprits">
                ${this.#renderRootCauseValues(rootCauses)}
              </td>`: LitHtml.nothing}
          </tr>
        </tbody>
      </table>
    `;
    // clang-format on
  }

  async #render(): Promise<void> {
    if (!this.#layoutShift || !this.#traceInsightsSets || !this.#parsedTrace) {
      return;
    }
    // todo: move into table
    const gif = await this.#renderScreenshotThumbnail(this.#layoutShift);
    gif && this.#shadow.append(gif.elem);

    // clang-format off
    const output = LitHtml.html`
      <div class="layout-shift-summary-details">
        <div class="event-details">
          ${this.#renderTitle()}
          ${this.#renderDetailsTable(this.#layoutShift, this.#traceInsightsSets, this.#parsedTrace)}
        </div>
        <div class="insight-categories">
          ${this.#renderInsightChip()}
        </div>
      </div>
    `;
    // clang-format on
    LitHtml.render(output, this.#shadow, {host: this});
  }

  async #renderScreenshotThumbnail(event: Trace.Types.Events.SyntheticLayoutShift): Promise<ScreenshotGif|undefined> {
    if (!this.#parsedTrace) {
      return;
    }
    const maxSize = new UI.Geometry.Size(100, 100);
    return createScreenshotGif(event, this.#parsedTrace, maxSize);
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'devtools-performance-layout-shift-details': LayoutShiftDetails;
  }
}

customElements.define('devtools-performance-layout-shift-details', LayoutShiftDetails);


type ScreenshotGif = {
  elem: HTMLElement,
  width: number,
  height: number
};

/** This is called twice. Once with a small maxSize for the thumbnail, and again to create the large version in the dialog. */
export async function createScreenshotGif(
    event: Trace.Types.Events.SyntheticLayoutShift, parsedTrace: Trace.Handlers.Types.ParsedTrace,
    maxSize: UI.Geometry.Size): Promise<ScreenshotGif|undefined> {
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
  screenshotContainer.classList.add('layout-shift-screenshot-preview');
  screenshotContainer.style.position = 'relative';
  screenshotContainer.appendChild(beforeImage);

  // If this is being size constrained, it needs to be done in JS (rather than css max-width, etc)....
  // That's because this function is complete before it's added to the DOM.. so we can't query offsetHeight for its resolved size…
  const scaleFactor = Math.min(maxSize.width / beforeImage.naturalWidth, maxSize.height / beforeImage.naturalHeight, 1);
  const width = beforeImage.naturalWidth * scaleFactor;
  const height = beforeImage.naturalHeight * scaleFactor;
  beforeImage.style.width = `${width}px`;
  beforeImage.style.height = `${height}px`;

  // Set up before rects
  const rectEls = beforeRects.map((beforeRect, i) => {
    const rectEl = document.createElement('div');
    rectEl.classList.add('layout-shift-screenshot-preview-rect');

    // If it's a 0x0x0x0 rect, then set to new, so we can fade it in from the new position instead.
    if ([beforeRect.width, beforeRect.height, beforeRect.x, beforeRect.y].every(v => v === 0)) {
      beforeRect = afterRects[i];
      rectEl.style.opacity = '0';
    } else {
      rectEl.style.opacity = '1';
    }

    const scaledRectX = beforeRect.x * beforeImage.naturalWidth / viewport.width * scaleFactor;
    const scaledRectY = beforeRect.y * beforeImage.naturalHeight / viewport.height * scaleFactor;
    const scaledRectWidth = beforeRect.width * beforeImage.naturalWidth / viewport.width * scaleFactor;
    const scaledRectHeight = beforeRect.height * beforeImage.naturalHeight / viewport.height * scaleFactor;
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
    afterImage.addEventListener('click', () => {
      new ScreenshotGifDialog(event, parsedTrace);
    });
  }

  // Update for the after rect positions after a bit.
  setTimeout(() => {
    rectEls.forEach((rectEl, i) => {
      const afterRect = afterRects[i];
      const scaledRectX = afterRect.x * beforeImage.naturalWidth / viewport.width * scaleFactor;
      const scaledRectY = afterRect.y * beforeImage.naturalHeight / viewport.height * scaleFactor;
      const scaledRectWidth = afterRect.width * beforeImage.naturalWidth / viewport.width * scaleFactor;
      const scaledRectHeight = afterRect.height * beforeImage.naturalHeight / viewport.height * scaleFactor;
      rectEl.style.left = `${scaledRectX}px`;
      rectEl.style.top = `${scaledRectY}px`;
      rectEl.style.width = `${scaledRectWidth}px`;
      rectEl.style.height = `${scaledRectHeight}px`;
      rectEl.style.opacity = '0.4';
    });
    if (afterImage) {
      afterImage.style.opacity = '1';
    }
  }, 1000);


  return {elem: screenshotContainer, width, height};
}


export class ScreenshotGifDialog {
  private fragment: UI.Fragment.Fragment;
  private readonly widget: UI.XWidget.XWidget;
  private dialog: UI.Dialog.Dialog|null = null;

  constructor(event: Trace.Types.Events.SyntheticLayoutShift, parsedTrace: Trace.Handlers.Types.ParsedTrace) {
    const prevButton = UI.UIUtils.createTextButton('\u25C0', () => console.log('prev gif'));
    UI.Tooltip.Tooltip.install(prevButton, i18nString('prev gif'));
    const nextButton = UI.UIUtils.createTextButton('\u25B6', () => console.log('next gif'));
    UI.Tooltip.Tooltip.install(nextButton, i18nString('next gif'));

    this.fragment = UI.Fragment.Fragment.build`
      <x-widget flex=none margin=12px>
        <x-hbox>
          <x-hbox $='container' overflow=auto border='1px solid #ddd'>
          </x-hbox>
          <x-hbox>
            <ul $='nodes'>

            </ul>
          </x-hbox>
        </x-hbox>
          <x-hbox x-center justify-content=center margin-top=10px>
          ${prevButton}
          <x-hbox $='time' margin=8px></x-hbox>
          ${nextButton}
        </x-hbox>
      </x-widget>
    `;

    this.widget = (this.fragment.element() as UI.XWidget.XWidget);
    (this.widget as HTMLElement).tabIndex = 0;
    // this.widget.addEventListener('keydown', this.keyDown.bind(this), false);
    this.dialog = null;

    void this.renderDialog(event, parsedTrace);
  }

  private async renderDialog(
      event: Trace.Types.Events.SyntheticLayoutShift, parsedTrace: Trace.Handlers.Types.ParsedTrace): Promise<void> {
    const maxSize = new UI.Geometry.Size(800, 800);
    const gif = await createScreenshotGif(event, parsedTrace, maxSize);
    if (!gif) {
      return;
    }
    const dialogSize = new UI.Geometry.Size(gif.width + 300, gif.height);

    this.fragment.$('container').append(gif.elem);

    const lis = event.args.data?.impacted_nodes?.map((node, i) => {
      const rectEl = this.fragment.$('container').querySelectorAll('.layout-shift-screenshot-preview-rect').item(i);
      return LitHtml.html`
            <li><${NodeLink.NodeLink.litTagName}
              @mouseover=${() => () => rectEl.classList.add('highlight')}
              @mouseleave=${() => () => rectEl.classList.remove('highlight')}
              .data=${{
        backendNodeId: node.node_id,
      } as NodeLink.NodeLinkData}>
            </${NodeLink.NodeLink.litTagName}></li>`;
    });
    LitHtml.render(
        LitHtml.html`
      <ul>
        ${lis}
      </ul>
    `,
        this.fragment.$('nodes') as HTMLElement);

    this.resize(dialogSize);
  }

  hide(): void {
    if (this.dialog) {
      this.dialog.hide();
    }
  }

  private resize(dialogSize: UI.Geometry.Size): void {
    if (!this.dialog) {
      this.dialog = new UI.Dialog.Dialog();
      this.dialog.contentElement.appendChild(this.widget);
      this.dialog.setDefaultFocusedElement(this.widget);
      // this.dialog.registerRequiredCSS({cssContent: styles});
      this.dialog.show();
    }
    this.dialog.setMaxContentSize(dialogSize);
    this.dialog.setSizeBehavior(UI.GlassPane.SizeBehavior.SET_EXACT_SIZE);
  }
}


// write a new version of the ScreenshotGifDialog, but as a custom element using LitHtml where appropriate. and the NodeLink component to link nodes.  Finally, add a "time" element that shows the time of the current layout shift.
// okay go
export class LayoutShiftGifDialog extends HTMLElement {
  static readonly litTagName = LitHtml.literal`devtools-performance-layout-shift-gif-dialog`;
  readonly #shadow = this.attachShadow({mode: 'open'});
  #layoutShift?: Trace.Types.Events.SyntheticLayoutShift|null;
  #parsedTrace: Trace.Handlers.Types.ParsedTrace|null = null;
  #gif: ScreenshotGif|undefined;
  #currentShiftIndex = 0;
  #rectEls: HTMLElement[] = [];
  #nodeLinks: NodeLink.NodeLink[] = [];


  connectedCallback(): void {
    this.#shadow.adoptedStyleSheets = [layoutShiftDetailsStyles];
    // Styles for linkifier button.
    UI.UIUtils.injectTextButtonStyles(this.#shadow);
    this.#render();
  }

  setData(layoutShift: Trace.Types.Events.SyntheticLayoutShift, parsedTrace: Trace.Handlers.Types.ParsedTrace): void {
    if (this.#layoutShift === layoutShift) {
      return;
    }
    this.#layoutShift = layoutShift;
    this.#parsedTrace = parsedTrace;
    this.#render();
  }

  #render(): void {
    if (!this.#layoutShift || !this.#parsedTrace) {
      return;
    }

    const maxSize = new UI.Geometry.Size(800, 800);
    const gif = createScreenshotGif(this.#layoutShift, this.#parsedTrace, maxSize);
    if (!gif) {
      return;
    }


    this.#layoutShift.args.data?.impacted_nodes?.forEach((node, i) => {
      const rectEl = gif.elem.querySelectorAll('.layout-shift-screenshot-preview-rect').item(i);
      LitHtml.html`
            ${NodeLink.NodeLink.litTagName}
              @mouseover=${() => () => rectEl.classList.add('highlight')}
              @mouseleave=${() => () => rectEl.classList.remove('highlight')}
              .data=${{
        backendNodeId: node.node_id,
      } as NodeLink.NodeLinkData}>
            </${NodeLink.NodeLink.litTagName}>`;
    });
    this.#nodeLinks.push(nodeLink);
  });


  // clang-format off
    const output = LitHtml.html`
      <div class="layout-shift-gif-dialog">
        <div class="layout-shift-gif-dialog-container">
          ${this.#gif ? LitHtml.html`
            <div class="layout-shift-gif-dialog-gif">
              ${this.#gif.elem}
            </div>` : LitHtml.nothing}
        </div>
        <div class="layout-shift-gif-dialog-controls">
          <div class="layout-shift-gif-dialog-nodes">
            <ul>
              ${this.#lis}
            </ul>
          </div>
          <div class="layout-shift-gif-dialog-time">
            ${this.#layoutShift ? LitHtml.html`
              <span class="time">${i18n.TimeUtilities.preciseMillisToString(Helpers.Timing.microSecondsToMilliseconds(this
