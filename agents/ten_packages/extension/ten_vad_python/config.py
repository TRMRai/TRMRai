from pydantic import BaseModel


class TENVADConfig(BaseModel):
    prefix_padding_ms: int = 200
    silence_duration_ms: int = 1000
    vad_threshold: float = 0.5
    hop_size_ms: int = 10
    dump: bool = False
    dump_path: str = ""
