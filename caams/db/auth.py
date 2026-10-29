# ============================================================================
#  AUTHENTICATION  - passwords are never stored in plain text.
#  hash = 'pbkdf2$' + PBKDF2-HMAC-SHA256(password, random 16-byte salt, 120000 rounds)
#  (Hashes without the 'pbkdf2$' prefix are scrypt hashes from the old Node.js
#   version; they are still accepted where hashlib.scrypt is available.)
# ============================================================================
import hashlib
import hmac
import os

PREFIX = 'pbkdf2$'
ITERATIONS = 120000


def hash_password(password, salt=None):
    if salt is None:
        salt = os.urandom(16).hex()
    h = hashlib.pbkdf2_hmac('sha256', password.encode(), salt.encode(), ITERATIONS).hex()
    return PREFIX + h, salt


def verify_password(password, hash_, salt):
    if hash_.startswith(PREFIX):
        candidate, _ = hash_password(password, salt)
    elif hasattr(hashlib, 'scrypt'):
        candidate = hashlib.scrypt(password.encode(), salt=salt.encode(), n=16384, r=8, p=1, dklen=64).hex()
    else:
        return False
    return hmac.compare_digest(candidate, hash_)


def login(username, password):
    from . import connection as db
    user = db.get("""SELECT u.username, u.password_hash, u.salt, u.role, u.faculty_id, f.name
                       FROM app_user u LEFT JOIN faculty f ON f.faculty_id = u.faculty_id
                      WHERE u.username = ?""", str(username).strip().lower())
    if not user or not verify_password(password, user['password_hash'], user['salt']):
        return None
    db.run("UPDATE app_user SET last_login = datetime('now', 'localtime') WHERE username = ?", user['username'])
    return {'username': user['username'], 'role': user['role'], 'faculty_id': user['faculty_id'],
            'name': user['name'] or 'Administrator'}
