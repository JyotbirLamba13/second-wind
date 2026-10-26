"""Patent record model and legal-status derivation (US utility patents)."""
from __future__ import annotations

from datetime import date
from typing import Literal, Optional

from pydantic import BaseModel, Field

# Maintenance fees fall due at 3.5, 7.5 and 11.5 years after grant, with a 6 month grace period.
FEE_YEARS = (3.5, 7.5, 11.5)
GRACE_YEARS = 0.5
TERM_YEARS = 20

Status = Literal["in_force", "lapsed", "expired"]


class MaintenanceEvent(BaseModel):
    year: float = Field(description="Fee stage: 3.5, 7.5 or 11.5 years after grant")
    paid: bool
    paid_date: Optional[date] = None


class Patent(BaseModel):
    id: str
    title: str
    abstract: str
    claims: list[str] = Field(default_factory=list)
    cpc: list[str] = Field(default_factory=list)
    filing_date: date
    grant_date: date
    assignee: Optional[str] = None
    family_ids: list[str] = Field(default_factory=list)
    cites: list[str] = Field(default_factory=list)
    cited_by_count: int = 0
    maintenance: list[MaintenanceEvent] = Field(default_factory=list)
    url: Optional[str] = None
    synthetic: bool = False

    @property
    def source_url(self) -> str:
        return self.url or f"https://patents.google.com/patent/{self.id}"

    @property
    def text(self) -> str:
        return " ".join([self.title, self.abstract, *self.claims])


def _add_years(d: date, years: float) -> date:
    whole = int(years)
    frac_days = round((years - whole) * 365.25)
    try:
        base = d.replace(year=d.year + whole)
    except ValueError:  # Feb 29
        base = d.replace(year=d.year + whole, day=28)
    return date.fromordinal(base.toordinal() + frac_days)


class LegalStatus(BaseModel):
    status: Status
    expiry_date: date
    lapse_date: Optional[date] = None
    lapse_reason: Optional[str] = None


def legal_status(p: Patent, today: Optional[date] = None) -> LegalStatus:
    """A patent lapses when a fee is unpaid past its grace window, and expires 20 years from filing."""
    today = today or date.today()
    expiry = _add_years(p.filing_date, TERM_YEARS)
    paid = {round(m.year, 1): m.paid for m in p.maintenance}
    lapse_date = lapse_reason = None
    for stage in FEE_YEARS:
        window_end = _add_years(p.grant_date, stage + GRACE_YEARS)
        if window_end > today:
            break  # later stages are not yet due
        if not paid.get(stage, False):
            lapse_date = window_end
            lapse_reason = f"{stage}-year maintenance fee not paid"
            break
    if lapse_date and lapse_date < expiry:
        status: Status = "lapsed" if lapse_date <= today else "in_force"
        return LegalStatus(status=status, expiry_date=expiry, lapse_date=lapse_date, lapse_reason=lapse_reason)
    if expiry <= today:
        return LegalStatus(status="expired", expiry_date=expiry)
    return LegalStatus(status="in_force", expiry_date=expiry)
