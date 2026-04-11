from fastapi import APIRouter, Depends, HTTPException, Query, status
from typing import Optional

from sqlalchemy.orm import Session

from app.core.auth_dependencies import get_current_user
from app.core.db_dependencies import get_db
from app.orm_models.user import UserDB
from app.schemas.alerts import (
    AlertListResponse,
    AlertStatus,
    PriceAlertCreate,
    PriceAlertOut,
    PriceAlertUpdate,
)
from app.services.alerts import (
    create_alert,
    delete_alert,
    list_alerts,
    list_alerts_by_status,
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
    db: Session = Depends(get_db),
    current_user: UserDB = Depends(get_current_user),
):
    alerts = list_alerts_by_status(db, current_user.userID, status_filter)
    active_alerts = [alert for alert in alerts if alert.isActive]
    triggered_alerts = [alert for alert in alerts if not alert.isActive and alert.triggeredAt is not None]

    return AlertListResponse(
        activeAlerts=[PriceAlertOut.model_validate(alert) for alert in active_alerts],
        triggeredAlerts=[PriceAlertOut.model_validate(alert) for alert in triggered_alerts],
        totalCount=len(alerts),
        activeCount=len(active_alerts),
        triggeredCount=len(triggered_alerts),
    )


@router.get("/triggered", response_model=list[PriceAlertOut])
def list_triggered_price_alerts(
    db: Session = Depends(get_db),
    current_user: UserDB = Depends(get_current_user),
):
    alerts = list_alerts_by_status(db, current_user.userID, AlertStatus.triggered)
    return [PriceAlertOut.model_validate(alert) for alert in alerts]


@router.patch("/{alert_id}", response_model=PriceAlertOut)
def update_price_alert(
    alert_id: str,
    payload: PriceAlertUpdate,
    db: Session = Depends(get_db),
    current_user: UserDB = Depends(get_current_user),
):
    alert = update_alert(
        db,
        current_user.userID,
        alert_id,
        is_active=payload.isActive,
        reset_triggered=payload.resetTriggered,
    )
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
