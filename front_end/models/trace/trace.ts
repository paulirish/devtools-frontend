// Copyright 2022 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as FetchNodes from './extras/FetchNodes.js';
import * as FilmStrip from './extras/FilmStrip.js';
import * as MainThreadActivity from './extras/MainThreadActivity.js';
import * as Metadata from './extras/Metadata.js';
import * as ScriptDuplication from './extras/ScriptDuplication.js';
import * as StackTraceForEvent from './extras/StackTraceForEvent.js';
import * as ThirdParties from './extras/ThirdParties.js';
import * as TimelineJSProfile from './extras/TimelineJSProfile.js';
import * as TraceFilter from './extras/TraceFilter.js';
import * as TraceTree from './extras/TraceTree.js';
import * as Handlers from './handlers/handlers.js';
import * as Helpers from './helpers/helpers.js';
import * as Insights from './insights/insights.js';
import * as Lantern from './lantern/lantern.js';
import * as LanternComputationData from './LanternComputationData.js';
import * as TraceModel from './ModelImpl.js';
import * as Processor from './Processor.js';
import * as RootCauses from './root-causes/root-causes.js';
import * as TracingManager from './TracingManager.js';
import * as Types from './types/types.js';

const Extras = {
  FetchNodes,
  FilmStrip,
  MainThreadActivity,
  Metadata,
  ScriptDuplication,
  StackTraceForEvent,
  ThirdParties,
  TimelineJSProfile,
  TraceFilter,
  TraceTree,
};

export {
  Extras,
  Handlers,
  Helpers,
  Insights,
  Lantern,
  LanternComputationData,
  Processor,
  RootCauses,
  TraceModel,
  TracingManager,
  Types,
};
