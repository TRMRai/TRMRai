// npx jest src/core/webview/__tests__/webviewMessageHandler.test.ts

import { webviewMessageHandler } from "../webviewMessageHandler"
import { getModels } from "../../../api/providers/fetchers/modelCache"

// Mock dependencies
jest.mock("../../../api/providers/fetchers/modelCache", () => ({
	getModels: jest.fn(),
	flushModels: jest.fn().mockResolvedValue(undefined),
}))

describe("webviewMessageHandler", () => {
	// Set up provider mock with essential methods needed by the handler
	const mockProvider = {
		postMessageToWebview: jest.fn(),
		getState: jest.fn().mockResolvedValue({
			apiConfiguration: {
				openRouterApiKey: "mock-openrouter-key",
				requestyApiKey: "mock-requesty-key",
				glamaApiKey: "mock-glama-key",
				unboundApiKey: "mock-unbound-key",
				litellmApiKey: "mock-litellm-key",
				litellmBaseUrl: "https://mock-litellm-url",
			},
		}),
		log: jest.fn(),
	}

	beforeEach(() => {
		jest.clearAllMocks()
	})

	describe("requestRouterModels", () => {
		test("handles all successful model fetches correctly", async () => {
			// Mock all getModels calls to succeed with different data
			;(getModels as jest.Mock).mockImplementation((options) => {
				const provider = options.provider
				return Promise.resolve({
					[`${provider}-model-1`]: { name: `${provider} Model 1` },
					[`${provider}-model-2`]: { name: `${provider} Model 2` },
				})
			})

			// Call the handler
			await webviewMessageHandler(mockProvider as any, {
				type: "requestRouterModels",
			})

			// Verify the provider posted the correct message with all models
			expect(mockProvider.postMessageToWebview).toHaveBeenCalledWith({
				type: "routerModels",
				routerModels: {
					openrouter: {
						"openrouter-model-1": { name: "openrouter Model 1" },
						"openrouter-model-2": { name: "openrouter Model 2" },
					},
					requesty: {
						"requesty-model-1": { name: "requesty Model 1" },
						"requesty-model-2": { name: "requesty Model 2" },
					},
					glama: {
						"glama-model-1": { name: "glama Model 1" },
						"glama-model-2": { name: "glama Model 2" },
					},
					unbound: {
						"unbound-model-1": { name: "unbound Model 1" },
						"unbound-model-2": { name: "unbound Model 2" },
					},
					litellm: {
						"litellm-model-1": { name: "litellm Model 1" },
						"litellm-model-2": { name: "litellm Model 2" },
					},
				},
			})
		})

		test("handles some failed model fetches correctly", async () => {
			// Mock some getModels calls to succeed and others to fail
			;(getModels as jest.Mock).mockImplementation((options) => {
				const provider = options.provider
				if (provider === "openrouter" || provider === "litellm") {
					return Promise.resolve({
						[`${provider}-model-1`]: { name: `${provider} Model 1` },
					})
				}
				// For other providers, throw an error
				return Promise.reject(new Error(`Failed to fetch ${provider} models`))
			})

			// Call the handler
			await webviewMessageHandler(mockProvider as any, {
				type: "requestRouterModels",
			})

			// Verify the provider posted the correct message with only successful models
			expect(mockProvider.postMessageToWebview).toHaveBeenCalledWith({
				type: "routerModels",
				routerModels: {
					openrouter: {
						"openrouter-model-1": { name: "openrouter Model 1" },
					},
					requesty: {},
					glama: {},
					unbound: {},
					litellm: {
						"litellm-model-1": { name: "litellm Model 1" },
					},
				},
			})
		})

		test("handles all failed model fetches correctly", async () => {
			// Mock all getModels calls to fail
			;(getModels as jest.Mock).mockRejectedValue(new Error("API Error"))

			// Call the handler
			await webviewMessageHandler(mockProvider as any, {
				type: "requestRouterModels",
			})

			// Verify the provider posted the correct message with empty objects for each router
			expect(mockProvider.postMessageToWebview).toHaveBeenCalledWith({
				type: "routerModels",
				routerModels: {
					openrouter: {},
					requesty: {},
					glama: {},
					unbound: {},
					litellm: {},
				},
			})
		})
	})

	describe("requestProviderModels", () => {
		test("when getModels succeeds, it posts a providerModelsResponse with models", async () => {
			const mockLiteLLMModels = { "litellm-model-1": { name: "LiteLLM Model 1" } }
			;(getModels as jest.Mock).mockResolvedValueOnce(mockLiteLLMModels)

			await webviewMessageHandler(mockProvider as any, {
				type: "requestProviderModels",
				payload: { provider: "litellm", apiKey: "test-key", baseUrl: "test-url" },
			})

			expect(mockProvider.postMessageToWebview).toHaveBeenCalledWith({
				type: "providerModelsResponse",
				payload: {
					provider: "litellm",
					models: mockLiteLLMModels,
					error: undefined, // Explicitly check error is undefined on success
				},
			})
			expect(getModels).toHaveBeenCalledWith({ provider: "litellm", apiKey: "test-key", baseUrl: "test-url" })
		})

		test("when getModels fails, it posts a providerModelsResponse with an error and empty models", async () => {
			const errorMessage = "Failed to fetch LiteLLM models: No response from server."
			;(getModels as jest.Mock).mockRejectedValueOnce(new Error(errorMessage))

			await webviewMessageHandler(mockProvider as any, {
				type: "requestProviderModels",
				payload: { provider: "litellm", apiKey: "test-key", baseUrl: "test-url" },
			})

			expect(mockProvider.postMessageToWebview).toHaveBeenCalledWith({
				type: "providerModelsResponse",
				payload: {
					provider: "litellm",
					models: {},
					error: errorMessage,
				},
			})
			expect(getModels).toHaveBeenCalledWith({ provider: "litellm", apiKey: "test-key", baseUrl: "test-url" })
		})
	})
})
