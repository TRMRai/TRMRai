import getFolderSize from "get-folder-size"

import { ClineMessage } from "../../shared/ExtensionMessage"
import { combineApiRequests } from "../../shared/combineApiRequests"
import { combineCommandSequences } from "../../shared/combineCommandSequences"
import { getApiMetrics } from "../../shared/getApiMetrics"
import { findLastIndex } from "../../shared/array"
import { HistoryItem } from "../../shared/HistoryItem"
import { getTaskDirectoryPath } from "../../shared/storagePathManager"

export type TaskMetadataOptions = {
	messages: ClineMessage[]
	taskId: string
	taskNumber: number
	globalStoragePath: string
	workspace: string
}

export async function taskMetadata({
	messages,
	taskId,
	taskNumber,
	globalStoragePath,
	workspace,
}: TaskMetadataOptions) {
	const taskDir = await getTaskDirectoryPath(globalStoragePath, taskId)
	const taskMessage = messages[0] // First message is always the task say.

	const lastRelevantMessage =
		messages[findLastIndex(messages, (m) => !(m.ask === "resume_task" || m.ask === "resume_completed_task"))]

	let taskDirSize = 0

	try {
		taskDirSize = await getFolderSize.loose(taskDir)
	} catch (error) {
		console.error(
			`[saveTaskMessages] getFolderSize.loose failed -> ${error instanceof Error ? error.message : String(error)}`,
		)
	}

	const tokenUsage = getApiMetrics(combineApiRequests(combineCommandSequences(messages.slice(1))))

	const historyItem: HistoryItem = {
		id: taskId,
		number: taskNumber,
		ts: lastRelevantMessage.ts,
		task: taskMessage.text ?? "",
		tokensIn: tokenUsage.totalTokensIn,
		tokensOut: tokenUsage.totalTokensOut,
		cacheWrites: tokenUsage.totalCacheWrites,
		cacheReads: tokenUsage.totalCacheReads,
		totalCost: tokenUsage.totalCost,
		size: taskDirSize,
		workspace,
	}

	return { historyItem, tokenUsage }
}
