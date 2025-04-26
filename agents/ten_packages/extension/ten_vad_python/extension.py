#
# This file is part of TEN Framework, an open source project.
# Licensed under the Apache License, Version 2.0.
# See the LICENSE file for more information.
#
from ten import (
    AudioFrame,
    AudioFrameDataFmt,
    AsyncExtension,
    AsyncTenEnv,
    Cmd,
    StatusCode,
    CmdResult,
    Data,
)
from .config import TENVADConfig
from .ten_aivad import tenAiVad
from enum import Enum, auto

import numpy as np
import os
import asyncio

BYTES_PER_SAMPLE = 2
SAMPLE_RATE = 16000


class VADState(Enum):
    IDLE = auto()
    SPEAKING = auto()


class TENVADPythonExtension(AsyncExtension):
    def __init__(self, name: str):
        super().__init__(name)
        self.name = name
        self.config: TENVADConfig = None
        self.hop_size: int = 0  # samples

        self.vad = None
        self.audio_buffer: bytearray = bytearray()

        # VAD state
        self.state = VADState.IDLE
        self.probe_window: list[float] = []
        self.window_size: int = 0
        self.prefix_window_size: int = 0
        self.silence_window_size: int = 0

        # Audio buffer for speaking only mode
        self.prefix_buffer: bytearray = bytearray()
        self.prefix_buffer_size: int = 0  # maximum size in bytes

    async def on_init(self, ten_env: AsyncTenEnv) -> None:
        config_json = await ten_env.get_property_to_json("")
        self.config = TENVADConfig.model_validate_json(config_json)
        ten_env.log_debug(f"config: {self.config}")

        self.hop_size = self.config.hop_size_ms * SAMPLE_RATE // 1000
        ten_env.log_debug(f"hop_size: {self.hop_size}")

        # Calculate window size based on config
        self.silence_window_size = (
            self.config.silence_duration_ms // self.config.hop_size_ms
        )
        self.prefix_window_size = (
            self.config.prefix_padding_ms // self.config.hop_size_ms
        )
        self.window_size = max(self.silence_window_size, self.prefix_window_size)
        ten_env.log_debug(
            f"window_size: {self.window_size}, prefix_window_size: {self.prefix_window_size}, silence_window_size: {self.silence_window_size}"
        )

        # Calculate prefix buffer size in bytes
        samples_in_prefix = (self.config.prefix_padding_ms * SAMPLE_RATE) // 1000
        self.prefix_buffer_size = samples_in_prefix * BYTES_PER_SAMPLE
        ten_env.log_debug(f"prefix_buffer_size: {self.prefix_buffer_size} bytes")

    async def on_start(self, ten_env: AsyncTenEnv) -> None:

        self.vad = tenAiVad(self.hop_size)

    async def on_stop(self, ten_env: AsyncTenEnv) -> None:
        self.vad = None

    async def on_deinit(self, ten_env: AsyncTenEnv) -> None:
        pass

    async def on_cmd(self, ten_env: AsyncTenEnv, cmd: Cmd) -> None:
        cmd_name = cmd.get_name()
        ten_env.log_debug("on_cmd name {}".format(cmd_name))

        # TODO: process cmd

        cmd_result = CmdResult.create(StatusCode.OK)
        await ten_env.return_result(cmd_result, cmd)

    async def on_data(self, ten_env: AsyncTenEnv, data: Data) -> None:
        pass

    async def _check_state_transition(self, ten_env: AsyncTenEnv) -> None:
        if len(self.probe_window) != self.window_size:
            return

        if self.state == VADState.IDLE:
            # Check if we should transition to SPEAKING
            prefix_probes = self.probe_window[-self.prefix_window_size :]
            all_above_threshold = all(
                p >= self.config.vad_threshold for p in prefix_probes
            )
            if all_above_threshold:
                self.state = VADState.SPEAKING
                ten_env.log_debug(f"State transition: IDLE -> SPEAKING")
                ten_env.log_debug(f"(probes: {prefix_probes})")

                # send start_of_speaking cmd
                ten_env.log_debug("send_cmd: start_of_speaking")
                await asyncio.create_task(
                    ten_env.send_cmd(Cmd.create("start_of_speaking"))
                )

                # In speaking only mode, output buffered audio
                if self.config.output_speaking_only:
                    if len(self.prefix_buffer) > 0:
                        # Get the buffered audio and clear the buffer
                        prefix_buffer = bytes(self.prefix_buffer)  # Make a copy
                        self.prefix_buffer = bytearray()
                        ten_env.log_debug(
                            f"Sending prefix buffer with {len(prefix_buffer)} bytes"
                        )
                        await self._send_audio_frame(ten_env, prefix_buffer)
                    else:
                        ten_env.log_debug("Prefix buffer is empty")

        elif self.state == VADState.SPEAKING:
            # Check if we should transition to IDLE
            silence_probes = self.probe_window[-self.silence_window_size :]
            all_below_threshold = all(
                p < self.config.vad_threshold for p in silence_probes
            )
            if all_below_threshold:
                self.state = VADState.IDLE
                ten_env.log_debug(f"State transition: SPEAKING -> IDLE")
                ten_env.log_debug(f"(probes: {silence_probes})")

                # send end_of_speaking cmd
                ten_env.log_debug("send_cmd: end_of_speaking")
                await asyncio.create_task(
                    ten_env.send_cmd(Cmd.create("end_of_speaking"))
                )

    async def _send_audio_frame(self, ten_env: AsyncTenEnv, audio_data: bytes) -> None:
        """Helper function to create and send an audio frame with given data."""

        # Dump output audio if needed
        self._dump_audio_if_needed(audio_data, "out")

        audio_frame = AudioFrame.create("pcm_frame")
        audio_frame.set_bytes_per_sample(BYTES_PER_SAMPLE)
        audio_frame.set_sample_rate(SAMPLE_RATE)
        audio_frame.set_number_of_channels(1)
        audio_frame.set_data_fmt(AudioFrameDataFmt.INTERLEAVE)
        audio_frame.set_samples_per_channel(len(audio_data) // BYTES_PER_SAMPLE)
        audio_frame.alloc_buf(len(audio_data))
        buf = audio_frame.lock_buf()
        buf[:] = audio_data
        audio_frame.unlock_buf(buf)
        await ten_env.send_audio_frame(audio_frame)
        # ten_env.log_debug(f"sent audio frame with {len(audio_data)} bytes")

    def _dump_audio_if_needed(self, buf: bytearray, suffix: str) -> None:
        if not self.config.dump:
            return

        dump_file = os.path.join(self.config.dump_path, f"{self.name}_{suffix}.pcm")
        with open(dump_file, "ab") as f:
            f.write(buf)

    async def on_audio_frame(
        self, ten_env: AsyncTenEnv, audio_frame: AudioFrame
    ) -> None:
        frame_buf = audio_frame.get_buf()
        self._dump_audio_if_needed(frame_buf, "in")

        # Handle audio frame based on mode
        if not self.config.output_speaking_only:
            # Direct passthrough mode
            await self._send_audio_frame(ten_env, frame_buf)
        else:
            # Speaking only mode
            if self.state == VADState.SPEAKING:
                # In speaking state, directly output the frame
                await self._send_audio_frame(ten_env, frame_buf)
            else:
                # In idle state, buffer the audio data for potential prefix
                self.prefix_buffer.extend(frame_buf)
                if len(self.prefix_buffer) > self.prefix_buffer_size:
                    # Remove oldest data to maintain buffer size
                    excess = len(self.prefix_buffer) - self.prefix_buffer_size
                    self.prefix_buffer = self.prefix_buffer[excess:]

        # Process audio for VAD
        self.audio_buffer.extend(frame_buf)
        if len(self.audio_buffer) < self.hop_size * BYTES_PER_SAMPLE:
            return

        audio_buf = self.audio_buffer[: self.hop_size * BYTES_PER_SAMPLE]
        self.audio_buffer = self.audio_buffer[self.hop_size * BYTES_PER_SAMPLE :]

        # vad process
        probe = self.vad.process(np.frombuffer(audio_buf, dtype=np.int16))
        # ten_env.log_debug(f"vad probe: {probe}")

        # Update probe window
        self.probe_window.append(probe)
        if len(self.probe_window) > self.window_size:
            self.probe_window.pop(0)

        # Check state transition
        await self._check_state_transition(ten_env)
