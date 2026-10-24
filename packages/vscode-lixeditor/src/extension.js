const vscode = require('vscode');
const path = require('path');
const fs = require('fs');

class LixEditorProvider {
  static viewType = 'lixeditor.editor';

  constructor(context) {
    this.context = context;
  }

  static register(context) {
    const provider = new LixEditorProvider(context);
    return vscode.window.registerCustomEditorProvider(
      LixEditorProvider.viewType,
      provider,
      {
        webviewOptions: { retainContextWhenHidden: true },
        supportsMultipleEditorsPerDocument: false,
      }
    );
  }

  async resolveCustomTextEditor(document, webviewPanel) {
    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.file(path.join(this.context.extensionPath, 'webview')),
        vscode.Uri.file(path.join(this.context.extensionPath, 'media')),
      ],
    };

    const editorJsUri = webviewPanel.webview.asWebviewUri(
      vscode.Uri.file(path.join(this.context.extensionPath, 'webview', 'editor.js'))
    );

    // Read CSS and inline it to avoid CSP issues
    let cssContent = '';
    try {
      cssContent = fs.readFileSync(path.join(this.context.extensionPath, 'webview', 'editor.css'), 'utf8');
    } catch {}

    webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview, editorJsUri, cssContent);

    // Send initial content
    const initialContent = document.getText();
    let blocks = [];
    try {
      blocks = initialContent.trim() ? JSON.parse(initialContent) : [];
    } catch {
      blocks = [];
    }

    const messageHandler = webviewPanel.webview.onDidReceiveMessage((message) => {
      switch (message.type) {
        case 'ready':
          webviewPanel.webview.postMessage({ type: 'load', blocks });
          break;
        case 'update':
          const edit = new vscode.WorkspaceEdit();
          edit.replace(
            document.uri,
            new vscode.Range(0, 0, document.lineCount, 0),
            JSON.stringify(message.blocks, null, 2)
          );
          vscode.workspace.applyEdit(edit);
          break;
        case 'save':
          const saveEdit = new vscode.WorkspaceEdit();
          saveEdit.replace(
            document.uri,
            new vscode.Range(0, 0, document.lineCount, 0),
            JSON.stringify(message.blocks, null, 2)
          );
          vscode.workspace.applyEdit(saveEdit).then(() => {
            document.save();
          });
          break;
        case 'exportMarkdown':
          vscode.window.showSaveDialog({
            filters: { 'Markdown': ['md'] },
            saveLabel: 'Export Markdown',
          }).then(async (uri) => {
            if (uri && message.markdown) {
              const encoder = new TextEncoder();
              await vscode.workspace.fs.writeFile(uri, encoder.encode(message.markdown));
              vscode.window.showInformationMessage('Exported as Markdown: ' + uri.fsPath);
            }
          });
          break;
        case 'import':
          vscode.window.showOpenDialog({
            canSelectMany: false,
            filters: { 'LixEditor Files': ['lixeditor', 'json'], 'Markdown': ['md'] },
          }).then(uris => {
            if (uris && uris[0]) {
              vscode.workspace.fs.readFile(uris[0]).then(data => {
                const text = Buffer.from(data).toString('utf8');
                webviewPanel.webview.postMessage({ type: 'import', content: text });
              });
            }
          });
          break;
      }
    });

    const changeHandler = vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.uri.toString() === document.uri.toString() && e.contentChanges.length > 0) {
        try {
          const newBlocks = JSON.parse(e.document.getText());
          webviewPanel.webview.postMessage({ type: 'load', blocks: newBlocks });
        } catch {}
      }
    });

    webviewPanel.onDidDispose(() => {
      messageHandler.dispose();
      changeHandler.dispose();
    });
  }

  getHtmlForWebview(webview, editorJsUri, cssContent) {
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline' https://fonts.googleapis.com https://fonts.gstatic.com; font-src https://fonts.gstatic.com data:; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} https: data:; connect-src https:;">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,wght@0,400;0,500;0,600;0,650;0,700;1,400;1,500&display=swap" rel="stylesheet">
  <style>${cssContent}</style>
  <title>LixEditor</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${editorJsUri}"></script>
</body>
</html>`;
  }
}

function getNonce() {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

function activate(context) {
  vscode.window.showInformationMessage('LixEditor activated');
  context.subscriptions.push(LixEditorProvider.register(context));
  context.subscriptions.push(
    vscode.commands.registerCommand('lixeditor.newDocument', async () => {
      const uri = vscode.Uri.parse('untitled:New Document.lixeditor');
      const doc = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(doc);
    })
  );
}

function deactivate() {}

module.exports = { activate, deactivate };
