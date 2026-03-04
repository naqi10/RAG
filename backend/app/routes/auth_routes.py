from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import User
from ..auth import verify_password, create_token, get_current_user

router = APIRouter()


class LoginRequest(BaseModel):
    email: str
    password: str


@router.post("/login")
def login(req: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(
        User.email == req.email, User.is_active.is_(True)
    ).first()
    if not user or not verify_password(req.password, user.password_hash):
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
