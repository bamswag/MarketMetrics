from fastapi import APIRouter, Depends, HTTPException, Query, status
from typing import Optional

from sqlalchemy.orm import Session

from app.core.auth_dependencies import get_current_user
from app.core.db_dependencies import get_db
from app.orm_models.user import UserDB
from app.schemas.alerts import (
    AlertEventOut,
    AlertHistoryListResponse,
    AlertListResponse,
    AlertStatus,
    BulkAlertAction,
    PriceAlertCreate,
    PriceAlertOut,
    PriceAlertUpdate,
)
from app.services.alerts import (
    bulk_update_alerts,
    create_alert,
    delete_alert,
    get_alert_history,
    get_recent_alert_events,
    list_alerts,
    list_alerts_by_status,
    list_alerts_for_symbols,
    update_alert,
)

router = APIRouter(prefix="/alerts", tags=["alerts"])


@router.post("/", response_model=PriceAlertOut, status_code=status.HTTP_201_CREATED)
def create_price_alert(
    payload: PriceAlertCreate,
    db: Session = Depends(get_db),
    current_user: UserDB = Depends(get_current_user),
):
    try:
        return create_alert(db, current_user.userID, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/", response_model=AlertListResponse)
def list_price_alerts(
    status_filter: Optional[AlertStatus] = Query(default=None, alias="status"),
    symbol: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    current_user: UserDB = Depends(get_current_user),
):
    if symbol:
        alerts = list_alerts_for_symbols(db, current_user.userID, [symbol.upper()])
    else:
        alerts = list_alerts_by_status(db, current_user.userID, status_filter)
    active_alerts = [a for a in alerts if a.isActive]
    paused_alerts = [a for a in alerts if not a.isActive and a.triggeredAt is None]
    triggered_alerts = [a for a in alerts if not a.isActive and a.triggeredAt is not None]

    return AlertListResponse(
        activeAlerts=[PriceAlertOut.model_validate(a) for a in active_alerts],
        pausedAlerts=[PriceAlertOut.model_validate(a) for a in paused_alerts],
        triggeredAlerts=[PriceAlertOut.model_validate(a) for a in triggered_alerts],
        totalCount=len(alerts),
        activeCount=len(active_alerts),
        pausedCount=len(paused_alerts),
        triggeredCount=len(triggered_alerts),
    )


@router.get("/triggered", response_model=list[PriceAlertOut])
def list_triggered_price_alerts(
    db: Session = Depends(get_db),
    current_user: UserDB = Depends(get_current_user),
):
    alerts = list_alerts_by_status(db, current_user.userID, AlertStatus.triggered)
    return [PriceAlertOut.model_validate(alert) for alert in alerts]


@router.get("/history", response_model=AlertHistoryListResponse)
def list_recent_alert_events(
    db: Session = Depends(get_db),
    current_user: UserDB = Depends(get_current_user),
):
    events = get_recent_alert_events(db, current_user.userID)
    return AlertHistoryListResponse(
        events=[AlertEventOut.model_validate(e) for e in events],
        totalCount=len(events),
    )


@router.get("/{alert_id}/history", response_model=AlertHistoryListResponse)
def list_alert_history(
    alert_id: str,
    db: Session = Depends(get_db),
    current_user: UserDB = Depends(get_current_user),
):
    events = get_alert_history(db, current_user.userID, alert_id)
    return AlertHistoryListResponse(
        events=[AlertEventOut.model_validate(e) for e in events],
        totalCount=len(events),
    )


@router.patch("/{alert_id}", response_model=PriceAlertOut)
def update_price_alert(
    alert_id: str,
    payload: PriceAlertUpdate,
    db: Session = Depends(get_db),
    current_user: UserDB = Depends(get_current_user),
):
    try:
        alert = update_alert(
            db,
            current_user.userID,
            alert_id,
            is_active=payload.isActive,
            reset_triggered=payload.resetTriggered,
            target_price=payload.targetPrice,
            condition=payload.condition.value if payload.condition else None,
            severity=payload.severity.value if payload.severity else None,
            expires_at=payload.expiresAt,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    return alert


@router.delete("/{alert_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_price_alert(
    alert_id: str,
    db: Session = Depends(get_db),
    current_user: UserDB = Depends(get_current_user),
):
    deleted = delete_alert(db, current_user.userID, alert_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Alert not found")
    return


@router.post("/bulk", status_code=status.HTTP_200_OK)
def bulk_alert_action(
    payload: BulkAlertAction,
    db: Session = Depends(get_db),
    current_user: UserDB = Depends(get_current_user),
):
    count = bulk_update_alerts(
        db, current_user.userID, payload.alertIds, payload.action,
    )
    return {"affected": count, "action": payload.action}
