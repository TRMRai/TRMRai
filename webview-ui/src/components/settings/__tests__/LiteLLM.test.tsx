import React from "react"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { act } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import type { ProviderSettings } from "@roo-code/types"

import { vscode } from "@src/utils/vscode"
import { ExtensionStateContextProvider } from "@src/context/ExtensionStateContext"

import { LiteLLM } from "../providers/LiteLLM"

// Mock vscode API
jest.mock("@src/utils/vscode", () => ({ vscode: { postMessage: jest.fn() } }))

// Mock useExtensionState
jest.mock("@src/context/ExtensionStateContext", () => ({
	...jest.requireActual("@src/context/ExtensionStateContext"),
	useExtensionState: jest.fn(() => ({
		routerModels: {
			litellm: {},
		},
	})),
	ExtensionStateContextProvider: ({ children }: any) => <div>{children}</div>,
}))

// Mock useAppTranslation
jest.mock("@src/i18n/TranslationContext", () => ({
	useAppTranslation: () => ({
		t: (key: string) => {
			// Return the key itself as a fallback for testing
			// This makes tests more resilient to translation changes
			return key
		},
	}),
}))

// Mock VSCode components
jest.mock("@vscode/webview-ui-toolkit/react", () => ({
	VSCodeTextField: ({ value, onInput, placeholder, children, type, "data-testid": dataTestId }: any) => (
		<div>
			<label>{children}</label>
			<input
				type={type || "text"}
				value={value}
				onChange={(e) => onInput({ target: { value: e.target.value } })}
				placeholder={placeholder}
				data-testid={dataTestId}
			/>
		</div>
	),
}))

// Mock Button component
jest.mock("@src/components/ui", () => ({
	Button: ({ children, onClick, disabled, "data-testid": dataTestId }: any) => (
		<button onClick={onClick} disabled={disabled} data-testid={dataTestId}>
			{children}
		</button>
	),
}))

// Mock ModelPicker component
jest.mock("../ModelPicker", () => ({
	ModelPicker: ({ serviceName }: any) => <div data-testid="model-picker">ModelPicker for {serviceName}</div>,
}))

class MockResizeObserver {
	observe() {}
	unobserve() {}
	disconnect() {}
}

global.ResizeObserver = MockResizeObserver

