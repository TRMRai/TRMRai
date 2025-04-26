#
# This file is part of TEN Framework, an open source project.
# Licensed under the Apache License, Version 2.0.
# See the LICENSE file for more information.
#
from ten import (
    AudioFrame,
    VideoFrame,
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

BYTES_PER_SAMPLE = 2
SAMPLE_RATE = 16000


class VADState(Enum):
    IDLE = auto()
    SPEECHING = auto()


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

    async def on_init(self, ten_env: AsyncTenEnv) -> None:
        config_json = await ten_env.get_property_to_json("")
        self.config = TENVADConfig.model_validate_json(config_json)
        ten_env.log_debug(f"config: {self.config}")

        self.hop_size = self.config.hop_size_ms * SAMPLE_RATE // 1000
        ten_env.log_debug(f"hop_size: {self.hop_size}")

        # Calculate window size based on config
        self.silence_window = self.config.silence_duration_ms // self.config.hop_size_ms
        self.prefix_window = self.config.prefix_padding_ms // self.config.hop_size_ms
        self.window_size = max(self.silence_window, self.prefix_window)
        ten_env.log_debug(
            f"window_size: {self.window_size}, prefix_window_size: {self.prefix_window}, silence_window_size: {self.silence_window}"
        )

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

    def _check_state_transition(self, ten_env: AsyncTenEnv) -> None:
        if len(self.probe_window) != self.window_size:
            return

        if self.state == VADState.IDLE:
            # Check if we should transition to SPEECHING
            prefix_probes = self.probe_window[-self.prefix_window_size :]
            all_above_threshold = all(
                p >= self.config.vad_threshold for p in prefix_probes
            )
            if all_above_threshold:
                self.state = VADState.SPEECHING
                ten_env.log_debug(
                    f"State transition: IDLE -> SPEECHING (probes: {prefix_probes})"
                )

        elif self.state == VADState.SPEECHING:
            # Check if we should transition to IDLE
            silence_probes = self.probe_window[-self.silence_window_size :]
            all_below_threshold = all(
                p < self.config.vad_threshold for p in silence_probes
            )
            if all_below_threshold:
                self.state = VADState.IDLE
                ten_env.log_debug(
                    f"State transition: SPEECHING -> IDLE (probes: {silence_probes})"
                )

    async def on_audio_frame(
        self, ten_env: AsyncTenEnv, audio_frame: AudioFrame
    ) -> None:
        frame_buf = audio_frame.get_buf()
        self._dump_audio_if_needed(frame_buf, "in")

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
        self._check_state_transition(ten_env)

    def _dump_audio_if_needed(self, buf: bytearray, suffix: str) -> None:
        if not self.config.dump:
            return

        dump_file = os.path.join(self.config.dump_path, f"{self.name}_{suffix}.pcm")
        with open(dump_file, "ab") as f:
            f.write(buf)
