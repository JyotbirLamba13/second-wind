"""Offline retrieval: BM25, hashed TF-IDF embeddings, CPC matching, and reciprocal-rank-fusion hybrid.

No model downloads are needed, so the benchmark is repeatable anywhere. The embedding class can be
swapped for a neural one by matching its `fit`/`encode` interface.
"""
from __future__ import annotations

import math
import re
import zlib
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from typing import Iterable, Optional

import numpy as np

from .patents import Patent

_TOKEN = re.compile(r"[a-z0-9]+")
_STOP = set(
    "a an and are as at be by for from has have in is it its of on or that the this to with which wherein "
    "said comprising comprises claim claims according method system apparatus device including includes "
    "one two first second can may use used using into when each such than also not more".split()
)


def _stem(w: str) -> str:
    for suf in ("ing", "ed", "es", "s"):
        if w.endswith(suf) and len(w) - len(suf) >= 3:
            w = w[: -len(suf)]
            if suf in ("ing", "ed") and len(w) > 3 and w[-1] == w[-2] and w[-1] not in "lsz":
                w = w[:-1]  # stirring -> stir
            return w
    return w


# Small synonym map so lay wording lines up with patent vocabulary. A neural embedder would replace this.
_CANON = {"phone": "mobile", "smartphone": "mobile", "cellphone": "mobile", "app": "application",
          "sens": "sensor", "remind": "reminder", "wireless": "wireless", "bluetooth": "wireless",
          "cup": "vessel", "mug": "vessel", "jug": "vessel", "tilt": "inclination", "slouch": "inclination",
          "posture": "posture", "watch": "watch", "wristwatch": "watch", "smartwatch": "watch"}


def tokenize(text: str) -> list[str]:
    toks = [_stem(t) for t in _TOKEN.findall(text.lower()) if t not in _STOP and len(t) > 1]
    return [_CANON.get(t, t) for t in toks]


def cpc_group(code: str) -> str:
    """Subclass level, e.g. 'A47J31/00' -> 'A47J'."""
    return code.replace(" ", "")[:4]


@dataclass
class Hit:
    id: str
    score: float
    components: dict[str, float] = field(default_factory=dict)


class HashEmbedder:
    """TF-IDF over hashed unigrams and bigrams, L2-normalised."""

    def __init__(self, dim: int = 4096):
        self.dim = dim
        self.idf: dict[int, float] = {}
        self.default_idf = 1.0

    def _features(self, tokens: list[str]) -> Counter:
        feats: Counter = Counter()
        for t in tokens:
            feats[zlib.crc32(t.encode()) % self.dim] += 1
        for a, b in zip(tokens, tokens[1:]):
            feats[zlib.crc32(f"{a}_{b}".encode()) % self.dim] += 1
        return feats

    def fit(self, docs: list[list[str]]) -> None:
        df: Counter = Counter()
        for d in docs:
            df.update(self._features(d).keys())
        n = max(len(docs), 1)
        self.idf = {k: math.log((n + 1) / (v + 1)) + 1 for k, v in df.items()}
        self.default_idf = math.log(n + 1) + 1

    def encode(self, tokens: list[str]) -> np.ndarray:
        vec = np.zeros(self.dim, dtype=np.float32)
        for k, c in self._features(tokens).items():
            vec[k] = (1 + math.log(c)) * self.idf.get(k, self.default_idf)
        norm = np.linalg.norm(vec)
        return vec / norm if norm else vec