describe("LiteLLM", () => {
	const mockSetApiConfigurationField = jest.fn()

	const defaultApiConfiguration: ProviderSettings = {
		litellmBaseUrl: "",
		litellmApiKey: "",
		litellmModelId: "",
	}

	const defaultProps = {
		apiConfiguration: defaultApiConfiguration,
		setApiConfigurationField: mockSetApiConfigurationField,
	}

	const queryClient = new QueryClient()

	const renderLiteLLM = (props = defaultProps) => {
		return render(
			<ExtensionStateContextProvider>
				<QueryClientProvider client={queryClient}>
					<LiteLLM {...props} />
				</QueryClientProvider>
			</ExtensionStateContextProvider>,
		)
	}

	beforeEach(() => {
		jest.clearAllMocks()
	})

	it("renders all required fields", () => {
		renderLiteLLM()

		expect(screen.getByTestId("litellm-base-url-input")).toBeInTheDocument()
		expect(screen.getByTestId("litellm-api-key-input")).toBeInTheDocument()
		expect(screen.getByTestId("litellm-refresh-models-button")).toBeInTheDocument()
		expect(screen.getByTestId("model-picker")).toBeInTheDocument()
	})

	it("updates base URL when input changes", () => {
		renderLiteLLM()

		const baseUrlInput = screen.getByTestId("litellm-base-url-input")
		fireEvent.change(baseUrlInput, { target: { value: "https://api.litellm.ai" } })

		expect(mockSetApiConfigurationField).toHaveBeenCalledWith("litellmBaseUrl", "https://api.litellm.ai")
	})

	it("updates API key when input changes", () => {
		renderLiteLLM()

		const apiKeyInput = screen.getByTestId("litellm-api-key-input")
		fireEvent.change(apiKeyInput, { target: { value: "test-api-key" } })

		expect(mockSetApiConfigurationField).toHaveBeenCalledWith("litellmApiKey", "test-api-key")
	})

	it("disables refresh button when API key or base URL is missing", () => {
		renderLiteLLM()

		const refreshButton = screen.getByTestId("litellm-refresh-models-button")
		expect(refreshButton).toBeDisabled()
	})

	it("enables refresh button when both API key and base URL are provided", () => {
		const configWithCredentials: ProviderSettings = {
			...defaultApiConfiguration,
			litellmBaseUrl: "https://api.litellm.ai",
			litellmApiKey: "test-api-key",
		}

		renderLiteLLM({
			...defaultProps,
			apiConfiguration: configWithCredentials,
		})

		const refreshButton = screen.getByTestId("litellm-refresh-models-button")
		expect(refreshButton).not.toBeDisabled()
	})

	it("ensures flushRouterModels is called before requestRouterModels", async () => {
		const configWithCredentials: ProviderSettings = {
			...defaultApiConfiguration,
			litellmBaseUrl: "https://api.litellm.ai",
			litellmApiKey: "test-api-key",
		}

		renderLiteLLM({
			...defaultProps,
			apiConfiguration: configWithCredentials,
		})

		const refreshButton = screen.getByTestId("litellm-refresh-models-button")

		await act(async () => {
			fireEvent.click(refreshButton)
		})

		// Verify the order of calls - flushRouterModels should be called first
		const calls = (vscode.postMessage as jest.Mock).mock.calls
		expect(calls).toHaveLength(2)

		// First call should be flushRouterModels
		expect(calls[0][0]).toEqual({
			type: "flushRouterModels",
			text: "litellm",
		})

		// Second call should be requestRouterModels
		expect(calls[1][0]).toEqual({
			type: "requestRouterModels",
			values: {
				litellmApiKey: "test-api-key",
				litellmBaseUrl: "https://api.litellm.ai",
			},
		})
	})

	it("shows loading state when refresh is in progress", async () => {
		const configWithCredentials: ProviderSettings = {
			...defaultApiConfiguration,
			litellmBaseUrl: "https://api.litellm.ai",
			litellmApiKey: "test-api-key",
		}

		renderLiteLLM({
			...defaultProps,
			apiConfiguration: configWithCredentials,
		})

		const refreshButton = screen.getByTestId("litellm-refresh-models-button")

		await act(async () => {
			fireEvent.click(refreshButton)
		})

		// Should show loading state
		expect(screen.getByTestId("litellm-loading-message")).toBeInTheDocument()
		expect(refreshButton).toBeDisabled()
	})

	it("handles successful model refresh response", async () => {
		const configWithCredentials: ProviderSettings = {
			...defaultApiConfiguration,
			litellmBaseUrl: "https://api.litellm.ai",
			litellmApiKey: "test-api-key",
		}

		renderLiteLLM({
			...defaultProps,
			apiConfiguration: configWithCredentials,
		})

		const refreshButton = screen.getByTestId("litellm-refresh-models-button")

		await act(async () => {
			fireEvent.click(refreshButton)
		})

		// Simulate successful response
		await act(async () => {
			window.dispatchEvent(
				new MessageEvent("message", {
					data: {
						type: "routerModels",
						routerModels: {
							litellm: {
								"gpt-4": { name: "GPT-4", description: "OpenAI GPT-4 model" },
							},
						},
					},
				}),
			)
		})

		await waitFor(() => {
			expect(screen.getByTestId("litellm-success-message")).toBeInTheDocument()
		})
	})

	it("handles error response from model refresh", async () => {
		const configWithCredentials: ProviderSettings = {
			...defaultApiConfiguration,
			litellmBaseUrl: "https://api.litellm.ai",
			litellmApiKey: "test-api-key",
		}

		renderLiteLLM({
			...defaultProps,
			apiConfiguration: configWithCredentials,
		})

		const refreshButton = screen.getByTestId("litellm-refresh-models-button")

		await act(async () => {
			fireEvent.click(refreshButton)
		})

		// Simulate error response
		await act(async () => {
			window.dispatchEvent(
				new MessageEvent("message", {
					data: {
						type: "singleRouterModelFetchResponse",
						success: false,
						error: "Invalid API key",
						values: { provider: "litellm" },
					},
				}),
			)
		})

		await waitFor(() => {
			expect(screen.getByTestId("litellm-error-message")).toBeInTheDocument()
		})
	})

	it("resets error flag on new refresh attempt", async () => {
		const configWithCredentials: ProviderSettings = {
			...defaultApiConfiguration,
			litellmBaseUrl: "https://api.litellm.ai",
			litellmApiKey: "test-api-key",
		}

		renderLiteLLM({
			...defaultProps,
			apiConfiguration: configWithCredentials,
		})

		const refreshButton = screen.getByTestId("litellm-refresh-models-button")

		// First refresh attempt with error
		await act(async () => {
			fireEvent.click(refreshButton)
		})

		await act(async () => {
			window.dispatchEvent(
				new MessageEvent("message", {
					data: {
						type: "singleRouterModelFetchResponse",
						success: false,
						error: "Invalid API key",
						values: { provider: "litellm" },
					},
				}),
			)
		})

		// Second refresh attempt should reset the error flag
		await act(async () => {
			fireEvent.click(refreshButton)
		})

		// Simulate successful response this time
		await act(async () => {
			window.dispatchEvent(
				new MessageEvent("message", {
					data: {
						type: "routerModels",
						routerModels: {
							litellm: {
								"gpt-4": { name: "GPT-4", description: "OpenAI GPT-4 model" },
							},
						},
					},
				}),
			)
		})

		await waitFor(() => {
			expect(screen.getByTestId("litellm-success-message")).toBeInTheDocument()
		})
	})
})
