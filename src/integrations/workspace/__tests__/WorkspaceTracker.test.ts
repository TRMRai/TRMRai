import * as vscode from "vscode"
import { ClineProvider } from "../../../core/webview/ClineProvider"
import WorkspaceTracker from "../WorkspaceTracker"
import { listFiles } from "../../../services/glob/list-files"

// Mock VSCode APIs
// Mock VSCode workspace
jest.mock("vscode", () => {
    const mockWorkspace = {
        workspaceFolders: [{ uri: { fsPath: "/test/workspace" } }],
        onDidCreateFiles: jest.fn().mockReturnValue({ dispose: jest.fn() }),
        onDidDeleteFiles: jest.fn().mockReturnValue({ dispose: jest.fn() }),
        onDidRenameFiles: jest.fn().mockReturnValue({ dispose: jest.fn() }),
        createFileSystemWatcher: jest.fn().mockReturnValue({
            onDidCreate: jest.fn().mockReturnValue({ dispose: jest.fn() }),
            dispose: jest.fn()
        }),
        fs: {
            stat: jest.fn().mockResolvedValue({ type: 1 }) // FileType.File = 1
        }
    };
    return { workspace: mockWorkspace };
});

// Mock the cwd variable
jest.mock("../WorkspaceTracker", () => {
    const originalModule = jest.requireActual("../WorkspaceTracker");
    return {
        __esModule: true,
        ...originalModule,
        default: originalModule.default,
        cwd: "/test/workspace"
    };
});
jest.mock("../../../services/glob/list-files")

describe("WorkspaceTracker", () => {
    let workspaceTracker: WorkspaceTracker
    let mockProvider: jest.Mocked<ClineProvider>
    let mockListFiles: jest.Mock
    let mockDisposables: Array<{ dispose: jest.Mock }>
    
    beforeEach(() => {
        jest.useFakeTimers()
        
        // Mock provider
        mockProvider = {
            postMessageToWebview: jest.fn(),
        } as any
        
        // Mock listFiles
        mockListFiles = listFiles as jest.Mock
        mockListFiles.mockResolvedValue([["file1.txt", "file2.txt"], false])
        
        // Mock workspace folder
        ;(vscode.workspace as any).workspaceFolders = [
            { uri: { fsPath: "/test/workspace" } }
        ]
        
        // Create tracker
        workspaceTracker = new WorkspaceTracker(mockProvider)
        
        // Track disposables for cleanup verification
        mockDisposables = []
        ;(vscode.workspace.onDidCreateFiles as jest.Mock).mockImplementation(() => {
            const disposable = { dispose: jest.fn() }
            mockDisposables.push(disposable)
            return disposable
        })
    })
    
    afterEach(() => {
        workspaceTracker?.dispose()
        jest.clearAllTimers()
        jest.useRealTimers()
    })
    
    beforeEach(() => {
        jest.useFakeTimers();
    });

    afterEach(() => {
        workspaceTracker?.dispose();
        jest.clearAllTimers();
        jest.useRealTimers();
    });

    it("should periodically check for new files", async () => {
        // Mock setInterval to execute callback immediately
        const realSetInterval = global.setInterval;
        const mockSetInterval = jest.fn((callback) => {
            console.log('setInterval called');
            callback(); // Execute immediately
            return 123; // Return a dummy interval ID
        }) as unknown as typeof global.setInterval;
        global.setInterval = mockSetInterval;
        
        try {
            // Initial file list
            mockListFiles.mockResolvedValueOnce([["/test/workspace/file1.txt"], false]);
            const initPromise = workspaceTracker.initializeFilePaths();
            await Promise.resolve(); // Let the first promise resolve
            await initPromise;
            
            // Verify initial state
            expect(mockProvider.postMessageToWebview).toHaveBeenCalledWith({
                type: "workspaceUpdated",
                filePaths: expect.arrayContaining(["file1.txt"]) // Relative to workspace root
            });
            
            // Clear the mock to track new calls
            mockProvider.postMessageToWebview.mockClear();
            
            // Mock the next periodic check with absolute paths
            mockListFiles.mockResolvedValueOnce([[
                "/test/workspace/file1.txt",
                "/test/workspace/newfile.txt"
            ], false]);
            
            // Create new tracker to trigger setInterval with our mock
            workspaceTracker = new WorkspaceTracker(mockProvider);
            
            // Let all promises resolve
            await Promise.resolve();
            await Promise.resolve();
            
            // Log the current state
            console.log('mockProvider.postMessageToWebview calls:', mockProvider.postMessageToWebview.mock.calls);
            
            // Verify the new file was detected (paths should be relative to workspace root)
            expect(mockProvider.postMessageToWebview).toHaveBeenCalledWith({
                type: "workspaceUpdated",
                filePaths: expect.arrayContaining(["file1.txt", "newfile.txt"])
            });
        } finally {
            global.setInterval = realSetInterval;
        }
    });
    
    it("should clean up refresh interval on dispose", () => {
        workspaceTracker.dispose()
        
        // Verify all disposables were cleaned up
        mockDisposables.forEach(disposable => {
            expect(disposable.dispose).toHaveBeenCalled()
        })
    })

    it("should not update webview when no new files are found", async () => {
        // Initial file list
        mockListFiles.mockResolvedValueOnce([["file1.txt"], false])
        await workspaceTracker.initializeFilePaths()
        
        // Clear the mock to track new calls
        mockProvider.postMessageToWebview.mockClear()
        
        // Mock the same file list (no changes)
        mockListFiles.mockResolvedValueOnce([["file1.txt"], false])
        
        // Advance timers to trigger refresh
        jest.advanceTimersByTime(1000)
        await Promise.resolve() // Let promises resolve
        
        // Verify no update was sent to webview
        expect(mockProvider.postMessageToWebview).not.toHaveBeenCalled()
    })
})