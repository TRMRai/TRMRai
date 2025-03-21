import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { BugReportDialog } from "../BugReportDialog"
import { TranslationContext } from "@/i18n/TranslationContext"

// Mock vscode API
const mockPostMessage = jest.fn()
jest.mock("@/utils/vscode", () => ({
	vscode: {
		postMessage: mockPostMessage,
	},
}))

// Mock window.addEventListener to capture message handler
type MessageHandler = (event: any) => void
const mockMessageHandlers: Record<string, MessageHandler> = {}
const originalAddEventListener = window.addEventListener
const originalRemoveEventListener = window.removeEventListener

beforeAll(() => {
	window.addEventListener = jest.fn((event, handler) => {
		if (event === "message" && typeof handler === "function") {
			mockMessageHandlers[event] = handler as MessageHandler
		}
		return originalAddEventListener(event, handler)
	})

	window.removeEventListener = jest.fn((event, handler) => {
		if (event === "message" && typeof handler === "function" && mockMessageHandlers[event] === handler) {
			delete mockMessageHandlers[event]
		}
		return originalRemoveEventListener(event, handler)
	})
})

afterAll(() => {
	window.addEventListener = originalAddEventListener
	window.removeEventListener = originalRemoveEventListener
})

// Mock lucide-react icons
jest.mock("lucide-react", () => ({
	Bug: () => <div data-testid="bug-icon" />,
	ClipboardCopy: () => <div data-testid="clipboard-icon" />,
	ExternalLink: () => <div data-testid="external-link-icon" />,
}))

// Mock Dialog components
jest.mock("@/components/ui", () => ({
	Dialog: ({ children, open, onOpenChange }: any) => (
		<div data-testid="dialog" data-open={open} onClick={() => onOpenChange && onOpenChange(false)}>
			{children}
		</div>
	),
	DialogContent: ({ children, className }: any) => (
		<div data-testid="dialog-content" className={className}>
			{children}
		</div>
	),
	DialogHeader: ({ children, className }: any) => (
		<div data-testid="dialog-header" className={className}>
			{children}
		</div>
	),
	DialogTitle: ({ children, className }: any) => (
		<div data-testid="dialog-title" className={className}>
			{children}
		</div>
	),
	DialogFooter: ({ children, className }: any) => (
		<div data-testid="dialog-footer" className={className}>
			{children}
		</div>
	),
}))

// Mock VSCode components
jest.mock("@vscode/webview-ui-toolkit/react", () => ({
	VSCodeButton: ({ children, onClick, appearance, disabled, className }: any) => (
		<button
			onClick={onClick}
			data-appearance={appearance}
			disabled={disabled}
			className={className}
			data-testid={
				appearance === "primary"
					? "create-issue-button"
					: appearance === "secondary"
						? "copy-button"
						: "default-button"
			}>
			{children}
		</button>
	),
}))

// Mock clipboard API
Object.assign(navigator, {
	clipboard: {
		writeText: jest.fn(),
	},
})

const mockT = jest.fn((key) => key)
const mockTranslationContext = {
	t: mockT,
	i18n: {} as any,
}

