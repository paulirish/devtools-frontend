// Copyright 2022 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/* eslint-disable no-unused-private-class-members, @typescript-eslint/naming-convention */

export type MicroSeconds = number&{_tag: 'MicroSeconds'};
export const MicroSeconds = (value: number): MicroSeconds => value as MicroSeconds;

export type MilliSeconds = number&{_tag: 'MilliSeconds'};
export const MilliSeconds = (value: number): MilliSeconds => value as MilliSeconds;

export type Seconds = number&{_tag: 'Seconds'};
export const Seconds = (value: number): Seconds => value as Seconds;

export const enum TimeUnit {
  MICROSECONDS = 0,
  MILLISECONDS = 1,
  SECONDS = 2,
  MINUTES = 3,
}

// Other types.

export interface TraceWindow<TimeFormat extends MicroSeconds|MilliSeconds> {
  min: TimeFormat;
  max: TimeFormat;
  range: TimeFormat;
}

export type TraceWindowMicroSeconds = TraceWindow<MicroSeconds>;
export type TraceWindowMilliSeconds = TraceWindow<MilliSeconds>;
