(function () {
    const vscode = acquireVsCodeApi()

    let messages = []
    let tabs = [{ id: 1, title: 'Chat 1', active: true }]
    let nextTabId = 2
    let pendingChanges = { files: 0, added: 0, removed: 0 }

    const root = document.getElementById('root')
    renderApp()

    function renderApp() {
        root.innerHTML = `
            <div class="chat-tabs" id="chatTabs">
                ${renderTabs()}
                <div class="tabs-actions">
                    <button class="tab-action-btn" id="newChatBtn" title="New chat">+</button>
                    <button class="tab-action-btn" id="settingsBtn" title="Settings">⚙</button>
                </div>
            </div>
            <div class="messages" id="messages">
                <div class="welcome-message">
                    <div class="welcome-logo">Lexentia</div>
                    <div class="welcome-content">Connect a model in Settings and describe your task.</div>
                </div>
            </div>
            <div class="diff-bar hidden" id="diffBar">
                <div class="diff-stats" id="diffStats"></div>
                <div class="diff-btns">
                    <button class="diff-btn reject" id="rejectAllBtn">Reject all</button>
                    <button class="diff-btn accept" id="acceptAllBtn">Accept all</button>
                </div>
            </div>
            <div class="input-footer">
                <div class="input-row">
                    <textarea id="messageInput" placeholder="Ask anything (Ctrl+L)" rows="1"></textarea>
                    <div class="input-actions">
                        <button class="input-icon-btn" id="attachBtn" title="Attach file">⊕</button>
                        <button class="input-icon-btn send-btn" id="sendBtn" title="Send (Enter)">▲</button>
                    </div>
                </div>
                <div class="statusbar-row">
                    <div class="statusbar-left">
                        <button class="statusbar-btn" id="modeBtn">&lt;&gt; Code</button>
                    </div>
                    <div class="statusbar-right"></div>
                </div>
            </div>
            <div class="settings-panel" id="settingsPanel">
                <div class="settings-header">
                    <h3>Settings</h3>
                    <button class="close-settings" id="closeSettings">×</button>
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
                <button class="save-settings-btn" id="saveSettingsBtn">Save</button>
            </div>
        `
        bindEvents()
        vscode.postMessage({ type: 'getSettings' })
    }

    function renderTabs() {
        return tabs.map(t => `
            <div class="tab ${t.active ? 'active' : ''}" data-id="${t.id}">
                ${escapeHtml(t.title)}
            </div>
        `).join('')
    }

    function bindEvents() {
        const sendBtn       = document.getElementById('sendBtn')
        const messageInput  = document.getElementById('messageInput')
        const settingsBtn   = document.getElementById('settingsBtn')
        const closeSettings = document.getElementById('closeSettings')
        const settingsPanel = document.getElementById('settingsPanel')
        const saveSettingsBtn = document.getElementById('saveSettingsBtn')
        const provider      = document.getElementById('provider')
        const modelPreset   = document.getElementById('modelPreset')
        const newChatBtn    = document.getElementById('newChatBtn')
        const rejectAllBtn  = document.getElementById('rejectAllBtn')
        const acceptAllBtn  = document.getElementById('acceptAllBtn')
        const chatTabs      = document.getElementById('chatTabs')
        const attachBtn     = document.getElementById('attachBtn')
        const modeBtn       = document.getElementById('modeBtn')

        sendBtn?.addEventListener('click', sendMessage)

        messageInput?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                sendMessage()
            }
        })

        messageInput?.addEventListener('input', function () {
            this.style.height = 'auto'
            this.style.overflowY = 'hidden'
            const newH = Math.min(this.scrollHeight, 120)
            this.style.height = newH + 'px'
            this.style.overflowY = this.scrollHeight > 120 ? 'auto' : 'hidden'
        })

        settingsBtn?.addEventListener('click', () => {
            settingsPanel?.classList.toggle('visible')
        })

        closeSettings?.addEventListener('click', () => {
            settingsPanel?.classList.remove('visible')
        })

        // close settings on outside click
        document.addEventListener('click', (e) => {
            if (settingsPanel?.classList.contains('visible')) {
                if (!settingsPanel.contains(e.target) && e.target !== settingsBtn) {
                    settingsPanel.classList.remove('visible')
                }
            }
        })

        provider?.addEventListener('change', (e) => {
            const apiKeyRow = document.getElementById('apiKeyRow')
            apiKeyRow.style.display = e.target.value === 'openai-compatible' ? 'block' : 'none'
        })

        saveSettingsBtn?.addEventListener('click', () => {
            const prov    = document.getElementById('provider')?.value
            const baseUrl = document.getElementById('baseUrl')?.value
            const model   = document.getElementById('modelName')?.value
            const apiKey  = document.getElementById('apiKey')?.value
            const preset  = document.getElementById('modelPreset')?.value || 'custom'
            const customSystemPrompt = document.getElementById('customSystemPrompt')?.value || ''
            vscode.postMessage({ type: 'saveSettings', settings: { modelPreset: preset, provider: prov, baseUrl, model, apiKey, customSystemPrompt } })
            settingsPanel?.classList.remove('visible')
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

        newChatBtn?.addEventListener('click', () => {
            const id = nextTabId++
            // deactivate all
            tabs.forEach(t => t.active = false)
            tabs.push({ id, title: `Chat ${id}`, active: true })
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

        modeBtn?.addEventListener('click', () => {
            const isCodeMode = modeBtn.textContent?.includes('Code')
            modeBtn.textContent = isCodeMode ? 'Ask' : '<> Code'
        })

        chatTabs?.addEventListener('click', (e) => {
            const tab = e.target.closest('.tab')
            if (tab) {
                const id = parseInt(tab.dataset.id)
                tabs.forEach(t => t.active = t.id === id)
                // re-render tabs area only
                const tabsContainer = document.getElementById('chatTabs')
                if (tabsContainer) {
                    const actions = tabsContainer.querySelector('.tabs-actions')
                    tabsContainer.innerHTML = renderTabs()
                    tabsContainer.appendChild(actions)
                }
            }
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
                    target.textContent = '✓'
                    setTimeout(() => { target.textContent = '⧉' }, 1200)
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

    window.addEventListener('message', (event) => {
        const msg = event.data
        switch (msg.type) {
            case 'thinking':
                // remove previous thinking block
                messages = messages.filter(m => m.role !== 'thinking')
                messages.push({ role: 'thinking', content: msg.content, seconds: msg.seconds })
                renderMessages()
                break
            case 'response':
                messages = messages.filter(m => m.role !== 'thinking')
                messages.push({ role: 'assistant', content: msg.content })
                renderMessages()
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
            case 'settings':
                const s = msg.settings
                const providerEl  = document.getElementById('provider')
                const baseUrlEl   = document.getElementById('baseUrl')
                const modelEl     = document.getElementById('modelName')
                const apiKeyEl    = document.getElementById('apiKey')
                const apiKeyRow   = document.getElementById('apiKeyRow')
                const presetEl    = document.getElementById('modelPreset')
                const customPromptEl = document.getElementById('customSystemPrompt')
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
