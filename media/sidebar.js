(function () {
    const vscode = acquireVsCodeApi()

    const openChatBtn = document.getElementById('openChatBtn')
    const fileList = document.getElementById('fileList')

    openChatBtn?.addEventListener('click', () => {
        vscode.postMessage({ type: 'openChat' })
    })

    vscode.postMessage({ type: 'getFiles' })

    window.addEventListener('message', (event) => {
        const message = event.data

        switch (message.type) {
            case 'fileList':
                renderFileList(message.files)
                break
        }
    })

    function renderFileList(files) {
        if (!fileList) return
        fileList.innerHTML = ''

        files.sort().forEach((f) => {
            const div = document.createElement('div')
            div.className = 'file-item'
            div.textContent = f
            div.title = f
            div.addEventListener('click', () => {
                vscode.postMessage({ type: 'openFile', relPath: f })
            })
            fileList.appendChild(div)
        })
    }
}())
