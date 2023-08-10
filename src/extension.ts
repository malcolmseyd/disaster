// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { execSync } from "child_process";

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

  // Use the console to output diagnostic information (console.log) and errors (console.error)
  // This line of code will only be executed once when your extension is activated
  console.log('Congratulations, your extension "disaster" is now active!');

  // The command has been defined in the package.json file
  // Now provide the implementation of the command with registerCommand
  // The commandId parameter must match the command field in package.json
  let disposable = vscode.commands.registerCommand(
    "disaster.disassembleCurrentFile",
    async () => {
      const file = vscode.window.activeTextEditor?.document;
      if (!file || file.isUntitled) {
        vscode.window.showErrorMessage("No file open");
        return;
      }

      let command = "objdump -M intel --line-numbers --no-show-raw-insn";
      if (file.languageId === "code-text-binary") {
        command = [command, "--disassemble", "-S", file.fileName].join(" ");
      } else {
        vscode.window.showErrorMessage("Unsupported file type");
        return;
      }

      console.log("disassembling: ", command);

      const cmdResult = execSync(command).toString();

      const newFile = await vscode.workspace.openTextDocument({
        content: cmdResult,
      });
      await vscode.window.showTextDocument(newFile);
      await vscode.commands.executeCommand(
        "workbench.action.moveEditorToNextGroup"
      );
    }
  );

  context.subscriptions.push(disposable);
}

// This method is called when your extension is deactivated
export function deactivate() {}
