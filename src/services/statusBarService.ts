/**
 * Status Bar Service
 * Manages status bar items for model indicator and autocomplete toggle
 */

import * as vscode from 'vscode'
import { getAutocompleteService } from './autocompleteService'

export class StatusBarService {
    private modelIndicator: vscode.StatusBarItem
    private autocompleteToggle: vscode.StatusBarItem
    private autocompleteService: any

    constructor(private context: vscode.ExtensionContext) {
        this.modelIndicator = vscode.window.createStatusBarItem(
            'lexentia.modelIndicator',
            vscode.StatusBarAlignment.Right,
            100
        )
        this.autocompleteToggle = vscode.window.createStatusBarItem(
            'lexentia.autocompleteToggle',
            vscode.StatusBarAlignment.Right,
            101
        )

        this.modelIndicator.name = 'Lexentia Model Indicator'
        this.autocompleteToggle.name = 'Lexentia Autocomplete Toggle'

        this.modelIndicator.command = 'lexentia.openChat'
        this.autocompleteToggle.command = 'lexentia.toggleAutocomplete'

        this.setupCommands()
        this.setupConfigurationListener()
        this.update()
    }

    private setupCommands(): void {
        const toggleCommand = vscode.commands.registerCommand('lexentia.toggleAutocomplete', () => {
            this.toggleAutocomplete()
        })
        this.context.subscriptions.push(toggleCommand)
    }

    private setupConfigurationListener(): void {
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('lexentia.models') || 
                e.affectsConfiguration('lexentia.roles') ||
                e.affectsConfiguration('lexentia.autocomplete')) {
                this.update()
            }
        })
    }

    private toggleAutocomplete(): void {
        if (!this.autocompleteService) {
            this.autocompleteService = getAutocompleteService(this.context)
        }
        
        const isEnabled = this.autocompleteService.toggle()
        this.update()

        vscode.window.showInformationMessage(
            `Autocomplete ${isEnabled ? 'enabled' : 'disabled'}`
        )
    }

    private update(): void {
        this.updateModelIndicator()
        this.updateAutocompleteToggle()
    }

    private updateModelIndicator(): void {
        const config = vscode.workspace.getConfiguration('lexentia')
        const models = config.get<any[]>('models', [])
        const roleIndex = config.get<string>('roles.chat', '0')
        const modelConfig = models[parseInt(roleIndex)] || models[0]

        if (modelConfig) {
            const provider = modelConfig.provider === 'ollama' ? '🦙' : '🌐'
            const modelName = modelConfig.model.length > 15 
                ? modelConfig.model.substring(0, 15) + '...' 
                : modelConfig.model
            
            this.modelIndicator.text = `${provider} ${modelName}`
            this.modelIndicator.tooltip = `Model: ${modelConfig.model}\nProvider: ${modelConfig.provider}\nBase URL: ${modelConfig.apiBaseUrl}`
            this.modelIndicator.show()
        } else {
            this.modelIndicator.hide()
        }
    }

    private updateAutocompleteToggle(): void {
        const config = vscode.workspace.getConfiguration('lexentia.autocomplete')
        const isEnabled = config.get<boolean>('enabled', true)

        if (isEnabled) {
            this.autocompleteToggle.text = '$(lightbulb) Auto'
            this.autocompleteToggle.tooltip = 'Autocomplete is enabled (click to disable)'
            this.autocompleteToggle.backgroundColor = undefined
        } else {
            this.autocompleteToggle.text = '$(lightbulb) Auto'
            this.autocompleteToggle.tooltip = 'Autocomplete is disabled (click to enable)'
            this.autocompleteToggle.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground')
        }

        this.autocompleteToggle.show()
    }

    show(): void {
        this.modelIndicator.show()
        this.autocompleteToggle.show()
    }

    hide(): void {
        this.modelIndicator.hide()
        this.autocompleteToggle.hide()
    }

    dispose(): void {
        this.modelIndicator.dispose()
        this.autocompleteToggle.dispose()
    }
}

// Singleton
let statusBarService: StatusBarService | null = null

export function getStatusBarService(context: vscode.ExtensionContext): StatusBarService {
    if (!statusBarService) {
        statusBarService = new StatusBarService(context)
    }
    return statusBarService
}