describe("BugReportDialog component", () => {
	beforeEach(() => {
		jest.clearAllMocks()
	})

	const renderComponent = (props: { onClose?: () => void } = {}) => {
		const { onClose = jest.fn() } = props

		return render(
			<TranslationContext.Provider value={mockTranslationContext}>
				<BugReportDialog onClose={onClose} />
			</TranslationContext.Provider>,
		)
	}

	it("should render the dialog", () => {
		renderComponent()
		expect(screen.getByTestId("dialog")).toBeInTheDocument()
		expect(screen.getByTestId("dialog-content")).toBeInTheDocument()
		expect(screen.getByTestId("bug-icon")).toBeInTheDocument()
	})

	it("should request environment info when mounted", () => {
		renderComponent()
		expect(mockPostMessage).toHaveBeenCalledWith({ type: "getBugReportInfo" })
	})

	it("should display loading state initially", () => {
		renderComponent()
		expect(screen.getByTestId("create-issue-button")).toBeDisabled()
		expect(screen.getByTestId("copy-button")).toBeDisabled()
		expect(screen.getByTestId("dialog-content").textContent).toContain(mockT("settings:bugreport.description"))
	})

	it("should display environment info when received", async () => {
		renderComponent()

		// Simulate receiving environment info
		const envInfo = {
			vscodeVersion: "1.70.0",
			platform: "darwin",
			appVersion: "1.2.3",
		}

		// Send a message with environment info
		if (mockMessageHandlers.message) {
			mockMessageHandlers.message({
				data: {
					type: "bugReportInfo",
					info: envInfo,
				},
			})
		}

		// Should display the formatted info
		await waitFor(() => {
			const content = screen.getByTestId("dialog-content")
			expect(content.textContent).toContain("vscodeVersion")
			expect(content.textContent).toContain("platform")
			expect(content.textContent).toContain("appVersion")
		})

		// Buttons should be enabled now
		expect(screen.getByTestId("create-issue-button")).not.toBeDisabled()
		expect(screen.getByTestId("copy-button")).not.toBeDisabled()
	})

	it("should copy environment info to clipboard", async () => {
		renderComponent()

		// Simulate receiving environment info
		const envInfo = {
			vscodeVersion: "1.70.0",
			platform: "darwin",
			appVersion: "1.2.3",
		}

		// Send a message with environment info
		if (mockMessageHandlers.message) {
			mockMessageHandlers.message({
				data: {
					type: "bugReportInfo",
					info: envInfo,
				},
			})
		}

		// Wait for info to be displayed
		await waitFor(() => {
			expect(screen.getByTestId("copy-button")).not.toBeDisabled()
		})

		// Click copy button
		fireEvent.click(screen.getByTestId("copy-button"))

		// Should call clipboard API
		expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
			expect.stringContaining("- **vscodeVersion**: 1.70.0"),
		)
	})

	it("should create GitHub issue when button is clicked", async () => {
		const onClose = jest.fn()
		renderComponent({ onClose })

		// Simulate receiving environment info
		const envInfo = {
			vscodeVersion: "1.70.0",
			platform: "darwin",
			appVersion: "1.2.3",
		}

		// Send a message with environment info
		if (mockMessageHandlers.message) {
			mockMessageHandlers.message({
				data: {
					type: "bugReportInfo",
					info: envInfo,
				},
			})
		}

		// Wait for info to be displayed
		await waitFor(() => {
			expect(screen.getByTestId("create-issue-button")).not.toBeDisabled()
		})

		// Click create issue button
		fireEvent.click(screen.getByTestId("create-issue-button"))

		// Should post message to VS Code with URL containing environment info
		expect(mockPostMessage).toHaveBeenCalledWith({
			type: "openExternal",
			url: expect.stringContaining("https://github.com/RooVetGit/Roo-Code/issues/new?template=bug_report.yml"),
		})

		// Verify URL contains the required parameters
		const urlArg = mockPostMessage.mock.calls[mockPostMessage.mock.calls.length - 1][0].url

		// Check for version parameter
		expect(urlArg).toContain("version=1.2.3")

		// Check for what-happened parameter with environment info
		expect(urlArg).toContain("what-happened=")
		expect(urlArg).toContain("Environment+Information")
		expect(urlArg).toContain("vscodeVersion")
		expect(urlArg).toContain("platform")
		expect(urlArg).toContain("appVersion")

		// Check for additional-context parameter
		expect(urlArg).toContain("additional-context=")
		expect(urlArg).toContain("Platform%3A+darwin")

		// Should call onClose
		expect(onClose).toHaveBeenCalled()
	})

	it("should close when cancel button is clicked", () => {
		const onClose = jest.fn()
		renderComponent({ onClose })

		// Find the cancel button (secondary button that isn't the copy button)
		const buttons = screen.getAllByRole("button")
		const cancelButton = buttons.find(
			(button) =>
				button !== screen.getByTestId("copy-button") && button !== screen.getByTestId("create-issue-button"),
		)

		// Click cancel button
		if (cancelButton) {
			fireEvent.click(cancelButton)
			expect(onClose).toHaveBeenCalled()
		} else {
			fail("Cancel button not found")
		}
	})
})
