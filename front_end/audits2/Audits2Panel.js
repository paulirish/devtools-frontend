// Copyright (c) 2016 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @typedef {{
 *     lighthouseVersion: ?string,
 *     generatedTime: !string,
 *     initialUrl: !string,
 *     url: !string,
 *     audits: ?Object,
 *     aggregations: !Array.<*>
 * }}
 */
Audits2.LighthouseResult;

/**
 * @typedef {{
 *     bloburl: !string,
 *     lighthouseResult: ?Audits2.LighthouseResult
 * }}
 */
Audits2.WorkerResult;

/**
 * @unrestricted
 */
Audits2.Audits2Panel = class extends UI.Panel {
  constructor() {
    super('audits2');
    this.setHideOnDetach();
    this.registerRequiredCSS('audits2/audits2Panel.css');

    this._protocolService = new Audits2.ProtocolService();
    this._protocolService.registerStatusCallback(this._updateStatus.bind(this));

    var auditsView = this.contentElement.createChild('div', 'hbox audits-view');
    this.resultsView = this.contentElement.createChild('div', 'vbox results-view');
    auditsView.appendChild(createElementWithClass('div', 'logo'));
    auditsView.appendChild(this._createLauncherUI());
  }

  _reset() {
    this.contentElement.classList.remove('show-results');
    this.resultsView.removeChildren();
  }

  _createLauncherUI() {
    var uiElement = createElement('div');
    var headerElement = uiElement.createChild('header');
    headerElement.createChild('p').textContent = Common.UIString(
        'Audits will analyze the page against modern development best practices and collect useful performance metrics and diagnostics. Select audits to collect:');
    uiElement.appendChild(headerElement);

    var auditSelectorForm = uiElement.createChild('form');
    var pwaLabel = createCheckboxLabel(Common.UIString('Progressive web app audits'), true);
    var bpLabel = createCheckboxLabel(Common.UIString('Modern web development best practices'), true);
    var perfLabel = createCheckboxLabel(Common.UIString('Performance metrics and diagnostics'), true);
    [pwaLabel, bpLabel, perfLabel].forEach(label => {
        label.checkboxElement.disabled = true;
        auditSelectorForm.appendChild(label);
    });

    this._startButton = createTextButton(Common.UIString('Audit this page'), this._startButtonClicked.bind(this), 'run-audit audit-btn');
    auditSelectorForm.appendChild(this._startButton);

    this._statusView = this._createStatusView();
    uiElement.appendChild(this._statusView);
    return uiElement;
  }

  /**
   * @return {!Element}
   */
  _createStatusView() {
    var statusView = createElementWithClass('div', 'status hbox hidden');
    statusView.createChild('span', 'icon');
    this._statusElement = createElement('p');
    statusView.appendChild(this._statusElement);
    this._updateStatus('Loading...');
    return statusView;
  }

  _start() {
    this._auditRunning = true;
    this._updateButton();
    this._updateStatus('Loading...');

    this._inspectedURL = SDK.targetManager.mainTarget().inspectedURL();

    return Promise.resolve()
        .then(_ => this._protocolService.attach())
        .then(_ => this._protocolService.startLighthouse(this._inspectedURL))
        .then(this._finish.bind(this));
  }

  /**
   * @param {!Event} event
   */
  _startButtonClicked(event) {
    if (this._auditRunning) {
      this._updateStatus('Cancelling...');
      this._stop();
      return;
    }
    this._start();
  }

  _updateButton() {
    this._startButton.textContent = this._auditRunning ? Common.UIString('Cancel audit') : Common.UIString('Audit this page');
    this._startButton.classList.toggle('started', this._auditRunning);
    this._statusView.classList.toggle('hidden', !this._auditRunning);
  }

  /**
   * @param {string} statusMessage
   */
  _updateStatus(statusMessage) {
    this._statusElement.textContent = Common.UIString(statusMessage);
  }

  _stop() {
    this._protocolService.detach().then(_ => {
      this._auditRunning = false;
      this._updateButton();
      if (this._inspectedURL !== SDK.targetManager.mainTarget().inspectedURL())
          SDK.targetManager.mainTarget().pageAgent().navigate(this._inspectedURL);

    });
  }

  /**
   * @param {!Audits2.WorkerResult} result
   */
  _finish(result) {
    this._stop();
    this.resultsView.removeChildren();

    this.resultsView.appendChild(this._createResultsBar(result.lighthouseResult.url, result.lighthouseResult.generatedTime));
    this.resultsView.appendChild(this._createIframe(result.bloburl));
    this.contentElement.classList.add('show-results');
  }

  /**
   * @param {string} bloburl
   * @return {!Element}
   */
  _createIframe(bloburl) {
    var iframeContainer = createElementWithClass('div', 'iframe-container');
    var iframe = iframeContainer.createChild('iframe', 'fill');
    iframe.setAttribute('sandbox', 'allow-scripts allow-popups-to-escape-sandbox allow-popups');
    iframe.src = bloburl;
    return iframeContainer;
  }

  /**
   * @param {string} url
   * @param {string} timestamp
   * @return {!Element}
   */
  _createResultsBar(url, timestamp) {
    var elem = createElementWithClass('div', 'results-bar hbox');
    elem.createChild('div', 'logo-small');

    var summaryElem = elem.createChild('div', 'summary');
    var reportFor = summaryElem.createChild('span');
    reportFor.innerHTML = `Report for <b>${url}</b>`;
    var timeElem = summaryElem.createChild('span');
    timeElem.textContent =
        `Generated at ${new Date(timestamp).toLocaleDateString()} ${new Date(timestamp).toLocaleTimeString()}`;

    var newAuditButton = createTextButton(Common.UIString('New Audit'), this._reset.bind(this), 'new-audit audit-btn');
    elem.appendChild(newAuditButton);
    return elem;
  }
};

