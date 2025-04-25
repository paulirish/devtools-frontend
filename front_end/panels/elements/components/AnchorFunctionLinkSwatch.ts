// Copyright (c) 2024 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import '../../../ui/components/icon_button/icon_button.js';
import '../../../ui/legacy/components/inline_editor/inline_editor.js';

/* eslint-disable rulesdir/no-lit-render-outside-of-view */

import * as i18n from '../../../core/i18n/i18n.js';
import type * as SDK from '../../../core/sdk/sdk.js';
import type * as InlineEditor from '../../../ui/legacy/components/inline_editor/inline_editor.js';
import * as Lit from '../../../ui/lit/lit.js';
import * as VisualLogging from '../../../ui/visual_logging/visual_logging.js';

import anchorFunctionLinkSwatchStyles from './anchorFunctionLinkSwatch.css.js';

const UIStrings = {
  /**
   *@description Title in the styles tab for the icon button for jumping to the anchor node.
   */
  jumpToAnchorNode: 'Jump to anchor node',
  /**
   *@description Text displayed in a tooltip shown when hovering over a CSS property value references a name that's not
   *             defined and can't be linked to.
   *@example {--my-linkable-name} PH1
   */
  sIsNotDefined: '{PH1} is not defined',
} as const;
const str_ = i18n.i18n.registerUIStrings('panels/elements/components/AnchorFunctionLinkSwatch.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
const {render, html} = Lit;

// Clang format is messing up the formatting of the functions below. It's best
// to leave formatting off for this type declaration.
// clang-format off
export interface AnchorFunctionLinkSwatchData {
  onLinkActivate: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  // The dashed identifier for the anchor function.
  // It is undefined when we're rendering for implicit or default anchor cases.
  identifier?: string;
  // The anchor node, it is undefined when it is not resolved correctly.
  anchorNode?: SDK.DOMModel.DOMNode;
  // Whether to add a space after the link or not. This is needed because for some cases,
  // even though the link swatch is created; there might not be any links rendered for it.
  // So adding the space from the outside causes an unnecessary space to be rendered for these cases.
  // That's the reason we're controlling space behavior from the inside.
  // However for `position-anchor: --dashed-ident` case, there is no space needed at all.
  // That's why we need the parameter so that we don't render a space for that case.
  needsSpace?: boolean;
}
// clang-format on

export class AnchorFunctionLinkSwatch extends HTMLElement {
  readonly #shadow = this.attachShadow({mode: 'open'});
  #data: AnchorFunctionLinkSwatchData;

  constructor(data: AnchorFunctionLinkSwatchData) {
    super();
    this.#data = data;
  }

  dataForTest(): AnchorFunctionLinkSwatchData {
    return this.#data;
  }

  connectedCallback(): void {
    this.render();
  }

  set data(data: AnchorFunctionLinkSwatchData) {
    this.#data = data;
    this.render();
  }

  #handleIconClick(ev: MouseEvent): void {
    ev.stopPropagation();
    this.#data.onLinkActivate();
  }

  protected render(): void {
    if (!this.#data.identifier && !this.#data.anchorNode) {
      return;
    }

    if (this.#data.identifier) {
      render(
          // clang-format off
          html`<style>${anchorFunctionLinkSwatchStyles.cssText}</style>
               <devtools-link-swatch
                @mouseenter=${this.#data.onMouseEnter}
                @mouseleave=${this.#data.onMouseLeave}
                .data=${{
                  text: this.#data.identifier,
                  tooltip: this.#data.anchorNode ? undefined :
                   {title:  i18nString(UIStrings.sIsNotDefined, {PH1: this.#data.identifier})},
                  isDefined: Boolean(this.#data.anchorNode),
                  jslogContext: 'anchor-link',
                  onLinkActivate: this.#data.onLinkActivate,
                } as InlineEditor.LinkSwatch.LinkSwatchRenderData}
                ></devtools-link-swatch>${this.#data.needsSpace ? ' ' : ''}`,
          // clang-format on
          this.#shadow, {host: this});
    } else {
      // clang-format off
      render(html`<style>${anchorFunctionLinkSwatchStyles.cssText}</style>
                  <devtools-icon
                   role='button'
                   title=${i18nString(UIStrings.jumpToAnchorNode)}
                   class='icon-link'
                   name='open-externally'
                   jslog=${VisualLogging.action('jump-to-anchor-node').track({click: true})}
                   @mouseenter=${this.#data.onMouseEnter}
                   @mouseleave=${this.#data.onMouseLeave}
                   @mousedown=${(ev: MouseEvent) => ev.stopPropagation()}
                   @click=${this.#handleIconClick}
                  ></devtools-icon>${this.#data.needsSpace ? ' ' : ''}`, this.#shadow, {host: this});
      // clang-format on
    }
  }
}

customElements.define('devtools-anchor-function-link-swatch', AnchorFunctionLinkSwatch);

declare global {
  interface HTMLElementTagNameMap {
    'devtools-anchor-function-link-swatch': AnchorFunctionLinkSwatch;
  }
}
