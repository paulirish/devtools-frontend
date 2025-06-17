// Copyright 2024 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import './Table.js';

import * as i18n from '../../../../core/i18n/i18n.js';
import type {LCPPhasesInsightModel} from '../../../../models/trace/insights/LCPPhases.js';
import * as Trace from '../../../../models/trace/trace.js';
import * as Lit from '../../../../ui/lit/lit.js';
import type * as Overlays from '../../overlays/overlays.js';

import {BaseInsightComponent} from './BaseInsightComponent.js';
import type {TableData} from './Table.js';

const {UIStrings, i18nString} = Trace.Insights.Models.LCPPhases;

const {html} = Lit;

interface PhaseData {
  phase: string;
  timing: number|Trace.Types.Timing.Milli;
}

export class LCPPhases extends BaseInsightComponent<LCPPhasesInsightModel> {
  static override readonly litTagName = Lit.StaticHtml.literal`devtools-performance-lcp-by-phases`;
  override internalName = 'lcp-by-phase';
  #overlay: Overlays.Overlays.TimespanBreakdown|null = null;

  protected override hasAskAiSupport(): boolean {
    return true;
  }

  #getPhaseData(): PhaseData[] {
    if (!this.model) {
      return [];
    }

    const timing = this.model.lcpMs;
    const phases = this.model.phases;

    if (!timing || !phases) {
      return [];
    }

    const {ttfb, loadDelay, loadTime, renderDelay} = phases;

    if (loadDelay && loadTime) {
      const phaseData = [
        {phase: i18nString(UIStrings.timeToFirstByte), timing: ttfb},
        {
          phase: i18nString(UIStrings.resourceLoadDelay),
          timing: loadDelay,
        },
        {
          phase: i18nString(UIStrings.resourceLoadDuration),
          timing: loadTime,
        },
        {
          phase: i18nString(UIStrings.elementRenderDelay),
          timing: renderDelay,
        },
      ];
      return phaseData;
    }

