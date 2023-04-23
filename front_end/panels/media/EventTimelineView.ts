// Copyright 2019 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as i18n from '../../core/i18n/i18n.js';
import * as VisualLogging from '../../ui/visual_logging/visual_logging.js';

import {type PlayerEvent} from './MediaModel.js';
import {
  ColdColorScheme,
  type Event,
  type EventProperties,
  HotColorScheme,
  TickingFlameChart,
} from './TickingFlameChart.js';

// Has to be a double, see https://v8.dev/blog/react-cliff
const NO_NORMALIZED_TIMESTAMP = -1.5;

const UIStrings = {
  /**
   *@description Title of the 'Playback Status' button
   */
  playbackStatus: 'Playback Status',
  /**
   *@description Title of the 'Buffering Status' button
   */
  bufferingStatus: 'Buffering Status',
};
const str_ = i18n.i18n.registerUIStrings('panels/media/EventTimelineView.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);

type State = {
  [key: string]: string,
};
export class PlayerEventsTimeline extends TickingFlameChart {
  private normalizedTimestamp: number;
  private playbackStatusLastEvent: Event|null;
  private audioBufferingStateEvent: Event|null;
  private videoBufferingStateEvent: Event|null;

  constructor() {
    super();

    this.element.setAttribute('jslog', `${VisualLogging.pane('timeline')}`);

    this.addGroup(i18nString(UIStrings.playbackStatus), 2);
    this.addGroup(i18nString(UIStrings.bufferingStatus), 2);  // video on top, audio on bottom

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

  onEvent(event: PlayerEvent): void {
    console.log('media event', event);
  }
}
