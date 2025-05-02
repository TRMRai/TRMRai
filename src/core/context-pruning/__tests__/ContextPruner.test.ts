// npx jest src/core/context-pruning/__tests__/ContextPruner.test.ts

import type { MessageParam } from "@anthropic-ai/sdk/resources"

import { TokenType, ContextPruner } from "../ContextPruner"

describe("ContextPruner", () => {
	describe("getToken", () => {
		it("should generate a token with the correct format", () => {
			const pruner = new ContextPruner()
			const content = "This is some file content"
			const type: TokenType = "file_read"
			const token = pruner.getToken({ type, content })
			expect(token).toMatch(/^\{file_read:[a-f0-9]{64}\}$/)
		})

		it("should store the content in the tokens map", () => {
			const pruner = new ContextPruner()
			const content = "This is some file content"
			const type: TokenType = "file_read"
			const token = pruner.getToken({ type, content })
			const hash = token.split(":")[1].replace("}", "")
			expect(pruner.tokens.get(hash)).toBe(content)
		})

		it("should generate different tokens for different content", () => {
			const pruner = new ContextPruner()
			const content1 = "Content 1"
			const content2 = "Content 2"
			const type: TokenType = "file_read"
			const token1 = pruner.getToken({ type, content: content1 })
			const token2 = pruner.getToken({ type, content: content2 })
			expect(token1).not.toBe(token2)
		})
	})

	describe("prune", () => {
		it("should handle messages with string content", () => {
			const pruner = new ContextPruner()

			const messages: MessageParam[] = [
				{ role: "user", content: "Hello" },
				{ role: "assistant", content: "Hi there" },
			]

			const result = pruner.prune(messages)
			expect(result).toEqual(messages)
		})

		it("should replace tokens with their content in the most recent occurrence", () => {
			const pruner = new ContextPruner()
			const fileContent = "const x = 1;\nconst y = 2;"
			const token = pruner.getToken({ type: "file_read", content: fileContent })

			const messages: MessageParam[] = [
				{
					role: "user",
					content: [{ type: "text", text: `Here's a file: ${token}` }],
				},
				{
					role: "assistant",
					content: "I'll help you with that file",
				},
				{
					role: "user",
					content: [{ type: "text", text: `Can you explain this file again? ${token}` }],
				},
			]

			const result = pruner.prune(messages)

			expect(result[0].content).toEqual([{ type: "text", text: `Here's a file: STALE` }])
			expect(result[1].content).toEqual(`I'll help you with that file`)
			expect(result[2].content).toEqual([
				{ type: "text", text: `Can you explain this file again? ${fileContent}` },
			])
		})

		it("should handle multiple tokens in the same message", () => {
			const pruner = new ContextPruner()
			const fileContent1 = "File 1 content"
			const fileContent2 = "File 2 content"
			const token1 = pruner.getToken({ type: "file_read", content: fileContent1 })
			const token2 = pruner.getToken({ type: "file_read", content: fileContent2 })

			const messages: MessageParam[] = [
				{
					role: "user",
					content: [{ type: "text", text: `Here are two files: ${token1} and ${token2}` }],
				},
			]

			const result = pruner.prune(messages)

			expect(result[0].content).toEqual([
				{
					type: "text",
					text: `Here are two files: ${fileContent1} and ${fileContent2}`,
				},
			])
		})

		it("should handle non-text content blocks", () => {
			const pruner = new ContextPruner()

			const messages: MessageParam[] = [
				{
					role: "user",
					content: [{ type: "image", source: { type: "base64", media_type: "image/jpeg", data: "abc123" } }],
				},
			]

			const result = pruner.prune(messages)
			expect(result).toEqual(messages)
		})

		it("should handle empty messages array", () => {
			const pruner = new ContextPruner()
			const messages: MessageParam[] = []
			const result = pruner.prune(messages)
			expect(result).toEqual([])
		})

		it("should handle messages with no tokens", () => {
			const pruner = new ContextPruner()

			const messages: MessageParam[] = [
				{
					role: "user",
					content: [{ type: "text", text: "This message has no tokens" }],
				},
			]

			const result = pruner.prune(messages)
			expect(result).toEqual(messages)
		})

		it("should handle multiple occurrences of the same token across different messages", () => {
			const pruner = new ContextPruner()
			const fileContent = "Important file content"
			const token = pruner.getToken({ type: "file_read", content: fileContent })

			const messages: MessageParam[] = [
				{
					role: "user",
					content: [{ type: "text", text: `First mention: ${token}` }],
				},
				{
					role: "assistant",
					content: "I'll help with that",
				},
				{
					role: "user",
					content: [{ type: "text", text: `Second mention: ${token}` }],
				},
				{
					role: "assistant",
					content: "More help",
				},
				{
					role: "user",
					content: [{ type: "text", text: `Third mention: ${token}` }],
				},
			]

			const result = pruner.prune(messages)
			expect(result[0].content).toEqual([{ type: "text", text: `First mention: STALE` }])
			expect(result[2].content).toEqual([{ type: "text", text: `Second mention: STALE` }])
			expect(result[4].content).toEqual([{ type: "text", text: `Third mention: ${fileContent}` }])
		})

		it("should correctly handle the regex pattern for file_read tokens", () => {
			const pruner = new ContextPruner()
			const fileContent = "function test() { return true; }"
			const hash = pruner.getToken({ type: "file_read", content: fileContent }).split(":")[1].replace("}", "")

			const messages: MessageParam[] = [
				{
					role: "user",
					content: [{ type: "text", text: `Check this: {file_read:${hash}}` }],
				},
			]

			const result = pruner.prune(messages)
			expect(result[0].content).toEqual([{ type: "text", text: `Check this: ${fileContent}` }])
		})

		it("should ignore tokens that don't exist in the map", () => {
			const pruner = new ContextPruner()

			const messages: MessageParam[] = [
				{
					role: "user",
					content: [{ type: "text", text: "Check this: {file_read:nonexistenttoken}" }],
				},
			]

			const result = pruner.prune(messages)
			expect(result).toEqual(messages)
		})
	})
})
