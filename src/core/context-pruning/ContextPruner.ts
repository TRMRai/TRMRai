// npx jest src/core/context-pruning/__tests__/ContextPruner.test.ts

import { createHash } from "crypto"

import type { MessageParam, ContentBlockParam } from "@anthropic-ai/sdk/resources"

export type TokenType = "file_read"

const fileReadRegex = /{file_read:([^}]+)}/g

export class ContextPruner {
	public readonly tokens: Map<string, string> = new Map()

	public getToken({ type, content }: { type: TokenType; content: string }) {
		const token = createHash("sha256").update(content).digest("hex")
		this.tokens.set(token, content)
		return `{${type}:${token}}`
	}

	public prune(messages: MessageParam[]) {
		const pruned: MessageParam[] = []

		const replacements = new Set<string>()

		for (let i = messages.length - 1; i >= 0; i--) {
			const { role, content } = messages[i]

			if (typeof content === "string") {
				pruned.unshift({ role, content })
				continue
			}

			const newContent: ContentBlockParam[] = []

			for (let j = 0; j < content.length; j++) {
				const block = content[j]

				if (block.type === "text") {
					let text = block.text
					let match: RegExpExecArray | null

					while ((match = fileReadRegex.exec(text)) !== null) {
						const token = match[0].substring(11, match[0].length - 1)

						if (this.tokens.get(token)) {
							const newText =
								text.substring(0, match.index) +
								(replacements.has(token) ? "STALE" : this.tokens.get(token)) +
								text.substring(match.index + match[0].length)

							text = newText
							fileReadRegex.lastIndex = 0
						}

						replacements.add(token)
					}

					newContent.push({ type: "text", text })
				} else {
					newContent.push(block)
				}
			}

			pruned.unshift({ role, content: newContent })
		}

		return pruned
	}
}
