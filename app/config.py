import os
from dataclasses import dataclass, field


@dataclass(frozen=True)
class Settings:
    data_path: str = field(default_factory=lambda: os.getenv("SECOND_LIFE_DATA", "data/sample_patents.jsonl"))
    db_path: str = field(default_factory=lambda: os.getenv("SECOND_LIFE_DB", "second_life.db"))
    model: str = field(default_factory=lambda: os.getenv("SECOND_LIFE_MODEL", "claude-sonnet-5-5"))
    anthropic_key: str = field(default_factory=lambda: os.getenv("ANTHROPIC_API_KEY", ""))
    cors_origins: tuple = field(
        default_factory=lambda: tuple(o.strip() for o in os.getenv("CORS_ORIGINS", "*").split(",") if o.strip())
    )
    # Triage thresholds on idf-weighted claim coverage (0..1). Starting assumptions; tune on the benchmark.
    blocking_red: float = 0.45
    blocking_yellow: float = 0.25
    novelty_red: float = 0.60
    novelty_yellow: float = 0.25
    # Embedding cosine above which an in-force patent counts as a possible blocker for a lapsed one.
    scout_block_cosine: float = 0.30


def get_settings() -> Settings:
    return Settings()
