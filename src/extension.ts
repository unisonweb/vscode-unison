import {
  workspace,
  window,
  WorkspaceFolder,
  OutputChannel,
  commands,
  ExtensionContext,
} from "vscode";
import { LanguageClient } from "vscode-languageclient/node";
import { connect } from "node:net";
import { UnisonTreeProvider } from "./unisonTreeProvider";

const outputChannel: OutputChannel = window.createOutputChannel("Unison");
const clients: Map<string, LanguageClient> = new Map();
// This is global mutable state so that when the extension host gets restarted after
// the terminal is closed, we don't immediately open another one.
let shouldOpenTerminal = true;

function log(msg: string) {
  outputChannel.appendLine(msg);
}

exports.activate = function (context: ExtensionContext) {
  // Register the tree view
  const apiBaseUrl =
    workspace.getConfiguration("unison").codebaseApiUrl ||
    "http://127.0.0.1:5858/codebase/api";
  const treeProvider = new UnisonTreeProvider(apiBaseUrl);
  const treeView = window.createTreeView("unisonCodebase", {
    treeDataProvider: treeProvider,
  });
  context.subscriptions.push(treeView);

  // Register the refresh command
  context.subscriptions.push(
    commands.registerCommand("unison.refreshCodebase", () => {
      treeProvider.refresh();
    }),
  );

  // Register the edit definition command
  context.subscriptions.push(
    commands.registerCommand("unison.editDefinition", editDefinition),
  );

  workspace.workspaceFolders?.forEach((folder) => addWorkspaceFolder(folder));
  workspace.onDidChangeWorkspaceFolders(({ added, removed }) => {
    added.forEach((folder) => addWorkspaceFolder(folder));
    removed.forEach((folder) => removeWorkspaceFolder(folder));
  });

  // Register "Open on Share" command
  commands.registerCommand("unison.openOnShare", openOnShare);
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

function getActiveLanguageClient(): LanguageClient | undefined {
  // Return the first available client or the one for the active workspace
  if (clients.size === 0) {
    return undefined;
  }

  const activeEditor = window.activeTextEditor;
  if (activeEditor) {
    const workspaceFolder = workspace.getWorkspaceFolder(
      activeEditor.document.uri,
    );
    if (workspaceFolder) {
      const client = clients.get(workspaceFolder.uri.fsPath);
      if (client) {
        return client;
      }
    }
  }

  // Return the first available client
  return clients.values().next().value;
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
        socket.once("connect", resolve).once("error", reject),
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
          `Unison: ${errMsg}, is there a UCM running? (version M4a or later)`,
        );
      }
      await sleep(2000);
      continue;
    }
  }
}

async function editDefinition(fqn?: string) {
  const editor = window.activeTextEditor;
  if (!editor) {
    window.showErrorMessage("No active editor found");
    return;
  }

  const document = editor.document;

  // Get the LSP client for this workspace
  const workspaceFolder = workspace.getWorkspaceFolder(document.uri);
  if (!workspaceFolder) {
    window.showErrorMessage("File is not in a workspace");
    return;
  }

  const client = clients.get(workspaceFolder.uri.fsPath);
  if (!client) {
    window.showErrorMessage("Unison language server not connected");
    return;
  }

  try {
    // If FQN is provided (from tree view), send request with FQN only
    if (fqn) {
      log(`Sending editDefinition request for FQN: ${fqn}`);

      const response = await client.sendRequest("unison/editDefinition", {
        textDocument: { uri: document.uri.toString() },
        fqn: fqn,
      });
      log(`Received response: ${JSON.stringify(response)}`);

      // Check if the response has an error
      if (response && typeof response === "object" && "error" in response) {
        const errorMessage = (response as { error: string | null }).error;
        if (errorMessage) {
          window.showErrorMessage(errorMessage);
        } else {
          window.showInformationMessage("Definition edited");
        }
      }
    } else {
      // If no FQN (from context menu), send request with position
      const position = editor.selection.active;
      log(
        `Sending editDefinition request for ${document.uri.toString()} at ${position.line}:${position.character}`,
      );

      const response = await client.sendRequest("unison/editDefinition", {
        textDocument: { uri: document.uri.toString() },
        position: {
          line: position.line,
          character: position.character,
        },
      });

      log(`Received response: ${JSON.stringify(response)}`);

      // Check if the response has an error
      if (response && typeof response === "object" && "error" in response) {
        const errorMessage = (response as { error: string | null }).error;
        if (errorMessage) {
          window.showErrorMessage(errorMessage);
        } else {
          window.showInformationMessage("Definition edited");
        }
      }
    }
  } catch (error) {
    window.showErrorMessage(`Failed to edit definition: ${error}`);
    log(`Error editing definition: ${error}`);
  }
}

async function openOnShare() {
  const editor = window.activeTextEditor;
  if (!editor) {
    window.showErrorMessage("No active editor found");
    return;
  }

  const document = editor.document;
  const position = editor.selection.active;

  // Get the LSP client for this workspace
  const workspaceFolder = workspace.getWorkspaceFolder(document.uri);
  if (!workspaceFolder) {
    window.showErrorMessage("File is not in a workspace");
    return;
  }

  const client = clients.get(workspaceFolder.uri.fsPath);
  if (!client) {
    window.showErrorMessage("Unison language server not connected");
    return;
  }

  try {
    log(
      `Sending unison/openOnShare request for ${document.uri.toString()} at ${position.line}:${position.character}`,
    );

    // Send custom LSP request to the Unison server
    const response = await client.sendRequest("unison/openOnShare", {
      textDocument: { uri: document.uri.toString() },
      position: {
        line: position.line,
        character: position.character,
      },
    });

    // Check if the response has an error
    if (response && typeof response === "object" && "error" in response) {
      const errorMessage = (response as { error: string | null }).error;
      if (errorMessage) {
        window.showErrorMessage(errorMessage);
      } else {
        window.showInformationMessage("Opened on Share");
      }
    }
  } catch (error) {
    window.showErrorMessage(`Failed to open on Share: ${error}`);
    log(`Error opening on Share: ${error}`);
  }
}
