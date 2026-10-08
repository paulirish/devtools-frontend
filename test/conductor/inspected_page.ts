// Copyright 2026 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import type * as puppeteer from 'puppeteer-core';

export interface InspectedPage {
  serverPort: number;
  goTo(url: string, options?: puppeteer.WaitForOptions): Promise<void>;
  goToHtml(html: string): Promise<void>;
  goToResource(path: string, options?: puppeteer.WaitForOptions): Promise<void>;
  goToResourceWithCustomHost(host: string, path: string): Promise<void>;
  getResourcesPath(host?: string): string;
  domain(host?: string): string;
  getOopifResourcesPath(): string;
  overridePermissions(permissions: puppeteer.Permission[]): Promise<void>;

  waitForSelector<Selector extends string>(selector: Selector,
                                           /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
                                           options?: puppeteer.WaitForSelectorOptions): Promise<any>;

  evaluate<T>(fn: (...args: any[]) => T, ...args: any[]): Promise<T>;

  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  [key: string]: any;
}
