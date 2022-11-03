import { workspace, window, WorkspaceFolder, OutputChannel } from "vscode";
import { LanguageClient } from "vscode-languageclient/node";
import { connect } from "node:net";

const outputChannel: OutputChannel = window.createOutputChannel("Unison");
const clients: Map<string, LanguageClient> = new Map();

function log(msg: string) {
  outputChannel.appendLine(msg)
}

exports.activate = function () {
  workspace.workspaceFolders?.forEach((folder) => addWorkspaceFolder(folder));
  workspace.onDidChangeWorkspaceFolders(({ added, removed }) => {
    added.forEach((folder) => addWorkspaceFolder(folder));
    removed.forEach((folder) => removeWorkspaceFolder(folder));
  });
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

  log(`Activating unison language server at ${folderPath}`)
  clients.set(folderPath, client);
  await client.start();
}

async function removeWorkspaceFolder(workspaceFolder: WorkspaceFolder) {
  let folderPath = workspaceFolder.uri.fsPath;
  let client = clients.get(folderPath);
  if (client) {
    log(`Deactivating unison language server at ${folderPath}`)
    clients.delete(folderPath);
    await client.stop();
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function connectToServer() {
  let haveShownError = false;
  let haveOpenedTerminal = false;

  while (true) {
    try {
      const host = "127.0.0.1";
      const port = workspace.getConfiguration("unison").lspPort;

      log(`Trying to connect to ucm lsp server at ${host}:${port}`);
      let socket = connect({ port, host: "127.0.0.1" });
      await new Promise((resolve, reject) =>
        socket.once("connect", resolve).once("error", reject)
      );

      // Show a success message, but only if we were in an error state
      const okMsg = `Unison: Connected to Language Server at ${host}:${port}.`;
      log(okMsg);
      if (haveShownError) {
        window.showInformationMessage(okMsg);
      }
      return { reader: socket, writer: socket };

    } catch (e) {
      const errMsg = "Language server failed to connect";
      log(`${errMsg}, cause: ${e}`)

      if (!haveShownError) {
        haveShownError = true;
        window.showErrorMessage(`Unison: ${errMsg}, is there a UCM running? (version M4a or later)`);

        // Only ever try to open the terminal once, so we don't get stuck in weird loops
        // or in a strange state if the user tries to quit UCM or close the terminal.
        if (!haveOpenedTerminal && workspace.getConfiguration("unison").automaticallyOpenUCM) {
          haveOpenedTerminal = true;
          // Start up a new terminal in the IDE, tell it to run UCM, and then show it.
          window.showInformationMessage("Attemping to launch UCM in the embedded terminal.");
          const terminal = window.createTerminal();
          terminal.sendText("ucm");
          terminal.show();
        }
      }
      await sleep(2000);
      continue;
    }
  }
}