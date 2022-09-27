import { workspace, window, WorkspaceFolder, OutputChannel } from "vscode";
import { LanguageClient } from "vscode-languageclient/node";
import { connect } from "node:net";

const outputChannel: OutputChannel = window.createOutputChannel("Unison");
const clients: Map<string, LanguageClient> = new Map();

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

  clients.set(folderPath, client);

  await client.start();
}

async function removeWorkspaceFolder(workspaceFolder: WorkspaceFolder) {
  let folderPath = workspaceFolder.uri.fsPath;
  let client = clients.get(folderPath);
  if (client) {
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
      const port = workspace.getConfiguration("unison").lspPort;
      let socket = connect({ port, host: "127.0.0.1" });
      await new Promise((resolve, reject) =>
        socket.once("connect", resolve).once("error", reject)
      );
      // Show a success message, but only if we were in an error state
      if (haveShownError) {
        window.showInformationMessage("Unison: Connected to Language Server.");
      }
      return { reader: socket, writer: socket };
    } catch (e) {
      if (!haveShownError) {
        haveShownError = true;
        window.showErrorMessage(
          "Unison: Language server failed to connect, is there a UCM running? (version M4a or later)"
        );
      }
      await sleep(2000);
      continue;
    }
  }
}
