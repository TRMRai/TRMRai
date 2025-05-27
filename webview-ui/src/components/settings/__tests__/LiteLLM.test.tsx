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
			litellm: {
				"gpt-4": { name: "GPT-4", description: "OpenAI GPT-4 model" },
				"claude-3": { name: "Claude 3", description: "Anthropic Claude 3 model" },
			},
		},
	})),
	ExtensionStateContextProvider: ({ children }: any) => <div>{children}</div>,
}))

// Mock useAppTranslation
jest.mock("@src/i18n/TranslationContext", () => ({
	useAppTranslation: () => ({
		t: (key: string) => {
			const translations: Record<string, string> = {
				"settings:providers.litellmBaseUrl": "LiteLLM Base URL",
				"settings:providers.litellmApiKey": "LiteLLM API Key",
				"settings:placeholders.baseUrl": "Enter base URL",
				"settings:placeholders.apiKey": "Enter API key",
				"settings:providers.apiKeyStorageNotice": "API keys are stored securely",
				"settings:providers.refreshModels.label": "Refresh Models",
				"settings:providers.refreshModels.loading": "Loading models...",
				"settings:providers.refreshModels.success": "Models refreshed successfully",
				"settings:providers.refreshModels.error": "Failed to refresh models",
				"settings:providers.refreshModels.missingConfig": "Please provide both API key and base URL",
			}
			return translations[key] || key
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

		expect(screen.getByText("LiteLLM Base URL")).toBeInTheDocument()
		expect(screen.getByText("LiteLLM API Key")).toBeInTheDocument()
		expect(screen.getByText("Refresh Models")).toBeInTheDocument()
		expect(screen.getByTestId("model-picker")).toBeInTheDocument()
	})

	it("updates base URL when input changes", () => {
		renderLiteLLM()

		const baseUrlInput = screen.getByPlaceholderText("Enter base URL")
		fireEvent.change(baseUrlInput, { target: { value: "https://api.litellm.ai" } })

		expect(mockSetApiConfigurationField).toHaveBeenCalledWith("litellmBaseUrl", "https://api.litellm.ai")
	})

	it("updates API key when input changes", () => {
		renderLiteLLM()

		const apiKeyInput = screen.getByPlaceholderText("Enter API key")
		fireEvent.change(apiKeyInput, { target: { value: "test-api-key" } })

		expect(mockSetApiConfigurationField).toHaveBeenCalledWith("litellmApiKey", "test-api-key")
	})

	it("disables refresh button when API key or base URL is missing", () => {
		renderLiteLLM()

		const refreshButton = screen.getByRole("button", { name: /refresh models/i })
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

		const refreshButton = screen.getByRole("button", { name: /refresh models/i })
		expect(refreshButton).not.toBeDisabled()
	})

	it("sends flushRouterModels and requestRouterModels messages when refresh button is clicked", async () => {
		const configWithCredentials: ProviderSettings = {
			...defaultApiConfiguration,
			litellmBaseUrl: "https://api.litellm.ai",
			litellmApiKey: "test-api-key",
		}

		renderLiteLLM({
			...defaultProps,
			apiConfiguration: configWithCredentials,
		})

		const refreshButton = screen.getByRole("button", { name: /refresh models/i })

		await act(async () => {
			fireEvent.click(refreshButton)
		})

		// Verify that flushRouterModels is called first
		expect(vscode.postMessage).toHaveBeenCalledWith({
			type: "flushRouterModels",
			text: "litellm",
		})

		// Verify that requestRouterModels is called with the correct parameters
		expect(vscode.postMessage).toHaveBeenCalledWith({
			type: "requestRouterModels",
			values: {
				litellmApiKey: "test-api-key",
				litellmBaseUrl: "https://api.litellm.ai",
			},
		})

		// Verify both messages were sent
		expect(vscode.postMessage).toHaveBeenCalledTimes(2)
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

		const refreshButton = screen.getByRole("button", { name: /refresh models/i })

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

		const refreshButton = screen.getByRole("button", { name: /refresh models/i })

		await act(async () => {
			fireEvent.click(refreshButton)
		})

		// Should show loading state
		expect(screen.getByText("Loading models...")).toBeInTheDocument()
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

		const refreshButton = screen.getByRole("button", { name: /refresh models/i })

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
			expect(screen.getByText("Models refreshed successfully")).toBeInTheDocument()
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

		const refreshButton = screen.getByRole("button", { name: /refresh models/i })

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
			expect(screen.getByText("Invalid API key")).toBeInTheDocument()
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

		const refreshButton = screen.getByRole("button", { name: /refresh models/i })

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
			expect(screen.getByText("Models refreshed successfully")).toBeInTheDocument()
		})
	})
})
