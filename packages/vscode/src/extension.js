const vscode = require('vscode');
const { LixSketchEditorProvider } = require('./EditorProvider');

function activate(context) {
    // Register the custom editor provider for .lixsketch files
    const provider = new LixSketchEditorProvider(context);
    context.subscriptions.push(
        vscode.window.registerCustomEditorProvider(
            'lixsketch.editor',
            provider,
            {
                webviewOptions: { retainContextWhenHidden: true },
                supportsMultipleEditorsPerDocument: false,
            }
        )
    );

    // Register the "New Diagram" command
    context.subscriptions.push(
        vscode.commands.registerCommand('lixsketch.newDiagram', async () => {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            let targetDir;

            if (workspaceFolders && workspaceFolders.length > 0) {
                targetDir = workspaceFolders[0].uri;
            } else {
                const selected = await vscode.window.showOpenDialog({
                    canSelectFiles: false,
                    canSelectFolders: true,
                    canSelectMany: false,
                    openLabel: 'Select folder',
                });
                if (!selected || selected.length === 0) return;
                targetDir = selected[0];
            }

            const name = await vscode.window.showInputBox({
                prompt: 'Diagram name',
                value: 'untitled',
            });
            if (!name) return;

            const fileName = name.endsWith('.lixsketch') ? name : `${name}.lixsketch`;
            const fileUri = vscode.Uri.joinPath(targetDir, fileName);

            // Write empty scene
            const emptyScene = JSON.stringify({
                format: 'lixsketch',
                version: 1,
                name: name.replace('.lixsketch', ''),
                createdAt: new Date().toISOString(),
                viewport: { x: 0, y: 0, width: 1920, height: 1080 },
                zoom: 1,
                shapes: [],
            }, null, 2);

            await vscode.workspace.fs.writeFile(fileUri, Buffer.from(emptyScene, 'utf-8'));
            await vscode.commands.executeCommand('vscode.openWith', fileUri, 'lixsketch.editor');
        })
    );

    console.log('[LixSketch] Extension activated');
}

function deactivate() {}

module.exports = { activate, deactivate };
