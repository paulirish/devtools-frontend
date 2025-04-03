// Copyright 2024 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/* eslint-disable rulesdir/no-lit-render-outside-of-view */

import './SidebarSingleInsightSet.js';

import * as Host from '../../../core/host/host.js';
import * as i18n from '../../../core/i18n/i18n.js';
import type * as Platform from '../../../core/platform/platform.js';
import * as Trace from '../../../models/trace/trace.js';
import * as Buttons from '../../../ui/components/buttons/buttons.js';
import * as ComponentHelpers from '../../../ui/components/helpers/helpers.js';
import * as Lit from '../../../ui/lit/lit.js';
import * as Utils from '../utils/utils.js';

import * as Insights from './insights/insights.js';
import type {ActiveInsight} from './Sidebar.js';
import stylesRaw from './sidebarInsightsTab.css.js';
import {SidebarSingleInsightSet, type SidebarSingleInsightSetData} from './SidebarSingleInsightSet.js';

// TODO(crbug.com/391381439): Fully migrate off of constructed style sheets.
const styles = new CSSStyleSheet();
styles.replaceSync(stylesRaw.cssText);

const {html} = Lit;

const FEEDBACK_URL = 'https://crbug.com/371170842' as Platform.DevToolsPath.UrlString;

const UIStrings = {
  /**
   *@description text show in feedback button
   */
  feedbackButton: 'Feedback',
  /**
   *@description text show in feedback tooltip
   */
  feedbackTooltip: 'Insights is an experimental feature. Your feedback will help us improve it.',
} as const;

