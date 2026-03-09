from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
import secrets
import string

from ..database import get_db
from ..models import User
from ..auth import require_admin, hash_password
from ..utils.config import MAX_USERS, APP_BASE_URL
from ..services.mailer import send_invite_email, is_mail_configured

router = APIRouter()


class InviteRequest(BaseModel):
    email: str
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
    if not is_mail_configured():
        raise HTTPException(
            status_code=500,
            detail="Email service is not configured. Add BREVO_API_KEY + SMTP_FROM_EMAIL (or SMTP settings) in backend/.env first.",
        )

    email = req.email.strip().lower()
    if email == admin.email.lower():
        raise HTTPException(status_code=400, detail="Cannot invite the admin email.")

    non_admin_count = db.query(User).filter(User.role != "admin", User.is_active.is_(True)).count()
    if non_admin_count >= MAX_USERS:
        raise HTTPException(
            status_code=400, detail=f"Maximum {MAX_USERS} users allowed."
        )

    existing = db.query(User).filter(User.email == email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered.")

    alphabet = string.ascii_letters + string.digits + "!@#$%^&*"
    temp_password = "".join(secrets.choice(alphabet) for _ in range(14))

    user = User(
        email=email,
        password_hash=hash_password(temp_password),
        display_name=req.display_name or email.split("@")[0],
        role="user",
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    invite_body = (
        f"Hello {user.display_name},\n\n"
        "You have been invited to StudyAI.\n\n"
        f"Login URL: {APP_BASE_URL}\n"
        f"Email: {email}\n"
        f"Temporary Password: {temp_password}\n\n"
        "Please login and change your password immediately.\n\n"
        "Regards,\nStudyAI Admin"
    )
    try:
        send_invite_email(
            to_email=email,
            subject="You are invited to StudyAI",
            body=invite_body,
        )
    except Exception:
        db.delete(user)
        db.commit()
        raise HTTPException(status_code=502, detail="Failed to send invite email. User was not created.")

    return {
        "message": f"Invite sent to {email}.",
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
