import * as vscode from "vscode";
import * as http from "http";
import { LanguageClient } from "vscode-languageclient/node";

interface Project {
    projectName: string;
    activeBranchRef: string | null;
}

interface Branch {
    branchName: string;
}

interface NamespaceContent {
    type: "namespace" | "type" | "term";
    name: string;
    kind?: string;
    size?: number;
}

interface NamespaceListing {
    namespaceListingFQN: string;
    namespaceListingChildren: Array<{
        tag: "Subnamespace" | "TermObject" | "TypeObject";
        contents: any;
    }>;
}

type TreeItemType = "project" | "branch" | "namespace" | "term" | "type";

export class UnisonTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly itemType: TreeItemType,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly projectName?: string,
        public readonly branchName?: string,
        public readonly namespacePath?: string,
        public readonly fqn?: string
    ) {
        super(label, collapsibleState);
        this.contextValue = itemType;

        // Set icons based on item type
        switch (itemType) {
            case "project":
                this.iconPath = new vscode.ThemeIcon("project");
                break;
            case "branch":
                this.iconPath = new vscode.ThemeIcon("git-branch");
                break;
            case "namespace":
                this.iconPath = new vscode.ThemeIcon("folder");
                break;
            case "term":
                this.iconPath = new vscode.ThemeIcon("symbol-function");
                this.command = {
                    command: "unison.editDefinition",
                    title: "Edit Definition",
                    arguments: [this.fqn],
                };
                break;
            case "type":
                this.iconPath = new vscode.ThemeIcon("symbol-class");
                this.command = {
                    command: "unison.editDefinition",
                    title: "Edit Definition",
                    arguments: [this.fqn],
                };
                break;
        }

        // Set tooltip with full path
        if (fqn) {
            this.tooltip = fqn;
        } else if (namespacePath) {
            this.tooltip = `${projectName}/${branchName}/${namespacePath}`;
        } else if (branchName) {
            this.tooltip = `${projectName}/${branchName}`;
        } else if (projectName) {
            this.tooltip = projectName;
        }
    }
}

export class UnisonTreeProvider implements vscode.TreeDataProvider<UnisonTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<UnisonTreeItem | undefined | null | void> =
        new vscode.EventEmitter<UnisonTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<UnisonTreeItem | undefined | null | void> =
        this._onDidChangeTreeData.event;

    private apiBaseUrl: string;
    private getLanguageClient: () => LanguageClient | undefined;
    private treeView?: vscode.TreeView<UnisonTreeItem>;

    constructor(
        apiBaseUrl: string = "http://127.0.0.1:5858/codebase/api",
        getLanguageClient: () => LanguageClient | undefined
    ) {
        this.apiBaseUrl = apiBaseUrl;
        this.getLanguageClient = getLanguageClient;
    }

    setTreeView(treeView: vscode.TreeView<UnisonTreeItem>): void {
        this.treeView = treeView;
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: UnisonTreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: UnisonTreeItem): Promise<UnisonTreeItem[]> {
        if (!element) {
            // Root level: get current project context and show namespace contents
            return this.getCurrentProjectContents();
        }

        switch (element.itemType) {
            case "namespace":
                return this.getNamespaceContents(
                    element.projectName!,
                    element.branchName!,
                    element.namespacePath!
                );
            default:
                return [];
        }
    }

    private async getCurrentProjectContents(): Promise<UnisonTreeItem[]> {
        try {
            const client = this.getLanguageClient();
            if (!client) {
                console.error("No language client available");
                if (this.treeView) {
                    this.treeView.title = "No LSP client";
                    this.treeView.description = "Unison Codebase";
                }
                return [];
            }

            // Call the unison/projectContext LSP handler
            const context = await client.sendRequest("unison/projectContext", {}) as {
                projectName: string;
                projectBranch: string;
            };

            if (!context.projectName || !context.projectBranch) {
                console.error("No project context available");
                if (this.treeView) {
                    this.treeView.title = "No project context";
                    this.treeView.description = "Unison Codebase";
                }
                return [];
            }

            // Update the tree view title with current project/branch
            if (this.treeView) {
                this.treeView.title = `${context.projectName}/${context.projectBranch}`;
                this.treeView.description = "Unison Codebase";
            }

            // Return the namespace contents for the current project/branch
            return this.getNamespaceContents(
                context.projectName,
                context.projectBranch,
                ""
            );
        } catch (error) {
            console.error("Failed to fetch project context:", error);
            if (this.treeView) {
                this.treeView.title = "Error fetching context";
                this.treeView.description = "Unison Codebase";
            }
            return [];
        }
    }

    private async getNamespaceContents(
        projectName: string,
        branchName: string,
        namespacePath: string
    ): Promise<UnisonTreeItem[]> {
        try {
            const path = `/projects/${encodeURIComponent(projectName)}/branches/${encodeURIComponent(branchName)}/list`;
            const params = namespacePath ? `?namespace=${encodeURIComponent(namespacePath)}` : "";
            const listing = await this.apiRequest<NamespaceListing>(path + params);

            const items: UnisonTreeItem[] = [];

            for (const child of listing.namespaceListingChildren) {
                if (child.tag === "Subnamespace") {
                    const namespaceName = child.contents.namespaceName;
                    const fullPath = namespacePath
                        ? `${namespacePath}.${namespaceName}`
                        : namespaceName;
                    items.push(
                        new UnisonTreeItem(
                            namespaceName,
                            "namespace",
                            vscode.TreeItemCollapsibleState.Collapsed,
                            projectName,
                            branchName,
                            fullPath
                        )
                    );
                } else if (child.tag === "TermObject") {
                    const termName = child.contents.termName;
                    const fullPath = namespacePath
                        ? `${namespacePath}.${termName}`
                        : termName;
                    items.push(
                        new UnisonTreeItem(
                            termName,
                            "term",
                            vscode.TreeItemCollapsibleState.None,
                            projectName,
                            branchName,
                            namespacePath,
                            fullPath
                        )
                    );
                } else if (child.tag === "TypeObject") {
                    const typeName = child.contents.typeName;
                    const fullPath = namespacePath
                        ? `${namespacePath}.${typeName}`
                        : typeName;
                    items.push(
                        new UnisonTreeItem(
                            typeName,
                            "type",
                            vscode.TreeItemCollapsibleState.None,
                            projectName,
                            branchName,
                            namespacePath,
                            fullPath
                        )
                    );
                }
            }

            return items;
        } catch (error) {
            console.error("Failed to fetch namespace contents:", error);
            return [];
        }
    }

    private apiRequest<T>(path: string): Promise<T> {
        return new Promise((resolve, reject) => {
            // Remove leading slash from path and ensure base URL ends properly
            const cleanPath = path.startsWith('/') ? path.slice(1) : path;
            const baseUrl = this.apiBaseUrl.endsWith('/') ? this.apiBaseUrl : this.apiBaseUrl + '/';
            const url = new URL(cleanPath, baseUrl);

            http
                .get(url, (res) => {
                    let data = "";

                    res.on("data", (chunk) => {
                        data += chunk;
                    });

                    res.on("end", () => {
                        try {
                            if (res.statusCode === 200) {
                                resolve(JSON.parse(data));
                            } else {
                                reject(new Error(`API request to ${url} failed with status ${res.statusCode}`));
                            }
                        } catch (error) {
                            reject(error);
                        }
                    });
                })
                .on("error", (error) => {
                    reject(error);
                });
        });
    }
}
