// Copyright 2024 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import type * as Platform from '../../../core/platform/platform.js';
import * as Types from '../types/types.js';

import type {HandlerData} from './types.js';

export function getNonResolvedURL(
    entry: Types.Events.Event, parsedTrace?: HandlerData): Platform.DevToolsPath.UrlString|null {
  if (Types.Events.isProfileCall(entry)) {
    return entry.callFrame.url as Platform.DevToolsPath.UrlString;
  }

  if (Types.Events.isSyntheticNetworkRequest(entry)) {
    return entry.args.data.url as Platform.DevToolsPath.UrlString;
  }

  if (entry.args?.data?.stackTrace && entry.args.data.stackTrace.length > 0) {
    return entry.args.data.stackTrace[0].url as Platform.DevToolsPath.UrlString;
  }

  // ParseHTML events store the URL under beginData, not data.
  if (Types.Events.isParseHTML(entry)) {
    return entry.args.beginData.url as Platform.DevToolsPath.UrlString;
  }

  if (parsedTrace) {
    // DecodeImage events use the URL from the relevant PaintImage event.
    if (Types.Events.isDecodeImage(entry)) {
      const paintEvent = parsedTrace.ImagePainting.paintImageForEvent.get(entry);
      return paintEvent ? getNonResolvedURL(paintEvent, parsedTrace) : null;
    }

    // DrawLazyPixelRef events use the URL from the relevant PaintImage event.
    if (Types.Events.isDrawLazyPixelRef(entry) && entry.args?.LazyPixelRef) {
      const paintEvent = parsedTrace.ImagePainting.paintImageByDrawLazyPixelRef.get(entry.args.LazyPixelRef);
      return paintEvent ? getNonResolvedURL(paintEvent, parsedTrace) : null;
    }
  }

  // For all other events, try to see if the URL is provided, else return null.
  if (entry.args?.data?.url) {
    return entry.args.data.url as Platform.DevToolsPath.UrlString;
  }

  return null;
}
