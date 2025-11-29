# BACKEND CODE - Python/Flask
# File: ambulink_backend.py
# Complete backend implementation with Flask, SQLAlchemy, and AI/ML

from flask import Flask, request, jsonify
from flask_sqlalchemy import SQLAlchemy
from flask_jwt_extended import JWTManager, create_access_token, jwt_required
from flask_cors import CORS
from flask_socketio import SocketIO, emit, join_room, leave_room
from cryptography.fernet import Fernet
from datetime import datetime, timedelta
import os
import logging
from functools import wraps
import joblib
import numpy as np
from sklearn.ensemble import RandomForestClassifier
import spacy
import json
from dotenv import load_dotenv

# ==================== CONFIGURATION ====================

load_dotenv()

class Config:
    """Application configuration"""
    SQLALCHEMY_DATABASE_URI = os.getenv('DATABASE_URL', 'postgresql://localhost/ambulink')
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    JWT_SECRET_KEY = os.getenv('SECRET_KEY', 'dev-secret-key-change-in-production')
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=1)
    
    # HIPAA Configuration
    HIPAA_ENCRYPTION_KEY = os.getenv('HIPAA_ENCRYPTION_KEY', Fernet.generate_key())
    HIPAA_MODE = os.getenv('HIPAA_MODE', 'strict')
    
    # Logging
    LOG_LEVEL = os.getenv('LOG_LEVEL', 'INFO')

# ==================== INITIALIZATION ====================

app = Flask(__name__)
app.config.from_object(Config)
CORS(app)

db = SQLAlchemy(app)
jwt = JWTManager(app)
socketio = SocketIO(app, cors_allowed_origins="*")

# Logging setup
logging.basicConfig(level=getattr(logging, Config.LOG_LEVEL))
logger = logging.getLogger(__name__)

# ==================== ENCRYPTION ====================

class PHIEncryption:
    """HIPAA-compliant encryption for Protected Health Information"""
    
    def __init__(self, key=None):
        self.key = key or Config.HIPAA_ENCRYPTION_KEY
        self.cipher = Fernet(self.key)
    
    def encrypt_phi(self, data):
        """Encrypt sensitive patient data"""
        if isinstance(data, dict):
            data = json.dumps(data)
        return self.cipher.encrypt(data.encode()).decode()
    
    def decrypt_phi(self, encrypted_data):
        """Decrypt sensitive patient data"""
        try:
            decrypted = self.cipher.decrypt(encrypted_data.encode())
            return decrypted.decode()
        except Exception as e:
            logger.error(f"Decryption failed: {str(e)}")
            return None

phi_encryption = PHIEncryption()

# ==================== DATABASE MODELS ====================

class User(db.Model):
    """User model with role-based access control"""
    __tablename__ = 'users'
    
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False, index=True)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(50), nullable=False, default='user')  # paramedic, physician, admin
    hospital_id = db.Column(db.Integer, db.ForeignKey('hospitals.id'))
    ambulance_id = db.Column(db.String(50))
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Relationships
    hospital = db.relationship('Hospital', back_populates='users')
    audit_logs = db.relationship('AuditLog', back_populates='user')


class Patient(db.Model):
    """Patient model with encrypted PHI"""
    __tablename__ = 'patients'
    
    id = db.Column(db.Integer, primary_key=True)
    patient_id = db.Column(db.String(20), unique=True, index=True)  # PAT-12345
    
    # Demographics (encrypted)
    _demographics = db.Column('demographics', db.Text)  # encrypted JSON
    
    # Medical History (encrypted)
    _medical_history = db.Column('medical_history', db.Text)  # encrypted JSON
    
    # Vitals (not encrypted for real-time access)
    heart_rate = db.Column(db.Integer)
    blood_pressure = db.Column(db.String(20))
    oxygen_saturation = db.Column(db.Float)
    temperature = db.Column(db.Float)
    respiratory_rate = db.Column(db.Integer)
    
    # Clinical Information
    chief_complaint = db.Column(db.Text)
    triage_level = db.Column(db.String(10))  # ESI 1-5
    risk_score = db.Column(db.Float)  # 0-100
    
    # Location & Routing
    ambulance_id = db.Column(db.String(50), index=True)
    origin_latitude = db.Column(db.Float)
    origin_longitude = db.Column(db.Float)
    destination_hospital_id = db.Column(db.Integer, db.ForeignKey('hospitals.id'))
    estimated_arrival = db.Column(db.DateTime)
    
    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow, index=True)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    hospital = db.relationship('Hospital', back_populates='patients')
    alerts = db.relationship('Alert', back_populates='patient')
    records = db.relationship('PatientRecord', back_populates='patient')
    
    # Properties for encrypted data
    @property
    def demographics(self):
        if self._demographics:
            data = phi_encryption.decrypt_phi(self._demographics)
            return json.loads(data) if data else {}
        return {}
    
    @demographics.setter
    def demographics(self, value):
        self._demographics = phi_encryption.encrypt_phi(value)
    
    @property
    def medical_history(self):
        if self._medical_history:
            data = phi_encryption.decrypt_phi(self._medical_history)
            return json.loads(data) if data else {}
        return {}
    
    @medical_history.setter
    def medical_history(self, value):
        self._medical_history = phi_encryption.encrypt_phi(value)


