import { workspace, window, WorkspaceFolder, OutputChannel, commands, Uri, Range, Position } from "vscode";
import { LanguageClient } from "vscode-languageclient/node";
import { connect } from "node:net";
import { request } from "node:http";

const outputChannel: OutputChannel = window.createOutputChannel("Unison");
const clients: Map<string, LanguageClient> = new Map();
// This is global mutable state so that when the extension host gets restarted after
// the terminal is closed, we don't immediately open another one.
let shouldOpenTerminal = true;

function log(msg: string) {
  outputChannel.appendLine(msg);
}

exports.activate = function () {
  workspace.workspaceFolders?.forEach((folder) => addWorkspaceFolder(folder));
  workspace.onDidChangeWorkspaceFolders(({ added, removed }) => {
    added.forEach((folder) => addWorkspaceFolder(folder));
    removed.forEach((folder) => removeWorkspaceFolder(folder));
  });

  // Register "Open in Share" command
  commands.registerCommand('unison.openInShare', openInShare);
};

exports.deactivate = async function () {
  await Promise.all([...clients.values()].map((client) => client.stop()));
};

async function addWorkspaceFolder(workspaceFolder: WorkspaceFolder) {
  let folderPath = workspaceFolder.uri.fsPath;
  if (clients.has(folderPath)) return;

  let client = new LanguageClient("unison", "Unison", connectToServer, {
    workspaceFolder,
    outputChannel,
    documentSelector: [{ language: "unison" }],
  });

  log(`Activating unison language server at ${folderPath}`);
  clients.set(folderPath, client);
  await client.start();
}

async function removeWorkspaceFolder(workspaceFolder: WorkspaceFolder) {
  let folderPath = workspaceFolder.uri.fsPath;
  let client = clients.get(folderPath);
  if (client) {
    log(`Deactivating unison language server at ${folderPath}`);
    clients.delete(folderPath);
    await client.stop();
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function connectToServer() {
  let haveShownError = false;

  while (true) {
    try {
      const host = "127.0.0.1";
      const port = workspace.getConfiguration("unison").lspPort;

      log(`Trying to connect to ucm lsp server at ${host}:${port}`);
      let socket = connect({ port, host: "127.0.0.1" });
      await new Promise((resolve, reject) =>
        socket.once("connect", resolve).once("error", reject)
      );

      shouldOpenTerminal = false;
      // Show a success message, but only if we were in an error state
      const okMsg = `Unison: Connected to Language Server at ${host}:${port}.`;
      log(okMsg);
      if (haveShownError) {
        window.showInformationMessage(okMsg);
      }
      return { reader: socket, writer: socket };
    } catch (e) {
      const errMsg = "Language server failed to connect";
      log(`${errMsg}, cause: ${e}`);

      // Only ever try to open the terminal once, so we don't get stuck in weird loops
      // or in a strange state if the user tries to quit UCM or close the terminal.
      if (
        shouldOpenTerminal &&
        workspace.getConfiguration("unison").automaticallyOpenUCM
      ) {
        let ucmCommand = workspace.getConfiguration("unison").ucmCommand;
        shouldOpenTerminal = false;
        log("Opening ucm terminal");
        // Start up a new terminal in the IDE, tell it to run UCM, and then show it.
        const terminal = window.createTerminal();
        terminal.sendText(ucmCommand);
        terminal.show();
      } else if (!haveShownError) {
        haveShownError = true;
        window.showErrorMessage(
          `Unison: ${errMsg}, is there a UCM running? (version M4a or later)`
        );
      }
      await sleep(2000);
      continue;
    }
  }
}

async function openInShare() {
  const editor = window.activeTextEditor;
  if (!editor) {
    window.showErrorMessage('No active editor found');
    return;
  }

  const document = editor.document;
  const position = editor.selection.active;
  const fileUri = document.uri.toString();

  // Get the symbol at the current position
  const wordRange = document.getWordRangeAtPosition(position);
  if (!wordRange) {
    window.showErrorMessage('No symbol found at cursor position');
    return;
  }

  const symbolName = document.getText(wordRange);
  
  // Get the location (line and column) - VS Code uses 0-based indexing
  const line = wordRange.start.line + 1; // Convert to 1-based
  const column = wordRange.start.character + 1; // Convert to 1-based
  const loc = `${line}:${column}`;

  // Construct the URL with query parameters
  const url = `http://localhost:5424/open-on-share?fqn=${encodeURIComponent(symbolName)}&fileURI=${encodeURIComponent(fileUri)}&loc=${encodeURIComponent(loc)}`;

  log(`Opening in Share: ${url}`);

  // Make HTTP POST request
  try {
    await makeHttpPost(url);
    window.showInformationMessage(`Opened "${symbolName}" in Share`);
  } catch (error) {
    window.showErrorMessage(`Failed to open in Share: ${error}`);
    log(`Error opening in Share: ${error}`);
  }
}

function makeHttpPost(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'POST',
      headers: {
        'Content-Length': '0'
      }
    };

    const req = request(options, (res) => {
      if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
        resolve();
      } else {
        reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
      }
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.end();
  });
}
