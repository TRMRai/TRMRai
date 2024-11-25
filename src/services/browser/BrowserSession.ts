import * as vscode from "vscode"
import * as fs from "fs/promises"
import * as path from "path"
import { Browser, Page, ScreenshotOptions, TimeoutError, launch } from "puppeteer"
import pWaitFor from "p-wait-for"
import delay from "delay"
import { fileExistsAtPath } from "../../utils/fs"
import { BrowserActionResult } from "../../shared/ExtensionMessage"

export class BrowserSession {
	private context: vscode.ExtensionContext
	private browser?: Browser
	private page?: Page
	private currentMousePosition?: string
	private isInteractive: boolean = false
	private lastInteractionTime: number = 0
	private readonly TIMEOUT_MINUTES = 15
	private closeRequested: boolean = false
	private timeoutCheckInterval?: NodeJS.Timeout

	constructor(context: vscode.ExtensionContext) {
		this.context = context
	}

	async launchBrowser(interactive: boolean = false) {
		console.log("launch browser called")
		if (this.browser) {
			await this.closeBrowser() // this may happen when the model launches a browser again after having used it already before
		}

		this.isInteractive = interactive

		this.browser = await launch({
			args: [
				"--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
			],
			defaultViewport: this.isInteractive ? { width: 1300, height: 1000 } : {
				width: 900,
				height: 600,
			},
			headless: false, // Always use non-headless mode
		})
		this.page = await this.browser?.newPage()

		if (this.isInteractive && this.page) {
			// Maximize the window to use full screen dimensions
			const session = await this.page.target().createCDPSession()
			const { windowId } = await session.send('Browser.getWindowForTarget')
			await session.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } })

			// Disable Puppeteer's automation features in interactive mode
			await this.page.evaluate(() => {
				// @ts-ignore
				delete window.navigator.webdriver
			})
		}

		// Reset flags
		this.closeRequested = false
		this.lastInteractionTime = Date.now()
		
		// Start timeout monitoring if not in interactive mode
		if (!this.isInteractive) {
			this.startTimeoutMonitoring()
		}

		return {
			screenshot: "",
			logs: this.isInteractive ? 
				"Browser launched in interactive mode. Please confirm when you're done using the browser." :
				"Browser launched successfully.",
			currentUrl: this.page?.url(),
			currentMousePosition: this.currentMousePosition,
		}
	}

	private startTimeoutMonitoring() {
		// Clear any existing interval
		if (this.timeoutCheckInterval) {
			clearInterval(this.timeoutCheckInterval)
		}

		// Only start monitoring if not in interactive mode
		if (!this.isInteractive) {
			this.timeoutCheckInterval = setInterval(async () => {
				const timeSinceLastInteraction = Date.now() - this.lastInteractionTime
				if (timeSinceLastInteraction > this.TIMEOUT_MINUTES * 60 * 1000) {
					if (this.timeoutCheckInterval) {
						clearInterval(this.timeoutCheckInterval)
					}
					console.log("Browser timeout reached, closing...")
					await this.closeBrowser()
				}
			}, 30000) // Check every 30 seconds
		}
	}

	async closeBrowser(): Promise<BrowserActionResult> {
		// If in interactive mode and close hasn't been requested yet, ask for confirmation
		if (this.isInteractive && !this.closeRequested) {
			console.log("Close requested but waiting for user confirmation...")
			this.closeRequested = true
			return {
				logs: "Are you done using the browser? Please confirm to close it.",
				screenshot: await this.getCurrentScreenshot(),
				currentUrl: this.page?.url(),
				currentMousePosition: this.currentMousePosition,
			}
		} 

		// Only close if explicitly requested or not in interactive mode
		if (!this.isInteractive || (this.isInteractive && this.closeRequested)) {
			console.log("closing browser...")
			await this.browser?.close().catch(() => {})
			this.browser = undefined
			this.page = undefined
			this.currentMousePosition = undefined
			this.isInteractive = false
			this.closeRequested = false
			
			// Clear timeout monitoring
			if (this.timeoutCheckInterval) {
				clearInterval(this.timeoutCheckInterval)
				this.timeoutCheckInterval = undefined
			}
		}
		return {}
	}

	private async getCurrentScreenshot(): Promise<string | undefined> {
		if (!this.page) return undefined

		let options: ScreenshotOptions = {
			encoding: "base64",
		}

		try {
			let screenshotBase64 = await this.page.screenshot({
				...options,
				type: "webp",
			})
			return `data:image/webp;base64,${screenshotBase64}`
		} catch (err) {
			try {
				let screenshotBase64 = await this.page.screenshot({
					...options,
					type: "png",
				})
				return `data:image/png;base64,${screenshotBase64}`
			} catch (err) {
				console.error("Failed to take screenshot:", err)
				return undefined
			}
		}
	}

	async handleNextStep(choice: string): Promise<BrowserActionResult> {
		const normalizedChoice = choice.toLowerCase().trim()

		if (normalizedChoice === "yes" || normalizedChoice === "done" || normalizedChoice === "confirm") {
			await this.browser?.close().catch(() => {})
			this.browser = undefined
			this.page = undefined
			this.currentMousePosition = undefined
			this.isInteractive = false
			this.closeRequested = false
			
			if (this.timeoutCheckInterval) {
				clearInterval(this.timeoutCheckInterval)
				this.timeoutCheckInterval = undefined
			}
			return {}
		}

		if (normalizedChoice === "no" || normalizedChoice === "continue") {
			this.closeRequested = false
			this.lastInteractionTime = Date.now()
			return {
				logs: "Browser session continued. Please confirm when you're done.",
				screenshot: await this.getCurrentScreenshot(),
				currentUrl: this.page?.url(),
				currentMousePosition: this.currentMousePosition,
			}
		}

		// Default response for unclear input
		return {
			logs: "Please confirm if you're done using the browser (yes/no).",
			screenshot: await this.getCurrentScreenshot(),
			currentUrl: this.page?.url(),
			currentMousePosition: this.currentMousePosition,
		}
	}

	async doAction(action: (page: Page) => Promise<void>): Promise<BrowserActionResult> {
		if (!this.page) {
			throw new Error(
				"Browser is not launched. This may occur if the browser was automatically closed by a non-`browser_action` tool.",
			)
		}

		// Update last interaction time
		this.lastInteractionTime = Date.now()

		const logs: string[] = []
		let lastLogTs = Date.now()

		const consoleListener = (msg: any) => {
			if (msg.type() === "log") {
				logs.push(msg.text())
			} else {
				logs.push(`[${msg.type()}] ${msg.text()}`)
			}
			lastLogTs = Date.now()
		}

		const errorListener = (err: Error) => {
			logs.push(`[Page Error] ${err.toString()}`)
			lastLogTs = Date.now()
		}

		// Add the listeners
		this.page.on("console", consoleListener)
		this.page.on("pageerror", errorListener)

		try {
			if (!this.isInteractive) {
				await action(this.page)
			} else {
				console.log("Browser actions cannot be performed in interactive mode. The user has manual control.")
			}
		} catch (err) {
			if (!(err instanceof TimeoutError)) {
				logs.push(`[Error] ${err.toString()}`)
			}
		}

		// Wait for console inactivity, with a timeout
		await pWaitFor(() => Date.now() - lastLogTs >= 500, {
			timeout: 3_000,
			interval: 100,
		}).catch(() => {})

		let screenshot = await this.getCurrentScreenshot()
		if (!screenshot) {
			throw new Error("Failed to take screenshot.")
		}

		this.page.off("console", consoleListener)
		this.page.off("pageerror", errorListener)

		return {
			screenshot,
			logs: logs.join("\n"),
			currentUrl: this.page.url(),
			currentMousePosition: this.currentMousePosition,
		}
	}

	async navigateToUrl(url: string): Promise<BrowserActionResult> {
		return this.doAction(async (page) => {
			await page.goto(url, { timeout: 7_000, waitUntil: ["domcontentloaded", "networkidle2"] })
			await this.waitTillHTMLStable(page) // in case the page is loading more resources
		})
	}

	private async waitTillHTMLStable(page: Page, timeout = 5_000) {
		const checkDurationMsecs = 500
		const maxChecks = timeout / checkDurationMsecs
		let lastHTMLSize = 0
		let checkCounts = 1
		let countStableSizeIterations = 0
		const minStableSizeIterations = 3

		while (checkCounts++ <= maxChecks) {
			let html = await page.content()
			let currentHTMLSize = html.length

			console.log("last: ", lastHTMLSize, " <> curr: ", currentHTMLSize)

			if (lastHTMLSize !== 0 && currentHTMLSize === lastHTMLSize) {
				countStableSizeIterations++
			} else {
				countStableSizeIterations = 0 //reset the counter
			}

			if (countStableSizeIterations >= minStableSizeIterations) {
				console.log("Page rendered fully...")
				break
			}

			lastHTMLSize = currentHTMLSize
			await delay(checkDurationMsecs)
		}
	}

	async click(coordinate: string): Promise<BrowserActionResult> {
		const [x, y] = coordinate.split(",").map(Number)
		return this.doAction(async (page) => {
			// Set up network request monitoring
			let hasNetworkActivity = false
			const requestListener = () => {
				hasNetworkActivity = true
			}
			page.on("request", requestListener)

			// Perform the click
			await page.mouse.click(x, y)
			this.currentMousePosition = coordinate

			// Small delay to check if click triggered any network activity
			await delay(100)

			if (hasNetworkActivity) {
				// If we detected network activity, wait for navigation/loading
				await page
					.waitForNavigation({
						waitUntil: ["domcontentloaded", "networkidle2"],
						timeout: 7000,
					})
					.catch(() => {})
				await this.waitTillHTMLStable(page)
			}

			// Clean up listener
			page.off("request", requestListener)
		})
	}

	async type(text: string): Promise<BrowserActionResult> {
		return this.doAction(async (page) => {
			await page.keyboard.type(text)
		})
	}

	async scrollDown(): Promise<BrowserActionResult> {
		return this.doAction(async (page) => {
			await page.evaluate(() => {
				window.scrollBy({
					top: 600,
					behavior: "auto",
				})
			})
			await delay(300)
		})
	}

	async scrollUp(): Promise<BrowserActionResult> {
		return this.doAction(async (page) => {
			await page.evaluate(() => {
				window.scrollBy({
					top: -600,
					behavior: "auto",
				})
			})
			await delay(300)
		})
	}

	get isInInteractiveMode(): boolean {
		return this.isInteractive
	}
}
