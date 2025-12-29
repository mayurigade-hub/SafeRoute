import firebase_admin
from firebase_admin import credentials, firestore
import os

# Initialize Firebase Admin SDK
# Expects serviceAccountKey.json to be in the same directory
cred_path = os.path.join(os.path.dirname(__file__), 'serviceAccountKey.json')

if os.path.exists(cred_path):
    cred = credentials.Certificate(cred_path)
    if not firebase_admin._apps:
        firebase_admin.initialize_app(cred)
    db = firestore.client()
    print("Firebase initialized successfully.")
else:
    print("Warning: serviceAccountKey.json not found. Firebase features will not work.")
    db = None