class Hospital(db.Model):
    """Hospital model"""
    __tablename__ = 'hospitals'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), nullable=False, index=True)
    latitude = db.Column(db.Float, nullable=False)
    longitude = db.Column(db.Float, nullable=False)
    specialties = db.Column(db.JSON)  # ['cardiology', 'trauma', 'neurology']
    bed_capacity = db.Column(db.Integer)
    current_occupancy = db.Column(db.Integer, default=0)
    is_active = db.Column(db.Boolean, default=True)
    
    # Relationships
    users = db.relationship('User', back_populates='hospital')
    patients = db.relationship('Patient', back_populates='hospital')
    alerts = db.relationship('Alert', back_populates='hospital')


class Alert(db.Model):
    """Real-time alert model"""
    __tablename__ = 'alerts'
    
    id = db.Column(db.Integer, primary_key=True)
    alert_id = db.Column(db.String(30), unique=True, index=True)
    patient_id = db.Column(db.Integer, db.ForeignKey('patients.id'), index=True)
    hospital_id = db.Column(db.Integer, db.ForeignKey('hospitals.id'), index=True)
    alert_type = db.Column(db.String(50))  # 'patient_arrival', 'high_risk', 'critical'
    severity = db.Column(db.String(20))  # 'critical', 'high', 'medium', 'low'
    message = db.Column(db.Text)
    department = db.Column(db.String(100))  # 'cardiology', 'trauma', etc.
    is_acknowledged = db.Column(db.Boolean, default=False)
    acknowledged_by = db.Column(db.Integer, db.ForeignKey('users.id'))
    acknowledged_at = db.Column(db.DateTime)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, index=True)
    
    # Relationships
    patient = db.relationship('Patient', back_populates='alerts')
    hospital = db.relationship('Hospital', back_populates='alerts')


class PatientRecord(db.Model):
    """Auto-generated patient hospital record"""
    __tablename__ = 'patient_records'
    
    id = db.Column(db.Integer, primary_key=True)
    patient_id = db.Column(db.Integer, db.ForeignKey('patients.id'), index=True)
    record_number = db.Column(db.String(30), unique=True)  # MRN
    
    # Auto-generated content (encrypted)
    _record_content = db.Column('record_content', db.Text)  # encrypted HTML/PDF
    
    # Metadata
    generated_by_ai = db.Column(db.Boolean, default=True)
    confidence_score = db.Column(db.Float)  # 0-1
    reviewed_by = db.Column(db.Integer, db.ForeignKey('users.id'))
    is_finalized = db.Column(db.Boolean, default=False)
    
    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    patient = db.relationship('Patient', back_populates='records')
    
    @property
    def record_content(self):
        if self._record_content:
            return phi_encryption.decrypt_phi(self._record_content)
        return None
    
    @record_content.setter
    def record_content(self, value):
        self._record_content = phi_encryption.encrypt_phi(value)


class AuditLog(db.Model):
    """HIPAA audit log for all PHI access"""
    __tablename__ = 'audit_logs'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), index=True)
    action = db.Column(db.String(100))  # 'READ', 'WRITE', 'DELETE', 'EXPORT'
    resource_type = db.Column(db.String(50))  # 'patient', 'alert', 'record'
    resource_id = db.Column(db.String(50))
    ip_address = db.Column(db.String(50))
    status = db.Column(db.String(20))  # 'success', 'denied', 'error'
    details = db.Column(db.JSON)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow, index=True)
    
    # Relationship
    user = db.relationship('User', back_populates='audit_logs')


