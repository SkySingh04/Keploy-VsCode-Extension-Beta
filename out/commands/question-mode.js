'use strict';
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
exports.RunnerRunQuestionMode = void 0;
const vscode = __importStar(require("vscode"));
const utils = __importStar(require("../utils"));
const newman = __importStar(require("../exec-newman"));
const config_1 = require("../config");
class RunnerRunQuestionMode {
    _config;
    COLLECTION_EXTENSION = "postman_collection.json";
    COLLECTION_QUERY = `{**/*.${this.COLLECTION_EXTENSION},**/${this.COLLECTION_EXTENSION},${this.COLLECTION_EXTENSION}}`;
    ENVIRONMENT_EXTENSION = "postman_environment.json";
    ENVIRONMENT_QUERY = `{**/*.${this.ENVIRONMENT_EXTENSION},**/${this.ENVIRONMENT_EXTENSION},${this.ENVIRONMENT_EXTENSION}}`;
    DEFAULT_EXCLUDES = "**/node_modules/**";
    DATA_INCLUDE_QUERY = `**/*.{csv,json}`;
    DATA_EXCLUDE_QUERY = `{${this.DEFAULT_EXCLUDES},${this.COLLECTION_EXTENSION},**/${this.COLLECTION_EXTENSION},**/*.${this.COLLECTION_EXTENSION},${this.ENVIRONMENT_EXTENSION},**/${this.ENVIRONMENT_EXTENSION},**/*.${this.ENVIRONMENT_EXTENSION}}`;
    ALL_TEXT = '- ALL -';
    NONE_TEXT = '- NONE -';
    DEFAULT_NR_INTERACTIONS;
    DEFAULT_WORKING_DIRECTORY;
    DEFAULT_DELAY;
    _toolbarItem;
    _collectionFiles;
    _environmentFiles;
    _dataFiles;
    _collectionFile;
    _folder;
    _environmentFile;
    _iteractions;
    _delay;
    _dataFile;
    _workingDirectory;
    cleanUp() {
        this._config = new config_1.Config();
        this.DEFAULT_DELAY = this._config.testDefaultDelay;
        this.DEFAULT_NR_INTERACTIONS = this._config.testDefaultIterations;
        this.DEFAULT_WORKING_DIRECTORY = this._config.defaultWorkingDirectory;
        this._collectionFiles = null;
        this._environmentFiles = null;
        this._dataFiles = null;
        this._collectionFile = null;
        this._folder = null;
        this._environmentFile = null;
        this._iteractions = null;
        this._delay = null;
        this._dataFile = null;
        this._workingDirectory = null;
    }
    subscribe(context, toolbarItem) {
        console.log('Registering: RunnerRunQuestionMode');
        this._toolbarItem = toolbarItem;
        let disposable = vscode.commands.registerCommand('extension.question-mode', () => {
            try {
                this.cleanUp();
                this.getCollectionFiles()
                    .then(() => this.errorIfNotCollectionsFound()
                    .then(() => this.askForCollections()
                    .then(() => this.askForFolder()
                    .then(() => this.getEnvironmentFiles()
                    .then(() => this.askForEnvironments()
                    .then(() => this.askForInteractions()
                    .then(() => this.askForDelay()
                    .then(() => this.getDataFiles()
                    .then(() => this.askForDataFile()
                    .then(() => this.askForWorkingDirectory()
                    .then(() => this.onDoneWithQuestions()))))))))))).catch(e => console.error);
            }
            catch (ex) {
                console.error(ex);
            }
        });
        context.subscriptions.push(disposable);
    }
    //region Private
    getOnlyFileNames(files) {
        // Get just names of files
        let rootPath = vscode.workspace.rootPath;
        let fileNames = files.map((f) => f.fsPath.replace(rootPath, ""));
        let fileNamesSort = fileNames.sort(utils.sortTextAlphabeticallyFn);
        return fileNamesSort;
    }
    getCollectionFiles() {
        return new Promise((resolve, reject) => {
            vscode.workspace.findFiles(this.COLLECTION_QUERY, this.DEFAULT_EXCLUDES).then((files) => {
                // Save value
                this._collectionFiles = files;
                resolve();
            });
        });
    }
    errorIfNotCollectionsFound() {
        return new Promise((resolve, reject) => {
            // Show message if no collection files found
            if (this._collectionFiles.length === 0) {
                vscode.window.showInformationMessage(`No files with extension "${this.COLLECTION_EXTENSION}" found.`);
                return reject();
            }
            resolve();
        });
    }
    getEnvironmentFiles() {
        return new Promise((resolve, reject) => {
            vscode.workspace.findFiles(this.ENVIRONMENT_QUERY, this.DEFAULT_EXCLUDES).then((files) => {
                // Save value
                this._environmentFiles = files;
                resolve();
            });
        });
    }
    getDataFiles() {
        return new Promise((resolve, reject) => {
            vscode.workspace.findFiles(this.DATA_INCLUDE_QUERY, this.DATA_EXCLUDE_QUERY).then((files) => {
                // Save value
                this._dataFiles = files;
                resolve();
            });
        });
    }
    askForCollections() {
        return new Promise((resolve, reject) => {
            let fileNames = this.getOnlyFileNames(this._collectionFiles);
            vscode.window.showQuickPick(fileNames, { placeHolder: 'Collection files' }).then((value) => {
                if (!value) {
                    return reject();
                }
                // Save value
                this._collectionFile = vscode.workspace.rootPath + value;
                resolve();
            });
        });
    }
    getFoldersForVersion1(collection) {
        return collection.folders.map(f => f.name);
    }
    getFoldersForVersion2(collection) {
        return collection.item.filter(f => f.item).map(f => f.name);
    }
    askForFolder() {
        return new Promise((resolve, reject) => {
            // Parse collection
            let collection = require(this._collectionFile);
            let folders = [];
            // Filter by version of the collection
            if (collection.folders || collection.requests) {
                folders = [this.ALL_TEXT, ...this.getFoldersForVersion1(collection)];
            }
            else {
                folders = [this.ALL_TEXT, ...this.getFoldersForVersion2(collection)];
            }
            // If not folders, skip step
            if (folders.length === 1) {
                return resolve();
            }
            vscode.window.showQuickPick(folders, { placeHolder: 'Folders' }).then((value) => {
                if (!value) {
                    return reject();
                }
                // Save value
                this._folder = value === this.ALL_TEXT ? null : value;
                resolve();
            });
        });
    }
    askForInteractions() {
        return new Promise((resolve, reject) => {
            vscode.window.showInputBox({
                value: this.DEFAULT_NR_INTERACTIONS.toString(),
                prompt: `Number of iteractions (default: ${this.DEFAULT_NR_INTERACTIONS})`,
                placeHolder: `Number of iteractions (default: ${this.DEFAULT_NR_INTERACTIONS})`
            }).then((value) => {
                if (value === null || value === undefined) {
                    return reject();
                }
                if (value === '') {
                    value = this.DEFAULT_NR_INTERACTIONS.toString();
                }
                // Save value
                this._iteractions = parseInt(value) || this.DEFAULT_NR_INTERACTIONS;
                resolve();
            });
        });
    }
    askForDelay() {
        return new Promise((resolve, reject) => {
            vscode.window.showInputBox({
                value: this.DEFAULT_DELAY.toString(),
                prompt: `Delay (default: ${this.DEFAULT_DELAY})`,
                placeHolder: `Delay (default: ${this.DEFAULT_DELAY})`
            }).then((value) => {
                if (value === null || value === undefined) {
                    return reject();
                }
                if (value === '') {
                    value = this.DEFAULT_DELAY.toString();
                }
                // Save value
                this._delay = parseInt(value) || this.DEFAULT_DELAY;
                resolve();
            });
        });
    }
    askForEnvironments() {
        return new Promise((resolve, reject) => {
            if (!this._environmentFiles || this._environmentFiles.length === 0) {
                return resolve();
            }
            let fileNames = [this.NONE_TEXT, ...this.getOnlyFileNames(this._environmentFiles)];
            vscode.window.showQuickPick(fileNames, { placeHolder: 'Environments' }).then((value) => {
                if (!value) {
                    return reject();
                }
                // Save value
                this._environmentFile = value === this.NONE_TEXT ? null : vscode.workspace.rootPath + value;
                resolve();
            });
        });
    }
    askForDataFile() {
        return new Promise((resolve, reject) => {
            if (!this._dataFiles || this._dataFiles.length === 0) {
                return resolve();
            }
            let fileNames = [this.NONE_TEXT, ...this.getOnlyFileNames(this._dataFiles)];
            vscode.window.showQuickPick(fileNames, { placeHolder: 'Data files' }).then((value) => {
                if (!value) {
                    return reject();
                }
                // Save value
                this._dataFile = value === this.NONE_TEXT ? null : vscode.workspace.rootPath + value;
                resolve();
            });
        });
    }
    askForWorkingDirectory() {
        return new Promise((resolve, reject) => {
            vscode.window.showInputBox({
                value: this.DEFAULT_WORKING_DIRECTORY.toString(),
                prompt: `Working directory (default: ${this.DEFAULT_WORKING_DIRECTORY})`,
                placeHolder: `Working directory (default: ${this.DEFAULT_WORKING_DIRECTORY})`
            }).then((value) => {
                // Save value
                this._workingDirectory = value;
                if (value === null || value === undefined) {
                    this._workingDirectory = this.DEFAULT_WORKING_DIRECTORY;
                }
                if (value === '') {
                    this._workingDirectory = '.';
                }
                resolve();
            });
        });
    }
    onDoneWithQuestions() {
        const newmanOptions = {
            collection: this._collectionFile,
            folder: this._folder,
            environment: this._environmentFile,
            iteractions: this._iteractions,
            delay: this._delay,
            data: this._dataFile,
            workingDirectory: this._workingDirectory
        };
        newman.execNewman(newmanOptions, this._toolbarItem, this._config);
    }
}
exports.RunnerRunQuestionMode = RunnerRunQuestionMode;
//# sourceMappingURL=question-mode.js.map