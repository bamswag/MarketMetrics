from fastapi import Depends, HTTPException

from app.core.auth_dependencies import get_current_user


def get_current_admin_user(current_user=Depends(get_current_user)):
    if not getattr(current_user, "isAdmin", False):
        raise HTTPException(status_code=403, detail="Admin access required.")
    return current_user
