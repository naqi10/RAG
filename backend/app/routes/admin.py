from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import User
from ..auth import require_admin, hash_password
from ..utils.config import MAX_USERS

router = APIRouter()


class InviteRequest(BaseModel):
    email: str
    password: str
    display_name: str = ""


@router.get("/users")
def list_users(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    users = db.query(User).all()
    return {
        "users": [
            {
                "id": u.id,
                "email": u.email,
                "display_name": u.display_name,
                "role": u.role,
                "is_active": u.is_active,
                "created_at": u.created_at.isoformat() if u.created_at else None,
            }
            for u in users
        ],
        "max_users": MAX_USERS,
    }


@router.post("/users/invite")
def invite_user(
    req: InviteRequest,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    non_admin_count = db.query(User).filter(User.role != "admin", User.is_active.is_(True)).count()
    if non_admin_count >= MAX_USERS:
        raise HTTPException(
            status_code=400, detail=f"Maximum {MAX_USERS} users allowed."
        )

    existing = db.query(User).filter(User.email == req.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered.")

    user = User(
        email=req.email,
        password_hash=hash_password(req.password),
        display_name=req.display_name or req.email.split("@")[0],
        role="user",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return {
        "message": f"User {req.email} created successfully.",
        "user": {
            "id": user.id,
            "email": user.email,
            "display_name": user.display_name,
            "role": user.role,
        },
    }


@router.delete("/users/{user_id}")
def deactivate_user(
    user_id: str,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    if user.role == "admin":
        raise HTTPException(status_code=400, detail="Cannot deactivate admin.")
    user.is_active = False
    db.commit()
    return {"message": f"User {user.email} deactivated."}


@router.patch("/users/{user_id}/activate")
def activate_user(
    user_id: str,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    user.is_active = True
    db.commit()
    return {"message": f"User {user.email} activated."}