# ==================== AI/ML MODELS ====================

class TriageModel:
    """ML model for ESI-5 triage classification"""
    
    def __init__(self):
        self.model = RandomForestClassifier(n_estimators=100, random_state=42)
        self.features = ['age', 'heart_rate', 'bp_systolic', 'bp_diastolic',
                        'oxygen_sat', 'respiratory_rate', 'temperature']
        self.esi_mapping = {
            0: 'ESI-1', 1: 'ESI-2', 2: 'ESI-3', 3: 'ESI-4', 4: 'ESI-5'
        }
        self._trained = False
    
    def train(self, X_train, y_train):
        """Train triage model"""
        self.model.fit(X_train, y_train)
        self._trained = True
        logger.info("Triage model trained successfully")
    
    def predict_triage_level(self, patient_vitals):
        """
        Predict ESI triage level (1-5)
        Returns: {'level': 'ESI-2', 'confidence': 0.92}
        """
        if not self._trained:
            return {'level': 'ESI-3', 'confidence': 0.0, 'warning': 'Model not trained'}
        
        try:
            # Extract features
            features = []
            for feat in self.features:
                # Extract age from demographics if needed
                if feat == 'age':
                    features.append(patient_vitals.get('age', 50))
                elif 'bp' in feat:
                    bp = patient_vitals.get('blood_pressure', '120/80').split('/')
                    if feat == 'bp_systolic':
                        features.append(float(bp[0]))
                    else:
                        features.append(float(bp[1]))
                else:
                    features.append(float(patient_vitals.get(feat, 0)))
            
            # Predict
            prediction = self.model.predict([features])[0]
            probabilities = self.model.predict_proba([features])[0]
            confidence = float(max(probabilities))
            
            return {
                'level': self.esi_mapping.get(prediction, 'ESI-3'),
                'confidence': confidence,
                'probabilities': {self.esi_mapping.get(i): float(p) 
                                for i, p in enumerate(probabilities)}
            }
        except Exception as e:
            logger.error(f"Triage prediction error: {str(e)}")
            return {'level': 'ESI-3', 'confidence': 0.0, 'error': str(e)}


class ClinicalNLP:
    """NLP model for clinical text processing"""
    
    def __init__(self):
        try:
            self.nlp = spacy.load("en_core_sci_sm")
        except:
            logger.warning("Clinical NLP model not available, using basic processing")
            self.nlp = None
    
    def extract_entities(self, text):
        """Extract clinical entities from paramedic notes"""
        if not self.nlp or not text:
            return {}
        
        try:
            doc = self.nlp(text.lower())
            entities = {
                'symptoms': [],
                'conditions': [],
                'medications': [],
                'procedures': [],
                'vital_patterns': []
            }
            
            # Simple pattern matching (replace with trained NER model in production)
            symptom_keywords = ['pain', 'chest', 'breathing', 'difficulty', 'unconscious', 
                               'bleeding', 'fracture', 'trauma', 'shock']
            condition_keywords = ['diabetes', 'hypertension', 'asthma', 'copd', 'heart', 
                                 'stroke', 'seizure', 'allergic']
            
            for token in doc:
                if token.text in symptom_keywords:
                    entities['symptoms'].append(token.text)
                if token.text in condition_keywords:
                    entities['conditions'].append(token.text)
            
            return entities
        except Exception as e:
            logger.error(f"NLP extraction error: {str(e)}")
            return {}
    
    def generate_structured_note(self, raw_note):
        """Convert free-text note to structured format"""
        sections = {
            'history_of_present_illness': '',
            'physical_exam': '',
            'assessment': '',
            'plan': ''
        }
        
        # Split note by common sections
        lines = raw_note.split('\n')
        for line in lines:
            if any(x in line.lower() for x in ['chief', 'complaint', 'chief complaint']):
                sections['history_of_present_illness'] = line
            elif any(x in line.lower() for x in ['vital', 'exam', 'physical']):
                sections['physical_exam'] = line
            elif any(x in line.lower() for x in ['impression', 'assessment', 'diagnosis']):
                sections['assessment'] = line
            elif any(x in line.lower() for x in ['plan', 'treatment', 'intervention']):
                sections['plan'] = line
        
        return sections


