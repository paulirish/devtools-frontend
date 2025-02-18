// Copyright 2024 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as i18n from '../../../core/i18n/i18n.js';
import * as Buttons from '../../../ui/components/buttons/buttons.js';
import * as Dialogs from '../../../ui/components/dialogs/dialogs.js';
import * as ComponentHelpers from '../../../ui/components/helpers/helpers.js';
import * as UI from '../../../ui/legacy/legacy.js';
import * as Lit from '../../../ui/lit/lit.js';

import saveDialogStylesRaw from './saveDialog.css.js';

const saveDialogStyles = new CSSStyleSheet();
saveDialogStyles.replaceSync(saveDialogStylesRaw.cssContent);

const {html} = Lit;

const UIStrings = {
  /**
   * @description Text title for trace save dialog.
   */
  includeAnnotations: 'Include annotations',
  /**
   * @description Text title for trace save dialog.
   */
  includeAnnotationsTooltip: 'Include annotations in the saved trace file.',
  /**
   * @description Text title for trace save dialog.
   */
  includeSource: 'Include script source content',
  /**
   * @description Text title for trace save dialog.
   */
  includeSourceTooltip: 'Include script source content in the saved trace file.',
  /**
   * @description Text title for trace save dialog.
   */
  download: 'Download',
};

const str_ = i18n.i18n.registerUIStrings('panels/timeline/components/SaveDialog.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);

export class SaveDialog extends HTMLElement {
  readonly #shadow = this.attachShadow({mode: 'open'});

  #includeAnnotations = true;
  #includeSource = true;

  constructor() {
    super();
  }

  connectedCallback(): void {
    this.#shadow.adoptedStyleSheets = [saveDialogStyles];
    this.#scheduleRender();

    // Prevent the event making its way to the TimelinePanel element which will
    // cause the "Load Profile" context menu to appear.
    this.addEventListener('contextmenu', e => {
      e.stopPropagation();
    });
  }

  #scheduleRender(): void {
    void ComponentHelpers.ScheduledRender.scheduleRender(this, this.#render.bind(this));
  }

  #onAnnotationsChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.#includeAnnotations = target.checked;
  }

  #onSourceChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.#includeSource = target.checked;
  }

  #onDownloadClick(): void {
    const event = new CustomEvent('downloadclick', {
      detail: {
        includeAnnotations: this.#includeAnnotations,
        includeSource: this.#includeSource,
      },
      bubbles: true,
      composed: true,
    });
    this.dispatchEvent(event);
  }

  #render(): Lit.TemplateResult {
    const annotationsCheckbox = UI.UIUtils.CheckboxLabel.create(
        i18nString(UIStrings.includeAnnotations),
        this.#includeAnnotations,
        i18nString(UIStrings.includeAnnotationsTooltip),
    );
    annotationsCheckbox.checkboxElement.addEventListener('change', this.#onAnnotationsChange.bind(this));

    const sourceCheckbox = UI.UIUtils.CheckboxLabel.create(
        i18nString(UIStrings.includeSource), this.#includeSource, i18nString(UIStrings.includeSourceTooltip));
    sourceCheckbox.checkboxElement.addEventListener('change', this.#onSourceChange.bind(this));

    return html`
      <devtools-button-dialog .data=${{
      openOnRender: false,
      iconName: 'download',
      horizontalAlignment: Dialogs.Dialog.DialogHorizontalAlignment.AUTO,
    } as Dialogs.ButtonDialog.ButtonDialogData}>
        <div class="save-dialog-content">
          ${annotationsCheckbox}
          ${sourceCheckbox}
          <devtools-button  @click=${this.#onDownloadClick} .data=${{
      variant: Buttons.Button.Variant.PRIMARY,
    } as Buttons.Button.ButtonData}>
            ${i18nString(UIStrings.download)}
          </devtools-button>
        </div>
      </devtools-button-dialog>
    `;
  }
}

customElements.define('devtools-timeline-save-dialog', SaveDialog);

declare global {
  interface HTMLElementTagNameMap {
    'devtools-timeline-save-dialog': SaveDialog;
  }
}
