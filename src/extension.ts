import * as vscode from 'vscode';
import { SidebarProvider } from './SidebarProvider';


export function activate(context: vscode.ExtensionContext) {
	const sidebarProvider = new SidebarProvider(context.extensionUri);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            "Keploy-Sidebar",
            sidebarProvider
        )
    );
	let getLatestKeployDisposable = vscode.commands.registerCommand('keploy.KeployVersion', () => {
        // Logic to get the latest Keploy
        vscode.window.showInformationMessage('Feature coming soon!');
    }
    );
    context.subscriptions.push(getLatestKeployDisposable);
    
    let viewChangeLogDisposable = vscode.commands.registerCommand('keploy.viewChangeLog', () => {
        // Logic to view the change log
        vscode.window.showInformationMessage('Feature coming soon!');
    }
    );
    context.subscriptions.push(viewChangeLogDisposable);

    let viewDocumentationDisposable = vscode.commands.registerCommand('keploy.viewDocumentation', () => {
        // Logic to view the documentation
        vscode.window.showInformationMessage('Feature coming soon!');
    }
    );
    context.subscriptions.push(viewDocumentationDisposable);
    

	let viewGithubRepoDisposable = vscode.commands.registerCommand('keploy.SignIn', () => {
		// Logic to view the Github Repo
		vscode.window.showInformationMessage('Feature coming soon!');
	}
	);
	context.subscriptions.push(viewGithubRepoDisposable);

	let getLatestVersion = vscode.commands.registerCommand('keploy.getLatestVersion', () => {
		// Logic to get the latest version
		vscode.window.showInformationMessage('Feature coming soon!');
	}
	);
	context.subscriptions.push(getLatestVersion);
	
}

export function deactivate() {}
