import firebase_admin
from firebase_admin import credentials, firestore
import json
import os

db = None

try:
    firebase_key = os.environ.get("FIREBASE_KEY")

    if not firebase_key:
        raise Exception("FIREBASE_KEY environment variable not set")

    cred_dict = json.loads(firebase_key)
    cred = credentials.Certificate(cred_dict)

    firebase_admin.initialize_app(cred)
    db = firestore.client()
    print("Firebase initialized successfully")

except Exception as e:
    print("Firebase init failed:", e)
