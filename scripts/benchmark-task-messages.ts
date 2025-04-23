#!/usr/bin/env node

// npx tsx scripts/benchmark-task-messages.ts

import * as fs from "fs/promises"
import * as path from "path"
import { performance } from "perf_hooks"

// Import only the type
import type { ClineMessage } from "../src/shared/ExtensionMessage"

// Constants
const BENCHMARK_DIR = path.join(process.cwd(), "benchmark-test-storage")
const TASK_ID = "benchmark-test-task"
const TASK_DIR = path.join(BENCHMARK_DIR, TASK_ID)

// File paths for both implementations
const JSON_FILE_PATH = path.join(TASK_DIR, "messages.json")
const JSONL_FILE_PATH = path.join(TASK_DIR, "messages.jsonl")

// Function to create a sample message with much longer text
const createSampleMessage = (): ClineMessage => {
	// Generate a long text message to better simulate real-world data
	const longText = `This is a much longer test message that simulates a real-world conversation with an AI assistant.
It contains multiple paragraphs and a significant amount of text to better demonstrate the performance differences
between JSON and JSONL formats when dealing with larger message sizes.

When working with large datasets or conversation histories, the efficiency of storage and retrieval becomes increasingly
important. This benchmark helps quantify those differences by measuring the time it takes to append messages using
both approaches.

The JSON approach requires reading the entire file, parsing it into memory, appending the new message, and then
writing the entire content back to disk. This becomes increasingly expensive as the file grows larger.

The JSONL approach, on the other hand, simply appends the new message to the end of the file without needing to
read or parse existing content. This should theoretically provide better performance, especially as the number
of messages increases.

This benchmark will help us determine at what point the performance difference becomes significant and whether
the JSONL approach provides meaningful benefits for our specific use case in the VS Code extension.`

	return {
		ts: Date.now(),
		type: "say",
		say: "text",
		text: longText,
	}
}

// Function to create a directory if it doesn't exist
async function ensureDirectoryExists(dirPath: string): Promise<void> {
	try {
		await fs.mkdir(dirPath, { recursive: true })
	} catch (error) {
		console.error(`Error creating directory ${dirPath}:`, error)
		throw error
	}
}

// Function to create test files with a specified number of messages
async function createTestFiles(messageCount: number): Promise<void> {
	console.log(`Creating test files with ${messageCount} messages...`)

	// Create JSON test file
	const jsonMessages: ClineMessage[] = []
	for (let i = 0; i < messageCount; i++) {
		jsonMessages.push(createSampleMessage())
	}
	await fs.writeFile(JSON_FILE_PATH, JSON.stringify(jsonMessages))

	// Create JSONL test file
	const jsonlContent = jsonMessages.map((msg) => JSON.stringify(msg)).join("\n")
	await fs.writeFile(JSONL_FILE_PATH, jsonlContent)

	console.log("Test files created successfully.")
}

// Simplified implementation of saveTaskMessages
async function saveTaskMessages({
	messages,
	taskId,
	globalStoragePath,
}: {
	messages: ClineMessage[]
	taskId: string
	globalStoragePath: string
}): Promise<void> {
	// For the benchmark, we write directly to the specified file
	const filePath = path.join(globalStoragePath, "messages.json")
	await fs.writeFile(filePath, JSON.stringify(messages))
}

// Simplified implementation of appendTaskMessage
async function appendTaskMessage({
	message,
	taskId,
	globalStoragePath,
}: {
	message: ClineMessage
	taskId: string
	globalStoragePath: string
}): Promise<void> {
	// For the benchmark, we append directly to the specified file
	const filePath = path.join(globalStoragePath, "messages.jsonl")
	await fs.appendFile(filePath, JSON.stringify(message) + "\n")
}

// Function to benchmark JSON implementation
async function benchmarkJSON(iterations: number): Promise<number[]> {
	const durations: number[] = []
	const messages: ClineMessage[] = []

	for (let i = 0; i < iterations; i++) {
		const newMessage = createSampleMessage()

		// Benchmark saveTaskMessages
		const start = performance.now()
		messages.push(newMessage)
		await saveTaskMessages({ messages, taskId: TASK_ID, globalStoragePath: TASK_DIR })
		const end = performance.now()

		durations.push(end - start)
	}

	return durations
}

// Function to benchmark JSONL implementation
async function benchmarkJSONL(iterations: number): Promise<number[]> {
	const durations: number[] = []

	for (let i = 0; i < iterations; i++) {
		const newMessage = createSampleMessage()

		// Benchmark appendTaskMessage
		const start = performance.now()
		await appendTaskMessage({ message: newMessage, taskId: TASK_ID, globalStoragePath: TASK_DIR })
		const end = performance.now()

		durations.push(end - start)
	}

	return durations
}

