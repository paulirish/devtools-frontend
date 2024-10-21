// Copyright 2024 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../../core/common/common.js';
import * as Host from '../../core/host/host.js';
import * as i18n from '../../core/i18n/i18n.js';
import type * as Platform from '../../core/platform/platform.js';
import * as SDK from '../../core/sdk/sdk.js';
import * as Trace from '../../models/trace/trace.js';
import * as Workspace from '../../models/workspace/workspace.js';
import * as NetworkForward from '../../panels/network/forward/forward.js';
import * as UI from '../../ui/legacy/legacy.js';
import * as LitHtml from '../../ui/lit-html/lit-html.js';

import {ErrorType, type ResponseData, ResponseType} from './AiAgent.js';
import {ChangeManager} from './ChangeManager.js';
import {
  AgentType,
  ChatMessageEntity,
  FreestylerChatUi,
  type ModelChatMessage,
  type Props as FreestylerChatUiProps,
  State as FreestylerChatUiState,
  type Step,
} from './components/FreestylerChatUi.js';
import {
  DrJonesFileAgent,
} from './DrJonesFileAgent.js';
import {
  DrJonesNetworkAgent,
} from './DrJonesNetworkAgent.js';
import {DrJonesPerformanceAgent} from './DrJonesPerformanceAgent.js';
import {FreestylerAgent} from './FreestylerAgent.js';
import freestylerPanelStyles from './freestylerPanel.css.js';

const {html} = LitHtml;

const AI_ASSISTANCE_SEND_FEEDBACK = 'https://crbug.com/364805393' as Platform.DevToolsPath.UrlString;
const AI_ASSISTANCE_HELP = 'https://goo.gle/devtools-ai-assistance' as Platform.DevToolsPath.UrlString;

const UIStrings = {
  /**
   *@description AI assistance UI text for clearing the chat.
   */
  clearChat: 'Clear chat',
  /**
   *@description AI assistance UI tooltip text for the help button.
   */
  help: 'Help',
  /**
   *@description AI assistant UI tooltip text for the settings button (gear icon).
   */
  settings: 'Settings',
  /**
   *@description AI assistant UI tooltip sending feedback.
   */
  sendFeedback: 'Send feedback',
  /**
   *@description Announcement text for screen readers when the chat is cleared.
   */
  chatCleared: 'Chat cleared',
};

/*
* Strings that don't need to be translated at this time.
*/
const UIStringsNotTranslate = {

  /**
   *@description Announcement text for screen readers when the conversation starts.
   */
  answerLoading: 'Answer loading',
  /**
   *@description Announcement text for screen readers when the answer comes.
   */
  answerReady: 'Answer ready',
};

