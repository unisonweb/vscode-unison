import { window } from "vscode";
import { LanguageClient } from "vscode-languageclient/node";

export async function sendCustomRequest<T>(
    client: LanguageClient | undefined,
    method: string,
    params: any,
): Promise<T | undefined> {
    if (!client) {
        throw new Error("Language client not connected");
    }

    try {
        return await client.sendRequest<T>(method, params);
    } catch (error: any) {
        // Check if it's a method not found error (LSP error code -32601)
        if (
            error?.code === -32601 ||
            error?.message?.includes("method not found") ||
            error?.message?.includes("not supported")
        ) {
            window.showErrorMessage(
                `This action is not yet supported by the connected UCM. Upgrading to the latest version of UCM may resolve this.`,
            );
            console.log(
                `LSP endpoint not found: ${method}. User may need to upgrade UCM.`,
            );
            return undefined;
        }
        // Re-throw other errors
        throw error;
    }
}