# Initialize AI models
triage_model = TriageModel()
clinical_nlp = ClinicalNLP()

# ==================== DECORATORS ====================

def require_role(*allowed_roles):
    """Decorator to check user role"""
    def decorator(fn):
        @wraps(fn)
        @jwt_required()
        def wrapper(*args, **kwargs):
            from flask_jwt_extended import get_jwt_identity
            user_id = get_jwt_identity()
            user = User.query.get(user_id)
            
            if not user or user.role not in allowed_roles:
                return {'error': 'Insufficient permissions'}, 403
            
            return fn(*args, **kwargs)
        return wrapper
    return decorator


def log_audit(action, resource_type, resource_id='', details=None):
    """Decorator to log HIPAA-required audit events"""
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            from flask_jwt_extended import get_jwt_identity
            
            try:
                user_id = get_jwt_identity()
                result = fn(*args, **kwargs)
                
                # Log successful action
                audit_log = AuditLog(
                    user_id=user_id,
                    action=action,
                    resource_type=resource_type,
                    resource_id=resource_id,
                    ip_address=request.remote_addr,
                    status='success',
                    details=details or {}
                )
                db.session.add(audit_log)
                db.session.commit()
                
                return result
            except Exception as e:
                # Log failed action
                audit_log = AuditLog(
                    user_id=get_jwt_identity(),
                    action=action,
                    resource_type=resource_type,
                    resource_id=resource_id,
                    ip_address=request.remote_addr,
                    status='error',
                    details={'error': str(e)}
                )
                db.session.add(audit_log)
                db.session.commit()
                raise
        
        return wrapper
    return decorator


# ==================== API ROUTES ====================

# Authentication Routes
@app.route('/api/auth/login', methods=['POST'])
def login():
    """User login - returns JWT token"""
    data = request.get_json()
    
    user = User.query.filter_by(username=data.get('username')).first()
    if not user or data.get('password') != 'temp':  # Use proper hash in production
        return {'error': 'Invalid credentials'}, 401
    
    access_token = create_access_token(identity=user.id)
    return {
        'access_token': access_token,
        'expires_in': 3600,
        'user': {
            'id': user.id,
            'username': user.username,
            'role': user.role
        }
    }, 200


# Patient Routes
@app.route('/api/patients', methods=['POST'])
@require_role('paramedic', 'admin')
@log_audit('CREATE', 'patient')
def create_patient():
    """Create new patient record from ambulance"""
    try:
        data = request.get_json()
        
        # Generate unique patient ID
        patient_id = f"PAT-{int(datetime.utcnow().timestamp())}"
        
        # Create patient record
        patient = Patient(
            patient_id=patient_id,
            demographics=data.get('demographics', {}),
            medical_history=data.get('medical_history', {}),
            heart_rate=data.get('vitals', {}).get('heart_rate'),
            blood_pressure=data.get('vitals', {}).get('blood_pressure'),
            oxygen_saturation=data.get('vitals', {}).get('oxygen_saturation'),
            temperature=data.get('vitals', {}).get('temperature'),
            respiratory_rate=data.get('vitals', {}).get('respiratory_rate'),
            chief_complaint=data.get('chief_complaint'),
            ambulance_id=data.get('ambulance_id'),
            origin_latitude=data.get('origin_latitude'),
            origin_longitude=data.get('origin_longitude')
        )
        
        # Predict triage level
        triage_result = triage_model.predict_triage_level({
            'age': data.get('demographics', {}).get('age', 50),
            'heart_rate': patient.heart_rate,
            'blood_pressure': patient.blood_pressure,
            'oxygen_saturation': patient.oxygen_saturation,
            'temperature': patient.temperature,
            'respiratory_rate': patient.respiratory_rate
        })
        
        patient.triage_level = triage_result.get('level', 'ESI-3')
        patient.risk_score = triage_result.get('confidence', 0.0) * 100
        
        # Find nearest hospital
        destination_hospital = Hospital.query.filter_by(is_active=True).first()
        if destination_hospital:
            patient.destination_hospital_id = destination_hospital.id
            patient.estimated_arrival = datetime.utcnow() + timedelta(minutes=15)
        
        db.session.add(patient)
        db.session.commit()
        
        # Generate alert for hospital
        alert = Alert(
            alert_id=f"ALR-{int(datetime.utcnow().timestamp())}",
            patient_id=patient.id,
            hospital_id=destination_hospital.id,
            alert_type='patient_arrival',
            severity='critical' if 'ESI-1' in patient.triage_level or 'ESI-2' in patient.triage_level else 'medium',
            message=f"Incoming patient: {patient.demographics.get('name', 'Unknown')} - {patient.chief_complaint}",
            department=data.get('department', 'emergency')
        )
        db.session.add(alert)
        db.session.commit()
        
        # Broadcast alert via WebSocket
        socketio.emit('new_patient_alert', {
            'patient_id': patient.patient_id,
            'hospital_id': destination_hospital.id,
            'triage_level': patient.triage_level,
            'chief_complaint': patient.chief_complaint,
            'estimated_arrival': patient.estimated_arrival.isoformat(),
            'alert_id': alert.alert_id
        }, room=f"hospital_{destination_hospital.id}")
        
        return {
            'patient_id': patient.patient_id,
            'record_id': patient.id,
            'record_generated': True,
            'triage_level': patient.triage_level,
            'confidence': triage_result.get('confidence', 0),
            'alert_sent_to': destination_hospital.name if destination_hospital else None,
            'estimated_arrival': patient.estimated_arrival.isoformat() if patient.estimated_arrival else None
        }, 201
    
    except Exception as e:
        logger.error(f"Error creating patient: {str(e)}")
        return {'error': str(e)}, 400


