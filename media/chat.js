(function () {
    const vscode = acquireVsCodeApi()

    let messages = []
    let settingsVisible = false

    const root = document.getElementById('root')
    renderApp()

    function renderApp() {
        root.innerHTML = `
            <div class="header">
                <h2>chat</h2>
                <button id="settingsBtn">settings</button>
            </div>
            <div class="settings-panel" id="settingsPanel">
                <h3>model settings</h3>
                <div class="setting">
                    <label>provider</label>
                    <select id="provider">
                        <option value="ollama">ollama</option>
                        <option value="openai-compatible">openai-compatible</option>
                    </select>
                </div>
                <div class="setting">
                    <label>base url</label>
                    <input type="text" id="baseUrl" value="http://127.0.0.1:11434">
                </div>
                <div class="setting">
                    <label>model name</label>
                    <input type="text" id="modelName" value="llama3.1">
                </div>
                <div class="setting">
                    <label>api key</label>
                    <input type="password" id="apiKey" value="">
                </div>
                <button id="saveSettingsBtn">save</button>
            </div>
            <div class="messages" id="messages"></div>
            <div class="input-container">
                <div class="input-row">
                    <textarea id="messageInput" placeholder="type a message..." rows="1"></textarea>
                </div>
                <div class="input-row">
                    <button id="sendBtn">send</button>
                </div>
            </div>
        `

        bindEvents()
        renderMessages()
        vscode.postMessage({ type: 'getSettings' })
    }

    function bindEvents() {
        const sendBtn = document.getElementById('sendBtn')
        const messageInput = document.getElementById('messageInput')
        const settingsBtn = document.getElementById('settingsBtn')
        const settingsPanel = document.getElementById('settingsPanel')
        const saveSettingsBtn = document.getElementById('saveSettingsBtn')

        sendBtn?.addEventListener('click', sendMessage)

        messageInput?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                sendMessage()
            }
        })

        messageInput?.addEventListener('input', function () {
            this.style.height = 'auto'
            this.style.height = Math.min(this.scrollHeight, 120) + 'px'
        })

        settingsBtn?.addEventListener('click', () => {
            settingsVisible = !settingsVisible
            settingsPanel?.classList.toggle('visible', settingsVisible)
        })

        saveSettingsBtn?.addEventListener('click', () => {
            const provider = document.getElementById('provider')?.value
            const baseUrl = document.getElementById('baseUrl')?.value
            const model = document.getElementById('modelName')?.value
            const apiKey = document.getElementById('apiKey')?.value

            vscode.postMessage({
                type: 'saveSettings',
                settings: { provider, baseUrl, model, apiKey }
            })

            settingsVisible = false
            settingsPanel?.classList.remove('visible')
        })
    }

    function sendMessage() {
        const input = document.getElementById('messageInput')
        const text = input?.value.trim()
        if (!text) return

        messages.push({ role: 'user', content: text })
        input.value = ''
        input.style.height = 'auto'
        renderMessages()

        vscode.postMessage({ type: 'sendMessage', text })
    }

    function renderMessages() {
        const container = document.getElementById('messages')
        if (!container) return

        container.innerHTML = messages.map((m) => `
            <div class="message ${m.role}">
                ${escapeHtml(m.content)}
                ${m.toolResults ? renderToolResults(m.toolResults) : ''}
            </div>
        `).join('')

        container.scrollTop = container.scrollHeight
    }

    function renderToolResults(results) {
        if (!results || results.length === 0) return ''
        return results.map((r) => `
            <div class="tool-result ${r.error ? 'error' : 'success'}">
                ${r.error ? `error: ${escapeHtml(r.error)}` : escapeHtml(r.output.slice(0, 500))}
            </div>
        `).join('')
    }

    function escapeHtml(text) {
        const div = document.createElement('div')
        div.textContent = text
        return div.innerHTML
    }

    window.addEventListener('message', (event) => {
        const msg = event.data

        switch (msg.type) {
            case 'thinking':
                messages.push({ role: 'thinking', content: msg.content })
                renderMessages()
                break
            case 'response':
                messages = messages.filter((m) => m.role !== 'thinking')
                messages.push({ role: 'assistant', content: msg.content })
                renderMessages()
                break
            case 'error':
                messages = messages.filter((m) => m.role !== 'thinking')
                messages.push({ role: 'error', content: msg.content })
                renderMessages()
                break
            case 'settings':
                const s = msg.settings
                const providerEl = document.getElementById('provider')
                const baseUrlEl = document.getElementById('baseUrl')
                const modelEl = document.getElementById('modelName')
                const apiKeyEl = document.getElementById('apiKey')
                if (providerEl) providerEl.value = s.provider || 'ollama'
                if (baseUrlEl) baseUrlEl.value = s.baseUrl || 'http://127.0.0.1:11434'
                if (modelEl) modelEl.value = s.model || 'llama3.1'
                if (apiKeyEl) apiKeyEl.value = s.apiKey || ''
                break
            case 'toolResult':
                const lastMsg = messages[messages.length - 1]
                if (lastMsg && lastMsg.role === 'assistant') {
                    if (!lastMsg.toolResults) lastMsg.toolResults = []
                    lastMsg.toolResults.push(msg)
                    renderMessages()
                }
                break
            case 'lineChat':
                const prefix = msg.kind === 'explain'
                    ? `explain line ${msg.line} in ${msg.relPath}:`
                    : `fix line ${msg.line} in ${msg.relPath}:`
                const input = document.getElementById('messageInput')
                if (input) input.value = prefix
                break
        }
    })
}())
