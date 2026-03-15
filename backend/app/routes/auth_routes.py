from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import User
from ..auth import verify_password, create_token, get_current_user, hash_password
from ..utils.config import ADMIN_EMAIL, ADMIN_PASSWORD

router = APIRouter()


class LoginRequest(BaseModel):
    email: str
    password: str


@router.post("/login")
def login(req: LoginRequest, db: Session = Depends(get_db)):
    email = (req.email or "").strip().lower()
    user = db.query(User).filter(
        User.email == email, User.is_active.is_(True)
    ).first()

    # Deterministic admin login: env admin password always works for admin account.
    if email == ADMIN_EMAIL.lower() and req.password == ADMIN_PASSWORD:
        if not user:
            user = User(
                email=ADMIN_EMAIL,
                password_hash=hash_password(ADMIN_PASSWORD),
                display_name="Admin",
                role="admin",
                is_active=True,
            )
            db.add(user)
            db.commit()
            db.refresh(user)
        elif user.role == "admin":
            user.password_hash = hash_password(ADMIN_PASSWORD)
            user.is_active = True
            db.commit()
            db.refresh(user)
        else:
            raise HTTPException(status_code=403, detail="Admin credentials mismatch for this account.")
    elif not user or not verify_password(req.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = create_token(user)
    return {
        "token": token,
        "user": {
            "id": user.id,
            "email": user.email,
            "display_name": user.display_name or user.email.split("@")[0],
            "role": user.role,
        },
    }


@router.get("/me")
def me(user: User = Depends(get_current_user)):
    return {
        "id": user.id,
        "email": user.email,
        "display_name": user.display_name or user.email.split("@")[0],
        "role": user.role,
    }
