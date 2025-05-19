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
			;(getModels as jest.Mock).mockImplementation((router) => {
				return Promise.resolve({
					[`${router}-model-1`]: { name: `${router} Model 1` },
					[`${router}-model-2`]: { name: `${router} Model 2` },
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
			;(getModels as jest.Mock).mockImplementation((router) => {
				if (router === "openrouter" || router === "litellm") {
					return Promise.resolve({
						[`${router}-model-1`]: { name: `${router} Model 1` },
					})
				}
				// For other routers, throw an error
				return Promise.reject(new Error(`Failed to fetch ${router} models`))
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
})
