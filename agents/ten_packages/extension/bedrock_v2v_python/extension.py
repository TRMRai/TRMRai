#
# This file is part of TEN Framework, an open source project.
# Licensed under the Apache License, Version 2.0.
# See the LICENSE file for more information.
#
from typing import List
from ten import (
    AudioFrame,
    VideoFrame,
    AsyncTenEnv,
    Cmd,
    StatusCode,
    CmdResult,
    Data,
)
from ten.audio_frame import AudioFrameDataFmt
from ten_ai_base.config import BaseConfig
from ten_ai_base.llm import AsyncLLMBaseExtension
from ten_ai_base.types import (
    LLMToolMetadata,
    LLMToolResult,
    LLMChatCompletionContentPartParam,
)
from ten_ai_base.const import CMD_PROPERTY_RESULT, CMD_TOOL_CALL
import traceback
import asyncio
import base64
import json
import uuid
from aws_sdk_bedrock_runtime.client import (
    BedrockRuntimeClient,
    InvokeModelWithBidirectionalStreamOperationInput,
)
from aws_sdk_bedrock_runtime.models import (
    InvokeModelWithBidirectionalStreamInputChunk,
    BidirectionalInputPayloadPart,
)
from aws_sdk_bedrock_runtime.config import (
    Config,
    HTTPAuthSchemeResolver,
    SigV4AuthScheme,
)
from smithy_aws_core.credentials_resolvers.environment import (
    EnvironmentCredentialsResolver,
)
from dotenv import load_dotenv
from dataclasses import dataclass

load_dotenv()


@dataclass
class BedrockV2VConfig(BaseConfig):
    model: str = "amazon.nova-sonic-v1:0"
    region: str = "us-east-1"
    voice_id: str = "matthew"
    sample_rate: int = 16000
    channels: int = 1
    sample_size_bits: int = 16
    max_tokens: int = 1024
    topP: float = 0.5
    topK: int = 20
    temperature: float = 0.7
    prompt: str = (
        "You are a friendly assistant. The user and you will engage in a spoken dialog "
        "exchanging the transcripts of a natural real-time conversation. Keep your responses short, "
        "generally two or three sentences for chatty scenarios."
    )
    access_key_id: str = ""
    secret_access_key: str = ""
    stream_id: int = 0

    def build_ctx(self) -> dict:
        return {
            "model_id": self.model,
            "region": self.region,
            "voice_id": self.voice_id,
            "sample_rate": self.sample_rate,
            "channels": self.channels,
            "sample_size_bits": self.sample_size_bits,
        }


