import * as vscode from 'vscode';
import { EXTENSION_CONFIG_NAMESPACE } from './constants';

export function getExtensionConfig(): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration(EXTENSION_CONFIG_NAMESPACE);
}
