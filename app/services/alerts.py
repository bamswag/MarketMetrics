from __future__ import annotations

from datetime import datetime
from typing import Dict, List, Optional, Tuple

from sqlalchemy import case, func
from sqlalchemy.orm import Session

from app.orm_models.price_alert import PriceAlertDB
from app.schemas.alerts import AlertStatus, PriceAlertCreate


def create_alert(db: Session, user_id: str, payload: PriceAlertCreate) -> PriceAlertDB:
    existing = (
        db.query(PriceAlertDB)
        .filter(
            PriceAlertDB.userID == user_id,
            PriceAlertDB.symbol == payload.symbol,
            PriceAlertDB.condition == payload.condition.value,
            PriceAlertDB.targetPrice == payload.targetPrice,
        )
        .first()
    )
    if existing:
        raise ValueError(
            f"You already have an alert for {payload.symbol} "
            f"{payload.condition.value} ${payload.targetPrice:.2f}"
        )

    alert = PriceAlertDB(
        userID=user_id,
        symbol=payload.symbol,
        condition=payload.condition.value,
        targetPrice=payload.targetPrice,
        isActive=True,
    )
    db.add(alert)
    db.commit()
    db.refresh(alert)
    return alert


def list_alerts(
    db: Session,
    user_id: str,
    *,
    limit: Optional[int] = None,
    offset: int = 0,
) -> List[PriceAlertDB]:
    query = (
        db.query(PriceAlertDB)
        .filter(PriceAlertDB.userID == user_id)
        .order_by(PriceAlertDB.createdAt.desc())
    )
    if offset:
        query = query.offset(offset)
    if limit is not None:
        query = query.limit(limit)
    return query.all()


def get_alert_counts_for_symbols(
    db: Session,
    user_id: str,
    symbols: List[str],
) -> Dict[str, Tuple[int, int, int]]:
    """Return {symbol: (total, active, triggered)} aggregated in one SQL query."""
    if not symbols:
        return {}

    active_expr = case((PriceAlertDB.isActive.is_(True), 1), else_=0)
    triggered_expr = case(
        (
            (PriceAlertDB.isActive.is_(False)) & (PriceAlertDB.triggeredAt.is_not(None)),
            1,
        ),
        else_=0,
    )

    rows = (
        db.query(
            PriceAlertDB.symbol,
            func.count(PriceAlertDB.id),
            func.sum(active_expr),
            func.sum(triggered_expr),
        )
        .filter(
            PriceAlertDB.userID == user_id,
            PriceAlertDB.symbol.in_(symbols),
        )
        .group_by(PriceAlertDB.symbol)
        .all()
    )
    return {
        row[0]: (int(row[1] or 0), int(row[2] or 0), int(row[3] or 0))
        for row in rows
    }


def list_alerts_for_symbols(db: Session, user_id: str, symbols: list[str]) -> List[PriceAlertDB]:
    if not symbols:
        return []

    return (
        db.query(PriceAlertDB)
        .filter(
            PriceAlertDB.userID == user_id,
            PriceAlertDB.symbol.in_(symbols),
        )
        .all()
    )


def list_alerts_by_status(db: Session, user_id: str, status: Optional[AlertStatus]) -> List[PriceAlertDB]:
    query = db.query(PriceAlertDB).filter(PriceAlertDB.userID == user_id)

    if status == AlertStatus.active:
        query = query.filter(PriceAlertDB.isActive.is_(True))
    elif status == AlertStatus.paused:
        query = query.filter(
            PriceAlertDB.isActive.is_(False),
            PriceAlertDB.triggeredAt.is_(None),
        )
    elif status == AlertStatus.triggered:
        query = query.filter(
            PriceAlertDB.isActive.is_(False),
            PriceAlertDB.triggeredAt.is_not(None),
        )

    return query.order_by(PriceAlertDB.createdAt.desc()).all()


def update_alert(
    db: Session,
    user_id: str,
    alert_id: str,
    *,
    is_active: Optional[bool],
    reset_triggered: bool,
    target_price: Optional[float] = None,
    condition: Optional[str] = None,
) -> Optional[PriceAlertDB]:
    alert = (
        db.query(PriceAlertDB)
        .filter(
            PriceAlertDB.id == alert_id,
            PriceAlertDB.userID == user_id,
        )
        .first()
    )
    if not alert:
        return None

    if is_active is not None:
        alert.isActive = is_active

    if reset_triggered:
        alert.isActive = True
        alert.triggeredAt = None

    new_target = target_price if target_price is not None else alert.targetPrice
    new_condition = condition if condition is not None else alert.condition

    if target_price is not None or condition is not None:
        duplicate = (
            db.query(PriceAlertDB)
            .filter(
                PriceAlertDB.id != alert_id,
                PriceAlertDB.userID == user_id,
                PriceAlertDB.symbol == alert.symbol,
                PriceAlertDB.condition == new_condition,
                PriceAlertDB.targetPrice == new_target,
            )
            .first()
        )
        if duplicate:
            raise ValueError(
                f"You already have an alert for {alert.symbol} "
                f"{new_condition} ${new_target:.2f}"
            )

        if target_price is not None:
            alert.targetPrice = target_price
        if condition is not None:
            alert.condition = condition

    alert.updatedAt = datetime.utcnow()
    db.commit()
    db.refresh(alert)
    return alert


def delete_alert(db: Session, user_id: str, alert_id: str) -> bool:
    alert = (
        db.query(PriceAlertDB)
        .filter(
            PriceAlertDB.id == alert_id,
            PriceAlertDB.userID == user_id,
        )
        .first()
    )
    if not alert:
        return False

    db.delete(alert)
    db.commit()
    return True


def evaluate_alerts_for_quote(
    db: Session,
    user_id: str,
    symbol: str,
    price: float,
) -> List[PriceAlertDB]:
    now = datetime.utcnow()
    alerts = (
        db.query(PriceAlertDB)
        .filter(
            PriceAlertDB.userID == user_id,
            PriceAlertDB.symbol == symbol,
            PriceAlertDB.isActive.is_(True),
        )
        .all()
    )

    triggered: List[PriceAlertDB] = []
    for alert in alerts:
        alert.lastEvaluatedAt = now

        if alert.condition == "above" and price >= alert.targetPrice:
            alert.isActive = False
            alert.triggeredAt = now
            triggered.append(alert)
        elif alert.condition == "below" and price <= alert.targetPrice:
            alert.isActive = False
            alert.triggeredAt = now
            triggered.append(alert)

    if alerts:
        db.commit()

    return triggered
