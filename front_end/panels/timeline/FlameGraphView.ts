// Copyright 2017 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/* eslint-disable rulesdir/no-imperative-dom-api */

import * as Common from '../../core/common/common.js';
import * as i18n from '../../core/i18n/i18n.js';
import * as Trace from '../../models/trace/trace.js';
import * as DataGrid from '../../ui/legacy/components/data_grid/data_grid.js';
import * as UI from '../../ui/legacy/legacy.js';
import * as VisualLogging from '../../ui/visual_logging/visual_logging.js';

import {Category, IsLong} from './TimelineFilters.js';
import type {TimelineModeViewDelegate} from './TimelinePanel.js';
import {rangeForSelection, selectionIsEvent, type TimelineSelection} from './TimelineSelection.js';
import {TimelineTreeView} from './TimelineTreeView.js';
import {TimelineUIUtils} from './TimelineUIUtils.js';
import * as Utils from './utils/utils.js';

const UIStrings = {
  /**
   *@description Text for the start time of an activity
   */
  startTime: 'Start time',
} as const;
const str_ = i18n.i18n.registerUIStrings('panels/timeline/FlameGraphView.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);

export class FlameGraphView extends Common.ObjectWrapper.eventMixin<TimelineTreeView.EventTypes, typeof UI.Widget.VBox>(
    UI.Widget.VBox) implements UI.SearchableView.Searchable {
  private searchResults: Trace.Extras.TraceTree.Node[] = [];
  #parsedTrace: Trace.Handlers.Types.ParsedTrace|null = null;
  #entityMapper: Utils.EntityMapper.EntityMapper|null = null;
  #selectedEvents: Trace.Types.Events.Event[]|null = null;

  currentResult?: number;
  startTime: Trace.Types.Timing.Milli = Trace.Types.Timing.Milli(0);
  endTime: Trace.Types.Timing.Milli = Trace.Types.Timing.Milli(Infinity);

  constructor(
      private readonly delegate: TimelineModeViewDelegate,
      private readonly category: Category,
      private readonly isLong: IsLong,
  ) {
    super(true);
    // this.registerRequiredCSS('panels/timeline/flameGraphView.css');
    this.element.classList.add('timeline-flame-graph-view');
    this.element.tabIndex = -1;
    this.setDefaultFocusedElement(this.element);
    this.element.setAttribute('jslog', `${VisualLogging.pane('flamegraph').track({resize: true})}`);
    this.contentElement.textContent = 'hi mom';
  }
  setModelWithEvents(
      selectedEvents: Trace.Types.Events.Event[]|null,
      parsedTrace: Trace.Handlers.Types.ParsedTrace|null = null,
      entityMappings: Utils.EntityMapper.EntityMapper|null = null,
      ): void {
    this.#parsedTrace = parsedTrace;
    this.#selectedEvents = selectedEvents;
    this.#entityMapper = entityMappings;
    console.log('FlameGraphView.setModelWithEvents', selectedEvents);
    this.refreshTree();
  }

  refreshTree(): void {
    if (!this.isShowing() || !this.#selectedEvents || !this.#selectedEvents.length) {
      return;
    }


    const visibleEventsFilter = new Trace.Extras.TraceFilter.VisibleEventsFilter(Utils.EntryStyles.visibleTypes());

    const tree = new Trace.Extras.TraceTree.TopDownRootNode(this.#selectedEvents, {
      filters: [visibleEventsFilter],
      startTime: this.startTime,
      endTime: this.endTime,
      doNotAggregate: false,
      eventGroupIdCallback: null,
      includeInstantEvents: false
    });

    console.log('FlameGraphView.refreshTree', this.#selectedEvents.length, tree);

    const x = tree.children();
    console.log(x);
  }


  updateContents(selection: TimelineSelection): void {
    const timings = rangeForSelection(selection);
    const timingMilli = Trace.Helpers.Timing.traceWindowMicroSecondsToMilliSeconds(timings);
    // this.setRange(timingMilli.min, timingMilli.max);
    console.log('FlameGraphView.updateContents', selection, timingMilli);
    this.startTime = timingMilli.min;
    this.endTime = timingMilli.max;
    this.refreshTree();
    // if (selectionIsEvent(selection)) {
    //   this.selectEvent(selection.event, true);
    // }
  }



  // UI.SearchableView.Searchable implementation

  onSearchCanceled(): void {
    this.searchResults = [];
    this.currentResult = 0;
  }

  performSearch(searchConfig: UI.SearchableView.SearchConfig, _shouldJump: boolean, _jumpBackwards?: boolean): void {
    this.searchResults = [];
    this.currentResult = 0;
    // if (!this.root) {
    //   return;
    // }
    // const searchRegex = searchConfig.toSearchRegex();
    // this.searchResults = this.root.searchTree(
    //     event => TimelineUIUtils.testContentMatching(event, searchRegex.regex, this.#parsedTrace || undefined));
    // this.searchableView.updateSearchMatchesCount(this.searchResults.length);
  }

  jumpToNextSearchResult(): void {
    if (!this.searchResults.length || this.currentResult === undefined) {
      return;
    }
    // this.selectProfileNode(this.searchResults[this.currentResult], false);
    // this.currentResult = Platform.NumberUtilities.mod(this.currentResult + 1, this.searchResults.length);
  }

  jumpToPreviousSearchResult(): void {
    if (!this.searchResults.length || this.currentResult === undefined) {
      return;
    }
    // this.selectProfileNode(this.searchResults[this.currentResult], false);
    // this.currentResult = Platform.NumberUtilities.mod(this.currentResult - 1, this.searchResults.length);
  }

  supportsCaseSensitiveSearch(): boolean {
    return true;
  }

  supportsRegexSearch(): boolean {
    return true;
  }
}
