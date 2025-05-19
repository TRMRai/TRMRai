import { useCallback, useState } from "react"
import { VSCodeTextField } from "@vscode/webview-ui-toolkit/react"
import { useEvent } from "react-use"

import { ProviderSettings, RouterModels, litellmDefaultModelId } from "@roo/shared/api"
import { vscode } from "@src/utils/vscode"
import { Button } from "@src/components/ui"
import { useAppTranslation } from "@src/i18n/TranslationContext"

import { inputEventTransform } from "../transforms"
import { ModelPicker } from "../ModelPicker"
import { WebviewMessage } from "@roo/shared/WebviewMessage"
import { ExtensionMessage } from "@roo/shared/ExtensionMessage"

type LiteLLMProps = {
	apiConfiguration: ProviderSettings
	setApiConfigurationField: (field: keyof ProviderSettings, value: ProviderSettings[keyof ProviderSettings]) => void
	// routerModels prop might need to be updated by parent if we want to show new models immediately.
	// For now, this component will manage its own refresh feedback.
	routerModels?: RouterModels
}

export const LiteLLM = ({ apiConfiguration, setApiConfigurationField, routerModels }: LiteLLMProps) => {
	const { t } = useAppTranslation()
	const [refreshStatus, setRefreshStatus] = useState<"idle" | "loading" | "success" | "error">("idle")
	const [refreshError, setRefreshError] = useState<string | undefined>()

	const handleInputChange = useCallback(
		<K extends keyof ProviderSettings, E>(
			field: K,
			transform: (event: E) => ProviderSettings[K] = inputEventTransform,
		) =>
			(event: E | Event) => {
				setApiConfigurationField(field, transform(event as E))
			},
		[setApiConfigurationField],
	)

	const handleRefreshModels = () => {
		setRefreshStatus("loading")
		setRefreshError(undefined)

		// Due to the button's disabled state logic, litellmApiKey and litellmBaseUrl are guaranteed to be non-empty strings here.
		// We use non-null assertions (!) to reflect this guarantee for type safety.
		const key = apiConfiguration.litellmApiKey!
		const url = apiConfiguration.litellmBaseUrl!

		const message: WebviewMessage = {
			type: "requestProviderModels",
			payload: {
				provider: "litellm",
				apiKey: key,
				baseUrl: url,
			},
		}
		vscode.postMessage(message)
	}

	// Listen for model refresh responses using useEvent
	useEvent("message", (event: MessageEvent<ExtensionMessage>) => {
		const message = event.data
		if (message.type === "providerModelsResponse") {
			if (message.payload && message.payload.provider === "litellm") {
				if (message.payload.error) {
					console.log("LiteLLM.tsx: Error found in payload:", message.payload.error)
					setRefreshStatus("error")
					setRefreshError(message.payload.error)
				} else {
					setRefreshStatus("success")
					// Parent (ApiOptions.tsx) will handle updating the routerModels prop for ModelPicker
				}
			} else {
				console.log(
					"LiteLLM.tsx: Received providerModelsResponse but not for litellm or payload missing. Provider:",
					message.payload?.provider,
				)
			}
		}
	})
	console.log("apiconfig1212", apiConfiguration)

	return (
		<>
			<VSCodeTextField
				value={apiConfiguration?.litellmBaseUrl || ""}
				onInput={handleInputChange("litellmBaseUrl")}
				placeholder="http://localhost:4000"
				className="w-full">
				<label className="block font-medium mb-1">{t("settings:providers.litellmBaseUrl")}</label>
			</VSCodeTextField>

			<VSCodeTextField
				value={apiConfiguration?.litellmApiKey || ""}
				type="password"
				onInput={handleInputChange("litellmApiKey")}
				placeholder={t("settings:placeholders.apiKey")}
				className="w-full">
				<label className="block font-medium mb-1">{t("settings:providers.litellmApiKey")}</label>
			</VSCodeTextField>

			<div className="text-sm text-vscode-descriptionForeground -mt-2">
				{t("settings:providers.apiKeyStorageNotice")}
			</div>

			<Button
				variant="outline"
				onClick={handleRefreshModels}
				disabled={
					refreshStatus === "loading" || !apiConfiguration.litellmApiKey || !apiConfiguration.litellmBaseUrl
				}
				className="w-full">
				<div className="flex items-center gap-2">
					{refreshStatus === "loading" ? (
						<span className="codicon codicon-loading codicon-modifier-spin" />
					) : (
						<span className="codicon codicon-refresh" />
					)}
					{t("settings:providers.refreshModels.label")}
				</div>
			</Button>
			{refreshStatus === "loading" && (
				<div className="text-sm text-vscode-descriptionForeground">
					{t("settings:providers.refreshModels.loading")}
				</div>
			)}
			{refreshStatus === "success" && (
				<div className="text-sm text-vscode-foreground">{t("settings:providers.refreshModels.success")}</div>
			)}
			{refreshStatus === "error" && (
				<div className="text-sm text-vscode-errorForeground">
					{refreshError || t("settings:providers.refreshModels.error")}
				</div>
			)}

			<ModelPicker
				apiConfiguration={apiConfiguration}
				defaultModelId={litellmDefaultModelId}
				models={routerModels?.litellm ?? {}}
				modelIdKey="litellmModelId"
				serviceName="LiteLLM"
				serviceUrl="https://docs.litellm.ai/"
				setApiConfigurationField={setApiConfigurationField}
			/>
		</>
	)
}
