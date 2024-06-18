// Copyright 2024 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @license
 * Copyright 2024 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {type Metrics} from '../types/lantern.js';

export {FirstContentfulPaint} from './FirstContentfulPaint.js';
export {Interactive} from './Interactive.js';
export {LargestContentfulPaint} from './LargestContentfulPaint.js';
export {MaxPotentialFID} from './MaxPotentialFID.js';
export {SpeedIndex} from './SpeedIndex.js';
export {TotalBlockingTime} from './TotalBlockingTime.js';
export type Result<T = any> = Metrics.Result;
