(function () {
    const vscode = acquireVsCodeApi()

    let messages = []
    let pendingChanges = { files: 0, added: 0, removed: 0 }
    let streamingContent = ''
    let isStreaming = false

    const root = document.getElementById('root')
    renderApp()

    function renderApp() {
        root.innerHTML = `
            <!-- Header -->
            <div class="continue-header">
                <div class="header-left">
                    <span class="header-title">LEXENTIA</span>
                </div>
                <div class="header-actions">
                    <button class="header-btn" id="newChatBtn" title="New chat">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="12" y1="5" x2="12" y2="19"/>
                            <line x1="5" y1="12" x2="19" y2="12"/>
                        </svg>
                    </button>
                    <button class="header-btn" id="historyBtn" title="History">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="12" cy="12" r="10"/>
                            <polyline points="12 6 12 12 16 14"/>
                        </svg>
                    </button>
                    <button class="header-btn" id="settingsBtn" title="Settings">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="12" cy="12" r="3"/>
                            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                        </svg>
                    </button>
                    <button class="header-btn mode-btn" id="modeBtn" title="Agent Mode">
                        <span id="modeIcon">🤖</span>
                    </button>
                    <div class="model-selector">
                        <button class="model-selector-btn" id="modelSelectorBtn">
                            <span>Local Config</span>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <polyline points="6 9 12 15 18 9"/>
                            </svg>
                        </button>
                    </div>
                </div>
            </div>

            <!-- Status Bar -->
            <div class="status-bar hidden" id="statusBar">
                <div class="status-indicator" id="statusIndicator"></div>
                <span class="status-text" id="statusText">Ready</span>
                <button class="status-stop hidden" id="stopBtn" title="Stop">■</button>
            </div>

            <!-- Toolbar -->
            <div class="continue-toolbar hidden" id="mainToolbar">
                <button class="toolbar-btn" id="editModeBtn" title="Edit">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
                    </svg>
                </button>
                <button class="toolbar-btn" id="diffModeBtn" title="Diff">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="6" cy="6" r="3"/>
                        <circle cx="6" cy="18" r="3"/>
                        <line x1="20" y1="4" x2="8.12" y2="15.88"/>
                        <line x1="14.47" y1="14.48" x2="20" y2="20"/>
                        <line x1="8.12" y1="8.12" x2="12" y2="12"/>
                    </svg>
                </button>
            </div>

            <!-- Context Chips -->
            <div class="context-chips-container hidden" id="contextChipsContainer"></div>

            <!-- Execution Timeline -->
            <div class="execution-timeline hidden" id="executionTimeline"></div>

            <!-- Messages -->
            <div class="messages" id="messages">
                <div class="welcome-message">
                    <div class="welcome-logo">Lexentia</div>
                    <div class="welcome-subtitle">AI Dev Engine</div>
                    <div class="welcome-hint">Start typing to see smart actions</div>
                </div>
            </div>

            <!-- Diff Bar -->
            <div class="diff-bar hidden" id="diffBar">
                <div class="diff-stats" id="diffStats"></div>
                <div class="diff-btns">
                    <button class="diff-btn reject" id="rejectAllBtn">Reject all</button>
                    <button class="diff-btn accept" id="acceptAllBtn">Accept all</button>
                </div>
            </div>

            <!-- Action Chips (Progressive UI) -->
            <div class="action-chips-container hidden" id="actionChipsContainer"></div>

            <!-- Input Area -->
            <div class="input-container">
                <div class="input-wrapper">
                    <textarea id="messageInput" placeholder="Ask anything. '@' to add context" rows="2"></textarea>
                    <div class="input-toolbar">
                        <div class="input-toolbar-left">
                            <button class="input-btn at-btn" id="atBtn" title="Add context">@</button>
                        </div>
                        <div class="input-toolbar-right">
                            <button class="input-btn" id="attachBtn" title="Attach file">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.59a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
                                </svg>
                            </button>
                            <button class="send-btn" id="sendBtn" title="Send (Enter)">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <line x1="22" y1="2" x2="11" y2="13"/>
                                    <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Last Session -->
            <div class="last-session" id="lastSessionBtn">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="15 18 9 12 15 6"/>
                </svg>
                <span>Last Session</span>
            </div>

            <!-- Settings Panel -->
            <div class="settings-backdrop" id="settingsBackdrop"></div>
            <div class="settings-panel" id="settingsPanel">
                <div class="settings-header">
                    <h3>Settings</h3>
                    <button class="close-settings" id="closeSettings">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"/>
                            <line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                    </button>
                </div>
                <div class="setting">
                    <label>Model Preset</label>
                    <select id="modelPreset"></select>
                </div>
                <div class="setting">
                    <label>Provider</label>
                    <select id="provider">
                        <option value="ollama">Ollama</option>
                        <option value="openai-compatible">OpenAI Compatible</option>
                    </select>
                </div>
                <div class="setting">
                    <label>Base URL</label>
                    <input type="text" id="baseUrl" value="http://127.0.0.1:11434">
                </div>
                <div class="setting">
                    <label>Model</label>
                    <input type="text" id="modelName" value="llama3.1">
                </div>
                <div class="setting" id="apiKeyRow" style="display:none">
                    <label>API Key</label>
                    <input type="password" id="apiKey" value="">
                </div>
                <div class="setting">
                    <label>Custom System Prompt</label>
                    <textarea id="customSystemPrompt" rows="4" placeholder="Optional: override adaptive prompt per model"></textarea>
                </div>
                <div class="setting">
                    <label>
                        <input type="checkbox" id="streamingToggle"> Enable Streaming
                    </label>
                </div>

                <!-- AI Capabilities -->
                <div class="settings-section">
                    <h4 class="settings-section-title">🧰 Tools</h4>
                    <div class="setting-inline">
                        <label class="toggle-label">
                            <input type="checkbox" id="terminalToggle">
                            <span class="toggle-slider"></span>
                            Terminal
                        </label>
                    </div>
                    <div class="setting-inline">
                        <label class="toggle-label">
                            <input type="checkbox" id="filesystemToggle">
                            <span class="toggle-slider"></span>
                            File System
                        </label>
                    </div>
                    <div class="setting-inline">
                        <label class="toggle-label">
                            <input type="checkbox" id="testsToggle">
                            <span class="toggle-slider"></span>
                            Tests
                        </label>
                    </div>
                </div>

                <!-- Safety -->
                <div class="settings-section">
                    <h4 class="settings-section-title">🔒 Safety</h4>
                    <div class="setting">
                        <label>Max Iterations</label>
                        <input type="number" id="maxIterations" value="3" min="1" max="10">
                    </div>
                    <div class="setting-inline">
                        <label class="toggle-label">
                            <input type="checkbox" id="askBeforeRunToggle">
                            <span class="toggle-slider"></span>
                            Ask before run
                        </label>
                    </div>
                </div>

                <!-- Profiles -->
                <div class="settings-section">
                    <h4 class="settings-section-title">⚡ Profiles</h4>
                    <div class="profile-btns">
                        <button class="profile-btn" data-profile="safe" id="profileSafe">Safe Mode</button>
                        <button class="profile-btn active" data-profile="dev" id="profileDev">Dev Mode</button>
                        <button class="profile-btn" data-profile="fullauto" id="profileFullAuto">Full Auto</button>
                    </div>
                </div>

                <button class="save-settings-btn" id="saveSettingsBtn">Save</button>
            </div>
        `
        bindEvents()
        vscode.postMessage({ type: 'getSettings' })
    }

    function bindEvents() {
        const sendBtn       = document.getElementById('sendBtn')
        const messageInput  = document.getElementById('messageInput')
        const settingsBtn   = document.getElementById('settingsBtn')
        const closeSettings = document.getElementById('closeSettings')
        const settingsPanel = document.getElementById('settingsPanel')
        const settingsBackdrop = document.getElementById('settingsBackdrop')
        const saveSettingsBtn = document.getElementById('saveSettingsBtn')
        const provider      = document.getElementById('provider')
        const modelPreset   = document.getElementById('modelPreset')
        const newChatBtn    = document.getElementById('newChatBtn')
        const rejectAllBtn  = document.getElementById('rejectAllBtn')
        const acceptAllBtn  = document.getElementById('acceptAllBtn')
        const attachBtn     = document.getElementById('attachBtn')
        const atBtn         = document.getElementById('atBtn')
        const lastSessionBtn = document.getElementById('lastSessionBtn')
        const editModeBtn   = document.getElementById('editModeBtn')
        const diffModeBtn   = document.getElementById('diffModeBtn')
        const modelSelectorBtn = document.getElementById('modelSelectorBtn')
        const modeBtn = document.getElementById('modeBtn')
        const modeIcon = document.getElementById('modeIcon')
        const stopBtn = document.getElementById('stopBtn')
        let currentActionChips = []
        let currentMode = 'agent'

        // Mode selector
        const modes = [
            { id: 'plan', icon: '🧠', label: 'Plan', desc: 'Architecture' },
            { id: 'code', icon: '👨‍💻', label: 'Code', desc: 'Implement' },
            { id: 'debug', icon: '🐞', label: 'Debug', desc: 'Fix issues' },
            { id: 'agent', icon: '🤖', label: 'Agent', desc: 'Auto mode' }
        ]

        function showModeSelector() {
            // Create dropdown if not exists
            let dropdown = document.getElementById('modeSelectorDropdown')
            if (!dropdown) {
                dropdown = document.createElement('div')
                dropdown.id = 'modeSelectorDropdown'
                dropdown.className = 'mode-selector-dropdown'
                dropdown.innerHTML = modes.map(m => `
                    <div class="mode-option ${m.id === currentMode ? 'active' : ''}" data-mode="${m.id}">
                        <span class="mode-option-icon">${m.icon}</span>
                        <span class="mode-option-label">${m.label}</span>
                        <span class="mode-option-desc">${m.desc}</span>
                    </div>
                `).join('')
                modeBtn.parentElement.appendChild(dropdown)

                // Bind click handlers
                dropdown.querySelectorAll('.mode-option').forEach(opt => {
                    opt.addEventListener('click', () => {
                        currentMode = opt.dataset.mode
                        const mode = modes.find(m => m.id === currentMode)
                        if (modeIcon && mode) {
                            modeIcon.textContent = mode.icon
                        }
                        dropdown.classList.remove('visible')
                        vscode.postMessage({ type: 'setMode', mode: currentMode })
                    })
                })
            }

            // Toggle visibility
            dropdown.classList.toggle('visible')
        }

        modeBtn?.addEventListener('click', () => {
            showModeSelector()
        })

        // Stop button
        stopBtn?.addEventListener('click', () => {
            vscode.postMessage({ type: 'stopTask' })
            stopBtn?.classList.add('hidden')
            updateStatus('idle', 'Stopped')
        })

        // Action chips handler - dynamic UI
        function showActionChips(actions, contextInput = '') {
            const container = document.getElementById('actionChipsContainer')
            if (!container || !actions || actions.length === 0) {
                container?.classList.add('hidden')
                return
            }

            currentActionChips = actions
            container.innerHTML = actions.map(action => `
                <button class="action-chip ${action.type}" data-trigger="${action.trigger}" title="${action.condition || ''}">
                    <span class="action-chip-icon">${action.icon || '•'}</span>
                    <span>${action.label}</span>
                </button>
            `).join('')

            // Bind click handlers
            container.querySelectorAll('.action-chip').forEach(chip => {
                chip.addEventListener('click', () => {
                    const trigger = chip.dataset.trigger
                    handleActionTrigger(trigger, contextInput)
                })
            })

            container.classList.remove('hidden')
        }

        function handleActionTrigger(trigger, contextInput) {
            const input = document.getElementById('messageInput')
            const task = contextInput || input?.value.trim() || ''

            switch (trigger) {
                case 'runTask':
                case 'fixLoop':
                    if (!task) return
                    // Show status bar and timeline
                    document.getElementById('statusBar')?.classList.remove('hidden')
                    document.getElementById('executionTimeline')?.classList.remove('hidden')
                    document.getElementById('messages')?.classList.add('hidden')
                    stopBtn?.classList.remove('hidden')
                    clearExecutionTimeline()
                    addTimelineItem('plan', '🧠 Starting task...', task)
                    vscode.postMessage({ type: 'runTask', task })
                    break

                case 'runProject':
                case 'runTests':
                    vscode.postMessage({ type: 'runProject', command: trigger === 'runTests' ? 'test' : 'run' })
                    break

                case 'explainError':
                case 'explainCode':
                    if (task) {
                        vscode.postMessage({ type: 'sendMessage', text: `Explain: ${task}` })
                    }
                    break

                case 'showPlan':
                    if (task) {
                        vscode.postMessage({ type: 'showPlan', task })
                    }
                    break
            }

            // Hide chips after action
            document.getElementById('actionChipsContainer')?.classList.add('hidden')
        }

        // Request intent analysis on input
        function requestIntentAnalysis() {
            const input = document.getElementById('messageInput')
            const text = input?.value.trim()
            if (text && text.length > 3) {
                vscode.postMessage({ type: 'analyzeIntent', text })
            } else {
                document.getElementById('actionChipsContainer')?.classList.add('hidden')
            }
        }

        sendBtn?.addEventListener('click', sendMessage)

        messageInput?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                sendMessage()
            }
        })

        // Analyze intent on input (Progressive UI)
        let intentDebounceTimer
        messageInput?.addEventListener('input', function () {
            this.style.height = 'auto'
            this.style.overflowY = 'hidden'
            const newH = Math.min(this.scrollHeight, 120)
            this.style.height = newH + 'px'
            this.style.overflowY = this.scrollHeight > 120 ? 'auto' : 'hidden'

            // Debounce intent analysis
            clearTimeout(intentDebounceTimer)
            intentDebounceTimer = setTimeout(() => {
                requestIntentAnalysis()
            }, 300)
        })

        function openSettings() {
            settingsPanel?.classList.add('visible')
            settingsBackdrop?.classList.add('visible')
        }

        function closeSettingsPanel() {
            settingsPanel?.classList.remove('visible')
            settingsBackdrop?.classList.remove('visible')
        }

        settingsBtn?.addEventListener('click', () => {
            openSettings()
        })

        closeSettings?.addEventListener('click', () => {
            closeSettingsPanel()
        })

        settingsBackdrop?.addEventListener('click', () => {
            closeSettingsPanel()
        })

        provider?.addEventListener('change', (e) => {
            const apiKeyRow = document.getElementById('apiKeyRow')
            apiKeyRow.style.display = e.target.value === 'openai-compatible' ? 'block' : 'none'
        })

        // Profile buttons
        const profileBtns = document.querySelectorAll('.profile-btn')
        let selectedProfile = 'dev'
        profileBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                profileBtns.forEach(b => b.classList.remove('active'))
                btn.classList.add('active')
                selectedProfile = btn.dataset.profile

                // Auto-set permissions based on profile
                const terminalToggle = document.getElementById('terminalToggle')
                const filesystemToggle = document.getElementById('filesystemToggle')
                const testsToggle = document.getElementById('testsToggle')

                if (selectedProfile === 'safe') {
                    terminalToggle.checked = false
                    filesystemToggle.checked = true
                    testsToggle.checked = false
                } else if (selectedProfile === 'dev') {
                    terminalToggle.checked = true
                    filesystemToggle.checked = true
                    testsToggle.checked = true
                } else if (selectedProfile === 'fullauto') {
                    terminalToggle.checked = true
                    filesystemToggle.checked = true
                    testsToggle.checked = true
                }
            })
        })

        saveSettingsBtn?.addEventListener('click', () => {
            const prov    = document.getElementById('provider')?.value
            const baseUrl = document.getElementById('baseUrl')?.value
            const model   = document.getElementById('modelName')?.value
            const apiKey  = document.getElementById('apiKey')?.value
            const preset  = document.getElementById('modelPreset')?.value || 'custom'
            const customSystemPrompt = document.getElementById('customSystemPrompt')?.value || ''
            const streaming = document.getElementById('streamingToggle')?.checked || false

            // Tools & Safety
            const tools = {
                terminal: document.getElementById('terminalToggle')?.checked || false,
                filesystem: document.getElementById('filesystemToggle')?.checked || false,
                tests: document.getElementById('testsToggle')?.checked || false
            }
            const safety = {
                maxIterations: parseInt(document.getElementById('maxIterations')?.value || '3'),
                askBeforeRun: document.getElementById('askBeforeRunToggle')?.checked || false,
                profile: selectedProfile
            }

            vscode.postMessage({
                type: 'saveSettings',
                settings: { modelPreset: preset, provider: prov, baseUrl, model, apiKey, customSystemPrompt, streaming, tools, safety }
            })
            closeSettingsPanel()
        })

        modelPreset?.addEventListener('change', () => {
            const selected = modelPreset.value
            if (selected === 'custom') return
            const presets = modelPreset._presets || []
            const hit = presets.find((p) => p.id === selected)
            if (!hit) return
            const providerEl = document.getElementById('provider')
            const baseUrlEl = document.getElementById('baseUrl')
            const modelEl = document.getElementById('modelName')
            if (providerEl) providerEl.value = hit.provider
            if (baseUrlEl) baseUrlEl.value = hit.baseUrl
            if (modelEl) modelEl.value = hit.model
            providerEl?.dispatchEvent(new Event('change'))
        })

        // New chat - just clear messages
        newChatBtn?.addEventListener('click', () => {
            messages = []
            pendingChanges = { files: 0, added: 0, removed: 0 }
            updateDiffBar()
            renderApp()
        })

        rejectAllBtn?.addEventListener('click', () => {
            vscode.postMessage({ type: 'rejectAll' })
            pendingChanges = { files: 0, added: 0, removed: 0 }
            updateDiffBar()
        })

        acceptAllBtn?.addEventListener('click', () => {
            vscode.postMessage({ type: 'acceptAll' })
            pendingChanges = { files: 0, added: 0, removed: 0 }
            updateDiffBar()
        })

        attachBtn?.addEventListener('click', () => {
            vscode.postMessage({ type: 'attachFile' })
        })

        // Toolbar buttons
        atBtn?.addEventListener('click', () => {
            const input = document.getElementById('messageInput')
            if (input) {
                input.value += '@'
                input.focus()
            }
        })

        lastSessionBtn?.addEventListener('click', () => {
            vscode.postMessage({ type: 'loadLastSession' })
        })

        editModeBtn?.addEventListener('click', () => {
            editModeBtn.classList.toggle('active')
            vscode.postMessage({ type: 'toggleEditMode', enabled: editModeBtn.classList.contains('active') })
        })

        diffModeBtn?.addEventListener('click', () => {
            diffModeBtn.classList.toggle('active')
            vscode.postMessage({ type: 'toggleDiffMode', enabled: diffModeBtn.classList.contains('active') })
        })

        modelSelectorBtn?.addEventListener('click', () => {
            openSettings()
        })

        root?.addEventListener('click', async (e) => {
            const target = e.target.closest('.msg-action-btn, .thought-header')
            if (!target) return

            if (target.classList.contains('thought-header')) {
                target.parentElement?.classList.toggle('expanded')
                return
            }

            const title = target.getAttribute('title')
            if (title === 'Copy') {
                const message = target.closest('.message')
                const text = message?.querySelector('.msg-content')?.textContent || ''
                if (!text) return
                try {
                    await navigator.clipboard.writeText(text)
                    target.textContent = '&#10003;'
                    setTimeout(() => { target.textContent = '&#10629;' }, 1200)
                } catch {
                    vscode.postMessage({ type: 'notify', level: 'error', text: 'Failed to copy text' })
                }
            } else if (title === 'Like' || title === 'Dislike') {
                vscode.postMessage({ type: 'notify', level: 'info', text: `${title} received` })
            }
        })
    }

    function updateDiffBar() {
        const bar = document.getElementById('diffBar')
        const stats = document.getElementById('diffStats')
        if (!bar || !stats) return
        if (pendingChanges.files === 0) {
            bar.classList.add('hidden')
        } else {
            bar.classList.remove('hidden')
            stats.innerHTML = `
                ${pendingChanges.files} file${pendingChanges.files !== 1 ? 's' : ''}
                <span class="stat-add">+${pendingChanges.added}</span>
                <span class="stat-del">-${pendingChanges.removed}</span>
            `
        }
    }

    function sendMessage() {
        const input = document.getElementById('messageInput')
        const text = input?.value.trim()
        if (!text) return

        const welcome = document.querySelector('.welcome-message')
        if (welcome) welcome.remove()

        messages.push({ role: 'user', content: text })
        input.value = ''
        input.style.height = 'auto'
        input.style.overflowY = 'hidden'
        renderMessages()

        vscode.postMessage({ type: 'sendMessage', text })
    }

    function renderMessages() {
        const container = document.getElementById('messages')
        if (!container) return

        const welcome = container.querySelector('.welcome-message')

        const html = messages.map((m) => {
            if (m.role === 'user') {
                return `
                <div class="message user">
                    <div class="msg-content">${escapeHtml(m.content)}</div>
                    <div class="msg-actions">
                        <div class="msg-actions-left"></div>
                        <div class="msg-actions-right">
                            <button class="msg-action-btn" title="Copy">⧉</button>
                        </div>
                    </div>
                </div>`
            }
            if (m.role === 'thinking') {
                const sec = m.seconds || ''
                return `
                <div class="thought-block" id="thought-${m.id || ''}">
                    <div class="thought-header">
                        <span class="thought-chevron">▶</span>
                        Thought${sec ? ` for ${sec}s` : ''}
                    </div>
                    <div class="thought-body">${escapeHtml(m.content)}</div>
                </div>`
            }
            if (m.role === 'assistant') {
                const blocks = renderAssistantContent(m.content, m.toolResults)
                return `
                <div class="message assistant">
                    ${blocks}
                    <div class="msg-actions">
                        <div class="msg-actions-left">
                            <button class="msg-action-btn" title="Like">👍</button>
                            <button class="msg-action-btn" title="Dislike">👎</button>
                        </div>
                        <div class="msg-actions-right">
                            <button class="msg-action-btn" title="Copy">⧉</button>
                        </div>
                    </div>
                </div>`
            }
            if (m.role === 'error') {
                return `
                <div class="message error">
                    <div class="msg-content">${escapeHtml(m.content)}</div>
                </div>`
            }
            return ''
        }).join('')

        container.innerHTML = (welcome ? welcome.outerHTML : '') + html
        container.scrollTop = container.scrollHeight
    }

    function renderAssistantContent(text, toolResults) {
        let out = ''
        // detect code blocks (``` fences)
        const parts = text.split(/(```[\s\S]*?```)/g)
        parts.forEach(part => {
            if (part.startsWith('```')) {
                const lines = part.slice(3, -3).split('\n')
                const lang = lines[0].trim() || 'code'
                const code = lines.slice(1).join('\n')
                out += `
                <div class="code-block">
                    <div class="code-block-header">
                        <div class="code-block-filename">
                            <span class="code-block-lang">${escapeHtml(lang)}</span>
                        </div>
                    </div>
                    <div class="code-block-body">${escapeHtml(code)}</div>
                </div>`
            } else if (part.trim()) {
                // detect [LOG] blocks
                const logMatch = part.match(/\[LOG\]([\s\S]*?)\[\/LOG\]/g)
                if (logMatch) {
                    const beforeLog = part.replace(/\[LOG\][\s\S]*?\[\/LOG\]/g, '').trim()
                    if (beforeLog) out += `<div class="msg-content">${escapeHtml(beforeLog)}</div>`
                    logMatch.forEach(lb => {
                        const content = lb.replace('[LOG]', '').replace('[/LOG]', '').trim()
                        out += `<div class="log-block">${renderLogLines(content)}</div>`
                    })
                } else {
                    out += `<div class="msg-content">${escapeHtml(part)}</div>`
                }
            }
        })

        if (toolResults && toolResults.length > 0) {
            toolResults.forEach(r => {
                out += `
                <div class="log-block">
                    ${r.error
                        ? `<span class="log-line-error">Error: ${escapeHtml(r.error)}</span>`
                        : renderLogLines(r.output?.slice(0, 600) || '')
                    }
                </div>`
            })
        }

        return out || `<div class="msg-content">${escapeHtml(text)}</div>`
    }

    function renderLogLines(text) {
        return text.split('\n').map(line => {
            const cls = line.includes('Error') || line.includes('error') ? 'log-line-error'
                      : line.includes('warn') || line.includes('Warn') ? 'log-line-warn'
                      : 'log-line-ok'
            return `<span class="${cls}">${escapeHtml(line)}</span>`
        }).join('\n')
    }

    function escapeHtml(text) {
        if (!text) return ''
        const div = document.createElement('div')
        div.textContent = text
        return div.innerHTML
    }

    function renderContextChips(chips) {
        const container = document.getElementById('contextChipsContainer')
        if (!container) return

        if (!chips || chips.length === 0) {
            container.classList.add('hidden')
            container.innerHTML = ''
            return
        }

        const chipIcons = {
            file: '📄',
            symbol: '⚡',
            terminal_error: '❌',
            selection: '✂️',
            rag_result: '🔍',
            memory: '🧠'
        }

        container.innerHTML = chips.map(chip => `
            <div class="context-chip ${chip.type}" title="${escapeHtml(chip.label)}">
                <span class="context-chip-icon">${chipIcons[chip.type] || '•'}</span>
                <span>${escapeHtml(chip.label)}</span>
            </div>
        `).join('')

        container.classList.remove('hidden')
    }

    // === Execution Timeline ===
    function clearExecutionTimeline() {
        const timeline = document.getElementById('executionTimeline')
        if (timeline) timeline.innerHTML = ''
    }

    function addTimelineItem(type, title, details = '') {
        const timeline = document.getElementById('executionTimeline')
        if (!timeline) return

        const icons = {
            plan: '🧠',
            edit: '✏️',
            run: '🧪',
            error: '❌',
            fix: '🔧',
            success: '✅',
            info: 'ℹ️'
        }

        const item = document.createElement('div')
        item.className = `timeline-item ${type}`
        item.innerHTML = `
            <div class="timeline-icon">${icons[type] || '•'}</div>
            <div class="timeline-content">
                <div class="timeline-title">${title}</div>
                ${details ? `<div class="timeline-details">${details}</div>` : ''}
            </div>
        `
        timeline.appendChild(item)
        timeline.scrollTop = timeline.scrollHeight
    }

    function updateStatus(status, text) {
        const statusBar = document.getElementById('statusBar')
        const indicator = document.getElementById('statusIndicator')
        const statusText = document.getElementById('statusText')
        
        if (!statusBar || !indicator || !statusText) return

        statusBar.classList.remove('hidden')
        statusText.textContent = text

        const statusClasses = {
            idle: '',
            collecting: 'status-working',
            planning: 'status-working',
            executing: 'status-working',
            running: 'status-running',
            parsing_error: 'status-error',
            fixing: 'status-working',
            success: 'status-success',
            error: 'status-error',
            max_iterations: 'status-warning'
        }

        indicator.className = 'status-indicator ' + (statusClasses[status] || '')
    }

    window.openSettings = function() {
        const settingsPanel = document.getElementById('settingsPanel')
        const settingsBackdrop = document.getElementById('settingsBackdrop')
        settingsPanel?.classList.add('visible')
        settingsBackdrop?.classList.add('visible')
    }

    window.addEventListener('message', (event) => {
        const msg = event.data
        switch (msg.type) {
            case 'thinking':
                // remove previous thinking block
                messages = messages.filter(m => m.role !== 'thinking')
                messages.push({ role: 'thinking', content: msg.content, seconds: msg.seconds })
                renderMessages()
                break
            case 'contextChips':
                renderContextChips(msg.chips)
                break
            case 'response':
                messages = messages.filter(m => m.role !== 'thinking')
                messages.push({ role: 'assistant', content: msg.content })
                renderMessages()
                renderContextChips([])
                break
            case 'error':
                messages = messages.filter(m => m.role !== 'thinking')
                messages.push({ role: 'error', content: msg.content })
                renderMessages()
                break
            case 'fileChanges':
                pendingChanges = {
                    files:   msg.files   || 0,
                    added:   msg.added   || 0,
                    removed: msg.removed || 0
                }
                updateDiffBar()
                break
            case 'taskStatus':
                updateStatus(msg.status, msg.text)
                if (msg.status === 'success' || msg.status === 'error' || msg.status === 'max_iterations') {
                    document.getElementById('stopBtn')?.classList.add('hidden')
                }
                break
            case 'executionLog':
                addTimelineItem(msg.logType, msg.title, msg.details)
                break
            case 'intentAnalysis':
                // Progressive UI: show action chips based on intent
                if (msg.actions && msg.actions.length > 0) {
                    showActionChips(msg.actions, msg.input)
                } else {
                    document.getElementById('actionChipsContainer')?.classList.add('hidden')
                }
                break
            case 'settings':
                const s = msg.settings
                const providerEl  = document.getElementById('provider')
                const baseUrlEl   = document.getElementById('baseUrl')
                const modelEl     = document.getElementById('modelName')
                const apiKeyEl    = document.getElementById('apiKey')
                const apiKeyRow   = document.getElementById('apiKeyRow')
                const presetEl    = document.getElementById('modelPreset')
                const customPromptEl = document.getElementById('customSystemPrompt')
                const streamingToggle = document.getElementById('streamingToggle')
                const presets = Array.isArray(s.modelPresets) ? s.modelPresets : []
                if (presetEl) {
                    presetEl._presets = presets
                    presetEl.innerHTML = [
                        `<option value="custom">Custom</option>`,
                        ...presets.filter(p => p.id !== 'custom').map(p => `<option value="${p.id}">${escapeHtml(p.label)}</option>`)
                    ].join('')
                    presetEl.value = s.modelPreset || 'custom'
                }
                if (providerEl) providerEl.value = s.provider || 'ollama'
                if (baseUrlEl)  baseUrlEl.value  = s.baseUrl  || 'http://127.0.0.1:11434'
                if (modelEl)    modelEl.value    = s.model    || 'llama3.1'
                if (apiKeyEl)   apiKeyEl.value   = s.apiKey   || ''
                if (customPromptEl) customPromptEl.value = s.customSystemPrompt || ''
                if (streamingToggle) streamingToggle.checked = s.streaming || false
                if (apiKeyRow)  apiKeyRow.style.display = s.provider === 'openai-compatible' ? 'block' : 'none'
                break
            case 'toolResult':
                const lastMsg = messages[messages.length - 1]
                if (lastMsg && lastMsg.role === 'assistant') {
                    if (!lastMsg.toolResults) lastMsg.toolResults = []
                    lastMsg.toolResults.push(msg)
                    renderMessages()
                }
                break
            case 'streamChunk':
                if (!isStreaming) {
                    isStreaming = true
                    streamingContent = ''
                    messages = messages.filter(m => m.role !== 'thinking')
                    messages.push({ role: 'assistant', content: '', isStreaming: true })
                }
                streamingContent += msg.content || ''
                const streamMsg = messages[messages.length - 1]
                if (streamMsg && streamMsg.isStreaming) {
                    streamMsg.content = streamingContent
                    renderMessages()
                }
                break
            case 'streamDone':
                isStreaming = false
                const doneMsg = messages[messages.length - 1]
                if (doneMsg && doneMsg.isStreaming) {
                    delete doneMsg.isStreaming
                }
                streamingContent = ''
                break
            case 'clearHistory':
                messages = []
                renderMessages()
                renderApp()
                break
            case 'insertText':
                const input = document.getElementById('messageInput')
                if (!input) break
                const existing = input.value.trim()
                input.value = existing ? `${existing}\n${msg.text}` : msg.text
                input.focus()
                input.dispatchEvent(new Event('input'))
                break
        }
    })
}())
