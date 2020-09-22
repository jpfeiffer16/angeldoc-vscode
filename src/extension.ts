import * as vscode from 'vscode';
import * as childProc from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import fetch from 'node-fetch';
import mkdirp = require('mkdirp');
import extract = require('extract-zip');

const angelDocBinPath = path.join(
	(process.env.HOME ? process.env.HOME : process.env.USERPROFILE) ?? '~',
	'/.angeldoc/bin');
const angelDocDllPath = path.join(angelDocBinPath, '/AngelDoc.dll');

export async function activate(context: vscode.ExtensionContext) {
	let disposable = vscode.commands.registerCommand('angeldoc-vscode.installangeldoc', async () => {
		await installAngelDoc();
	});
	context.subscriptions.push(disposable);
	disposable = vscode.commands.registerCommand('angeldoc-vscode.insertxmldoc', async () => {
		await insertXmlDoc();
	});
	context.subscriptions.push(disposable);
	await ensureInstalled();
	console.log('installed');
	let repeatedSlashes = 0;
	vscode.workspace.onDidChangeTextDocument(e => {
		if (e.contentChanges) {
			if (e.contentChanges[0].text === '/') {
				repeatedSlashes++;
			}
			else {
				repeatedSlashes = 0;
			}
			if (repeatedSlashes === 3) {
				if (
					vscode.workspace.getConfiguration('angeldoc').get('insertxmldoconslash')) {
					const editor = vscode.window.activeTextEditor;
					if (editor) {
						if (editor.document.languageId === 'csharp')
						{
							vscode.window.activeTextEditor?.edit(editBuilder =>
								editBuilder.delete(
									new vscode.Range(editor.selection.active.line, 0, editor.selection.active.line + 1, 0)));
							insertXmlDoc();
						}
					}
				}
			}
		}
	});
}

export function deactivate() {
	console.log('AngelDoc Deactivated.');
}

async function insertXmlDoc() {
	if (vscode.window.activeTextEditor) {
		const editor = vscode.window.activeTextEditor;
		if (editor.document.languageId === 'csharp')
		{
			const proc = childProc.spawn(
				'dotnet',
				[
					angelDocDllPath,
					'-',
					'gendoccsharp',
					(editor.selection.active.line + 1).toString()
				], {
				stdio: 'pipe'
			}
			);

			let output = '';

			proc.stdout.on('data', data => {
				output += data.toString();
			});
			proc.stdout.on('end', () => {
				editor.edit(editBuilder =>
					editBuilder.insert(new vscode.Position(editor.selection.active.line, 0), output + '\n'));
				vscode.commands.executeCommand('editor.action.formatDocument');
			});
			proc.stderr.on('data', data => {
				console.error(data.toString());
			});
			proc.stdin.setDefaultEncoding('utf-8');
			proc.stdin.write(editor.document.getText(), (err) => {
				if (err) {
					console.error(err);
					return;
				}
				proc.stdin.end();
			});
		}

	}

}

async function ensureInstalled() {
	if (!fs.existsSync(angelDocDllPath)) {
		await installAngelDoc();
	}
}

function installAngelDoc(): Promise<void> {
	const promise = new Promise<void>(async (resolve, reject) => {
		mkdirp(angelDocBinPath);
		const releasesResponse = await (await fetch('https://api.github.com/repos/jpfeiffer16/AngelDoc/releases/latest')).json();
		const latestRelease = releasesResponse.tag_name;
		const res = (await fetch(`https://github.com/jpfeiffer16/AngelDoc/releases/download/${latestRelease}/AngelDoc.zip`));
		res.body.pipe(fs.createWriteStream(path.join(angelDocBinPath, 'AngelDoc.zip')));
		res.body.on('end', async () => {
			await extract(path.join(angelDocBinPath, '/AngelDoc.zip'), { dir: angelDocBinPath });
			resolve();
		});
	});
	return promise;
}