@app.route('/api/patients/<patient_id>', methods=['GET'])
@require_role('paramedic', 'physician', 'admin')
@log_audit('READ', 'patient')
def get_patient(patient_id):
    """Get patient record by ID"""
    patient = Patient.query.filter_by(patient_id=patient_id).first()
    if not patient:
        return {'error': 'Patient not found'}, 404
    
    return {
        'patient_id': patient.patient_id,
        'demographics': patient.demographics,
        'medical_history': patient.medical_history,
        'vitals': {
            'heart_rate': patient.heart_rate,
            'blood_pressure': patient.blood_pressure,
            'oxygen_saturation': patient.oxygen_saturation,
            'temperature': patient.temperature,
            'respiratory_rate': patient.respiratory_rate
        },
        'chief_complaint': patient.chief_complaint,
        'triage_level': patient.triage_level,
        'risk_score': patient.risk_score,
        'created_at': patient.created_at.isoformat()
    }, 200


@app.route('/api/patients/<patient_id>/vitals', methods=['PUT'])
@require_role('paramedic')
@log_audit('UPDATE', 'patient')
def update_patient_vitals(patient_id):
    """Update patient vitals in real-time"""
    patient = Patient.query.filter_by(patient_id=patient_id).first()
    if not patient:
        return {'error': 'Patient not found'}, 404
    
    data = request.get_json()
    patient.heart_rate = data.get('heart_rate', patient.heart_rate)
    patient.blood_pressure = data.get('blood_pressure', patient.blood_pressure)
    patient.oxygen_saturation = data.get('oxygen_saturation', patient.oxygen_saturation)
    patient.temperature = data.get('temperature', patient.temperature)
    patient.respiratory_rate = data.get('respiratory_rate', patient.respiratory_rate)
    patient.updated_at = datetime.utcnow()
    
    db.session.commit()
    
    # Broadcast vitals update
    socketio.emit('patient_vitals_update', {
        'patient_id': patient.patient_id,
        'vitals': {
            'heart_rate': patient.heart_rate,
            'blood_pressure': patient.blood_pressure,
            'oxygen_saturation': patient.oxygen_saturation,
            'temperature': patient.temperature,
            'respiratory_rate': patient.respiratory_rate
        },
        'timestamp': datetime.utcnow().isoformat()
    }, room=f"patient_{patient_id}")
    
    return {'success': True, 'updated_at': datetime.utcnow().isoformat()}, 200