class Index:
    METHODS = ("bm25", "embedding", "cpc", "hybrid")

    def __init__(self, patents: Iterable[Patent], k1: float = 1.5, b: float = 0.75):
        self.patents: dict[str, Patent] = {p.id: p for p in patents}
        self.ids = list(self.patents)
        self.k1, self.b = k1, b
        self.tokens = {i: tokenize(self.patents[i].text) for i in self.ids}
        self.tf = {i: Counter(t) for i, t in self.tokens.items()}
        self.df: Counter = Counter()
        for c in self.tf.values():
            self.df.update(c.keys())
        n = max(len(self.ids), 1)
        self.n = n
        self.avgdl = sum(len(t) for t in self.tokens.values()) / n or 1.0
        self.idf = {t: math.log(1 + (n - d + 0.5) / (d + 0.5)) for t, d in self.df.items()}
        self.postings: dict[str, list[str]] = defaultdict(list)
        for i, c in self.tf.items():
            for t in c:
                self.postings[t].append(i)
        self.embedder = HashEmbedder()
        self.embedder.fit(list(self.tokens.values()))
        self.matrix = (
            np.stack([self.embedder.encode(self.tokens[i]) for i in self.ids]) if self.ids else np.zeros((0, 1))
        )
        self.row = {i: r for r, i in enumerate(self.ids)}
        self.groups = {i: {cpc_group(c) for c in self.patents[i].cpc} for i in self.ids}

    # -- individual scorers -------------------------------------------------
    def bm25(self, q_tokens: list[str]) -> dict[str, float]:
        scores: dict[str, float] = defaultdict(float)
        for t in set(q_tokens):
            idf = self.idf.get(t)
            if idf is None:
                continue
            for i in self.postings[t]:
                tf = self.tf[i][t]
                dl = len(self.tokens[i])
                scores[i] += idf * tf * (self.k1 + 1) / (tf + self.k1 * (1 - self.b + self.b * dl / self.avgdl))
        return scores

    def embedding(self, q_tokens: list[str]) -> dict[str, float]:
        if not self.ids:
            return {}
        sims = self.matrix @ self.embedder.encode(q_tokens)
        return {i: float(sims[r]) for i, r in self.row.items() if sims[r] > 0}

    def infer_cpc(self, q_tokens: list[str], top: int = 10) -> Counter:
        votes: Counter = Counter()
        ranked = sorted(self.bm25(q_tokens).items(), key=lambda x: -x[1])[:top]
        for i, s in ranked:
            for g in self.groups[i]:
                votes[g] += s
        return votes

    def cpc_scores(self, groups: Counter) -> dict[str, float]:
        total = sum(groups.values()) or 1.0
        out = {}
        for i, gs in self.groups.items():
            s = sum(groups[g] for g in gs if g in groups) / total
            if s > 0:
                out[i] = s
        return out

    # -- public search ------------------------------------------------------
    def search(
        self,
        query: str,
        k: int = 10,
        mode: str = "hybrid",
        cpc_hints: Optional[list[str]] = None,
        exclude: Optional[set[str]] = None,
        allow: Optional[set[str]] = None,
    ) -> list[Hit]:
        if mode not in self.METHODS:
            raise ValueError(f"mode must be one of {self.METHODS}")
        q = tokenize(query)
        if not q:
            return []
        groups = Counter({cpc_group(c): 1.0 for c in cpc_hints}) if cpc_hints else self.infer_cpc(q)
        comps: dict[str, dict[str, float]] = {}
        if mode in ("bm25", "hybrid"):
            comps["bm25"] = self.bm25(q)
        if mode in ("embedding", "hybrid"):
            comps["embedding"] = self.embedding(q)
        if mode in ("cpc", "hybrid"):
            cs = self.cpc_scores(groups)
            # CPC alone is coarse, so break ties inside a class with BM25.
            bm = self.bm25(q)
            comps["cpc"] = {i: s + 1e-3 * bm.get(i, 0) for i, s in cs.items()}

        def keep(i: str) -> bool:
            return (not exclude or i not in exclude) and (allow is None or i in allow)

        if mode != "hybrid":
            only = comps[mode]
            ranked = sorted(((i, s) for i, s in only.items() if keep(i)), key=lambda x: -x[1])[:k]
            return [Hit(i, s, {mode: s}) for i, s in ranked]

        fused: dict[str, float] = defaultdict(float)
        detail: dict[str, dict[str, float]] = defaultdict(dict)
        for name, scores in comps.items():
            ranked = sorted(((i, s) for i, s in scores.items() if keep(i)), key=lambda x: -x[1])
            for r, (i, s) in enumerate(ranked, 1):
                fused[i] += 1.0 / (60 + r)
                detail[i][name] = s
        top = sorted(fused.items(), key=lambda x: -x[1])[:k]
        return [Hit(i, s, detail[i]) for i, s in top]

    # -- explainable overlap ------------------------------------------------
    def claim_coverage(self, patent_id: str, idea: str) -> tuple[float, list[str]]:
        """idf-weighted share of the patent's first claim terms that appear in the idea text."""
        p = self.patents[patent_id]
        claim = p.claims[0] if p.claims else p.abstract
        terms = set(tokenize(claim))
        if not terms:
            return 0.0, []
        idea_terms = set(tokenize(idea))
        w = lambda t: self.idf.get(t, math.log(1 + self.n))
        total = sum(w(t) for t in terms)
        matched = sorted((t for t in terms if t in idea_terms), key=lambda t: -w(t))
        return sum(w(t) for t in matched) / total, matched

    def idea_coverage(self, patent_id: str, idea: str) -> float:
        """idf-weighted share of the idea's terms found anywhere in the patent. Catches lay wording that
        misses the claim's technical vocabulary, so triage errs towards flagging."""
        terms = set(tokenize(idea))
        if not terms:
            return 0.0
        have = set(self.tokens[patent_id])
        if len(terms & have) < 3:  # a couple of shared common words is not overlap
            return 0.0
        w = lambda t: self.idf.get(t, math.log(1 + self.n))
        return sum(w(t) for t in terms if t in have) / sum(w(t) for t in terms)

    def cosine(self, a: str, b: str) -> float:
        return float(self.matrix[self.row[a]] @ self.matrix[self.row[b]])