class SimpleNovaSonic:
    def __init__(self, config: BedrockV2VConfig, ten_env: AsyncTenEnv):
        self.config = config
        self.model_id = config.model
        self.region = config.region
        self.client = None
        self.stream = None
        self.response = None
        self.is_active = False
        self.prompt_name = str(uuid.uuid4())
        self.content_name = str(uuid.uuid4())
        self.audio_content_name = str(uuid.uuid4())
        self.audio_queue = asyncio.Queue()
        self.text_queue = asyncio.Queue()
        self.tool_call_queue = asyncio.Queue()
        self.display_assistant_text = False
        self.role = None
        self.ten_env = ten_env
        self.available_tools = []
        self.is_interrupted = False

    def _initialize_client(self):
        """Initialize the Bedrock client."""
        # Set AWS credentials in environment variables if provided in config
        self.ten_env.log_info("Initializing Bedrock client...")
        import os

        if self.config.access_key_id and self.config.secret_access_key:
            os.environ["AWS_ACCESS_KEY_ID"] = self.config.access_key_id
            os.environ["AWS_SECRET_ACCESS_KEY"] = self.config.secret_access_key

        config = Config(
            endpoint_uri=f"https://bedrock-runtime.{self.region}.amazonaws.com",
            region=self.region,
            aws_credentials_identity_resolver=EnvironmentCredentialsResolver(),
            http_auth_scheme_resolver=HTTPAuthSchemeResolver(),
            http_auth_schemes={"aws.auth#sigv4": SigV4AuthScheme()},
        )
        self.client = BedrockRuntimeClient(config=config)

    async def send_event(self, event_json):
        """Send an event to the stream."""
        # self.ten_env.log_info(f"Send an event to the stream: {event_json}")
        event = InvokeModelWithBidirectionalStreamInputChunk(
            value=BidirectionalInputPayloadPart(bytes_=event_json.encode("utf-8"))
        )
        await self.stream.input_stream.send(event)

    async def start_session(self, tools: List[LLMToolMetadata]):
        """Start a new session with Nova Sonic."""
        self.ten_env.log_info(
            f"start_session...., prompt_name: {self.prompt_name}, content_name: {self.content_name} "
        )
        if not self.client:
            self._initialize_client()

        self.stream = await self.client.invoke_model_with_bidirectional_stream(
            InvokeModelWithBidirectionalStreamOperationInput(model_id=self.model_id)
        )
        self.is_active = True

        # Configure tools if enabled
        tools_config = []
        prompt = self.config.prompt
        if tools:
            prompt = f"{prompt}\n\n You have several tools that you can get help from: "
            for tool in tools:
                prompt += f"- ***{tool.name}***: {tool.description}"
                tools_config.append(
                    {
                        "toolSpec": {
                            "name": tool.name,
                            "description": tool.description,
                            "inputSchema": {
                                "json": self._convert_tool_params_to_dict(tool)
                            },
                        }
                    }
                )
            self.ten_env.log_info(f"Configuring session with {len(tools_config)} tools")

        session_start = f"""
        {{
          "event": {{
            "sessionStart": {{
              "inferenceConfiguration": {{
                "maxTokens": {self.config.max_tokens},
                "topP": {self.config.topP},
                "temperature": {self.config.temperature}
              }}
            }}
          }}
        }}
        """
        await self.send_event(session_start)

        tools_config = json.dumps(tools_config)

        prompt_start = f"""
        {{
          "event": {{
            "promptStart": {{
              "promptName": "{self.prompt_name}",
              "textOutputConfiguration": {{
                "mediaType": "text/plain"
              }},
              "audioOutputConfiguration": {{
                "mediaType": "audio/lpcm",
                "sampleRateHertz": {self.config.sample_rate},
                "sampleSizeBits": {self.config.sample_size_bits},
                "channelCount": {self.config.channels},
                "voiceId": "{self.config.voice_id}",
                "encoding": "base64",
                "audioType": "SPEECH"
              }},
              "toolUseOutputConfiguration": {{
                "mediaType": "application/json"
              }}
              {f',"toolConfiguration": {{"tools": {tools_config}}}' if tools_config else ''}
            }}
          }}
        }}
        """
        await self.send_event(prompt_start)

        self.ten_env.log_info(f"prompt_start: {prompt_start}")

        text_content_start = f"""
        {{
            "event": {{
                "contentStart": {{
                    "promptName": "{self.prompt_name}",
                    "contentName": "{self.content_name}",
                    "type": "TEXT",
                    "interactive": true,
                    "role": "SYSTEM",
                    "textInputConfiguration": {{
                        "mediaType": "text/plain"
                    }}
                }}
            }}
        }}
        """
        await self.send_event(text_content_start)

        text_input = f"""
        {{
            "event": {{
                "textInput": {{
                    "promptName": "{self.prompt_name}",
                    "contentName": "{self.content_name}",
                    "content": {json.dumps(prompt)}
                }}
            }}
        }}
        """
        await self.send_event(text_input)

        text_content_end = f"""
        {{
            "event": {{
                "contentEnd": {{
                    "promptName": "{self.prompt_name}",
                    "contentName": "{self.content_name}"
                }}
            }}
        }}
        """
        await self.send_event(text_content_end)

        self.response = asyncio.create_task(self._process_responses())

    async def start_audio_input(self):
        """Start audio input stream."""
        self.ten_env.log_info("Start audio input stream....")
        audio_content_start = f"""
        {{
            "event": {{
                "contentStart": {{
                    "promptName": "{self.prompt_name}",
                    "contentName": "{self.audio_content_name}",
                    "type": "AUDIO",
                    "interactive": true,
                    "role": "USER",
                    "audioInputConfiguration": {{
                        "mediaType": "audio/lpcm",
                        "sampleRateHertz": {self.config.sample_rate},
                        "sampleSizeBits": {self.config.sample_size_bits},
                        "channelCount": {self.config.channels},
                        "audioType": "SPEECH",
                        "encoding": "base64"
                    }}
                }}
            }}
        }}
        """
        await self.send_event(audio_content_start)

    async def send_audio_chunk(self, audio_bytes):
        """Send an audio chunk to the stream."""
        # self.ten_env.log_info("Send an audio chunk to the stream...")
        if not self.is_active:
            return

        blob = base64.b64encode(audio_bytes)
        audio_event = f"""
        {{
            "event": {{
                "audioInput": {{
                    "promptName": "{self.prompt_name}",
                    "contentName": "{self.audio_content_name}",
                    "content": {json.dumps(blob.decode('utf-8'))}
                }}
            }}
        }}
        """
        await self.send_event(audio_event)

    async def end_audio_input(self):
        """End audio input stream."""
        self.ten_env.log_info("End audio input stream...")
        audio_content_end = f"""
        {{
            "event": {{
                "contentEnd": {{
                    "promptName": "{self.prompt_name}",
                    "contentName": "{self.audio_content_name}"
                }}
            }}
        }}
        """
        await self.send_event(audio_content_end)

    async def end_session(self):
        """End the session."""
        self.ten_env.log_info("End the session...")

        if not self.is_active:
            return

        try:
            prompt_end = f"""
            {{
                "event": {{
                    "promptEnd": {{
                        "promptName": "{self.prompt_name}"
                    }}
                }}
            }}
            """
            await self.send_event(prompt_end)

            session_end = """
            {
                "event": {
                    "sessionEnd": {}
                }
            }
            """
            await self.send_event(session_end)

            # Ensure the stream is properly closed
            if self.stream and hasattr(self.stream, "input_stream"):
                await self.stream.input_stream.close()

            # Reset state
            self.is_active = False
            self.is_interrupted = False

        except Exception as e:
            self.ten_env.log_error(f"Error ending session: {e}")
            # Force cleanup even if there's an error
            try:
                if self.stream and hasattr(self.stream, "input_stream"):
                    await self.stream.input_stream.close()
            except Exception as close_error:
                self.ten_env.log_error(f"Error closing stream: {close_error}")
            finally:
                self.is_active = False
                self.is_interrupted = False

    def set_available_tools(self, tools):
        """Set the available tools for the model."""
        self.available_tools = tools
        self.ten_env.log_info(f"Set available tools: {len(tools)} tools")

    def _convert_tool_params_to_dict(self, tool: LLMToolMetadata):
        """Convert tool parameters to a dictionary format for Bedrock."""

        json_dict = {"type": "object", "properties": {}, "required": []}

        for param in tool.parameters:
            json_dict["properties"][param.name] = {
                "type": param.type,
                "description": param.description,
            }
            if param.required:
                json_dict["required"].append(param.name)
        # json_dict convert as string
        json_string = json.dumps(json_dict)
        return json_string

    def convert_to_content_parts(self, content: LLMChatCompletionContentPartParam):
        """Convert content parts to a format suitable for Bedrock."""
        content_parts = []

        if isinstance(content, str):
            content_parts.append({"type": "text", "text": content})
        else:
            for part in content:
                # Only text content is supported currently for v2v model
                if part["type"] == "text":
                    content_parts.append(part)
        return content_parts

    async def send_tool_response(self, tool_use_id, output):
        """Send a tool response back to the model."""
        self.ten_env.log_info(f"Sending tool response for tool use ID: {tool_use_id}")

        # Generate a unique content name for the tool result
        tool_content_name = f"tool_result_{uuid.uuid4()}"

        # First, start a content block for the tool result
        content_start = f"""
        {{
            "event": {{
                "contentStart": {{
                    "promptName": "{self.prompt_name}",
                    "contentName": "{tool_content_name}",
                    "interactive": false,
                    "type": "TOOL",
                    "role": "TOOL",
                    "toolResultInputConfiguration": {{
                        "toolUseId": "{tool_use_id}",
                        "type": "TEXT",
                        "textInputConfiguration": {{
                            "mediaType": "text/plain"
                        }}
                    }}
                }}
            }}
        }}
        """
        await self.send_event(content_start)

        # Then, send the tool result
        result_content = ""
        if isinstance(output, list):
            for part in output:
                if part.get("type") == "text":
                    result_content = part.get("text", "")
                    break
        elif isinstance(output, str):
            result_content = output
        else:
            result_content = json.dumps(output)

        tool_result = f"""
        {{
            "event": {{
                "toolResult": {{
                    "promptName": "{self.prompt_name}",
                    "contentName": "{tool_content_name}",
                    "content": {json.dumps(result_content)}
                }}
            }}
        }}
        """
        await self.send_event(tool_result)

        # Finally, end the content block
        content_end = f"""
        {{
            "event": {{
                "contentEnd": {{
                    "promptName": "{self.prompt_name}",
                    "contentName": "{tool_content_name}"
                }}
            }}
        }}
        """
        await self.send_event(content_end)

    async def _process_responses(self):
        """Process responses from the stream."""
        self.ten_env.log_info("Process responses from the stream...")
        try:
            while self.is_active:
                # self.ten_env.log_info("Awaiting response from the stream...")
                output = await self.stream.await_output()
                result = await output[1].receive()

                if result.value and result.value.bytes_:
                    response_data = result.value.bytes_.decode("utf-8")
                    json_data = json.loads(response_data)

                    if "event" in json_data:
                        if "contentStart" in json_data["event"]:
                            content_start = json_data["event"]["contentStart"]
                            content_type = content_start.get("type", "")
                            self.role = content_start.get("role", "")

                            # Handle tool content start
                            if content_type == "TOOL" and self.role == "TOOL":
                                self.ten_env.log_info(
                                    f"Tool content start detected: {content_start}"
                                )
                            elif "additionalModelFields" in content_start:
                                additional_fields = json.loads(
                                    content_start["additionalModelFields"]
                                )
                                self.display_assistant_text = (
                                    additional_fields.get("generationStage")
                                    == "SPECULATIVE"
                                )

                        elif "textOutput" in json_data["event"]:
                            text = json_data["event"]["textOutput"]["content"]
                            # Don't process text if interrupted
                            if not self.is_interrupted:
                                if (
                                    self.role == "ASSISTANT"
                                    and self.display_assistant_text
                                ):
                                    print(f"Assistant: {text}")
                                    await self.text_queue.put(
                                        ("assistant", text, False)
                                    )
                                elif self.role == "USER":
                                    print(f"User: {text}")
                                    await self.text_queue.put(("user", text, True))

                        elif "audioOutput" in json_data["event"]:
                            # Don't process audio if interrupted
                            if not self.is_interrupted:
                                audio_content = json_data["event"]["audioOutput"][
                                    "content"
                                ]
                                audio_bytes = base64.b64decode(audio_content)
                                # self.ten_env.log_info(f"Received audio data, length: {len(audio_bytes)}")
                                await self.audio_queue.put(audio_bytes)

                        elif "toolUse" in json_data["event"]:
                            tool_use = json_data["event"]["toolUse"]
                            tool_use_id = tool_use.get("toolUseId")
                            tool_name = tool_use.get("toolName")
                            tool_content = tool_use.get("content")

                            self.ten_env.log_info(
                                f"Tool use received: {tool_name} with ID {tool_use_id}"
                            )
                            await self.tool_call_queue.put(
                                (tool_use_id, tool_name, tool_content)
                            )

                        elif "contentEnd" in json_data["event"]:
                            content_end = json_data["event"]["contentEnd"]
                            stop_reason = content_end.get("stopReason")
                            content_type = content_end.get("type")

                            if stop_reason == "INTERRUPTED":
                                self.ten_env.log_info(
                                    "INTERRUPTED signal detected, stopping output"
                                )
                                self.is_interrupted = True
                                flush_cmd = Cmd.create("flush")
                                await self.ten_env.send_cmd(flush_cmd)
                            elif (
                                stop_reason == "END_TURN"
                                or stop_reason == "INTERRUPTED"
                            ):
                                if self.role is not None:
                                    await self.text_queue.put((self.role, "", True))

                            self.ten_env.log_info(
                                f"Content end detected: {content_end},  role: {self.role}"
                            )
        except Exception as e:
            traceback.print_exc()
            self.ten_env.log_error(f"Error processing responses: {e}")
            # Clean up the session when an error occurs to prevent invalid state in future requests
            self.ten_env.log_info("Cleaning up session due to error")
            self.is_active = False
            try:
                # Try to properly close the stream if it exists
                if self.stream and hasattr(self.stream, "input_stream"):
                    await self.stream.input_stream.close()
            except Exception as close_error:
                self.ten_env.log_error(f"Error closing stream: {close_error}")


