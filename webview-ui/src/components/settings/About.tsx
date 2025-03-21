import { HTMLAttributes, useState } from "react"
import { useAppTranslation } from "@/i18n/TranslationContext"
import { Trans } from "react-i18next"
import { Bug, Info } from "lucide-react"

import { VSCodeButton, VSCodeCheckbox, VSCodeLink } from "@vscode/webview-ui-toolkit/react"

import { TelemetrySetting } from "../../../../src/shared/TelemetrySetting"

import { vscode } from "@/utils/vscode"
import { cn } from "@/lib/utils"

import { SectionHeader } from "./SectionHeader"
import { BugReportDialog } from "./BugReportDialog"
import { Section } from "./Section"

type AboutProps = HTMLAttributes<HTMLDivElement> & {
	version: string
	telemetrySetting: TelemetrySetting
	setTelemetrySetting: (setting: TelemetrySetting) => void
}

export const About = ({ version, telemetrySetting, setTelemetrySetting, className, ...props }: AboutProps) => {
	const { t } = useAppTranslation()
	const [showBugReportDialog, setShowBugReportDialog] = useState(false)

	return (
		<div className={cn("flex flex-col gap-2", className)} {...props}>
			<SectionHeader description={`Version: ${version}`}>
				<div className="flex items-center gap-2">
					<Info className="w-4" />
					<div>{t("settings:sections.about")}</div>
				</div>
			</SectionHeader>

			<Section>
				<div>
					<VSCodeCheckbox
						style={{ marginBottom: "5px" }}
						checked={telemetrySetting === "enabled"}
						onChange={(e: any) => {
							const checked = e.target.checked === true
							setTelemetrySetting(checked ? "enabled" : "disabled")
						}}>
						{t("settings:footer.telemetry.label")}
					</VSCodeCheckbox>
					<p
						style={{
							fontSize: "12px",
							marginTop: "5px",
							color: "var(--vscode-descriptionForeground)",
						}}>
						{t("settings:footer.telemetry.description")}
					</p>
				</div>

				<div>
					<Trans
						i18nKey="settings:footer.feedback"
						components={{
							githubLink: <VSCodeLink href="https://github.com/RooVetGit/Roo-Code" />,
							redditLink: <VSCodeLink href="https://reddit.com/r/RooCode" />,
							discordLink: <VSCodeLink href="https://discord.gg/roocode" />,
						}}
					/>
				</div>

				<div className="flex justify-between items-center gap-3">
					<p>{t("settings:footer.reset.description")}</p>
					<VSCodeButton
						onClick={() => vscode.postMessage({ type: "resetState" })}
						appearance="secondary"
						className="shrink-0">
						<span className="codicon codicon-warning text-vscode-errorForeground mr-1" />
						{t("settings:footer.reset.button")}
					</VSCodeButton>
				</div>

				<div className="flex justify-between items-center gap-3">
					<p>{t("settings:footer.bugreport.description")}</p>
					<VSCodeButton
						onClick={() => setShowBugReportDialog(true)}
						appearance="secondary"
						className="shrink-0">
						<Bug className="w-4 h-4 text-vscode-foreground mr-1" />
						{t("settings:footer.bugreport.button")}
					</VSCodeButton>
				</div>
			</Section>

			{showBugReportDialog && <BugReportDialog onClose={() => setShowBugReportDialog(false)} />}
		</div>
	)
}
