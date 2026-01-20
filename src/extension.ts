import {
  workspace,
  window,
  OutputChannel,
  commands,
  ExtensionContext,
  Position,
  Selection,
  TextEditorRevealType,
} from "vscode";
import { LanguageClient } from "vscode-languageclient/node";
import { connect } from "node:net";
import { UnisonTreeProvider } from "./unisonTreeProvider";

const outputChannel: OutputChannel = window.createOutputChannel("Unison");
let client: LanguageClient | undefined = undefined;
// This is global mutable state so that when the extension host gets restarted after
// the terminal is closed, we don't immediately open another one.
let shouldOpenTerminal = true;

function log(msg: string) {
  outputChannel.appendLine(msg);
}

exports.activate = async function (context: ExtensionContext) {
  // Register the tree view
  const apiBaseUrl =
    workspace.getConfiguration("unison").codebaseApiUrl ||
    "http://127.0.0.1:5858/codebase/api";
  const treeProvider = new UnisonTreeProvider(
    apiBaseUrl,
    getActiveLanguageClient,
  );
  const treeView = window.createTreeView("unisonCodebase", {
    treeDataProvider: treeProvider,
  });
  treeProvider.setTreeView(treeView);
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

  // Register the edit definition command for context menu
  context.subscriptions.push(
    commands.registerCommand(
      "unison.editDefinitionAtCursor",
      editDefinitionAtCursor,
    ),
  );

  // Register "Open on Share" command
  commands.registerCommand("unison.openOnShare", openOnShare);

  // Start the global language client
  await startLanguageClient();
};

exports.deactivate = async function () {
  if (client) {
    await client.stop();
  }
};

async function startLanguageClient() {
  if (client) {
    return; // Already started
  }

  client = new LanguageClient("unison", "Unison", connectToServer, {
    outputChannel,
    documentSelector: [{ language: "unison" }],
  });

  log(`Starting Unison language client`);
  await client.start();
}

function getActiveLanguageClient(): LanguageClient | undefined {
  return client;
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

  if (!client) {
    window.showErrorMessage("Unison language server not connected");
    return;
  }

  const position = editor.selection.active;

  let request;
  if (fqn) {
    request = {
      textDocument: { uri: document.uri.toString() },
      fqn: fqn,
    };
  } else {
    // If no FQN, send request with the current cursor position
    request = {
      textDocument: { uri: document.uri.toString() },
      position: {
        line: position.line,
        character: position.character,
      },
    };
  }

  try {
    const response = await client.sendRequest("unison/editDefinition", request);

    // Check if the response has an error
    if (response && typeof response === "object") {
      const errorMessage = (response as { error?: string | null }).error;
      if (errorMessage) {
        window.showErrorMessage(errorMessage);
      } else {
        // Check the newlyAdded key to determine action
        const newlyAdded = (response as { newlyAdded?: boolean }).newlyAdded;
        if (newlyAdded) {
          window.showInformationMessage("Edited.");
          // Jump to the first line of the file on success
          const firstLine = new Position(0, 0);
          editor.selection = new Selection(firstLine, firstLine);
          editor.revealRange(editor.selection, TextEditorRevealType.InCenter);
        } else {
          window.showInformationMessage("Definition already in scratch file");
        }
      }
    }
  } catch (error) {
    window.showErrorMessage(`Failed to edit definition: ${error}`);
    log(`Error editing definition: ${error}`);
  }
}

async function editDefinitionAtCursor() {
  // Wrapper that calls editDefinition with no arguments for context menu
  return editDefinition();
}

async function openOnShare() {
  const editor = window.activeTextEditor;
  if (!editor) {
    window.showErrorMessage("No active editor found");
    return;
  }

  const document = editor.document;
  const position = editor.selection.active;

  if (!client) {
    window.showErrorMessage("Unison language server not connected");
    return;
  }

  try {
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
