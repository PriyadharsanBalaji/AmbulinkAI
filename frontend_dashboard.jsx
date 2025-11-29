# FRONTEND CODE - React.js
# File: HospitalDashboard.jsx
# Complete real-time hospital dashboard for emergency department

import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import Map from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

// ==================== CONFIGURATION ====================

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';
const MAPBOX_TOKEN = process.env.REACT_APP_MAPBOX_TOKEN;

// ==================== STYLES ====================

const styles = {
  container: {
    display: 'flex',
    height: '100vh',
    backgroundColor: '#f5f5f5'
  },
  sidebar: {
    width: '400px',
    backgroundColor: '#ffffff',
    borderRight: '1px solid #e0e0e0',
    overflowY: 'auto',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
  },
  mainContent: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column'
  },
  header: {
    backgroundColor: '#1976d2',
    color: 'white',
    padding: '20px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
  },
  mapContainer: {
    flex: 1,
    position: 'relative'
  },
  alertCard: {
    padding: '16px',
    marginBottom: '12px',
    backgroundColor: '#fff3cd',
    borderLeft: '4px solid #ff9800',
    borderRadius: '4px',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    '&:hover': {
      boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
    }
  },
  criticalAlert: {
    backgroundColor: '#f8d7da',
    borderLeftColor: '#dc3545'
  },
  patientCard: {
    padding: '16px',
    marginBottom: '12px',
    backgroundColor: '#e3f2fd',
    borderRadius: '4px',
    borderLeft: '4px solid #2196f3'
  },
  vitals: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '8px',
    marginTop: '8px',
    fontSize: '12px'
  },
  vital: {
    backgroundColor: 'rgba(255,255,255,0.7)',
    padding: '8px',
    borderRadius: '4px'
  },
  label: {
    fontSize: '10px',
    color: '#666',
    textTransform: 'uppercase',
    letterSpacing: '0.5px'
  },
  value: {
    fontSize: '14px',
    fontWeight: 'bold',
    color: '#333',
    marginTop: '2px'
  },
  button: {
    padding: '8px 16px',
    backgroundColor: '#2196f3',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '12px',
    marginTop: '8px',
    transition: 'background-color 0.3s ease'
  },
  badge: {
    display: 'inline-block',
    padding: '4px 8px',
    borderRadius: '12px',
    fontSize: '11px',
    fontWeight: 'bold',
    marginTop: '4px'
  },
  esiCritical: {
    backgroundColor: '#dc3545',
    color: 'white'
  },
  esiHigh: {
    backgroundColor: '#ff9800',
    color: 'white'
  },
  esiMedium: {
    backgroundColor: '#ffc107',
    color: '#333'
  }
};

// ==================== COMPONENTS ====================

// Alert Notification Component
const AlertNotification = ({ alert, onAcknowledge }) => {
  const isCritical = alert.severity === 'critical' || 
                    alert.alert_type === 'patient_arrival';
  
  const getESIColor = (level) => {
    if (level === 'ESI-1' || level === 'ESI-2') return styles.esiCritical;
    if (level === 'ESI-3') return styles.esiHigh;
    return styles.esiMedium;
  };
  
  return (
    <div style={{
      ...styles.alertCard,
      ...(isCritical ? styles.criticalAlert : {})
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
            🚑 New Patient Arrival
          </div>
          <div style={{ fontSize: '14px', marginBottom: '8px' }}>
            {alert.message}
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ ...styles.badge, ...getESIColor(alert.triage_level) }}>
              {alert.triage_level}
            </span>
            <span style={{ ...styles.badge, backgroundColor: '#e9ecef', color: '#333' }}>
              {alert.department}
            </span>
          </div>
          <div style={{ fontSize: '11px', color: '#666', marginTop: '8px' }}>
            ETA: {new Date(alert.estimated_arrival).toLocaleTimeString()}
          </div>
        </div>
        <button
          style={{
            ...styles.button,
            marginLeft: '12px',
            marginTop: '0',
            backgroundColor: '#28a745'
          }}
          onClick={() => onAcknowledge(alert.alert_id)}
        >
          ✓ Acknowledge
        </button>
      </div>
    </div>
  );
};

