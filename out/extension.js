"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deactivate = exports.activate = void 0;
const vscode = __importStar(require("vscode"));
const SidebarProvider_1 = require("./SidebarProvider");
function activate(context) {
    const sidebarProvider = new SidebarProvider_1.SidebarProvider(context.extensionUri);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider("Keploy-Sidebar", sidebarProvider));
    let getLatestKeployDisposable = vscode.commands.registerCommand('keploy.KeployVersion', () => {
        // Logic to get the latest Keploy
        vscode.window.showInformationMessage('Feature coming soon!');
    });
    context.subscriptions.push(getLatestKeployDisposable);
    let viewChangeLogDisposable = vscode.commands.registerCommand('keploy.viewChangeLog', () => {
        // Logic to view the change log
        vscode.window.showInformationMessage('Feature coming soon!');
    });
    context.subscriptions.push(viewChangeLogDisposable);
    let viewDocumentationDisposable = vscode.commands.registerCommand('keploy.viewDocumentation', () => {
        // Logic to view the documentation
        vscode.window.showInformationMessage('Feature coming soon!');
    });
    context.subscriptions.push(viewDocumentationDisposable);
    let hellocommand = vscode.commands.registerCommand('keploy.HeyKeploy', () => {
        vscode.window.showInformationMessage(`Hey Keploy Community!`);
    });
    context.subscriptions.push(hellocommand);
    let viewGithubRepoDisposable = vscode.commands.registerCommand('keploy.SignIn', () => {
        // Logic to view the Github Repo
        vscode.window.showInformationMessage('Feature coming soon!');
    });
    context.subscriptions.push(viewGithubRepoDisposable);
    let getLatestVersion = vscode.commands.registerCommand('keploy.getLatestVersion', () => {
        // Logic to get the latest version
        vscode.window.showInformationMessage('Feature coming soon!');
    });
    context.subscriptions.push(getLatestVersion);
}
exports.activate = activate;
function deactivate() { }
exports.deactivate = deactivate;
//# sourceMappingURL=extension.js.map