const str_ = i18n.i18n.registerUIStrings('panels/timeline/components/SidebarInsightsTab.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);

export class SidebarInsightsTab extends HTMLElement {
  readonly #boundRender = this.#render.bind(this);
  readonly #shadow = this.attachShadow({mode: 'open'});

  #parsedTrace: Trace.Handlers.Types.ParsedTrace|null = null;
  #traceMetadata: Trace.Types.File.MetaData|null = null;
  #insights: Trace.Insights.Types.TraceInsightSets|null = null;
  #activeInsight: ActiveInsight|null = null;
  #selectedCategory = Trace.Insights.Types.InsightCategory.ALL;
  /**
   * When a trace has sets of insights, we show an accordion with each
   * set within. A set can be specific to a single navigation, or include the
   * beginning of the trace up to the first navigation.
   * You can only have one of these open at any time, and we track it via this ID.
   */
  #selectedInsightSetKey: string|null = null;

  connectedCallback(): void {
    this.#shadow.adoptedStyleSheets = [styles];
  }

  // TODO(paulirish): add back a disconnectedCallback() to avoid memory leaks that doesn't cause b/372943062

  set parsedTrace(data: Trace.Handlers.Types.ParsedTrace|null) {
    if (data === this.#parsedTrace) {
      return;
    }
    this.#parsedTrace = data;
    this.#selectedInsightSetKey = null;

    void ComponentHelpers.ScheduledRender.scheduleRender(this, this.#boundRender);
  }

  set traceMetadata(data: Trace.Types.File.MetaData|null) {
    if (data === this.#traceMetadata) {
      return;
    }
    this.#traceMetadata = data;
    this.#selectedInsightSetKey = null;

    void ComponentHelpers.ScheduledRender.scheduleRender(this, this.#boundRender);
  }

  set insights(data: Trace.Insights.Types.TraceInsightSets|null) {
    if (data === this.#insights) {
      return;
    }

    this.#selectedInsightSetKey = null;
    if (!data || !this.#parsedTrace) {
      return;
    }

    const trivialThreshold = Trace.Helpers.Timing.milliToMicro(Trace.Types.Timing.Milli(5000));

    // If there's no insights, no navigation, and the duration is trivial, then don't show it at all.
    // These are typically the very short "before reload" time ranges.
    const nonTrivialEntries = Array.from(data?.entries()).filter(([id, insightSet]) => {
      const {shownInsights} = SidebarSingleInsightSet.categorizeInsights(data, id, this.#selectedCategory);
      return shownInsights.length > 0 || insightSet.navigation || insightSet.bounds.range > trivialThreshold;
    });
    this.#insights = new Map(nonTrivialEntries);

    // Select by default the first non-trivial insight set:
    // - greater than 5s in duration
    // - or, has a navigation
    // In practice this means selecting either the first or the second insight set.
    const insightSets = [...this.#insights.values()];
    this.#selectedInsightSetKey =
        insightSets.find(insightSet => insightSet.navigation || insightSet.bounds.range > trivialThreshold)?.id
        // If everything is "trivial", just select the first one.
        ?? insightSets[0]?.id ?? null;

    void ComponentHelpers.ScheduledRender.scheduleRender(this, this.#boundRender);
  }

  set activeInsight(active: ActiveInsight|null) {
    if (active === this.#activeInsight) {
      return;
    }
    this.#activeInsight = active;

    // Only update the insightSetKey if there is an active insight. Otherwise, closing an insight
    // would also collapse the insight set. Usually the proper insight set is already set because
    // the user has it open already in order for this setter to be called, but insights can also
    // be activated by clicking on a insight chip in the Summary panel, which may require opening
    // a different insight set.
    if (this.#activeInsight) {
      this.#selectedInsightSetKey = this.#activeInsight.insightSetKey;
    }
    void ComponentHelpers.ScheduledRender.scheduleRender(this, this.#boundRender);
  }

  #insightSetToggled(id: string): void {
    this.#selectedInsightSetKey = this.#selectedInsightSetKey === id ? null : id;
    // Update the active insight set.
    if (this.#selectedInsightSetKey !== this.#activeInsight?.insightSetKey) {
      this.dispatchEvent(new Insights.SidebarInsight.InsightDeactivated());
    }
    void ComponentHelpers.ScheduledRender.scheduleRender(this, this.#boundRender);
  }

  #insightSetHovered(id: string): void {
    const data = this.#insights?.get(id);
    data && this.dispatchEvent(new Insights.SidebarInsight.InsightSetHovered(data.bounds));
  }

  #insightSetUnhovered(): void {
    this.dispatchEvent(new Insights.SidebarInsight.InsightSetHovered());
  }

  #onFeedbackClick(): void {
    Host.InspectorFrontendHost.InspectorFrontendHostInstance.openInNewTab(FEEDBACK_URL);
  }

  #onZoomClick(event: Event, id: string): void {
    event.stopPropagation();
    const data = this.#insights?.get(id);
    if (!data) {
      return;
    }
    this.dispatchEvent(new Insights.SidebarInsight.InsightSetZoom(data.bounds));
  }

  #renderZoomButton(insightSetToggled: boolean): Lit.TemplateResult {
    const classes = Lit.Directives.classMap({
      'zoom-icon': true,
      active: insightSetToggled,
    });

    // clang-format off
    return html`
    <div class=${classes}>
        <devtools-button .data=${{
          variant: Buttons.Button.Variant.ICON,
          iconName: 'center-focus-weak',
          size: Buttons.Button.Size.SMALL,
        } as Buttons.Button.ButtonData}
      ></devtools-button></div>`;
    // clang-format on
  }

  #renderDropdownIcon(insightSetToggled: boolean): Lit.TemplateResult {
    const containerClasses = Lit.Directives.classMap({
      'dropdown-icon': true,
      active: insightSetToggled,
    });

    // clang-format off
    return html`
      <div class=${containerClasses}>
        <devtools-button .data=${{
          variant: Buttons.Button.Variant.ICON,
          iconName: 'chevron-right',
          size: Buttons.Button.Size.SMALL,
        } as Buttons.Button.ButtonData}
      ></devtools-button></div>
    `;
    // clang-format on
  }

  #render(): void {
    if (!this.#parsedTrace || !this.#insights) {
      Lit.render(Lit.nothing, this.#shadow, {host: this});
      return;
    }

    const hasMultipleInsightSets = this.#insights.size > 1;
    const labels = Utils.Helpers.createUrlLabels([...this.#insights.values()].map(({url}) => url));

    const contents =
        // clang-format off
     html`
      <div class="insight-sets-wrapper">
        ${[...this.#insights.values()].map(({id, url}, index) => {
          const data: SidebarSingleInsightSetData = {
            insights: this.#insights,
            insightSetKey: id,
            activeCategory: this.#selectedCategory,
            activeInsight: this.#activeInsight,
            parsedTrace: this.#parsedTrace,
            traceMetadata: this.#traceMetadata,
          };

          const contents = html`
            <devtools-performance-sidebar-single-navigation
              .data=${data}>
            </devtools-performance-sidebar-single-navigation>
          `;

          if (hasMultipleInsightSets) {
            return html`<details
              ?open=${id === this.#selectedInsightSetKey}
            >
              <summary
                @click=${() => this.#insightSetToggled(id)}
                @mouseenter=${() => this.#insightSetHovered(id)}
                @mouseleave=${() => this.#insightSetUnhovered()}
                title=${url.href}>
                ${this.#renderDropdownIcon(id === this.#selectedInsightSetKey)}
                <span>${labels[index]}</span>
                <span class='zoom-button' @click=${(event: Event) => this.#onZoomClick(event, id)}>${this.#renderZoomButton(id === this.#selectedInsightSetKey)}</span>
              </summary>
              ${contents}
            </details>`;
          }

          return contents;
        })}
      </div>

      <div class="feedback-wrapper">
        <devtools-button .variant=${Buttons.Button.Variant.OUTLINED} .iconName=${'experiment'} @click=${this.#onFeedbackClick}>
          ${i18nString(UIStrings.feedbackButton)}
        </devtools-button>

        <p class="tooltip">${i18nString(UIStrings.feedbackTooltip)}</p>
      </div>
    `;
    // clang-format on

    // Insight components contain state, so to prevent insights from previous trace loads breaking things we use the parsedTrace
    // as a render key.
    // Note: newer Lit has `keyed`, but we don't have that, so we do it manually. https://lit.dev/docs/templates/directives/#keyed
    const result = Lit.Directives.repeat([contents], () => this.#parsedTrace, template => template);
    Lit.render(result, this.#shadow, {host: this});
  }
}

customElements.define('devtools-performance-sidebar-insights', SidebarInsightsTab);

declare global {
  interface HTMLElementTagNameMap {
    'devtools-performance-sidebar-insights': SidebarInsightsTab;
  }
}