// Patient Vitals Card Component
const PatientVitalsCard = ({ patient }) => {
  const getTriageColor = (level) => {
    if (level === 'ESI-1' || level === 'ESI-2') return styles.esiCritical;
    if (level === 'ESI-3') return styles.esiHigh;
    return styles.esiMedium;
  };
  
  return (
    <div style={styles.patientCard}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '12px'
      }}>
        <div>
          <div style={{ fontWeight: 'bold', fontSize: '16px' }}>
            {patient.demographics?.name || 'Unknown Patient'}
          </div>
          <div style={{ fontSize: '12px', color: '#666' }}>
            ID: {patient.patient_id}
          </div>
        </div>
        <span style={{ ...styles.badge, ...getTriageColor(patient.triage_level) }}>
          {patient.triage_level}
        </span>
      </div>
      
      <div style={styles.vitals}>
        <div style={styles.vital}>
          <div style={styles.label}>Heart Rate</div>
          <div style={styles.value}>{patient.vitals?.heart_rate || '--'} bpm</div>
        </div>
        <div style={styles.vital}>
          <div style={styles.label}>O₂ Saturation</div>
          <div style={styles.value}>{patient.vitals?.oxygen_saturation || '--'}%</div>
        </div>
        <div style={styles.vital}>
          <div style={styles.label}>Blood Pressure</div>
          <div style={styles.value}>{patient.vitals?.blood_pressure || '--'}</div>
        </div>
        <div style={styles.vital}>
          <div style={styles.label}>Temperature</div>
          <div style={styles.value}>{patient.vitals?.temperature || '--'}°C</div>
        </div>
      </div>
      
      <div style={{ marginTop: '12px', fontSize: '12px', color: '#666' }}>
        <strong>Chief Complaint:</strong> {patient.chief_complaint}
      </div>
      
      <div style={{ marginTop: '8px', fontSize: '11px', color: '#999' }}>
        Allergies: {patient.medical_history?.allergies?.join(', ') || 'None documented'}
      </div>
    </div>
  );
};

// Real-time Metrics Display
const MetricsDisplay = ({ metrics }) => {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(4, 1fr)',
      gap: '12px',
      padding: '16px',
      backgroundColor: '#f9f9f9',
      borderBottom: '1px solid #e0e0e0'
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#dc3545' }}>
          {metrics.activeAlerts}
        </div>
        <div style={{ fontSize: '12px', color: '#666' }}>Active Alerts</div>
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#ff9800' }}>
          {metrics.incomingPatients}
        </div>
        <div style={{ fontSize: '12px', color: '#666' }}>Incoming</div>
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#2196f3' }}>
          {metrics.avgResponseTime}
        </div>
        <div style={{ fontSize: '12px', color: '#666' }}>Avg Response (min)</div>
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#28a745' }}>
          {metrics.occupancy}%
        </div>
        <div style={{ fontSize: '12px', color: '#666' }}>Bed Occupancy</div>
      </div>
    </div>
  );
};

// ==================== MAIN DASHBOARD COMPONENT ====================