// Function to calculate statistics
function calculateStats(durations: number[]): { min: number; max: number; avg: number; median: number } {
	const sorted = [...durations].sort((a, b) => a - b)
	return {
		min: sorted[0],
		max: sorted[sorted.length - 1],
		avg: durations.reduce((sum, val) => sum + val, 0) / durations.length,
		median: sorted[Math.floor(sorted.length / 2)],
	}
}

// Main benchmark function
async function runBenchmark(): Promise<void> {
	try {
		// Ensure benchmark directory exists
		await ensureDirectoryExists(TASK_DIR)

		// Define message counts to test
		const messageCounts = [10, 100, 1000, 10000, 50000]
		// Number of iterations for each test
		const iterations = 10

		// Add a sequential append test
		async function runSequentialTest() {
			console.log("\nRunning Sequential Append Test (100 messages in sequence)...")
			console.log("This test simulates a more realistic scenario where messages are added over time")

			// Create empty files
			await fs.writeFile(JSON_FILE_PATH, JSON.stringify([]))
			await fs.writeFile(JSONL_FILE_PATH, "")

			// Test JSON sequential append
			const jsonStart = performance.now()
			let jsonMessages: ClineMessage[] = []

			for (let i = 0; i < 100; i++) {
				// For JSON, we need to read the entire file each time
				jsonMessages = JSON.parse(await fs.readFile(JSON_FILE_PATH, "utf8"))
				jsonMessages.push(createSampleMessage())
				await fs.writeFile(JSON_FILE_PATH, JSON.stringify(jsonMessages))
			}

			const jsonEnd = performance.now()
			const jsonDuration = jsonEnd - jsonStart

			// Test JSONL sequential append
			const jsonlStart = performance.now()

			for (let i = 0; i < 100; i++) {
				// For JSONL, we just append
				await fs.appendFile(JSONL_FILE_PATH, JSON.stringify(createSampleMessage()) + "\n")
			}

			const jsonlEnd = performance.now()
			const jsonlDuration = jsonlEnd - jsonlStart

			// Calculate speedup
			const sequentialSpeedup = jsonDuration / jsonlDuration

			console.log(`JSON sequential append time: ${jsonDuration.toFixed(2)} ms`)
			console.log(`JSONL sequential append time: ${jsonlDuration.toFixed(2)} ms`)
			console.log(`Sequential append speedup: ${sequentialSpeedup.toFixed(2)}x`)
		}

		console.log("Starting benchmark...")
		console.log("=============================================")
		console.log("| Message Count | Implementation | Min (ms) | Max (ms) | Avg (ms) | Median (ms) |")
		console.log("|---------------|---------------|----------|----------|----------|-------------|")

		for (const count of messageCounts) {
			// Create test files with the specified number of messages
			await createTestFiles(count)

			// Benchmark JSON implementation
			const jsonDurations = await benchmarkJSON(iterations)
			const jsonStats = calculateStats(jsonDurations)

			// Reset the files to ensure consistent state
			await createTestFiles(count)

			// Benchmark JSONL implementation
			const jsonlDurations = await benchmarkJSONL(iterations)
			const jsonlStats = calculateStats(jsonlDurations)

			// Print results
			console.log(
				`| ${count.toString().padEnd(13)} | JSON          | ${jsonStats.min.toFixed(2).padEnd(8)} | ${jsonStats.max.toFixed(2).padEnd(8)} | ${jsonStats.avg.toFixed(2).padEnd(8)} | ${jsonStats.median.toFixed(2).padEnd(11)} |`,
			)
			console.log(
				`| ${" ".padEnd(13)} | JSONL         | ${jsonlStats.min.toFixed(2).padEnd(8)} | ${jsonlStats.max.toFixed(2).padEnd(8)} | ${jsonlStats.avg.toFixed(2).padEnd(8)} | ${jsonlStats.median.toFixed(2).padEnd(11)} |`,
			)

			// Calculate and print speedup
			const avgSpeedup = jsonStats.avg / jsonlStats.avg
			console.log(`| ${" ".padEnd(13)} | Speedup       | ${avgSpeedup.toFixed(2)}x ${" ".repeat(37)} |`)
			console.log("|---------------|---------------|----------|----------|----------|-------------|")
		}

		console.log("Benchmark completed!")

		// Run the sequential test
		await runSequentialTest()
	} catch (error) {
		console.error("Error running benchmark:", error)
	}
}

// Run the benchmark
runBenchmark()
