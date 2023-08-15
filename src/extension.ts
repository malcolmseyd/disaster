import * as vscode from "vscode";
import { execSync, spawnSync } from "node:child_process";
import { env } from "node:process";
import { statSync, mkdirSync } from "node:fs";

const SUPPORTED_LANGUAGE_IDS = ["c", "cpp", "code-text-binary"];

export function activate(context: vscode.ExtensionContext) {
  console.log("Initializing Disaster...");

  const TMPDIR = "/tmp/disaster";
  if (!statSync(TMPDIR, { throwIfNoEntry: false })?.isDirectory()) {
    mkdirSync(TMPDIR);
    console.log(`Created ${TMPDIR} directory for temporary files`);
  } else {
    console.log(`Using ${TMPDIR} directory for temporary files`);
  }

  const CC = env.CC || "cc";
  const CFLAGS = env.CFLAGS || "-g";
  const CXX = env.CXX || "c++";
  const CXXFLAGS = env.CXXFLAGS || "-g";
  console.log("Environment variables initialized");

  let disposable = vscode.commands.registerCommand(
    "disaster.disassembleCurrentFile",
    async () => {
      const messageChannel = vscode.window.createOutputChannel("Disaster");

      // get info about the current file
      const file = vscode.window.activeTextEditor?.document;
      const filePosition = vscode.window.activeTextEditor?.selection.active;
      if (!file || file.isUntitled) {
        vscode.window.showErrorMessage("No file open");
        return;
      }

      // validation
      if (!SUPPORTED_LANGUAGE_IDS.includes(file.languageId)) {
        vscode.window.showErrorMessage("Unsupported file type");
        return;
      }
      if (file.isDirty) {
        vscode.window.showErrorMessage("File is not saved");
        return;
      }

      let objectPath =
        file.languageId === "code-text-binary"
          ? file.fileName
          : getObjectPath(file.fileName);

      // compile
      let compileCommand: string | undefined;
      if (file.languageId === "code-text-binary") {
        messageChannel.appendLine(`Using ${file.fileName} as object file`);
      } else if (file.languageId === "c") {
        compileCommand = `${CC} ${CFLAGS} -c ${file.fileName} -o ${objectPath}`;
      } else if (file.languageId === "cpp") {
        compileCommand = `${CXX} ${CXXFLAGS} -c ${file.fileName} -o ${objectPath}`;
      }

      if (compileCommand) {
        messageChannel.appendLine(`Compiling ${file.fileName}...`);
        try {
          compile(compileCommand, messageChannel);
        } catch {
          return;
        }
      }

      // disassemble
      messageChannel.append(`Disassembling ${objectPath}...`);
      let content = disassemble(objectPath);

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

      // clean up
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
        execSync(`rm ${objectPath}`);
      }
    }
  );

  context.subscriptions.push(disposable);
  console.log("Command registered");

  function getBasename(path: string): string {
    return path.split("/").at(-1)?.split(".").slice(0, -1).join(".") ?? "";
  }

  function getObjectPath(path: string): string {
    return `${TMPDIR}/${getBasename(path)}.o`;
  }

  function compile(command: string, messageChannel: vscode.OutputChannel) {
    try {
      const compileOutput = execSync(command);
      messageChannel.appendLine(compileOutput.toString());
    } catch (e: any) {
      messageChannel.appendLine(e.stdout.toString());
      messageChannel.appendLine(e.stderr.toString());
      vscode.window.showErrorMessage("Compilation failed");
      messageChannel.show();
      throw e;
    }
  }

  function disassemble(objectPath: string) {
    const cmd = `objdump --disassemble -M intel --line-numbers --no-show-raw-insn -S ${objectPath}`;
    return execSync(cmd).toString();
  }
}

// This method is called when your extension is deactivated
export function deactivate() {}