Audits2.ProtocolService = class extends Common.Object {
  constructor() {
    super();
    this._rawConnection = undefined;
    this._backend = undefined;
    this._backendPromise = undefined;
    this._status = undefined;
  }

  /**
   * @return {!Promise<undefined>}
   */
  attach() {
    return SDK.targetManager.interceptMainConnection(this._dispatchProtocolMessage.bind(this))
        .then(rawConnection => {
          this._rawConnection = rawConnection;
        });
  }

  /**
   * @param {string} inspectedURL
   * @return {!Promise<!Object|undefined>}
   */
  startLighthouse(inspectedURL) {
      return this._send('start', {url: inspectedURL});
  }

  /**
   * @return {!Promise<!Object|undefined>}
   */
  detach() {
    return new Promise((resolve, reject) =>
       this._send('stop').then(() => {
        this._backend.dispose();
        delete this._backend;
        delete this._backendPromise;
        return this._rawConnection.disconnect().then(resolve);
      })
    );
  }

  /**
   *  @param {function (string): undefined} callback
   */
  registerStatusCallback(callback) {
    this._status = callback;
  }

  /**
   * @param {string} message
   */
  _dispatchProtocolMessage(message) {
    this._send('dispatchProtocolMessage', {message: message});
  }

  _initWorker() {
    this._backendPromise = Services.serviceManager.createAppService('audits2_worker', 'Audits2Service', false);
    this._backendPromise.then(backend => {
      /** @type {!ServiceManager.Service} */
      this._backend = backend;
      this._backend.on('statusUpdate', result => this._status(result.message));
      this._backend.on('sendProtocolMessage', result => this._rawConnection.sendMessage(result.message));
    });
  }

  /**
   * @param {string} method
   * @param {!Object=} params
   * @return {!Promise<!Object|undefined>}
   */
  _send(method, params) {
    if (!this._backendPromise)
      this._initWorker();

    return this._backendPromise.then(_ => this._backend.send(method, params));
  }
};