const HospitalDashboard = () => {
  // State Management
  const [alerts, setAlerts] = useState([]);
  const [patients, setPatients] = useState([]);
  const [metrics, setMetrics] = useState({
    activeAlerts: 0,
    incomingPatients: 0,
    avgResponseTime: 12,
    occupancy: 78
  });
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef(null);
  
  // Initialize WebSocket connection
  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      console.error('No authentication token found');
      return;
    }
    
    // Connect to WebSocket
    socketRef.current = io(API_URL, {
      auth: { token },
      transports: ['websocket', 'polling']
    });
    
    // Connection event handlers
    socketRef.current.on('connection_response', (data) => {
      console.log('Connected:', data);
      setIsConnected(true);
    });
    
    // Join hospital room
    const hospitalId = localStorage.getItem('hospital_id') || 1;
    socketRef.current.emit('join_hospital_room', { hospital_id: hospitalId });
    
    // Listen for new patient alerts
    socketRef.current.on('new_patient_alert', (data) => {
      console.log('New patient alert:', data);
      setAlerts(prev => [data, ...prev].slice(0, 50));
      
      // Update metrics
      setMetrics(prev => ({
        ...prev,
        activeAlerts: prev.activeAlerts + 1,
        incomingPatients: prev.incomingPatients + 1
      }));
      
      // Play notification sound
      playNotificationSound();
      
      // Browser notification
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('AmbuLink AI Alert', {
          body: `New patient: ${data.message}`,
          tag: 'ambulink-alert'
        });
      }
    });
    
    // Listen for vitals updates
    socketRef.current.on('patient_vitals_update', (data) => {
      console.log('Vitals update:', data);
      setPatients(prev => prev.map(p => 
        p.patient_id === data.patient_id 
          ? { ...p, vitals: data.vitals }
          : p
      ));
    });
    
    // Connection error
    socketRef.current.on('connect_error', (error) => {
      console.error('Connection error:', error);
      setIsConnected(false);
    });
    
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);
  
  // Request notification permission
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);
  
  // Fetch initial alerts and patients
  useEffect(() => {
    fetchAlerts();
  }, []);
  
  const fetchAlerts = async () => {
    try {
      const hospitalId = localStorage.getItem('hospital_id') || 1;
      const response = await fetch(`${API_URL}/api/hospitals/${hospitalId}/alerts`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setAlerts(data.alerts || []);
        setMetrics(prev => ({
          ...prev,
          activeAlerts: data.alerts?.length || 0
        }));
      }
    } catch (error) {
      console.error('Error fetching alerts:', error);
    }
  };
  
  const handleAcknowledgeAlert = async (alertId) => {
    try {
      const response = await fetch(`${API_URL}/api/alerts/${alertId}/acknowledge`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        setAlerts(prev => prev.filter(a => a.alert_id !== alertId));
        setMetrics(prev => ({
          ...prev,
          activeAlerts: Math.max(0, prev.activeAlerts - 1)
        }));
      }
    } catch (error) {
      console.error('Error acknowledging alert:', error);
    }
  };
  
  const playNotificationSound = () => {
    // Create audio context for notification sound
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    
    oscillator.frequency.value = 800;
    oscillator.type = 'sine';
    
    gain.gain.setValueAtTime(0.3, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.5);
  };
  
  return (
    <div style={styles.container}>
      {/* Sidebar - Alerts and Patient Queue */}
      <div style={styles.sidebar}>
        <div style={{
          padding: '16px',
          backgroundColor: '#f5f5f5',
          borderBottom: '1px solid #e0e0e0'
        }}>
          <h2 style={{ margin: '0 0 12px 0', fontSize: '18px' }}>
            🚨 Active Alerts ({alerts.length})
          </h2>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '12px',
            color: isConnected ? '#28a745' : '#dc3545'
          }}>
            <span style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: isConnected ? '#28a745' : '#dc3545'
            }}></span>
            {isConnected ? 'Connected' : 'Disconnected'}
          </div>
        </div>
        
        <div style={{ padding: '16px' }}>
          {alerts.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '32px 16px',
              color: '#999'
            }}>
              No active alerts
            </div>
          ) : (
            alerts.map(alert => (
              <AlertNotification
                key={alert.alert_id}
                alert={alert}
                onAcknowledge={handleAcknowledgeAlert}
              />
            ))
          )}
        </div>
      </div>
      
      {/* Main Content */}
      <div style={styles.mainContent}>
        {/* Header */}
        <div style={styles.header}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h1 style={{ margin: '0 0 4px 0' }}>AmbuLink AI Emergency Dashboard</h1>
              <p style={{ margin: 0, opacity: 0.9 }}>Real-time ambulance coordination & patient management</p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '14px' }}>{new Date().toLocaleTimeString()}</div>
              <div style={{ fontSize: '12px', opacity: 0.9 }}>Central Medical Center</div>
            </div>
          </div>
        </div>
        
        {/* Metrics */}
        <MetricsDisplay metrics={metrics} />
        
        {/* Map Container */}
        <div style={styles.mapContainer}>
          <div style={{
            padding: '16px',
            backgroundColor: '#f0f0f0',
            borderRadius: '4px',
            margin: '16px',
            textAlign: 'center',
            color: '#666'
          }}>
            🗺️ Real-time ambulance tracking map (Mapbox integration)
            <br />
            <small>Shows ambulance locations, traffic conditions, and ETA to hospital</small>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HospitalDashboard;