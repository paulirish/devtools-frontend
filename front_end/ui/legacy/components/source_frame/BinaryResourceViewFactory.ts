// Copyright 2019 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import type * as Common from '../../../../core/common/common.js';
import type * as Platform from '../../../../core/platform/platform.js';
import * as TextUtils from '../../../../models/text_utils/text_utils.js';

import {ResourceSourceFrame} from './ResourceSourceFrame.js';
import {StreamingContentHexView} from './StreamingContentHexView.js';

export class BinaryResourceViewFactory {
  private streamingContent: TextUtils.StreamingContentData.StreamingContentData;
  private readonly contentUrl: Platform.DevToolsPath.UrlString;
  private readonly resourceType: Common.ResourceType.ResourceType;
  private arrayPromise: Promise<Uint8Array>|null;
  private hexPromise: Promise<string>|null;
  private utf8Promise: Promise<string>|null;
  constructor(
      content: TextUtils.StreamingContentData.StreamingContentData, contentUrl: Platform.DevToolsPath.UrlString,
      resourceType: Common.ResourceType.ResourceType) {
    this.streamingContent = content;
    this.contentUrl = contentUrl;
    this.resourceType = resourceType;
    this.arrayPromise = null;
    this.hexPromise = null;
    this.utf8Promise = null;
  }

  private async fetchContentAsArray(): Promise<Uint8Array> {
    if (!this.arrayPromise) {
      this.arrayPromise = new Promise(async resolve => {
        const fetchResponse = await fetch('data:;base64,' + this.streamingContent.content().base64);
        resolve(new Uint8Array(await fetchResponse.arrayBuffer()));
      });
    }
    return await this.arrayPromise;
  }

  async hex(): Promise<string> {
    if (!this.hexPromise) {
      this.hexPromise = new Promise(async resolve => {
        const content = await this.fetchContentAsArray();
        const hexString = BinaryResourceViewFactory.uint8ArrayToHexString(content);
        resolve(hexString);
      });
    }

    return this.hexPromise;
  }

  base64(): string {
    return this.streamingContent.content().base64;
  }

  async utf8(): Promise<string> {
    if (!this.utf8Promise) {
      this.utf8Promise = new Promise(async resolve => {
        const content = await this.fetchContentAsArray();
        const utf8String = new TextDecoder('utf8').decode(content);
        resolve(utf8String);
      });
    }

    return this.utf8Promise;
  }

  createBase64View(): ResourceSourceFrame {
    return new ResourceSourceFrame(
        TextUtils.StaticContentProvider.StaticContentProvider.fromString(
            this.contentUrl, this.resourceType, this.streamingContent.content().base64),
        this.resourceType.canonicalMimeType(), {lineNumbers: false, lineWrapping: true});
  }

  createHexView(): StreamingContentHexView {
    return new StreamingContentHexView(this.streamingContent);
  }

  createUtf8View(): ResourceSourceFrame {
    const utf8fn = (): Promise<TextUtils.ContentData.ContentData> =>
        this.utf8().then(str => new TextUtils.ContentData.ContentData(str, /* isBase64 */ false, 'text/plain'));
    const utf8ContentProvider =
        new TextUtils.StaticContentProvider.StaticContentProvider(this.contentUrl, this.resourceType, utf8fn);
    return new ResourceSourceFrame(
        utf8ContentProvider, this.resourceType.canonicalMimeType(), {lineNumbers: true, lineWrapping: true});
  }

  static uint8ArrayToHexString(uint8Array: Uint8Array): string {
    let output = '';
    for (let i = 0; i < uint8Array.length; i++) {
      output += BinaryResourceViewFactory.numberToHex(uint8Array[i], 2);
    }
    return output;
  }

  static numberToHex(number: number, padding: number): string {
    let hex = number.toString(16);
    while (hex.length < padding) {
      hex = '0' + hex;
    }
    return hex;
  }
}
