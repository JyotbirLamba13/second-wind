import os
from pathlib import Path
from dataclasses import dataclass, field


def _load_dotenv(path: str = ".env") -> None:
    p = Path(path)
    if p.exists():
        for line in p.read_text().splitlines():
            if "=" in line and not line.lstrip().startswith("#"):
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())


_load_dotenv()


@dataclass(frozen=True)
class Settings:
    data_path: str = field(default_factory=lambda: os.getenv("SECOND_LIFE_DATA") or ("data/patents.jsonl" if Path("data/patents.jsonl").exists() else "data/sample_patents.jsonl"))
    db_path: str = field(default_factory=lambda: os.getenv("SECOND_LIFE_DB", "second_life.db"))
    model: str = field(default_factory=lambda: os.getenv("SECOND_LIFE_MODEL", "claude-sonnet-5-5"))
    anthropic_key: str = field(default_factory=lambda: os.getenv("ANTHROPIC_API_KEY", ""))
    openrouter_key: str = field(default_factory=lambda: os.getenv("OPENROUTER_API_KEY", ""))
    # Tried in order; the first that returns valid JSON wins. All free tier.
    openrouter_models: tuple = field(
        default_factory=lambda: tuple(
            m.strip()
            for m in os.getenv(
                "OPENROUTER_MODELS",
                "nvidia/nemotron-3-ultra-550b-a55b:free,google/gemma-4-31b-it:free,openrouter/free",
            ).split(",")
            if m.strip()
        )
    )
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
