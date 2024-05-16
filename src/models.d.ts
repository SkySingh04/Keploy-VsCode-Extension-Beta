import * as vscode from 'vscode';

export interface ICommand {
    subscribe(context: vscode.ExtensionContext, toolbarItem: vscode.StatusBarItem): void;
}

export interface INewManOpts {
    collection: string;
    folder: string;
    environment: string;
    iteractions: number;
    delay: number;
    data: string;
    workingDirectory: string;
}