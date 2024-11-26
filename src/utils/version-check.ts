import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';

const execAsync = promisify(exec);

export interface VersionInfo {
    current: string;
    latest: string;
    updateAvailable: boolean;
}

export async function checkForUpdates(context: vscode.ExtensionContext): Promise<VersionInfo | null> {
    try {
        // Get current version from package.json
        const currentVersion = vscode.extensions.getExtension('roo-vet.roo-cline')?.packageJSON.version;
        
        // Run CodeArtifact login to ensure we have valid credentials
        const loginScript = path.join(__dirname, '..', '..', 'scripts', 'codeartifact-login.sh');
        if (await fs.access(loginScript).then(() => true).catch(() => false)) {
            await execAsync(`bash "${loginScript}"`);
        } else {
            // If login script doesn't exist, try to get auth token directly
            await execAsync('aws codeartifact get-authorization-token --domain roo --query authorizationToken --output text');
        }
        
        // Get latest version from CodeArtifact
        const { stdout } = await execAsync('npm view roo-cline version');
        const latestVersion = stdout.trim();
        
        return {
            current: currentVersion,
            latest: latestVersion,
            updateAvailable: currentVersion !== latestVersion
        };
    } catch (error) {
        console.error('Failed to check for updates:', error);
        return null;
    }
}

export async function scheduleUpdateChecks(context: vscode.ExtensionContext) {
    // Check for updates on startup
    const initialCheck = await checkForUpdates(context);
    if (initialCheck?.updateAvailable) {
        showUpdateNotification(initialCheck.latest);
    }

    // Check for updates every 24 hours
    setInterval(async () => {
        const check = await checkForUpdates(context);
        if (check?.updateAvailable) {
            showUpdateNotification(check.latest);
        }
    }, 24 * 60 * 60 * 1000); // 24 hours in milliseconds
}

function showUpdateNotification(latestVersion: string) {
    vscode.window.showInformationMessage(
        `A new version of Roo Cline (${latestVersion}) is available!`,
        'Update Now',
        'Later'
    ).then(selection => {
        if (selection === 'Update Now') {
            installUpdate(latestVersion);
        }
    });
}

async function installUpdate(version: string) {
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Updating Roo Cline...",
        cancellable: false
    }, async (progress) => {
        try {
            // Create temp directory for installation
            const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'roo-cline-update-'));
            
            progress.report({ message: 'Installing new version...' });
            
            // Install roo-cline in temp directory
            await execAsync('npm init -y', { cwd: tempDir });
            await execAsync('npm install roo-cline', { cwd: tempDir });
            
            // Get path to vsix file
            const vsixPath = path.join(tempDir, 'node_modules', 'roo-cline', 'bin', `roo-cline-${version}.vsix`);
            
            progress.report({ message: 'Installing extension...' });
            
            // Install the extension
            const editor = process.env.TERM_PROGRAM === 'vscode' ? 'code' : 'cursor';
            await execAsync(`${editor} --install-extension "${vsixPath}"`);
            
            // Clean up temp directory
            await fs.rm(tempDir, { recursive: true, force: true });
            
            // Show success message with reload button
            const action = await vscode.window.showInformationMessage(
                'Roo Cline has been updated successfully!',
                'Reload Now'
            );
            
            if (action === 'Reload Now') {
                // Reload the window to activate the new version
                await vscode.commands.executeCommand('workbench.action.reloadWindow');
            }
        } catch (error) {
            vscode.window.showErrorMessage('Failed to update Roo Cline. Please try again later.');
            console.error('Update failed:', error);
        }
    });
}
