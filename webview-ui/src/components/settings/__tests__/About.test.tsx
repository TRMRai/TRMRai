import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { About } from "../About"
import { TranslationContext } from "@/i18n/TranslationContext"
import { TelemetrySetting } from "../../../../../src/shared/TelemetrySetting"

// Mock the BugReportDialog component
jest.mock("../BugReportDialog", () => ({
	BugReportDialog: ({ onClose }: { onClose: () => void }) => (
		<div data-testid="bug-report-dialog">
			<button data-testid="close-dialog" onClick={onClose}>
				Close
			</button>
		</div>
	),
}))

// Mock lucide-react icons
jest.mock("lucide-react", () => ({
	Info: () => <div data-testid="info-icon" />,
	Bug: () => <div data-testid="bug-icon" />,
}))

// Mock VSCode components
jest.mock("@vscode/webview-ui-toolkit/react", () => ({
	VSCodeButton: ({ children, onClick, appearance, className }: any) => (
		<button onClick={onClick} data-appearance={appearance} className={className} data-testid="vscode-button">
			{children}
		</button>
	),
	VSCodeCheckbox: ({ children, onChange, checked }: any) => (
		<label>
			<input
				type="checkbox"
				checked={checked}
				onChange={(e) => onChange({ target: { checked: e.target.checked } })}
				data-testid="telemetry-checkbox"
			/>
			{children}
		</label>
	),
	VSCodeLink: ({ children, href }: any) => <a href={href}>{children}</a>,
}))

// Mock vscode API
jest.mock("@/utils/vscode", () => ({
	vscode: {
		postMessage: jest.fn(),
	},
}))

const mockT = jest.fn((key) => key)
const mockTranslationContext = {
	t: mockT,
	i18n: {} as any,
}

describe("About component", () => {
	beforeEach(() => {
		jest.clearAllMocks()
	})

	const renderComponent = (
		props: {
			version?: string
			telemetrySetting?: TelemetrySetting
			setTelemetrySetting?: (setting: TelemetrySetting) => void
		} = {},
	) => {
		const { version = "1.0.0", telemetrySetting = "unset", setTelemetrySetting = jest.fn() } = props

		return render(
			<TranslationContext.Provider value={mockTranslationContext}>
				<About
					version={version}
					telemetrySetting={telemetrySetting}
					setTelemetrySetting={setTelemetrySetting}
				/>
			</TranslationContext.Provider>,
		)
	}

	it("renders the version number", () => {
		renderComponent({ version: "1.2.3" })
		expect(mockT).toHaveBeenCalledWith("settings:sections.about")
		expect(screen.getByText(/Version: 1.2.3/i)).toBeInTheDocument()
	})

	it("renders the telemetry checkbox", () => {
		renderComponent()
		expect(screen.getByTestId("telemetry-checkbox")).toBeInTheDocument()
	})

	it("renders the bug report button", () => {
		renderComponent()
		const bugReportText = mockT("settings:footer.bugreport.button")
		expect(screen.getByText(bugReportText)).toBeInTheDocument()
		expect(screen.getByTestId("bug-icon")).toBeInTheDocument()
	})

	it("opens the bug report dialog when clicking the button", async () => {
		renderComponent()

		// Bug report dialog shouldn't be visible initially
		expect(screen.queryByTestId("bug-report-dialog")).not.toBeInTheDocument()

		// Click the report bug button
		const bugReportButton = screen.getByText(mockT("settings:footer.bugreport.button"))
		fireEvent.click(bugReportButton)

		// Dialog should now be visible
		await waitFor(() => {
			expect(screen.getByTestId("bug-report-dialog")).toBeInTheDocument()
		})
	})

	it("closes the bug report dialog", async () => {
		renderComponent()

		// Open dialog
		const bugReportButton = screen.getByText(mockT("settings:footer.bugreport.button"))
		fireEvent.click(bugReportButton)

		// Dialog should be visible
		await waitFor(() => {
			expect(screen.getByTestId("bug-report-dialog")).toBeInTheDocument()
		})

		// Close dialog
		const closeButton = screen.getByTestId("close-dialog")
		fireEvent.click(closeButton)

		// Dialog should be hidden
		await waitFor(() => {
			expect(screen.queryByTestId("bug-report-dialog")).not.toBeInTheDocument()
		})
	})
})
