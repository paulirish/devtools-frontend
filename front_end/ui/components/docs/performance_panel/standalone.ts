// Copyright 2023 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as Common from '../../../../core/common/common.js';
import * as Root from '../../../../core/root/root.js';
import * as SDK from '../../../../core/sdk/sdk.js';
import * as Bindings from '../../../../models/bindings/bindings.js';
import * as Workspace from '../../../../models/workspace/workspace.js';
import * as Timeline from '../../../../panels/timeline/timeline.js';
import * as FrontendHelpers from '../../../../testing/EnvironmentHelpers.js';
import * as UI from '../../../legacy/legacy.js';
import * as ComponentSetup from '../../helpers/helpers.js';

/**
 * Because the panel is not quite as isolated as other components we have to
 * do a bit of setup globally to ensure the panel can render, primarily creating
 * some actions and settings. We also have to instantiate some instances which
 * would usually be setup in MainImpl when running DevTools, but we can set them
 * up here rather than pull in all of the setup from elsewhere. Over time we
 * should look to reduce this global setup and pass data into the panel.
 **/
await FrontendHelpers.initializeGlobalVars();
await ComponentSetup.ComponentServerSetup.setup();

const resourceMapping = new Bindings.ResourceMapping.ResourceMapping(
    SDK.TargetManager.TargetManager.instance(),
    Workspace.Workspace.WorkspaceImpl.instance(),
);
Bindings.DebuggerWorkspaceBinding.DebuggerWorkspaceBinding.instance({
  forceNew: true,
  resourceMapping,
  targetManager: SDK.TargetManager.TargetManager.instance(),
});
Bindings.IgnoreListManager.IgnoreListManager.instance({
  forceNew: true,
  debuggerWorkspaceBinding: Bindings.DebuggerWorkspaceBinding.DebuggerWorkspaceBinding.instance(),
});
SDK.CPUThrottlingManager.CPUThrottlingManager.instance().setHardwareConcurrency(128);

UI.ActionRegistration.registerActionExtension({
  actionId: 'timeline.record-reload',
  iconClass: UI.ActionRegistration.IconClass.REFRESH,
  category: UI.ActionRegistration.ActionCategory.PERFORMANCE,
  contextTypes() {
    return [Timeline.TimelinePanel.TimelinePanel];
  },
  bindings: [
    {
      platform: UI.ActionRegistration.Platforms.WindowsLinux,
      shortcut: 'Ctrl+Shift+E',
    },
    {
      platform: UI.ActionRegistration.Platforms.Mac,
      shortcut: 'Meta+Shift+E',
    },
  ],
});
UI.ActionRegistration.registerActionExtension({
  actionId: 'timeline.show-history',
  category: UI.ActionRegistration.ActionCategory.PERFORMANCE,
  contextTypes() {
    return [Timeline.TimelinePanel.TimelinePanel];
  },
  async loadActionDelegate() {
    return new Timeline.TimelinePanel.ActionDelegate();
  },
});
UI.ActionRegistration.registerActionExtension({
  actionId: 'components.collect-garbage',
  category: UI.ActionRegistration.ActionCategory.PERFORMANCE,
});
UI.ActionRegistration.registerActionExtension({
  actionId: 'timeline.toggle-recording',
  title: () => 'Toggle recording' as Common.UIString.LocalizedString,
  toggleable: true,
  category: UI.ActionRegistration.ActionCategory.PERFORMANCE,
  iconClass: UI.ActionRegistration.IconClass.START_RECORDING,
  contextTypes() {
    return [Timeline.TimelinePanel.TimelinePanel];
  },
  bindings: [
    {
      platform: UI.ActionRegistration.Platforms.WindowsLinux,
      shortcut: 'Ctrl+E',
    },
    {
      platform: UI.ActionRegistration.Platforms.Mac,
      shortcut: 'Meta+E',
    },
  ],
});

const actionRegistry = UI.ActionRegistry.ActionRegistry.instance();
UI.ShortcutRegistry.ShortcutRegistry.instance({forceNew: true, actionRegistry: actionRegistry});
Common.Settings.settingForTest('flamechart-mouse-wheel-action').set('zoom');
// Root.Runtime.experiments.setEnabled('timeline-invalidation-tracking', params.has('invalidations'));



// eslint-disable-next-line rulesdir/check_component_naming
export class DevToolsRPPStandalone extends HTMLElement {
  readonly #shadow = this.attachShadow({mode: 'open'});
  // todo:  lazily fetch/instantiate the impl when we also  fetch
  // the actual trace file. This allows us to be minimally impacting on the load performance
  // of the contain webpage. For more information, see the implementation in `fetchTraceAndInstantiateController`.
  #timeline: Timeline.TimelinePanel.TimelinePanel  = Timeline.TimelinePanel.TimelinePanel.instance({forceNew: true, isNode: false});
  #pendingUrl: string|undefined;

  constructor() {
    super();

    this.#timeline.markAsRoot();
    this.#timeline.show(this);

    window.addEventListener('resize', () => this.#timeline.doResize());
  }

  static get observedAttributes(): string[] {
    return ['url'];
  }

  connectedCallback(): void {
  }

  disconnectedCallback(): void {
  }

  attributeChangedCallback(name: string, _oldValue: string, newValue: string): void {
    if (name === 'url') {
      this.#pendingUrl = newValue;
      this.#loadFromUrlIfRequired();
    }
  }

  #loadFromUrlIfRequired(): void {
    const url = this.#pendingUrl;

    if (url !== undefined) {
      this.#pendingUrl = undefined;
      void this.loadFromUrl(url);
    }
  }

  async loadFromUrl(url: string): Promise<void> {
    const response = await fetch(url);
    const asBlob = await response.blob();
    const asFile = new File([asBlob], 'trace', {
      type: asBlob.type,
    });
    await this.#timeline.loadFromFile(asFile);
  }
}

// Disabled as we try to keep the standalone package as minimal as possible
// eslint-disable-next-line rulesdir/custom_element_component_definition
customElements.define('devtools-rpp', DevToolsRPPStandalone);

declare global {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface HTMLElementTagNameMap {
    'devtools-rpp': DevToolsRPPStandalone;
  }
}
