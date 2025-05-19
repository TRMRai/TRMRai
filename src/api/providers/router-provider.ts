import OpenAI from "openai"

import { ApiHandlerOptions, RouterName, ModelRecord, ModelInfo, GetModelsOptions } from "../../shared/api"
import { BaseProvider } from "./base-provider"
import { getModels } from "./fetchers/modelCache"

type RouterProviderOptions = {
	name: RouterName
	baseURL: string
	apiKey?: string
	modelId?: string
	defaultModelId: string
	defaultModelInfo: ModelInfo
	options: ApiHandlerOptions
}

export abstract class RouterProvider extends BaseProvider {
	protected readonly options: ApiHandlerOptions
	protected readonly name: RouterName
	protected readonly baseURL: string
	protected readonly apiKey: string
	protected models: ModelRecord = {}
	protected readonly modelId?: string
	protected readonly defaultModelId: string
	protected readonly defaultModelInfo: ModelInfo
	protected readonly client: OpenAI

	constructor({
		options,
		name,
		baseURL,
		apiKey = "not-provided",
		modelId,
		defaultModelId,
		defaultModelInfo,
	}: RouterProviderOptions) {
		super()

		this.options = options
		this.name = name
		this.modelId = modelId
		this.defaultModelId = defaultModelId
		this.defaultModelInfo = defaultModelInfo
		this.baseURL = baseURL
		this.apiKey = apiKey

		this.client = new OpenAI({
			baseURL,
			apiKey,
		})
	}

	public async fetchModel() {
		// Create the appropriate options based on router type
		let options: GetModelsOptions

		switch (this.name) {
			case "openrouter":
				options = { provider: "openrouter" }
				break
			case "glama":
				options = { provider: "glama" }
				break
			case "requesty":
				options = { provider: "requesty", apiKey: this.apiKey }
				break
			case "unbound":
				options = { provider: "unbound", apiKey: this.apiKey }
				break
			case "litellm":
				options = { provider: "litellm", apiKey: this.apiKey, baseUrl: this.baseURL }
				break
			default:
				const exhaustiveCheck: never = this.name
				throw new Error(`Unknown provider: ${exhaustiveCheck}`)
		}

		this.models = await getModels(options)
		return this.getModel()
	}

	override getModel(): { id: string; info: ModelInfo } {
		// Try user-specified model first
		if (this.modelId && this.models[this.modelId]) {
			return { id: this.modelId, info: this.models[this.modelId] }
		}

		// Try default model with fetched info
		if (this.models[this.defaultModelId]) {
			return { id: this.defaultModelId, info: this.models[this.defaultModelId] }
		}

		// Fallback to default model with static info
		return { id: this.defaultModelId, info: this.defaultModelInfo }
	}

	protected supportsTemperature(modelId: string): boolean {
		return !modelId.startsWith("openai/o3-mini")
	}
}
