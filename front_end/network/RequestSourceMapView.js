// Copyright (c) 2019 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.


import * as WebTreemap from '../webtreemap/webtreemap.js';


/**
 * @unrestricted
 */
export class RequestSourceMapView extends UI.VBox {
  /**
   * @param {!SDK.NetworkRequest} request
   */
  constructor(request) {
    super();
    this.registerRequiredCSS('network/requestSourceMapView.css');
    this.element.classList.add('request-sourcemap-view');

    this._request = request;
    this._container = this.element.createChild('div', 'treemap-container');
    this._treemap = null;

    this.showPreview();
  }

  showPreview() {
    if (!this._request.sourceMap()) {
      if (!this._emptyWidget) {
        this._emptyWidget = new UI.EmptyWidget(Common.UIString('This request has no source map.'));
        this._emptyWidget.show(this.element);
      }
      return;
    }
  }

  /**
   * @override
   * @return undefined
   */
  async wasShown() {
    const resourceContent = await this._request.requestContent();
    if (resourceContent.error) {
      return;
    }

    const sourceMap = this._request.sourceMap();
    const sourceBytes = sourceMap.attributableSourceBytes(resourceContent.content);

    if (!sourceBytes) {
      return;
    }
    const treemapNodes = this._prepareTreemapNodes(sourceBytes);
    webtreemap.sort(treemapNodes);
    this._treemap = new WebTreemap.TreeMap(treemapNodes, {padding: [18, 3, 3, 3]});
    this._treemap.render(this._container);
    return;
  }

  /**
   * @override
   */
  onResize() {
    if (!this._treemap) {
      return;
    }
    this.element.window().requestAnimationFrame(_ => {
      this._treemap.layout(this._treemap.node, this._container);
    });
  }

  /**
   * Covert file size map to webtreemap data
   * @param {!SDK.TextSourceMap.SourceMappedBytes} sourceBytes
   * @return {webtreemap.Node}
   */
  _prepareTreemapNodes(sourceBytes) {
    function newNode(id) {
      return {
        id,
        size: 0,
      };
    }

    function addNode(source, size, node) {
      const sourcePathSegments = source.replace(sharedPrefix, '').split('/');
      node.size += size;

      sourcePathSegments.forEach(sourcePathSegment => {
        if (!node.children) {
          node.children = [];
        }

        let child = node.children.find(child => child.id === sourcePathSegment);

        if (!child) {
          child = newNode(sourcePathSegment);
          node.children.push(child);
        }
        node = child;
        node.size += size;
      });
    }

    // DFS to generate each treemap node's text
    function addSizeToTitle(node, total) {
      const size = node.size;
      node.id += ` • ${Number.bytesToString(size)} • ${Common.UIString('%.1f\xa0%%', size / total * 100)}`;
      if (node.children) {
        for (const child of node.children) {
          addSizeToTitle(child, total);
        }
      }
    }

    const rootNode = newNode('/');

    // Strip off any shared string prefix, eg. webpack://./webpack/node_modules
    const sharedPrefix = TextUtils.TextUtils.commonPrefix(Array.from(sourceBytes.keys()).filter(key => key !== null));

    for (const [sourceURL, bytes] of sourceBytes) {
      const source = sourceURL === null ? ls`<unmapped>` : sourceURL;
      addNode(source, bytes, rootNode);
    }

    addSizeToTitle(rootNode, rootNode.size);

    return rootNode;
  }
}