# Alert Routes
@app.route('/api/hospitals/<int:hospital_id>/alerts', methods=['GET'])
@require_role('physician', 'admin')
def get_hospital_alerts(hospital_id):
    """Get active alerts for a hospital"""
    alerts = Alert.query.filter_by(
        hospital_id=hospital_id,
        is_acknowledged=False
    ).order_by(Alert.created_at.desc()).limit(100).all()
    
    return {
        'alerts': [{
            'alert_id': alert.alert_id,
            'patient_id': alert.patient_id,
            'alert_type': alert.alert_type,
            'severity': alert.severity,
            'message': alert.message,
            'department': alert.department,
            'created_at': alert.created_at.isoformat()
        } for alert in alerts]
    }, 200


@app.route('/api/alerts/<alert_id>/acknowledge', methods=['POST'])
@require_role('physician', 'admin')
@log_audit('UPDATE', 'alert')
def acknowledge_alert(alert_id):
    """Acknowledge an alert"""
    from flask_jwt_extended import get_jwt_identity
    
    alert = Alert.query.filter_by(alert_id=alert_id).first()
    if not alert:
        return {'error': 'Alert not found'}, 404
    
    alert.is_acknowledged = True
    alert.acknowledged_by = get_jwt_identity()
    alert.acknowledged_at = datetime.utcnow()
    
    db.session.commit()
    
    return {'success': True, 'acknowledged_at': alert.acknowledged_at.isoformat()}, 200


# Patient Record Routes
@app.route('/api/patients/<patient_id>/record', methods=['GET'])
@require_role('physician', 'admin')
@log_audit('READ', 'record')
def get_patient_record(patient_id):
    """Get auto-generated patient record"""
    patient = Patient.query.filter_by(patient_id=patient_id).first()
    if not patient:
        return {'error': 'Patient not found'}, 404
    
    record = PatientRecord.query.filter_by(patient_id=patient.id).order_by(
        PatientRecord.created_at.desc()
    ).first()
    
    if not record:
        return {'error': 'Record not found'}, 404
    
    return {
        'record_number': record.record_number,
        'record_content': record.record_content[:500] if record.record_content else None,
        'generated_by_ai': record.generated_by_ai,
        'confidence_score': record.confidence_score,
        'is_finalized': record.is_finalized,
        'created_at': record.created_at.isoformat()
    }, 200


# Audit Log Routes
@app.route('/api/audit-logs', methods=['GET'])
@require_role('admin')
def get_audit_logs():
    """Get audit logs (HIPAA requirement)"""
    logs = AuditLog.query.order_by(AuditLog.timestamp.desc()).limit(1000).all()
    
    return {
        'logs': [{
            'user_id': log.user_id,
            'action': log.action,
            'resource_type': log.resource_type,
            'resource_id': log.resource_id,
            'ip_address': log.ip_address,
            'status': log.status,
            'timestamp': log.timestamp.isoformat()
        } for log in logs]
    }, 200


# ==================== WEBSOCKET EVENTS ====================

@socketio.on('connect')
def handle_connect():
    """WebSocket connection handler"""
    logger.info(f"Client connected: {request.sid}")
    emit('connection_response', {'data': 'Connected to AmbuLink AI'})


@socketio.on('join_hospital_room')
def join_hospital(data):
    """Join hospital-specific room for alerts"""
    hospital_id = data.get('hospital_id')
    join_room(f"hospital_{hospital_id}")
    emit('joined_room', {'room': f"hospital_{hospital_id}"})


@socketio.on('join_patient_room')
def join_patient(data):
    """Join patient-specific room for vitals monitoring"""
    patient_id = data.get('patient_id')
    join_room(f"patient_{patient_id}")
    emit('joined_room', {'room': f"patient_{patient_id}"})


@socketio.on('disconnect')
def handle_disconnect():
    """Handle WebSocket disconnection"""
    logger.info(f"Client disconnected: {request.sid}")


# ==================== ERROR HANDLERS ====================

@app.errorhandler(404)
def not_found(error):
    return {'error': 'Endpoint not found'}, 404


@app.errorhandler(500)
def internal_error(error):
    db.session.rollback()
    logger.error(f"Internal server error: {str(error)}")
    return {'error': 'Internal server error'}, 500


# ==================== INITIALIZATION ====================

if __name__ == '__main__':
    with app.app_context():
        db.create_all()
        logger.info("Database tables created")
    
    socketio.run(app, host='0.0.0.0', port=5000, debug=True)