class BedrockV2VExtension(AsyncLLMBaseExtension):
    def __init__(self, name: str):
        super().__init__(name)
        self.nova_client = None
        self.is_active = False
        self.audio_task = None
        self.stream_id: int = 0
        self.remote_stream_id: int = 0
        self.channel_name: str = ""
        self.config = BedrockV2VConfig()
        self.transcript: str = ""
        self.loop = None
        self.ctx = {}

    async def on_init(self, ten_env: AsyncTenEnv) -> None:
        await super().on_init(ten_env)
        ten_env.log_debug("on_init")
        try:
            self.config = await BedrockV2VConfig.create_async(ten_env=ten_env)
            ten_env.log_info(f"Configuration: {self.config}")

            if not self.config.access_key_id or not self.config.secret_access_key:
                ten_env.log_error(
                    "AWS credentials (access_key_id and secret_access_key) are required"
                )
                return
            self.ctx = self.config.build_ctx()

        except Exception as e:
            traceback.print_exc()
            ten_env.log_error(f"Failed to initialize: {e}")

        self.nova_client = SimpleNovaSonic(self.config, ten_env)

    async def on_start(self, ten_env: AsyncTenEnv) -> None:
        ten_env.log_debug("on_start")
        await super().on_start(ten_env)
        self.loop = asyncio.get_event_loop()
        self.loop.create_task(self._loop(ten_env))

    async def _loop(self, ten_env: AsyncTenEnv) -> None:
        try:
            await asyncio.sleep(1)
            await self.nova_client.start_session(self.available_tools)
            self.is_active = True
            await self.nova_client.start_audio_input()
        except Exception as e:
            traceback.print_exc()
            ten_env.log_error(f"Error starting session: {e}")
            return

    async def on_stop(self, ten_env: AsyncTenEnv) -> None:
        await super().on_stop(ten_env)
        ten_env.log_info("on_stop")
        self.is_active = False
        if self.nova_client:
            try:
                await self.nova_client.end_session()
            except Exception as e:
                ten_env.log_error(f"Error ending session: {e}")
                # Force cleanup of resources even if end_session fails
                if self.nova_client.stream and hasattr(
                    self.nova_client.stream, "input_stream"
                ):
                    try:
                        await self.nova_client.stream.input_stream.close()
                    except Exception as close_error:
                        ten_env.log_error(f"Error closing stream: {close_error}")
                self.nova_client.is_active = False

    async def on_deinit(self, ten_env: AsyncTenEnv) -> None:
        ten_env.log_debug("on_deinit")
        self.nova_client = None

    async def on_cmd(self, ten_env: AsyncTenEnv, cmd: Cmd) -> None:
        cmd_name = cmd.get_name()
        ten_env.log_debug("on_cmd name {}".format(cmd_name))

        status = StatusCode.OK
        detail = "success"

        if cmd_name == "on_user_joined":
            # Handle user joined event
            ten_env.log_info("User joined")
            # No greeting, just focus on real-time audio conversation
        elif cmd_name == "on_user_left":
            # Handle user left event
            ten_env.log_info("User left")
        elif cmd_name == "on_connection_failure":
            # Handle connection failure event
            reason = cmd.get_property_string("reason")
            ten_env.log_error("Connection failure: {}".format(reason))
        elif cmd_name == "flush":
            # Handle flush command
            ten_env.log_info("Flush command received")
            await self._flush(ten_env)
        elif cmd_name == "tool_register":
            # Handle tool registration
            ten_env.log_info("Tool registered")
            await super().on_cmd(ten_env, cmd)
            return

        cmd_result = CmdResult.create(status)
        cmd_result.set_property_string("detail", detail)
        await ten_env.return_result(cmd_result, cmd)

    async def on_data(self, ten_env: AsyncTenEnv, data: Data) -> None:
        data_name = data.get_name()
        ten_env.log_debug("on_data name {}".format(data_name))

    async def on_tools_update(
        self, ten_env: AsyncTenEnv, tool: LLMToolMetadata
    ) -> None:
        """Called when a new tool is registered."""
        ten_env.log_info(f"Tool updated: {tool.name}")
        # Add the tool to available_tools if it's not already there
        if tool not in self.available_tools:
            self.available_tools.append(tool)
            ten_env.log_info(f"Added tool to available_tools: {tool.name}")

        # Don't update the nova_client with the new tools during an active session
        # They'll be used in the next session when it's started

    async def _handle_tool_call(
        self, ten_env: AsyncTenEnv, tool_call_id: str, name: str, arguments: str
    ) -> None:
        """Handle a tool call from the model."""
        ten_env.log_info(f"Handling tool call: {name} with ID {tool_call_id}")

        cmd = Cmd.create(CMD_TOOL_CALL)
        cmd.set_property_string("name", name)
        cmd.set_property_from_json("arguments", arguments)
        [result, _] = await ten_env.send_cmd(cmd)

        if result.get_status_code() == StatusCode.OK:
            tool_result: LLMToolResult = json.loads(
                result.get_property_to_json(CMD_PROPERTY_RESULT)
            )
            result_content = tool_result["content"]

            # Convert the result to a format suitable for Bedrock
            output = self.nova_client.convert_to_content_parts(result_content)
            await self.nova_client.send_tool_response(tool_call_id, output)
            ten_env.log_info(f"Tool call completed: {name}")
        else:
            ten_env.log_error(f"Tool call failed: {name}")
            # Send an error response
            await self.nova_client.send_tool_response(
                tool_call_id, {"error": "Tool call failed"}
            )

    async def on_audio_frame(
        self, ten_env: AsyncTenEnv, audio_frame: AudioFrame
    ) -> None:
        try:
            await super().on_audio_frame(ten_env, audio_frame)
            # Track stream_id and channel from incoming audio frames
            stream_id = audio_frame.get_property_int("stream_id")
            if self.remote_stream_id == 0:
                self.remote_stream_id = stream_id
            if self.channel_name == "":
                self.channel_name = audio_frame.get_property_string("channel")

            if self.is_active and self.nova_client:
                # Reset the interrupted flag when new user input is detected

                if self.nova_client.is_interrupted:
                    self.nova_client.is_interrupted = False
                    ten_env.log_info("Interrupt flag reset due to new user input")

                try:
                    audio_data = audio_frame.get_buf()
                    await self.nova_client.send_audio_chunk(audio_data)
                except Exception as audio_error:
                    ten_env.log_error(f"Error sending audio chunk: {audio_error}")
                    # If we can't send audio, the session might be in an invalid state
                    # Try to reset it in the next step
                    raise audio_error

                try:
                    # Process any available audio responses
                    while not self.nova_client.audio_queue.empty():
                        response_audio = await self.nova_client.audio_queue.get()
                        await self._send_audio_response(ten_env, response_audio)
                except Exception as audio_resp_error:
                    ten_env.log_error(
                        f"Error processing audio responses: {audio_resp_error}"
                    )
                    # Continue with other processing even if audio response fails

                try:
                    # Process any available text responses
                    while not self.nova_client.text_queue.empty():
                        role, text, is_final = await self.nova_client.text_queue.get()
                        await self._send_transcript(ten_env, text, role, is_final)
                except Exception as text_error:
                    ten_env.log_error(f"Error processing text responses: {text_error}")
                    # Continue with other processing even if text response fails

                try:
                    # Process any available tool calls
                    while not self.nova_client.tool_call_queue.empty():
                        tool_call_id, tool_name, tool_arguments = (
                            await self.nova_client.tool_call_queue.get()
                        )
                        await self._handle_tool_call(
                            ten_env, tool_call_id, tool_name, tool_arguments
                        )
                except Exception as tool_error:
                    ten_env.log_error(f"Error processing tool calls: {tool_error}")
                    # Continue even if tool call processing fails

        except Exception as e:
            traceback.print_exc()
            ten_env.log_error(f"BedrockV2VExtension on audio frame failed {e}")

            # If there's a critical error in audio frame processing, try to reset the session
            if self.nova_client:
                ten_env.log_info(
                    "Attempting to reset session due to audio frame processing error"
                )
                try:
                    # Try to end the current session properly
                    await self.nova_client.end_session()
                except Exception:
                    # If ending fails, force cleanup
                    if self.nova_client.stream and hasattr(
                        self.nova_client.stream, "input_stream"
                    ):
                        try:
                            await self.nova_client.stream.input_stream.close()
                        except Exception as close_error:
                            ten_env.log_error(f"Error closing stream: {close_error}")

                # Reset state and try to start a new session
                self.nova_client.is_active = False
                self.nova_client.is_interrupted = False

                try:
                    # Try to start a new session
                    await self.nova_client.start_session(self.available_tools)
                    self.is_active = True
                    self.nova_client.is_active = True
                    await self.nova_client.start_audio_input()
                    ten_env.log_info(
                        "Successfully restarted session after audio frame error"
                    )
                except Exception as restart_error:
                    ten_env.log_error(
                        f"Failed to restart session after audio frame error: {restart_error}"
                    )

    async def _send_transcript(
        self, ten_env: AsyncTenEnv, content: str, role: str, is_final: bool
    ) -> None:
        """Send text transcript to the client."""
        ten_env.log_debug(
            f"Sending transcript: {content}, role: {role}, is_final: {is_final}"
        )

        def is_punctuation(char):
            if char in [",", "，", ".", "。", "?", "？", "!", "！"]:
                return True
            return False

        def parse_sentences(sentence_fragment, content):
            sentences = []
            current_sentence = sentence_fragment
            for char in content:
                current_sentence += char
                if is_punctuation(char):
                    # Check if the current sentence contains non-punctuation characters
                    stripped_sentence = current_sentence
                    if any(c.isalnum() for c in stripped_sentence):
                        sentences.append(stripped_sentence)
                    current_sentence = ""  # Reset for the next sentence

            remain = current_sentence  # Any remaining characters form the incomplete sentence
            return sentences, remain

        stream_id = self.remote_stream_id if role == "user" else 0
        try:
            if role == "assistant" and not is_final:
                sentences, self.transcript = parse_sentences(self.transcript, content)
                for s in sentences:
                    d = Data.create("text_data")
                    d.set_property_string("text", s)
                    d.set_property_bool("end_of_segment", is_final)
                    d.set_property_string("role", role)
                    d.set_property_int("stream_id", stream_id)
                    ten_env.log_info(
                        f"send transcript text [{s}] stream_id {stream_id} is_final {is_final} role {role}"
                    )
                    await ten_env.send_data(d)
            else:
                d = Data.create("text_data")
                d.set_property_string("text", content)
                d.set_property_bool("end_of_segment", is_final)
                d.set_property_string("role", role)
                d.set_property_int("stream_id", stream_id)
                ten_env.log_info(
                    f"send transcript text [{content}] stream_id {stream_id} is_final {is_final} role {role}"
                )
                await ten_env.send_data(d)
        except Exception as e:
            ten_env.log_error(f"Error send text data {role}: {content} {is_final} {e}")

    async def _send_audio_response(
        self, ten_env: AsyncTenEnv, audio_data: bytes
    ) -> None:
        """Send audio response back to the client."""
        ten_env.log_debug(f"Sending audio response, length: {len(audio_data)}")

        try:
            # Create a new audio frame with the response
            f = AudioFrame.create("pcm_frame")
            f.set_sample_rate(self.config.sample_rate)
            f.set_bytes_per_sample(2)
            f.set_number_of_channels(self.config.channels)
            f.set_data_fmt(AudioFrameDataFmt.INTERLEAVE)
            f.set_samples_per_channel(len(audio_data) // 2)

            # Set additional properties that might be needed for routing
            if self.channel_name:
                f.set_property_string("channel", self.channel_name)

            # Set stream_id to 0 for assistant audio (similar to how we handle text)
            f.set_property_int("stream_id", 0)

            # Allocate buffer and copy audio data
            f.alloc_buf(len(audio_data))
            buf = f.lock_buf()
            buf[:] = audio_data
            f.unlock_buf(buf)

            # Send the audio frame
            # ten_env.log_info(f"Sending audio frame: sample_rate={self.config.sample_rate}, channels={self.config.channels}, bytes={len(audio_data)}")
            await ten_env.send_audio_frame(f)
        except Exception as e:
            traceback.print_exc()
            ten_env.log_error(f"Error sending audio response: {e}")

    async def _flush(self, ten_env: AsyncTenEnv) -> None:
        """Flush any pending audio data."""
        ten_env.log_debug("Flushing audio data")
        if self.nova_client and self.nova_client.is_active:
            try:
                # End the current audio input and start a new one
                await self.nova_client.end_audio_input()
                await self.nova_client.start_audio_input()
            except Exception as e:
                ten_env.log_error(f"Error during flush operation: {e}")
                # If there's an error during flush, try to reset the session
                try:
                    # First try to properly end the current session
                    await self.nova_client.end_session()
                except Exception:
                    # If ending the session fails, force cleanup
                    if self.nova_client.stream and hasattr(
                        self.nova_client.stream, "input_stream"
                    ):
                        try:
                            await self.nova_client.stream.input_stream.close()
                        except Exception as close_error:
                            ten_env.log_error(
                                f"Error closing stream during flush: {close_error}"
                            )

                # Reset state flags
                self.nova_client.is_active = False
                self.nova_client.is_interrupted = False

                # Try to start a new session
                try:
                    await self.nova_client.start_session(self.available_tools)
                    self.nova_client.is_active = True
                    await self.nova_client.start_audio_input()
                    ten_env.log_info("Successfully restarted session after flush error")
                except Exception as restart_error:
                    ten_env.log_error(
                        f"Failed to restart session after flush error: {restart_error}"
                    )

    async def on_video_frame(
        self, ten_env: AsyncTenEnv, video_frame: VideoFrame
    ) -> None:
        video_frame_name = video_frame.get_name()
        ten_env.log_debug("on_video_frame name {}".format(video_frame_name))

    async def on_call_chat_completion(self, async_ten_env, **kargs):
        """Implementation of abstract method from AsyncLLMBaseExtension."""
        async_ten_env.log_info(
            "on_call_chat_completion not supported in BedrockV2VExtension"
        )
        return None

    async def on_data_chat_completion(self, async_ten_env, **kargs):
        """Implementation of abstract method from AsyncLLMBaseExtension."""
        async_ten_env.log_info(
            "on_data_chat_completion not supported in BedrockV2VExtension"
        )
        return None