const str_ = i18n.i18n.registerUIStrings('panels/freestyler/FreestylerPanel.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
const lockedString = i18n.i18n.lockedString;

type ViewOutput = {
  freestylerChatUi?: FreestylerChatUi,
};
type View = (input: FreestylerChatUiProps, output: ViewOutput, target: HTMLElement) => void;

function selectedElementFilter(maybeNode: SDK.DOMModel.DOMNode|null): SDK.DOMModel.DOMNode|null {
  if (maybeNode) {
    return maybeNode.nodeType() === Node.ELEMENT_NODE ? maybeNode : null;
  }

  return null;
}

// TODO(ergunsh): Use the WidgetElement instead of separately creating the toolbar.
function createToolbar(target: HTMLElement, {onClearClick}: {onClearClick: () => void}): void {
  const toolbarContainer = target.createChild('div', 'freestyler-toolbar-container');
  const leftToolbar = new UI.Toolbar.Toolbar('', toolbarContainer);
  const rightToolbar = new UI.Toolbar.Toolbar('freestyler-right-toolbar', toolbarContainer);

  const clearButton =
      new UI.Toolbar.ToolbarButton(i18nString(UIStrings.clearChat), 'clear', undefined, 'freestyler.clear');
  clearButton.addEventListener(UI.Toolbar.ToolbarButton.Events.CLICK, onClearClick);
  leftToolbar.appendToolbarItem(clearButton);

  const link = UI.XLink.XLink.create(
      AI_ASSISTANCE_SEND_FEEDBACK, i18nString(UIStrings.sendFeedback), undefined, undefined,
      'freestyler.send-feedback');
  link.style.setProperty('display', null);
  link.style.setProperty('text-decoration', 'none');
  link.style.setProperty('padding', '0 var(--sys-size-3)');
  const linkItem = new UI.Toolbar.ToolbarItem(link);
  rightToolbar.appendToolbarItem(linkItem);

  rightToolbar.appendSeparator();
  const helpButton = new UI.Toolbar.ToolbarButton(i18nString(UIStrings.help), 'help', undefined, 'freestyler.help');
  helpButton.addEventListener(UI.Toolbar.ToolbarButton.Events.CLICK, () => {
    Host.InspectorFrontendHost.InspectorFrontendHostInstance.openInNewTab(AI_ASSISTANCE_HELP);
  });
  rightToolbar.appendToolbarItem(helpButton);

  const settingsButton =
      new UI.Toolbar.ToolbarButton(i18nString(UIStrings.settings), 'gear', undefined, 'freestyler.settings');
  settingsButton.addEventListener(UI.Toolbar.ToolbarButton.Events.CLICK, () => {
    void UI.ViewManager.ViewManager.instance().showView('chrome-ai');
  });
  rightToolbar.appendToolbarItem(settingsButton);
}

function defaultView(input: FreestylerChatUiProps, output: ViewOutput, target: HTMLElement): void {
  // clang-format off
  LitHtml.render(html`
    <devtools-freestyler-chat-ui .props=${input} ${LitHtml.Directives.ref((el: Element|undefined) => {
      if (!el || !(el instanceof FreestylerChatUi)) {
        return;
      }

      output.freestylerChatUi = el;
    })}></devtools-freestyler-chat-ui>
  `, target, {host: input}); // eslint-disable-line rulesdir/lit_html_host_this
  // clang-format on
}

let freestylerPanelInstance: FreestylerPanel;
export class FreestylerPanel extends UI.Panel.Panel {
  static panelName = 'freestyler';

  #toggleSearchElementAction: UI.ActionRegistration.Action;
  #contentContainer: HTMLElement;
  #aidaClient: Host.AidaClient.AidaClient;
  #freestylerAgent: FreestylerAgent;
  #drJonesFileAgent: DrJonesFileAgent;
  #drJonesNetworkAgent: DrJonesNetworkAgent;
  #drJonesPerformanceAgent: DrJonesPerformanceAgent;
  #viewProps: FreestylerChatUiProps;
  #viewOutput: ViewOutput = {};
  #serverSideLoggingEnabled = isFreestylerServerSideLoggingEnabled();
  #freestylerEnabledSetting: Common.Settings.Setting<boolean>|undefined;
  #changeManager = new ChangeManager();

  constructor(private view: View = defaultView, {aidaClient, aidaAvailability, syncInfo}: {
    aidaClient: Host.AidaClient.AidaClient,
    aidaAvailability: Host.AidaClient.AidaAccessPreconditions,
    syncInfo: Host.InspectorFrontendHostAPI.SyncInformation,
  }) {
    super(FreestylerPanel.panelName);
    this.#freestylerEnabledSetting = this.#getAiAssistanceEnabledSetting();

    createToolbar(this.contentElement, {onClearClick: this.#clearMessages.bind(this)});
    this.#toggleSearchElementAction =
        UI.ActionRegistry.ActionRegistry.instance().getAction('elements.toggle-element-search');
    this.#aidaClient = aidaClient;
    this.#contentContainer = this.contentElement.createChild('div', 'freestyler-chat-ui-container');

    this.#viewProps = {
      state: this.#getChatUiState(),
      aidaAvailability,
      messages: [],
      inspectElementToggled: this.#toggleSearchElementAction.toggled(),
      isLoading: false,
      onTextSubmit: this.#startConversation.bind(this),
      onInspectElementClick: this.#handleSelectElementClick.bind(this),
      onFeedbackSubmit: this.#handleFeedbackSubmit.bind(this),
      onCancelClick: this.#cancel.bind(this),
      onSelectedNetworkRequestClick: this.#handleSelectedNetworkRequestClick.bind(this),
      onSelectedFileRequestClick: this.#handleSelectedFileClick.bind(this),
      canShowFeedbackForm: this.#serverSideLoggingEnabled,
      userInfo: {
        accountImage: syncInfo.accountImage,
        accountFullName: syncInfo.accountFullName,
      },
      selectedElement: null,
      selectedFile: null,
      selectedNetworkRequest: null,
      selectedStackTrace: null,
    };

    this.#freestylerAgent = this.#createFreestylerAgent();
    this.#drJonesFileAgent = this.#createDrJonesFileAgent();
    this.#drJonesNetworkAgent = this.#createDrJonesNetworkAgent();
    this.#drJonesPerformanceAgent = this.#createDrJonesPerformanceAgent();
  }

  #getChatUiState(): FreestylerChatUiState {
    const config = Common.Settings.Settings.instance().getHostConfig();
    const blockedByAge = config.aidaAvailability?.blockedByAge === true;
    return (this.#freestylerEnabledSetting?.getIfNotDisabled() && !blockedByAge) ? FreestylerChatUiState.CHAT_VIEW :
                                                                                   FreestylerChatUiState.CONSENT_VIEW;
  }

  #getAiAssistanceEnabledSetting(): Common.Settings.Setting<boolean>|undefined {
    try {
      return Common.Settings.moduleSetting('ai-assistance-enabled') as Common.Settings.Setting<boolean>;
    } catch {
      return;
    }
  }

  #createFreestylerAgent(): FreestylerAgent {
    return new FreestylerAgent({
      aidaClient: this.#aidaClient,
      changeManager: this.#changeManager,
      serverSideLoggingEnabled: this.#serverSideLoggingEnabled,
    });
  }

  #createDrJonesFileAgent(): DrJonesFileAgent {
    return new DrJonesFileAgent({
      aidaClient: this.#aidaClient,
      serverSideLoggingEnabled: this.#serverSideLoggingEnabled,
    });
  }

  #createDrJonesNetworkAgent(): DrJonesNetworkAgent {
    return new DrJonesNetworkAgent({
      aidaClient: this.#aidaClient,
      serverSideLoggingEnabled: this.#serverSideLoggingEnabled,
    });
  }

  #createDrJonesPerformanceAgent(): DrJonesPerformanceAgent {
    return new DrJonesPerformanceAgent({
      aidaClient: this.#aidaClient,
      serverSideLoggingEnabled: this.#serverSideLoggingEnabled,
    });
  }

  static async instance(opts: {
    forceNew: boolean|null,
  }|undefined = {forceNew: null}): Promise<FreestylerPanel> {
    const {forceNew} = opts;
    if (!freestylerPanelInstance || forceNew) {
      const aidaClient = new Host.AidaClient.AidaClient();
      const syncInfoPromise = new Promise<Host.InspectorFrontendHostAPI.SyncInformation>(
          resolve => Host.InspectorFrontendHost.InspectorFrontendHostInstance.getSyncInformation(resolve));
      const [aidaAvailability, syncInfo] =
          await Promise.all([Host.AidaClient.AidaClient.checkAccessPreconditions(), syncInfoPromise]);
      freestylerPanelInstance = new FreestylerPanel(defaultView, {aidaClient, aidaAvailability, syncInfo});
    }

    return freestylerPanelInstance;
  }

  override wasShown(): void {
    this.registerCSSFiles([freestylerPanelStyles]);
    this.#viewOutput.freestylerChatUi?.restoreScrollPosition();
    this.#viewOutput.freestylerChatUi?.focusTextInput();
    void this.#handleAidaAvailabilityChange();
    void this
        .#handleFreestylerEnabledSettingChanged();  // If the setting was switched on/off while the FreestylerPanel was not shown.
    this.#viewProps = {
      ...this.#viewProps,
      inspectElementToggled: this.#toggleSearchElementAction.toggled(),
      selectedElement: selectedElementFilter(UI.Context.Context.instance().flavor(SDK.DOMModel.DOMNode)),
      selectedNetworkRequest: UI.Context.Context.instance().flavor(SDK.NetworkRequest.NetworkRequest),
      selectedStackTrace: UI.Context.Context.instance().flavor(Trace.Helpers.TreeHelpers.EventNodeForAI),
      selectedFile: UI.Context.Context.instance().flavor(Workspace.UISourceCode.UISourceCode),
    };
    this.doUpdate();

    this.#freestylerEnabledSetting?.addChangeListener(this.#handleFreestylerEnabledSettingChanged, this);
    Host.AidaClient.HostConfigTracker.instance().addEventListener(
        Host.AidaClient.Events.AIDA_AVAILABILITY_CHANGED, this.#handleAidaAvailabilityChange);
    this.#toggleSearchElementAction.addEventListener(
        UI.ActionRegistration.Events.TOGGLED, this.#handleSearchElementActionToggled);
    UI.Context.Context.instance().addFlavorChangeListener(SDK.DOMModel.DOMNode, this.#handleDOMNodeFlavorChange);
    UI.Context.Context.instance().addFlavorChangeListener(
        SDK.NetworkRequest.NetworkRequest, this.#handleNetworkRequestFlavorChange);
    UI.Context.Context.instance().addFlavorChangeListener(
        Trace.Helpers.TreeHelpers.EventNodeForAI, this.#handleTraceEntryNodeFlavorChange);
    UI.Context.Context.instance().addFlavorChangeListener(
        Workspace.UISourceCode.UISourceCode, this.#handleUISourceCodeFlavorChange);
  }

  override willHide(): void {
    this.#freestylerEnabledSetting?.removeChangeListener(this.#handleFreestylerEnabledSettingChanged, this);
    Host.AidaClient.HostConfigTracker.instance().removeEventListener(
        Host.AidaClient.Events.AIDA_AVAILABILITY_CHANGED, this.#handleAidaAvailabilityChange);
    this.#toggleSearchElementAction.removeEventListener(
        UI.ActionRegistration.Events.TOGGLED, this.#handleSearchElementActionToggled);
    UI.Context.Context.instance().removeFlavorChangeListener(SDK.DOMModel.DOMNode, this.#handleDOMNodeFlavorChange);
    UI.Context.Context.instance().removeFlavorChangeListener(
        SDK.NetworkRequest.NetworkRequest, this.#handleNetworkRequestFlavorChange);
    UI.Context.Context.instance().removeFlavorChangeListener(
        Trace.Helpers.TreeHelpers.EventNodeForAI, this.#handleTraceEntryNodeFlavorChange);
    UI.Context.Context.instance().removeFlavorChangeListener(
        Workspace.UISourceCode.UISourceCode, this.#handleUISourceCodeFlavorChange);
  }

  #handleAidaAvailabilityChange = async(): Promise<void> => {
    const currentAidaAvailability = await Host.AidaClient.AidaClient.checkAccessPreconditions();
    if (currentAidaAvailability !== this.#viewProps.aidaAvailability) {
      this.#viewProps.aidaAvailability = currentAidaAvailability;
      const syncInfo = await new Promise<Host.InspectorFrontendHostAPI.SyncInformation>(
          resolve => Host.InspectorFrontendHost.InspectorFrontendHostInstance.getSyncInformation(resolve));
      this.#viewProps.userInfo = {
        accountImage: syncInfo.accountImage,
        accountFullName: syncInfo.accountFullName,
      };
      this.#viewProps.state = this.#getChatUiState();
      this.doUpdate();
    }
  };

  #handleSearchElementActionToggled = (ev: Common.EventTarget.EventTargetEvent<boolean>): void => {
    if (this.#viewProps.inspectElementToggled === ev.data) {
      return;
    }

    this.#viewProps.inspectElementToggled = ev.data;
    this.doUpdate();
  };

  #handleDOMNodeFlavorChange = (ev: Common.EventTarget.EventTargetEvent<SDK.DOMModel.DOMNode>): void => {
    if (this.#viewProps.selectedElement === ev.data) {
      return;
    }

    this.#viewProps.selectedElement = selectedElementFilter(ev.data);
    this.doUpdate();
  };

  #handleNetworkRequestFlavorChange =
      (ev: Common.EventTarget.EventTargetEvent<SDK.NetworkRequest.NetworkRequest>): void => {
        if (this.#viewProps.selectedNetworkRequest === ev.data) {
          return;
        }

        this.#viewProps.selectedNetworkRequest = Boolean(ev.data) ? ev.data : null;
        this.doUpdate();
      };

  #handleTraceEntryNodeFlavorChange =
      (ev: Common.EventTarget.EventTargetEvent<Trace.Helpers.TreeHelpers.EventNodeForAI>): void => {
        if (this.#viewProps.selectedStackTrace === ev.data) {
          return;
        }

        this.#viewProps.selectedStackTrace = Boolean(ev.data) ? ev.data : null;
        this.doUpdate();
      };

  #handleUISourceCodeFlavorChange =
      (ev: Common.EventTarget.EventTargetEvent<Workspace.UISourceCode.UISourceCode>): void => {
        if (this.#viewProps.selectedFile === ev.data) {
          return;
        }

        this.#viewProps.selectedFile = Boolean(ev.data) ? ev.data : null;
        this.doUpdate();
      };

  #handleFreestylerEnabledSettingChanged = (): void => {
    const nextChatUiState = this.#getChatUiState();
    if (this.#viewProps.state === nextChatUiState) {
      return;
    }

    this.#viewProps.state = nextChatUiState;
    this.doUpdate();
  };

  doUpdate(): void {
    this.view(this.#viewProps, this.#viewOutput, this.#contentContainer);
  }

  #handleSelectElementClick(): void {
    void this.#toggleSearchElementAction.execute();
  }

  #handleFeedbackSubmit(rpcId: number, rating: Host.AidaClient.Rating, feedback?: string): void {
    void this.#aidaClient.registerClientEvent({
      corresponding_aida_rpc_global_id: rpcId,
      disable_user_content_logging: !this.#serverSideLoggingEnabled,
      do_conversation_client_event: {
        user_feedback: {
          sentiment: rating,
          user_input: {
            comment: feedback,
          },
        },
      },
    });
  }

  #handleSelectedNetworkRequestClick(): void|Promise<void> {
    if (this.#viewProps.selectedNetworkRequest) {
      const requestLocation = NetworkForward.UIRequestLocation.UIRequestLocation.tab(
          this.#viewProps.selectedNetworkRequest, NetworkForward.UIRequestLocation.UIRequestTabs.HEADERS_COMPONENT);
      return Common.Revealer.reveal(requestLocation);
    }
  }

  #handleSelectedFileClick(): void|Promise<void> {
    if (this.#viewProps.selectedFile) {
      return Common.Revealer.reveal(this.#viewProps.selectedFile.uiLocation(0, 0));
    }
  }

  handleAction(actionId: string): void {
    switch (actionId) {
      case 'freestyler.elements-floating-button': {
        this.#viewOutput.freestylerChatUi?.focusTextInput();
        Host.userMetrics.actionTaken(Host.UserMetrics.Action.FreestylerOpenedFromElementsPanelFloatingButton);
        this.#viewProps.agentType = AgentType.FREESTYLER;
        this.doUpdate();
        break;
      }
      case 'freestyler.element-panel-context': {
        this.#viewOutput.freestylerChatUi?.focusTextInput();
        Host.userMetrics.actionTaken(Host.UserMetrics.Action.FreestylerOpenedFromElementsPanel);
        this.#viewProps.agentType = AgentType.FREESTYLER;
        this.doUpdate();
        break;
      }
      case 'drjones.network-floating-button': {
        this.#viewOutput.freestylerChatUi?.focusTextInput();
        Host.userMetrics.actionTaken(Host.UserMetrics.Action.DrJonesOpenedFromNetworkPanelFloatingButton);
        this.#viewProps.agentType = AgentType.DRJONES_NETWORK_REQUEST;
        this.doUpdate();
        break;
      }
      case 'drjones.network-panel-context': {
        this.#viewOutput.freestylerChatUi?.focusTextInput();
        Host.userMetrics.actionTaken(Host.UserMetrics.Action.DrJonesOpenedFromNetworkPanel);
        this.#viewProps.agentType = AgentType.DRJONES_NETWORK_REQUEST;
        this.doUpdate();
        break;
      }
      case 'drjones.performance-panel-context': {
        this.#viewOutput.freestylerChatUi?.focusTextInput();
        Host.userMetrics.actionTaken(Host.UserMetrics.Action.DrJonesOpenedFromPerformancePanel);
        this.#viewProps.agentType = AgentType.DRJONES_PERFORMANCE;
        this.doUpdate();
        break;
      }
      case 'drjones.sources-floating-button': {
        this.#viewOutput.freestylerChatUi?.focusTextInput();
        Host.userMetrics.actionTaken(Host.UserMetrics.Action.DrJonesOpenedFromSourcesPanelFloatingButton);
        this.#viewProps.agentType = AgentType.DRJONES_FILE;
        this.doUpdate();
        break;
      }
      case 'drjones.sources-panel-context': {
        this.#viewOutput.freestylerChatUi?.focusTextInput();
        Host.userMetrics.actionTaken(Host.UserMetrics.Action.DrJonesOpenedFromSourcesPanel);
        this.#viewProps.agentType = AgentType.DRJONES_FILE;
        this.doUpdate();
        break;
      }
    }
  }

  #clearMessages(): void {
    this.#viewProps.messages = [];
    this.#viewProps.isLoading = false;
    this.#freestylerAgent = this.#createFreestylerAgent();
    this.#drJonesFileAgent = this.#createDrJonesFileAgent();
    this.#drJonesNetworkAgent = this.#createDrJonesNetworkAgent();
    this.#cancel();
    this.doUpdate();
    UI.ARIAUtils.alert(i18nString(UIStrings.chatCleared));
  }

  #runAbortController = new AbortController();
  #cancel(): void {
    this.#runAbortController.abort();
    this.#runAbortController = new AbortController();
    this.#viewProps.isLoading = false;
    this.doUpdate();
  }

  async #startConversation(text: string): Promise<void> {
    this.#viewProps.messages.push({
      entity: ChatMessageEntity.USER,
      text,
    });
    this.#viewProps.isLoading = true;
    const systemMessage: ModelChatMessage = {
      entity: ChatMessageEntity.MODEL,
      steps: [],
    };
    this.#viewProps.messages.push(systemMessage);
    this.doUpdate();

    this.#runAbortController = new AbortController();
    const signal = this.#runAbortController.signal;

    let runner: AsyncGenerator<ResponseData, void, void>|undefined;
    if (this.#viewProps.agentType === AgentType.FREESTYLER) {
      runner = this.#freestylerAgent.run(text, {signal, selected: this.#viewProps.selectedElement});
    } else if (this.#viewProps.agentType === AgentType.DRJONES_FILE) {
      runner = this.#drJonesFileAgent.run(text, {signal, selected: this.#viewProps.selectedFile});
    } else if (this.#viewProps.agentType === AgentType.DRJONES_NETWORK_REQUEST) {
      runner = this.#drJonesNetworkAgent.run(text, {signal, selected: this.#viewProps.selectedNetworkRequest});
    } else if (this.#viewProps.agentType === AgentType.DRJONES_PERFORMANCE) {
      runner = this.#drJonesPerformanceAgent.run(text, {signal, selected: this.#viewProps.selectedStackTrace});
    }

    if (!runner) {
      return;
    }

    let step: Step = {isLoading: true};
    UI.ARIAUtils.alert(lockedString(UIStringsNotTranslate.answerLoading));
    for await (const data of runner) {
      step.sideEffect = undefined;
      switch (data.type) {
        case ResponseType.QUERYING: {
          step = {isLoading: true};
          if (!systemMessage.steps.length) {
            systemMessage.steps.push(step);
          }

          break;
        }
        case ResponseType.CONTEXT: {
          step.title = data.title;
          step.contextDetails = data.details;
          step.isLoading = false;
          if (systemMessage.steps.at(-1) !== step) {
            systemMessage.steps.push(step);
          }
          break;
        }
        case ResponseType.TITLE: {
          step.title = data.title;
          if (systemMessage.steps.at(-1) !== step) {
            systemMessage.steps.push(step);
          }
          break;
        }
        case ResponseType.THOUGHT: {
          step.isLoading = false;
          step.thought = data.thought;
          if (systemMessage.steps.at(-1) !== step) {
            systemMessage.steps.push(step);
          }
          break;
        }
        case ResponseType.SIDE_EFFECT: {
          step.isLoading = false;
          step.code = data.code;
          step.sideEffect = {
            onAnswer: data.confirm,
          };
          if (systemMessage.steps.at(-1) !== step) {
            systemMessage.steps.push(step);
          }
          break;
        }
        case ResponseType.ACTION: {
          step.isLoading = false;
          step.code = data.code;
          step.output = data.output;
          step.canceled = data.canceled;
          if (systemMessage.steps.at(-1) !== step) {
            systemMessage.steps.push(step);
          }
          break;
        }
        case ResponseType.ANSWER: {
          systemMessage.suggestions = data.suggestions;
          systemMessage.answer = data.text;
          systemMessage.rpcId = data.rpcId;
          // When there is an answer without any thinking steps, we don't want to show the thinking step.
          if (systemMessage.steps.length === 1 && systemMessage.steps[0].isLoading) {
            systemMessage.steps.pop();
          }
          step.isLoading = false;
          this.#viewProps.isLoading = false;
          break;
        }

        case ResponseType.ERROR: {
          systemMessage.error = data.error;
          systemMessage.rpcId = undefined;
          this.#viewProps.isLoading = false;
          const lastStep = systemMessage.steps.at(-1);
          if (lastStep) {
            // Mark the last step as cancelled to make the UI feel better.
            if (data.error === ErrorType.ABORT) {
              lastStep.canceled = true;
              // If error happens while the step is still loading remove it.
            } else if (lastStep.isLoading) {
              systemMessage.steps.pop();
            }
          }
        }
      }

      this.doUpdate();
      this.#viewOutput.freestylerChatUi?.scrollToLastMessage();
    }
    UI.ARIAUtils.alert(lockedString(UIStringsNotTranslate.answerReady));
  }
}

