import * as vscode from 'vscode';
import { exec } from 'child_process';
import { checkForUpdates, VersionInfo } from '../version-check';
import * as fs from 'fs/promises';

// Mock dependencies
jest.mock('child_process');
jest.mock('fs/promises');
jest.mock('vscode', () => ({
    window: {
        showInformationMessage: jest.fn(),
        showErrorMessage: jest.fn(),
        withProgress: jest.fn(async (options, task) => task()),
    },
    commands: {
        executeCommand: jest.fn(),
    },
    extensions: {
        getExtension: jest.fn(),
    },
}));

describe('version-check', () => {
    let mockContext: vscode.ExtensionContext;

    beforeEach(() => {
        jest.clearAllMocks();
        mockContext = {} as vscode.ExtensionContext;

        // Mock extension version
        (vscode.extensions.getExtension as jest.Mock).mockReturnValue({
            packageJSON: { version: '1.0.0' }
        });
    });

    describe('checkForUpdates', () => {
        it('should detect when update is available', async () => {
            // Mock CodeArtifact login script exists
            (fs.access as jest.Mock).mockResolvedValue(undefined);

            // Mock successful command executions
            (exec as unknown as jest.Mock).mockImplementation((cmd, callback) => {
                if (callback) {
                    if (cmd.includes('codeartifact-login.sh')) {
                        callback(null, { stdout: 'Login successful' }, '');
                    } else if (cmd.includes('npm view')) {
                        callback(null, { stdout: '1.1.0\n' }, '');
                    }
                }
                return {
                    stdout: cmd.includes('npm view') ? '1.1.0\n' : 'Login successful',
                    stderr: '',
                };
            });

            const result = await checkForUpdates(mockContext);

            expect(result).toEqual({
                current: '1.0.0',
                latest: '1.1.0',
                updateAvailable: true
            });
        });

        it('should handle when no update is available', async () => {
            // Mock CodeArtifact login script exists
            (fs.access as jest.Mock).mockResolvedValue(undefined);

            // Mock successful command executions with same version
            (exec as unknown as jest.Mock).mockImplementation((cmd, callback) => {
                if (callback) {
                    if (cmd.includes('codeartifact-login.sh')) {
                        callback(null, { stdout: 'Login successful' }, '');
                    } else if (cmd.includes('npm view')) {
                        callback(null, { stdout: '1.0.0\n' }, '');
                    }
                }
                return {
                    stdout: cmd.includes('npm view') ? '1.0.0\n' : 'Login successful',
                    stderr: '',
                };
            });

            const result = await checkForUpdates(mockContext);

            expect(result).toEqual({
                current: '1.0.0',
                latest: '1.0.0',
                updateAvailable: false
            });
        });

        it('should fallback to direct auth token when login script missing', async () => {
            // Mock CodeArtifact login script does not exist
            (fs.access as jest.Mock).mockRejectedValue(new Error('ENOENT'));

            // Mock successful command executions
            (exec as unknown as jest.Mock).mockImplementation((cmd, callback) => {
                if (callback) {
                    if (cmd.includes('get-authorization-token')) {
                        callback(null, { stdout: 'token123' }, '');
                    } else if (cmd.includes('npm view')) {
                        callback(null, { stdout: '1.1.0\n' }, '');
                    }
                }
                return {
                    stdout: cmd.includes('npm view') ? '1.1.0\n' : 'token123',
                    stderr: '',
                };
            });

            const result = await checkForUpdates(mockContext);

            expect(result).toEqual({
                current: '1.0.0',
                latest: '1.1.0',
                updateAvailable: true
            });

            // Verify it tried to get auth token directly
            expect(exec).toHaveBeenCalledWith(
                expect.stringContaining('aws codeartifact get-authorization-token'),
                expect.any(Function)
            );
        });

        it('should handle errors and return null', async () => {
            // Mock CodeArtifact login script exists but fails
            (fs.access as jest.Mock).mockResolvedValue(undefined);
            (exec as unknown as jest.Mock).mockImplementation((cmd, callback) => {
                if (callback) {
                    callback(new Error('Command failed'), '', 'Error executing command');
                }
                throw new Error('Command failed');
            });

            const result = await checkForUpdates(mockContext);

            expect(result).toBeNull();
        });

        it('should handle missing extension version', async () => {
            // Mock extension not found
            (vscode.extensions.getExtension as jest.Mock).mockReturnValue(undefined);

            const result = await checkForUpdates(mockContext);

            expect(result).toBeNull();
        });
    });
});
