from ..patents import LegalStatus, Patent
from ..schemas import PatentSummary


def summarize(p: Patent, s: LegalStatus) -> PatentSummary:
    return PatentSummary(
        id=p.id, title=p.title, abstract=p.abstract, cpc=p.cpc, assignee=p.assignee,
        filing_date=p.filing_date, grant_date=p.grant_date, status=s.status, expiry_date=s.expiry_date,
        lapse_date=s.lapse_date, lapse_reason=s.lapse_reason, fee_data=s.fee_data, cited_by_count=p.cited_by_count,
        url=p.source_url, synthetic=p.synthetic, mock=p.mock)
