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

import numpy as np

BYTES_PER_SAMPLE = 2
SAMPLE_RATE = 16000


class TENVADPythonExtension(AsyncExtension):
    def __init__(self, name: str):
        super().__init__(name)
        self.name = name
        self.config: TENVADConfig = None
        self.hop_size: int = 0  # samples

        self.vad = None
        self.audio_buffer: bytearray = bytearray()

    async def on_init(self, ten_env: AsyncTenEnv) -> None:
        config_json = await ten_env.get_property_to_json("")
        self.config = TENVADConfig.model_validate_json(config_json)
        ten_env.log_debug(f"config: {self.config}")

        self.hop_size = self.config.hop_size_ms * SAMPLE_RATE // 1000
        ten_env.log_debug(f"hop_size: {self.hop_size}")

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
        ten_env.log_debug(f"vad probe: {probe}")

    def _dump_audio_if_needed(self, buf: bytearray, suffix: str) -> None:
        if not self.config.dump:
            return

        dump_file = os.path.join(self.config.dump_path, f"{self.name}_{suffix}.pcm")
        with open(dump_file, "ab") as f:
            f.write(buf)
