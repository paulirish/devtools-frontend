// Copyright 2025 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import type * as puppeteer from 'puppeteer-core';

import {AsyncScope} from '../../conductor/async-scope.js';

export class PageWrapper {
  page: puppeteer.Page;
  evaluate: puppeteer.Page['evaluate'];
  waitForNavigation: puppeteer.Page['waitForNavigation'];
  bringToFront: puppeteer.Page['bringToFront'];
  evaluateOnNewDocument: puppeteer.Page['evaluateOnNewDocument'];
  removeScriptToEvaluateOnNewDocument: puppeteer.Page['removeScriptToEvaluateOnNewDocument'];
  locator: puppeteer.Page['locator'];

  constructor(page: puppeteer.Page) {
    this.page = page;
    this.evaluate = page.evaluate.bind(page);
    this.bringToFront = page.bringToFront.bind(page);
    this.evaluateOnNewDocument = page.evaluateOnNewDocument.bind(page);
    this.removeScriptToEvaluateOnNewDocument = page.removeScriptToEvaluateOnNewDocument.bind(page);
    this.waitForNavigation = page.waitForNavigation.bind(page);
    this.locator = page.locator.bind(page);
  }

  async waitForFunction<T>(fn: () => Promise<T|undefined>, asyncScope = new AsyncScope(), description?: string) {
    const innerFunction = async () => {
      while (true) {
        AsyncScope.abortSignal?.throwIfAborted();
        const result = await fn();
        AsyncScope.abortSignal?.throwIfAborted();
        if (result) {
          return result;
        }
        await this.timeout(100);
      }
    };
    return await asyncScope.exec(innerFunction, description);
  }

  timeout(duration: number) {
    return new Promise<void>(resolve => setTimeout(resolve, duration));
  }

  async screenshot(): Promise<string> {
    await this.bringToFront();
    return await this.page.screenshot({
      encoding: 'base64',
    });
  }

  async reload() {
    await this.page.reload();
  }

  async raf() {
    await this.page.evaluate(() => {
      return new Promise(resolve => window.requestAnimationFrame(resolve));
    });
  }
}
