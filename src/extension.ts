import * as vscode from "vscode";
import { execSync } from "node:child_process";
import { env } from "node:process";
import { statSync, mkdirSync } from "node:fs";

export function activate(context: vscode.ExtensionContext) {
  console.log("Initializing Disaster...");

  const TMPDIR = "/tmp/disaster";
  if (!statSync(TMPDIR, { throwIfNoEntry: false })?.isDirectory()) {
    mkdirSync(TMPDIR);
    console.log(`Created ${TMPDIR} directory`);
  } else {
    console.log(`Using ${TMPDIR} directory`);
  }

  const CC = env.CC || "cc";
  const CFLAGS = env.CFLAGS || "-g";
  console.log("Environment variables initialized");

  let disposable = vscode.commands.registerCommand(
    "disaster.disassembleCurrentFile",
    async () => {
      // get info about the current file
      const file = vscode.window.activeTextEditor?.document;
      const filePosition = vscode.window.activeTextEditor?.selection.active;
      if (!file || file.isUntitled) {
        vscode.window.showErrorMessage("No file open");
        return;
      }

      // disassemble the file (or compile it first)
      let content = "";
      let objectFile = "";
      if (file.languageId === "code-text-binary") {
        let cmd = `objdump --disassemble -M intel --line-numbers --no-show-raw-insn -S ${file.fileName}`;
        content = execSync(cmd).toString();
      } else if (file.languageId === "c") {
        const basename = getBasename(file.fileName);
        objectFile = `${TMPDIR}/${basename}.o`;

        let cmd = `${CC} ${CFLAGS} -c ${file.fileName} -o ${TMPDIR}/${basename}.o`;
        execSync(cmd);

        cmd = `objdump --disassemble -M intel --line-numbers --no-show-raw-insn -S ${objectFile}`;
        content = execSync(cmd).toString();
      } else {
        vscode.window.showErrorMessage("Unsupported file type");
        return;
      }

      // pick a best-guess syntax highlighter
      const languages = (await vscode.languages.getLanguages()).filter((x) =>
        x.includes("asm")
      );
      let language: string | undefined;
      if (languages.includes("nasm")) {
        language = "nasm";
      } else {
        language = languages[0];
      }

      // put the disassembly in a new tab
      const newFile = await vscode.workspace.openTextDocument({
        language,
        content,
      });
      await vscode.window.showTextDocument(newFile);
      await vscode.commands.executeCommand(
        "workbench.action.moveEditorToNextGroup"
      );

      if (file.languageId !== "code-text-binary") {
        // scroll to relevant line
        if (filePosition) {
          const line = filePosition.line;
          const needle = `${file.fileName}:${line + 1}`;
          console.log(`Searching for ${needle}`);
          const i = content.split("\n").findIndex((line, index) => {
            if (line.includes(needle)) {
              vscode.commands.executeCommand("revealLine", {
                lineNumber: index,
                at: "top",
              });
              return true;
            }
          });
          console.log("Found line at index", i);
          if (i === -1) {
            vscode.window.showErrorMessage(
              "Could not find matching line in output"
            );
          }
        }

        // remove temporary object
        execSync(`rm ${objectFile}`);
      }
    }
  );

  context.subscriptions.push(disposable);
  console.log("Command registered");

  function getBasename(path: string): string {
    return path.split("/").at(-1)?.split(".").slice(0, -1).join(".") ?? "";
  }
}

// This method is called when your extension is deactivated
export function deactivate() {}
