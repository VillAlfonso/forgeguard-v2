"""
Promote a user to admin by email.

Usage (from the backend/ directory):
    python -m app.make_admin user@example.com
    python -m app.make_admin user@example.com --revoke   # remove admin role
"""

import argparse
import sys

from .database import SessionLocal, init_db
from .models import User


def main():
    parser = argparse.ArgumentParser(description="Promote or demote a Revelator user.")
    parser.add_argument("email", help="Email of the user to modify")
    parser.add_argument("--revoke", action="store_true", help="Revoke admin role instead of granting it")
    args = parser.parse_args()

    init_db()  # ensure tables + columns exist
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == args.email).first()
        if not user:
            print(f"No user found with email: {args.email}")
            sys.exit(1)
        user.is_admin = not args.revoke
        db.commit()
        action = "revoked" if args.revoke else "granted"
        print(f"Admin role {action} for {user.email} (id={user.id}, plan={user.plan})")
    finally:
        db.close()


if __name__ == "__main__":
    main()
