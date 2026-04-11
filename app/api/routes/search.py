from __future__ import annotations

from fastapi import APIRouter, Query
from app.schemas.search import CompanySearchResponse, CompanySearchResult
from app.services.search import build_search_result, search_symbol_catalog

router = APIRouter(prefix="/search", tags=["search"])


@router.get("/companies", response_model=CompanySearchResponse)
async def company_search(
    q: str = Query(..., min_length=1, description="Company name or ticker symbol"),
):
    query = q.strip()
    results = [
        CompanySearchResult(**build_search_result(item))
        for item in search_symbol_catalog(query)
    ]
    return CompanySearchResponse(query=query, results=results)
