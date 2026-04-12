from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.auth_dependencies import get_current_user
from app.core.db_dependencies import get_db
from app.orm_models.user import UserDB
from app.schemas.watchlists import WatchlistCreate, WatchlistItemDetailedOut, WatchlistItemOut
from app.services.watchlist_enrichment import get_watchlist_items_detailed
from app.services.watchlists import (
    add_watchlist_item,
    delete_watchlist_item,
)

router = APIRouter(prefix="/watchlist", tags=["watchlist"])


@router.post("/", response_model=WatchlistItemOut, status_code=status.HTTP_201_CREATED)
def create_watchlist_item(
    payload: WatchlistCreate,
    db: Session = Depends(get_db),
    current_user: UserDB = Depends(get_current_user),
):
    try:
        return add_watchlist_item(db, current_user.userID, payload.symbol)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/", response_model=list[WatchlistItemDetailedOut])
async def list_watchlist_items(
    db: Session = Depends(get_db),
    current_user: UserDB = Depends(get_current_user),
):
    return await get_watchlist_items_detailed(db, current_user.userID)


@router.delete("/{symbol:path}", status_code=status.HTTP_204_NO_CONTENT)
def remove_watchlist_item(
    symbol: str,
    db: Session = Depends(get_db),
    current_user: UserDB = Depends(get_current_user),
):
    deleted = delete_watchlist_item(db, current_user.userID, symbol)
    if not deleted:
        raise HTTPException(status_code=404, detail="Symbol not found in watchlist")
    return