export class ActionDelegate implements UI.ActionRegistration.ActionDelegate {
  handleAction(
      _context: UI.Context.Context,
      actionId: string,
      ): boolean {
    switch (actionId) {
      case 'freestyler.elements-floating-button':
      case 'freestyler.element-panel-context':
      case 'drjones.network-floating-button':
      case 'drjones.network-panel-context':
      case 'drjones.performance-panel-context':
      case 'drjones.sources-floating-button':
      case 'drjones.sources-panel-context': {
        void (async () => {
          const view = UI.ViewManager.ViewManager.instance().view(
              FreestylerPanel.panelName,
          );

          if (view) {
            await UI.ViewManager.ViewManager.instance().showView(
                FreestylerPanel.panelName,
            );
            const widget = (await view.widget()) as FreestylerPanel;
            widget.handleAction(actionId);
          }
        })();
        return true;
      }
    }

    return false;
  }
}

function setFreestylerServerSideLoggingEnabled(enabled: boolean): void {
  if (enabled) {
    localStorage.setItem('freestyler_enableServerSideLogging', 'true');
  } else {
    localStorage.setItem('freestyler_enableServerSideLogging', 'false');
  }
}

function isFreestylerServerSideLoggingEnabled(): boolean {
  const config = Common.Settings.Settings.instance().getHostConfig();
  if (config.aidaAvailability?.disallowLogging) {
    return false;
  }
  return localStorage.getItem('freestyler_enableServerSideLogging') !== 'false';
}

// @ts-ignore
globalThis.setFreestylerServerSideLoggingEnabled = setFreestylerServerSideLoggingEnabled;
