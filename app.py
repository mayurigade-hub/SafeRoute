from flask import Flask, render_template, request, redirect, url_for, session, jsonify
from firebase_config import db
import os

app = Flask(__name__)
app.secret_key = 'supersecretkey'  # Change this in production

# --- Authentication Routes ---

@app.route('/')
def index():
    if 'user' in session:
        return redirect(url_for('dashboard'))
    return redirect(url_for('login'))

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form['username']
        password = request.form['password']
        
        if db:
            users_ref = db.collection('users')
            query = users_ref.where('username', '==', username).where('password', '==', password).stream()
            user = None
            for doc in query:
                user = doc.to_dict()
                break
            
            if user:
                session['user'] = user
                return redirect(url_for('dashboard'))
            else:
                return render_template('login.html', error="Invalid Credentials")
        else:
             return render_template('login.html', error="Database not connected")

    return render_template('login.html')

@app.route('/signup', methods=['GET', 'POST'])
def signup():
    if request.method == 'POST':
        full_name = request.form['full_name']
        username = request.form['username']
        password = request.form['password']
        age = request.form['age']
        contact = request.form['contact']
        
        # Emergency contacts (expecting list or separate fields, simplifying for now)
        emergency_contacts = []
        if request.form.get('emergency_1'): emergency_contacts.append(request.form.get('emergency_1'))
        if request.form.get('emergency_2'): emergency_contacts.append(request.form.get('emergency_2'))
        if request.form.get('emergency_3'): emergency_contacts.append(request.form.get('emergency_3'))
        
        if len(emergency_contacts) < 2:
             return render_template('signup.html', error="Minimum 2 emergency contacts required")

        if db:
            # Check if username exists
            users_ref = db.collection('users')
            if len(list(users_ref.where('username', '==', username).stream())) > 0:
                 return render_template('signup.html', error="Username already taken")
            
            new_user = {
                'full_name': full_name,
                'username': username,
                'password': password, # In real app, hash this!
                'age': age,
                'contact': contact,
                'emergency_contacts': emergency_contacts
            }
            users_ref.add(new_user)
            
            # Auto-login: Set session then redirect to dashboard
            session['user'] = new_user
            return redirect(url_for('dashboard'))
        else:
             return render_template('signup.html', error="Database not connected")

    return render_template('signup.html')

@app.route('/logout')
def logout():
    session.pop('user', None)
    return redirect(url_for('login'))

# --- Dashboard & Core Features ---

@app.route('/update_contacts', methods=['POST'])
def update_contacts():
    if 'user' not in session:
        return jsonify({'success': False, 'message': 'Not logged in'})
    
    data = request.json
    emergency_contacts = data.get('emergency_contacts', [])
    
    if len(emergency_contacts) < 2:
        return jsonify({'success': False, 'message': 'Minimum 2 contacts required'})
    
    username = session['user']['username']
    
    if db:
        try:
            users_ref = db.collection('users')
            query = users_ref.where('username', '==', username).stream()
            
            for doc in query:
                doc.reference.update({'emergency_contacts': emergency_contacts})
                # Update session as well
                session['user']['emergency_contacts'] = emergency_contacts
                session.modified = True
                return jsonify({'success': True})
            
            return jsonify({'success': False, 'message': 'User not found'})
        except Exception as e:
            return jsonify({'success': False, 'message': str(e)})
    
    return jsonify({'success': False, 'message': 'Database not connected'})

@app.route('/dashboard')
def dashboard():
    if 'user' not in session:
        return redirect(url_for('login'))
    return render_template('dashboard.html', user=session['user'])

if __name__ == '__main__':
    app.run(host="0.0.0.0", port=5000, debug=True)
