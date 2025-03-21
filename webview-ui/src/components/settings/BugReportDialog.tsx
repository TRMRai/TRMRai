import { useEffect, useState } from "react"
import { Bug, ClipboardCopy, ExternalLink } from "lucide-react"
import { VSCodeButton } from "@vscode/webview-ui-toolkit/react"
import { useAppTranslation } from "@/i18n/TranslationContext"
import { vscode } from "@/utils/vscode"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui"

interface BugReportDialogProps {
	onClose: () => void
}

export function BugReportDialog({ onClose }: BugReportDialogProps) {
	const { t } = useAppTranslation()
	const [environmentInfo, setEnvironmentInfo] = useState<Record<string, any> | null>(null)
	const [copied, setCopied] = useState(false)

	useEffect(() => {
		// Request environment info from extension
		vscode.postMessage({ type: "getBugReportInfo" })

		const handleMessage = (event: MessageEvent) => {
			const message = event.data
			if (message.type === "bugReportInfo" && message.info) {
				setEnvironmentInfo(message.info)
			}
		}

		window.addEventListener("message", handleMessage)
		return () => {
			window.removeEventListener("message", handleMessage)
		}
	}, [])

	const formattedInfo = environmentInfo
		? Object.entries(environmentInfo)
				.map(([key, value]) => `- **${key}**: ${value}`)
				.join("\n")
		: ""

	const handleCopy = () => {
		if (formattedInfo) {
			navigator.clipboard.writeText(formattedInfo)
			setCopied(true)
			setTimeout(() => setCopied(false), 2000)
		}
	}

	const handleCreateIssue = () => {
		if (!environmentInfo) return

		// Build URL parameters to pre-fill GitHub issue template fields
		const params = new URLSearchParams()

		// Add parameters based on the template's field IDs
		// version - The app version
		if (environmentInfo.appVersion) {
			params.append("version", environmentInfo.appVersion)
		}

		// provider - Try to extract from API provider if available
		if (environmentInfo.apiProvider) {
			params.append("provider", environmentInfo.apiProvider)
		}

		// model - Try to extract from model ID if available
		if (environmentInfo.modelId) {
			params.append("model", environmentInfo.modelId)
		}

		// what-happened - Pre-fill with a template that includes environment info
		const environmentSummary = Object.entries(environmentInfo)
			.map(([key, value]) => `${key}: ${value}`)
			.join("\n")

		params.append(
			"what-happened",
			`I encountered an issue with Roo Code.\n\nEnvironment Information:\n${environmentSummary}`,
		)

		// additional-context - Add any system-specific details
		if (environmentInfo.platform) {
			params.append(
				"additional-context",
				`Platform: ${environmentInfo.platform}\nVSCode: ${environmentInfo.vscodeVersion || "unknown"}`,
			)
		}

		const issueUrl = `https://github.com/RooVetGit/Roo-Code/issues/new?template=bug_report.yml&${params.toString()}`

		// Open URL
		vscode.postMessage({ type: "openExternal", url: issueUrl })
		onClose()
	}

	return (
		<Dialog open onOpenChange={onClose}>
			<DialogContent className="sm:max-w-[600px]">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<Bug className="w-5 h-5" />
						{t("settings:bugreport.title")}
					</DialogTitle>
				</DialogHeader>

				<div className="py-4">
					<p className="mb-4">{t("settings:bugreport.description")}</p>

					<div className="bg-vscode-editor-background rounded-md p-3 text-sm font-mono overflow-auto max-h-[300px] whitespace-pre-wrap">
						{environmentInfo ? (
							<pre>{formattedInfo}</pre>
						) : (
							<div className="animate-pulse flex space-x-4">
								<div className="flex-1 space-y-3 py-1">
									<div className="h-2 bg-vscode-editor-inactiveSelectionBackground rounded"></div>
									<div className="h-2 bg-vscode-editor-inactiveSelectionBackground rounded"></div>
									<div className="h-2 bg-vscode-editor-inactiveSelectionBackground rounded"></div>
								</div>
							</div>
						)}
					</div>
				</div>

				<DialogFooter className="flex flex-row justify-between items-center gap-2">
					<VSCodeButton
						appearance="secondary"
						onClick={handleCopy}
						disabled={!environmentInfo}
						className="flex items-center gap-1">
						<ClipboardCopy className="w-4 h-4 mr-1" />
						{copied ? t("settings:bugreport.copied") : t("settings:bugreport.copy")}
					</VSCodeButton>

					<div className="flex gap-2">
						<VSCodeButton appearance="secondary" onClick={onClose}>
							{t("settings:common.cancel")}
						</VSCodeButton>
						<VSCodeButton
							appearance="primary"
							onClick={handleCreateIssue}
							disabled={!environmentInfo}
							className="flex items-center gap-1">
							<ExternalLink className="w-4 h-4 mr-1" />
							{t("settings:bugreport.createIssue")}
						</VSCodeButton>
					</div>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
