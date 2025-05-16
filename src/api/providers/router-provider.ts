import OpenAI from "openai"

import { ApiHandlerOptions, RouterName, ModelRecord, ModelInfo } from "../../shared/api"
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
		this.models = await getModels(this.name, this.apiKey, this.baseURL)
		return this.getModel()
	}

	override getModel(): { id: string; info: ModelInfo } {
		const userSpecifiedModelId = this.modelId

		// Priority 1: Use user-specified model if it's valid and found in fetched models
		if (userSpecifiedModelId && this.models[userSpecifiedModelId]) {
			return { id: userSpecifiedModelId, info: this.models[userSpecifiedModelId] }
		}

		// Priority 2: If user-specified model is not found (or not specified at all),
		// try the provider's default model ID with its fetched info (if available).
		if (this.models[this.defaultModelId]) {
			return { id: this.defaultModelId, info: this.models[this.defaultModelId] }
		}

		// Priority 3: Ultimate fallback: provider's default model ID with its (static) defaultModelInfo.
		// This is reached if userSpecifiedModelId was invalid/not found AND this.defaultModelId was also not in this.models.
		return { id: this.defaultModelId, info: this.defaultModelInfo }
	}

	protected supportsTemperature(modelId: string): boolean {
		return !modelId.startsWith("openai/o3-mini")
	}
}
