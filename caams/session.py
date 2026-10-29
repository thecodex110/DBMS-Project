# Logged-in user for the current run (set by app.py after login)
user = None


def set_user(u):
    global user
    user = u


def is_admin():
    return bool(user) and user['role'] == 'admin'


def faculty_id():
    return user['faculty_id'] if user else None
