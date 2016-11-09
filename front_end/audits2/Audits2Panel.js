// Copyright (c) 2016 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/**
 * @unrestricted
 */
WebInspector.Audits2Panel = class extends WebInspector.Panel {
  constructor() {
    super('audits2');
    this.contentElement.classList.add('hbox');


    const logo = createElement('img');
    logo.src = 'data:image/png;base64,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';
    logo.style.cssText = 'width: 101x; height: 115px;';
    this.contentElement.appendChild(logo);

    var uiElement = this._createLauncherUI();
    this.contentElement.appendChild(uiElement);

    // this._settings = new Map();
    // for (var type of ['pwa', 'best-practices', 'perf']) {
    //     console.log(type)
    //   this._settings.set(type, WebInspector.settings.createSetting('audits2-' + type, true));
    // }


    // this._resultElement = footer.createChild('div', 'overflow-auto');
  }


  _createLauncherUI() {
    var uiElement = createElement('div');
    uiElement.classList.add('vbox');

    this._headerElement = uiElement.createChild('header');
    this._headerElement.textContent = WebInspector.UIString('Audits opens with a piece of great flavor text that succinctly explains its purpose and why you should be auditing every page under the sun!');
    uiElement.appendChild(this._headerElement);

    var auditSelectorForm = uiElement.createChild('form');
    var pwaLabel = createCheckboxLabel(WebInspector.UIString('Consider Progressive Web App guidelines'), true);
    var bpLabel = createCheckboxLabel(WebInspector.UIString('Consider modern web best practices'), true);
    var perfLabel = createCheckboxLabel(WebInspector.UIString('Collect performance metrics and diagnostics'), true);

    auditSelectorForm.appendChild(pwaLabel);
    auditSelectorForm.appendChild(bpLabel);
    auditSelectorForm.appendChild(perfLabel);

    auditSelectorForm.appendChild(createTextButton(WebInspector.UIString('Audit this page'), this._start.bind(this)));

    this._footerElement = uiElement.createChild('footer');
    this._footerElement.appendChild(createTextButton(WebInspector.UIString('Stop'), this._stop.bind(this)));
    return uiElement;
  }


  /**
   * @param {!WebInspector.ReportView.Section} section
   * @param {string} title
   * @param {string} settingName
   */
  _appendItem(section, title, settingName) {
    var row = section.appendRow();
    row.appendChild(WebInspector.SettingsUI.createSettingCheckbox(title, this._settings.get(settingName), true));
  }


  _start() {
    WebInspector.targetManager.interceptMainConnection(this._dispatchProtocolMessage.bind(this)).then(rawConnection => {
      this._rawConnection = rawConnection;
      this._send('start').then(result => {
        var section = new WebInspector.ObjectPropertiesSection(
            WebInspector.RemoteObject.fromLocalObject(result), WebInspector.UIString('Audit Results'));
        this._resultElement.appendChild(section.element);
        this._stop();
      });
    });
  }

  /**
   * @param {string} message
   */
  _dispatchProtocolMessage(message) {
    this._send('dispatchProtocolMessage', {message: message});
  }

  _stop() {
    this._send('stop').then(() => {
      this._rawConnection.disconnect();
      this._backend.dispose();
      delete this._backend;
      delete this._backendPromise;
    });
  }

  /**
   * @param {string} method
   * @param {!Object=} params
   * @return {!Promise<!Object|undefined>}
   */
  _send(method, params) {
    if (!this._backendPromise) {
      this._backendPromise =
          WebInspector.serviceManager.createAppService('audits2_worker', 'Audits2Service', false).then(backend => {
            this._backend = backend;
            this._backend.on('sendProtocolMessage', result => this._rawConnection.sendMessage(result.message));
          });
    }
    return this._backendPromise.then(() => this._backend ? this._backend.send(method, params) : undefined);
  }
};
