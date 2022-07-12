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

async function connectToServer() {
  workspace.getConfiguration("unison");
  let socket = connect({ port: 5757, host: "127.0.0.1" });

  await new Promise((resolve, reject) =>
    socket.once("connect", resolve).once("error", reject)
  );

  return { reader: socket, writer: socket };
}
