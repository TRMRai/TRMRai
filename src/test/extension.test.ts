const assert = require("assert")
const vscode = require("vscode")
const path = require("path")
const fs = require("fs")
const dotenv = require("dotenv")

// Load test environment variables from root directory
const testEnvPath = path.join(__dirname, "..", "..", ".test_env")
dotenv.config({ path: testEnvPath })

suite("Roo Code Extension Test Suite", () => {
	vscode.window.showInformationMessage("Starting Roo Code extension tests.")

	test("Extension should be present", () => {
		const extension = vscode.extensions.getExtension("RooVeterinaryInc.roo-cline")
		assert.notStrictEqual(extension, undefined)
	})

	test("Extension should activate", async () => {
		const extension = vscode.extensions.getExtension("RooVeterinaryInc.roo-cline")
		if (!extension) {
			assert.fail("Extension not found")
		}
		await extension.activate()
		assert.strictEqual(extension.isActive, true)
	})

	test("OpenRouter API key and models should be configured correctly", function (done) {
		// @ts-ignore
		this.timeout(60000) // Increase timeout to 60s for network requests
		;(async () => {
			try {
				// Get extension instance
				const extension = vscode.extensions.getExtension("RooVeterinaryInc.roo-cline")
				if (!extension) {
					done(new Error("Extension not found"))
					return
				}

				// Verify API key is set and valid
				const apiKey = process.env.OPENROUTER_API_KEY
				if (!apiKey) {
					done(new Error("OPENROUTER_API_KEY environment variable is not set"))
					return
				}
				if (!apiKey.startsWith("sk-or-v1-")) {
					done(new Error("OpenRouter API key should have correct format"))
					return
				}

				// Activate extension and get provider
				const api = await extension.activate()
				if (!api) {
					done(new Error("Extension API not found"))
					return
				}

				// Get the provider from the extension's exports
				const provider = api.sidebarProvider
				if (!provider) {
					done(new Error("Provider not found"))
					return
				}

				// Set up the API configuration
				await provider.updateGlobalState("apiProvider", "openrouter")
				await provider.storeSecret("openRouterApiKey", apiKey)

				// Set up timeout to fail test if models don't load
				const timeout = setTimeout(() => {
					done(new Error("Timeout waiting for models to load"))
				}, 30000)

				// Wait for models to be loaded
				const checkModels = setInterval(async () => {
					try {
						const models = await provider.readOpenRouterModels()
						if (!models) {
							return
						}

						clearInterval(checkModels)
						clearTimeout(timeout)

						// Verify expected Claude models are available
						const expectedModels = [
							"anthropic/claude-3.5-sonnet:beta",
							"anthropic/claude-3-sonnet:beta",
							"anthropic/claude-3.5-sonnet",
							"anthropic/claude-3.5-sonnet-20240620",
							"anthropic/claude-3.5-sonnet-20240620:beta",
							"anthropic/claude-3.5-haiku:beta",
						]

						for (const modelId of expectedModels) {
							assert.strictEqual(modelId in models, true, `Model ${modelId} should be available`)
						}

						done()
					} catch (error) {
						clearInterval(checkModels)
						clearTimeout(timeout)
						done(error)
					}
				}, 1000)

				// Trigger model loading
				await provider.refreshOpenRouterModels()
			} catch (error) {
				done(error)
			}
		})()
	})

	test("Commands should be registered", async () => {
		const commands = await vscode.commands.getCommands(true)
		console.log(
			"Available commands:",
			// @ts-ignore
			commands.filter((cmd) => cmd.startsWith("roo-")),
		)

		// Test core commands are registered
		const expectedCommands = [
			"roo-cline.plusButtonClicked",
			"roo-cline.mcpButtonClicked",
			"roo-cline.promptsButtonClicked",
			"roo-cline.historyButtonClicked",
			"roo-cline.popoutButtonClicked",
			"roo-cline.settingsButtonClicked",
			"roo-cline.openInNewTab",
		]

		for (const cmd of expectedCommands) {
			assert.strictEqual(commands.includes(cmd), true, `Command ${cmd} should be registered`)
		}
	})

	test("Views should be registered", () => {
		const view = vscode.window.createWebviewPanel(
			"roo-cline.SidebarProvider",
			"Roo Code",
			vscode.ViewColumn.One,
			{},
		)
		assert.notStrictEqual(view, undefined)
		view.dispose()
	})

	test("Should handle prompt and response correctly", async function () {
		// @ts-ignore
		this.timeout(900000) // Increase timeout for CI environment

		const timeout = 120000 // Increase timeout for CI
		const interval = 2000 // Increase interval to reduce CPU usage
		const apiConfigTimeout = 300000 // 5 minutes timeout for API configuration

		console.log("Starting prompt and response test...")

		// Get extension instance
		const extension = await vscode.extensions.getExtension("RooVeterinaryInc.roo-cline")
		if (!extension) {
			assert.fail("Extension not found")
			return
		}

		// Activate extension and get API
		console.log("Activating extension...")
		const api = await extension.activate()
		if (!api) {
			assert.fail("Extension API not found")
			return
		}

		// Get provider
		console.log("Getting provider...")
		const provider = await api.sidebarProvider
		if (!provider) {
			assert.fail("Provider not found")
			return
		}

		// Set up API configuration
		console.log("Setting up API configuration...")
		await provider.updateGlobalState("apiProvider", "openrouter")
		await provider.updateGlobalState("openRouterModelId", "anthropic/claude-3.5-sonnet")
		const apiKey = process.env.OPENROUTER_API_KEY
		if (!apiKey) {
			assert.fail("OPENROUTER_API_KEY environment variable is not set")
			return
		}
		await provider.storeSecret("openRouterApiKey", apiKey)

		// Create webview panel with development options
		console.log("Creating webview panel...")
		const extensionUri = extension.extensionUri
		const panel = vscode.window.createWebviewPanel("roo-cline.SidebarProvider", "Roo Code", vscode.ViewColumn.One, {
			enableScripts: true,
			enableCommandUris: true,
			retainContextWhenHidden: true,
			localResourceRoots: [extensionUri],
		})

		try {
			// Initialize webview with development context
			panel.webview.options = {
				enableScripts: true,
				enableCommandUris: true,
				localResourceRoots: [extensionUri],
			}

			// Initialize provider with panel
			console.log("Initializing provider with panel...")
			await provider.resolveWebviewView(panel)

			// Set up message tracking with improved error handling
			let webviewReady = false
			let messagesReceived = false
			const originalPostMessage = await provider.postMessageToWebview.bind(provider)

			// @ts-ignore
			provider.postMessageToWebview = async function (message) {
				try {
					console.log("Posting message:", JSON.stringify(message))
					if (message.type === "state") {
						webviewReady = true
						console.log("Webview state received")
						if (message.state?.codeMessages?.length > 0) {
							messagesReceived = true
							console.log("Messages in state:", message.state.codeMessages)
						}
					}
					await originalPostMessage(message)
				} catch (error) {
					console.error("Error in postMessage:", error)
					throw error
				}
			}

			// Wait for API configuration
			console.log("Waiting for API configuration...")
			let startTime = Date.now()
			let apiConfigured = false

			// First verify the API key is stored
			while (Date.now() - startTime < apiConfigTimeout) {
				try {
					const state = await provider.getState()
					const storedKey = await provider.context.secrets.get("openRouterApiKey")

					if (
						storedKey &&
						state.apiConfiguration.apiProvider === "openrouter" &&
						state.apiConfiguration.openRouterModelId === "anthropic/claude-3.5-sonnet"
					) {
						console.log("API configuration verified")
						apiConfigured = true
						break
					}

					if (Date.now() - startTime > 60000) {
						console.log("API configuration status check at 1 minute mark:", {
							hasStoredKey: !!storedKey,
							provider: state.apiConfiguration.apiProvider,
							modelId: state.apiConfiguration.openRouterModelId,
						})
					}
				} catch (error) {
					console.error("Error checking API configuration:", error)
				}
				await new Promise((resolve) => setTimeout(resolve, 5000))
			}

			if (!apiConfigured) {
				const state = await provider.getState()
				const storedKey = await provider.context.secrets.get("openRouterApiKey")
				throw new Error(
					`API configuration timeout. Provider: ${state.apiConfiguration.apiProvider}, ` +
						`Model: ${state.apiConfiguration.openRouterModelId}, ` +
						`Has stored key: ${!!storedKey}`,
				)
			}

			// Wait for webview to launch and receive initial state
			console.log("Waiting for webview initialization...")
			startTime = Date.now()
			while (Date.now() - startTime < 300000) {
				// 5 minutes timeout for CI
				console.log("Webview ready:", webviewReady)
				if (webviewReady) {
					console.log("Webview successfully initialized")
					// Wait additional time for webview to fully initialize
					await new Promise((resolve) => setTimeout(resolve, 5000))
					break
				}
				if (Date.now() - startTime > 60000 && !webviewReady) {
					console.log("Webview status check at 1 minute mark")
				}
				await new Promise((resolve) => setTimeout(resolve, interval))
			}

			if (!webviewReady) {
				throw new Error("Timeout waiting for webview initialization")
			}

			// Send webviewDidLaunch to initialize chat
			console.log("Sending webviewDidLaunch...")
			await provider.postMessageToWebview({ type: "webviewDidLaunch" })
			console.log("Sent webviewDidLaunch")

			// Wait for webview to fully initialize
			await new Promise((resolve) => setTimeout(resolve, 5000))

			// Restore original postMessage
			provider.postMessageToWebview = originalPostMessage

			// Wait for OpenRouter models to be fully loaded
			console.log("Waiting for OpenRouter models...")
			startTime = Date.now()
			while (Date.now() - startTime < timeout) {
				const models = await provider.readOpenRouterModels()
				if (models && Object.keys(models).length > 0) {
					console.log("OpenRouter models successfully loaded")
					break
				}
				await new Promise((resolve) => setTimeout(resolve, interval))
			}

			// Send prompt
			const prompt = "Hello world, what is your name?"
			console.log("Sending prompt:", prompt)

			// Start task with improved error handling
			try {
				await api.startNewTask(prompt)
				console.log("Task successfully started")
			} catch (error) {
				console.error("Error starting task:", error)
				console.log("Provider state at error:", await provider.getState())
				throw error
			}

			// Wait for messages to be processed
			console.log("Waiting for response...")
			startTime = Date.now()
			let responseReceived = false
			while (Date.now() - startTime < timeout) {
				const state = await provider.getState()
				console.log("Current state:", JSON.stringify(state))

				// Check provider.clineMessages
				const messages = provider.clineMessages
				if (messages && messages.length > 0) {
					console.log("Provider messages:", JSON.stringify(messages, null, 2))
					const hasResponse = messages.some(
						// @ts-ignore
						(m) => m.type === "say" && m.text && m.text.toLowerCase().includes("roo"),
					)
					if (hasResponse) {
						console.log('Found response containing "Roo" in provider messages')
						responseReceived = true
						break
					}
				}

				// Check provider.cline.clineMessages
				const clineMessages = provider.cline?.clineMessages
				if (clineMessages && clineMessages.length > 0) {
					console.log("Cline messages:", JSON.stringify(clineMessages, null, 2))
					const hasResponse = clineMessages.some(
						// @ts-ignore
						(m) => m.type === "say" && m.text && m.text.toLowerCase().includes("roo"),
					)
					if (hasResponse) {
						console.log('Found response containing "Roo" in cline messages')
						responseReceived = true
						break
					}
				}

				await new Promise((resolve) => setTimeout(resolve, interval))
			}

			if (!responseReceived) {
				console.log("Final provider state:", await provider.getState())
				throw new Error("Did not receive expected response within timeout period")
			}

			console.log("Test completed successfully")
		} catch (error) {
			console.error("Test failed with error:", error)
			throw error
		} finally {
			panel.dispose()
		}
	})
})
