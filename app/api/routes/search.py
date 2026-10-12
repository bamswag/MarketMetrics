from __future__ import annotations

from fastapi import APIRouter, Query
from app.schemas.search import CompanySearchResponse, CompanySearchResult
from app.services.search import build_search_result, search_symbol_catalog
from app.services.chart_readiness import get_chart_readiness_batch

router = APIRouter(prefix="/search", tags=["search"])


@router.get("/companies", response_model=CompanySearchResponse)
async def company_search(
    q: str = Query(..., min_length=1, description="Company name or ticker symbol"),
):
    query = q.strip()
    candidates = search_symbol_catalog(query, limit=75)
    built = [build_search_result(item) for item in candidates]
    readiness = await get_chart_readiness_batch(result["symbol"] for result in built)
    results = []
    for result in built:
        chart = readiness.get(result["symbol"].upper())
        if not chart or not chart.chartReady:
            continue
        results.append(CompanySearchResult(**result, **chart.model_dump()))
        if len(results) >= 50:
            break
    return CompanySearchResponse(query=query, results=results)