    // If the lcp is text, we only have ttfb and render delay.
    const phaseData = [
      {phase: i18nString(UIStrings.timeToFirstByte), timing: ttfb},
      {
        phase: i18nString(UIStrings.elementRenderDelay),
        timing: renderDelay,
      },
    ];
    return phaseData;
  }

  override createOverlays(): Overlays.Overlays.TimelineOverlay[] {
    this.#overlay = null;

    if (!this.model) {
      return [];
    }

    const {phases, lcpTs} = this.model;
    if (!phases || !lcpTs) {
      return [];
    }
    const sections: Overlays.Overlays.TimespanBreakdown['sections'] = [];

    const overlays: Overlays.Overlays.TimelineOverlay[] = [];
    if (this.model.lcpRequest) {
      overlays.push({type: 'ENTRY_OUTLINE', entry: this.model.lcpRequest, outlineReason: 'INFO'});
    }

    /** Image LCP. 4 phases means 5 timestamps
     *
     *       |  ttfb   |    loadDelay     |     loadTime    |    renderDelay    |
     *                                                                          ^ lcpTs
     *                                                      ^ loadedTs
     *                                    ^ loadStartTs
     *                 ^ ttfbTs
     *       ^ navStartTs
     */

    if (phases.loadDelay && phases.loadTime) {
      // Microsecond timestamps
      const loadedTs = lcpTs - Trace.Helpers.Timing.milliToMicro(phases.renderDelay);
      const loadStartTs = loadedTs - Trace.Helpers.Timing.milliToMicro(phases.loadTime);
      const ttfbTs = loadStartTs - Trace.Helpers.Timing.milliToMicro(phases.loadDelay);
      const navStartTs = loadStartTs - Trace.Helpers.Timing.milliToMicro(phases.ttfb);
      const timestamps = [navStartTs, ttfbTs, loadStartTs, loadedTs, lcpTs] as Trace.Types.Timing.Micro[];

      const lcpImagePhases = [
        UIStrings.timeToFirstByte, UIStrings.resourceLoadDelay, UIStrings.resourceLoadDuration,
        UIStrings.elementRenderDelay
      ];

      lcpImagePhases.forEach((phaseLabel, i) => {
        const bounds = Trace.Helpers.Timing.traceWindowFromMicroSeconds(timestamps[i], timestamps[i + 1]);
        sections.push({bounds, label: phaseLabel, showDuration: true});
      });

    } else {
      /** Text LCP. 2 phases, thus 3 timestamps
       *
       *       |          ttfb           |             renderDelay              |
       *                                                                        ^ lcpTs
       *                                 ^ ttfbTs
       *       ^ navStartTs
       */
      const ttfbTs = lcpTs - Trace.Helpers.Timing.milliToMicro(phases.renderDelay);
      const navStartTs = ttfbTs - Trace.Helpers.Timing.milliToMicro(phases.ttfb);
      const timestamps = [navStartTs, ttfbTs, lcpTs] as Trace.Types.Timing.Micro[];

      const lcpTextPhases = [UIStrings.timeToFirstByte, UIStrings.elementRenderDelay];

      lcpTextPhases.forEach((phaseLabel, i) => {
        const bounds = Trace.Helpers.Timing.traceWindowFromMicroSeconds(timestamps[i], timestamps[i + 1]);
        sections.push({bounds, label: phaseLabel, showDuration: true});
      });
    }

    this.#overlay = {
      type: 'TIMESPAN_BREAKDOWN',
      sections,
    };
    overlays.push(this.#overlay);
    return overlays;
  }

  #renderFieldPhases(): Lit.LitTemplate|null {
    if (!this.fieldMetrics) {
      return null;
    }

    const {ttfb, loadDelay, loadDuration, renderDelay} = this.fieldMetrics.lcpPhases;
    if (!ttfb || !loadDelay || !loadDuration || !renderDelay) {
      return null;
    }

    const ttfbMillis = i18n.TimeUtilities.preciseMillisToString(Trace.Helpers.Timing.microToMilli(ttfb.value));
    const loadDelayMillis =
        i18n.TimeUtilities.preciseMillisToString(Trace.Helpers.Timing.microToMilli(loadDelay.value));
    const loadDurationMillis =
        i18n.TimeUtilities.preciseMillisToString(Trace.Helpers.Timing.microToMilli(loadDuration.value));
    const renderDelayMillis =
        i18n.TimeUtilities.preciseMillisToString(Trace.Helpers.Timing.microToMilli(renderDelay.value));

    const rows = [
      {values: [i18nString(UIStrings.timeToFirstByte), ttfbMillis]},
      {values: [i18nString(UIStrings.resourceLoadDelay), loadDelayMillis]},
      {values: [i18nString(UIStrings.resourceLoadDuration), loadDurationMillis]},
      {values: [i18nString(UIStrings.elementRenderDelay), renderDelayMillis]},
    ];

    // clang-format off
    return html`
      <div class="insight-section">
        <devtools-performance-table
          .data=${{
            insight: this,
            headers: [i18nString(UIStrings.phase), i18nString(UIStrings.fieldDuration)],
            rows,
          } as TableData}>
        </devtools-performance-table>
      </div>
    `;
    // clang-format on
  }

  override toggleTemporaryOverlays(
      overlays: Overlays.Overlays.TimelineOverlay[]|null, options: Overlays.Overlays.TimelineOverlaySetOptions): void {
    super.toggleTemporaryOverlays(overlays, {...options, updateTraceWindowPercentage: 0});
  }

  override getOverlayOptionsForInitialOverlays(): Overlays.Overlays.TimelineOverlaySetOptions {
    return {updateTraceWindow: true, updateTraceWindowPercentage: 0};
  }

  override renderContent(): Lit.LitTemplate {
    if (!this.model) {
      return Lit.nothing;
    }

    const phaseData = this.#getPhaseData();
    if (!phaseData.length) {
      return html`<div class="insight-section">${i18nString(UIStrings.noLcp)}</div>`;
    }

    const rows = phaseData.map(({phase, timing}) => {
      const section = this.#overlay?.sections.find(section => phase === section.label);
      return {
        values: [phase, i18n.TimeUtilities.preciseMillisToString(timing)],
        overlays: section && [{
                    type: 'TIMESPAN_BREAKDOWN',
                    sections: [section],
                  }],
      };
    });

    // clang-format off
    const sections: Lit.LitTemplate[] = [html`
      <div class="insight-section">
        <devtools-performance-table
          .data=${{
            insight: this,
            headers: [i18nString(UIStrings.phase), i18nString(UIStrings.duration)],
            rows,
          } as TableData}>
        </devtools-performance-table>
      </div>`
    ];
    // clang-format on

    const fieldDataSection = this.#renderFieldPhases();
    if (fieldDataSection) {
      sections.push(fieldDataSection);
    }

    return html`${sections}`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'devtools-performance-lcp-by-phases': LCPPhases;
  }
}

customElements.define('devtools-performance-lcp-by-phases', LCPPhases);
