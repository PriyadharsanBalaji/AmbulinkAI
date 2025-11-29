# AMBULANCE MOBILE APP CODE - React Native
# File: AmbulanceApp.js
# Mobile application for paramedics to collect patient data

import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, ScrollView, TouchableOpacity, 
  ActivityIndicator, Alert, PermissionsAndroid, StyleSheet
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import Geolocation from '@react-native-geolocation-service';
import axios from 'axios';

// ==================== CONFIGURATION ====================

const API_URL = 'https://api.ambulink.ai';
const colors = {
  primary: '#1976d2',
  danger: '#dc3545',
  success: '#28a745',
  warning: '#ff9800',
  background: '#f5f5f5',
  white: '#ffffff'
};

// ==================== STYLES ====================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background
  },
  header: {
    backgroundColor: colors.primary,
    padding: 16,
    paddingTop: 24
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.white,
    marginBottom: 4
  },
  headerSubtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.9)'
  },
  section: {
    backgroundColor: colors.white,
    marginHorizontal: 8,
    marginVertical: 8,
    borderRadius: 8,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0'
  },
  formGroup: {
    marginBottom: 12
  },
  label: {
    fontSize: 13,
    fontWeight: '500',
    color: '#555',
    marginBottom: 6
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 6,
    padding: 12,
    fontSize: 14,
    backgroundColor: '#f9f9f9'
  },
  textInputFocused: {
    borderColor: colors.primary,
    backgroundColor: colors.white
  },
  button: {
    backgroundColor: colors.primary,
    padding: 14,
    borderRadius: 6,
    alignItems: 'center',
    marginTop: 8
  },
  buttonDisabled: {
    backgroundColor: '#ccc'
  },
  buttonText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: 'bold'
  },
  row: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12
  },
  column: {
    flex: 1
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    alignSelf: 'flex-start',
    marginTop: 8
  },
  successBadge: {
    backgroundColor: 'rgba(40, 167, 69, 0.2)'
  },
  dangerBadge: {
    backgroundColor: 'rgba(220, 53, 69, 0.2)'
  },
  badgeText: {
    fontSize: 12,
    fontWeight: 'bold'
  },
  successText: {
    color: colors.success
  },
  dangerText: {
    color: colors.danger
  },
  infoText: {
    fontSize: 12,
    color: '#666',
    marginTop: 8
  },
  progressBar: {
    height: 4,
    backgroundColor: '#e0e0e0',
    borderRadius: 2,
    marginVertical: 12,
    overflow: 'hidden'
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  }
});

// ==================== OFFLINE DATA STORAGE ====================

class OfflineDataManager {
  static async savePatientData(data) {
    try {
      const queue = await AsyncStorage.getItem('patient_queue') || '[]';
      const patients = JSON.parse(queue);
      patients.push({
        ...data,
        id: Date.now(),
        synced: false,
        timestamp: new Date().toISOString()
      });
      await AsyncStorage.setItem('patient_queue', JSON.stringify(patients));
      return true;
    } catch (error) {
      console.error('Error saving patient data:', error);
      return false;
    }
  }
  
  static async getSyncQueue() {
    try {
      const queue = await AsyncStorage.getItem('patient_queue') || '[]';
      return JSON.parse(queue).filter(p => !p.synced);
    } catch (error) {
      console.error('Error getting sync queue:', error);
      return [];
    }
  }
  
  static async markAsSynced(patientId) {
    try {
      const queue = await AsyncStorage.getItem('patient_queue') || '[]';
      const patients = JSON.parse(queue);
      const updated = patients.map(p => 
        p.id === patientId ? { ...p, synced: true } : p
      );
      await AsyncStorage.setItem('patient_queue', JSON.stringify(updated));
    } catch (error) {
      console.error('Error marking as synced:', error);
    }
  }
}

// ==================== MAIN APP COMPONENT ====================

const AmbulanceApp = () => {
  // Form State
  const [formData, setFormData] = useState({
    // Demographics
    patientName: '',
    age: '',
    gender: '',
    bloodType: '',
    
    // Medical History
    allergies: '',
    medications: '',
    conditions: '',
    
    // Chief Complaint
    chiefComplaint: '',
    
    // Vitals
    heartRate: '',
    bloodPressure: '',
    oxygenSaturation: '',
    temperature: '',
    respiratoryRate: ''
  });
  
  // App State
  const [isLoading, setIsLoading] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [currentStep, setCurrentStep] = useState(1); // 1: Demographics, 2: Vitals, 3: Complaint, 4: Review
  const [location, setLocation] = useState(null);
  const [syncStatus, setSyncStatus] = useState('idle');
  
  // Initialize location tracking
  useEffect(() => {
    initializeLocation();
    setupNetworkListener();
    setupAutoSync();
  }, []);
  
  const initializeLocation = async () => {
    try {
      // Request location permission for Android
      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
        );
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          Alert.alert('Location permission required for ambulance tracking');
          return;
        }
      }
      
      // Get current location
      Geolocation.getCurrentPosition(
        position => {
          setLocation({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          });
        },
        error => console.error('Location error:', error),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
      );
    } catch (error) {
      console.error('Error initializing location:', error);
    }
  };
  
  const setupNetworkListener = () => {
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsOnline(state.isConnected);
      if (state.isConnected) {
        syncOfflineData();
      }
    });
    return unsubscribe;
  };
  
  const setupAutoSync = () => {
    // Try to sync every 30 seconds when online
    const interval = setInterval(() => {
      if (isOnline) {
        syncOfflineData();
      }
    }, 30000);
    
    return () => clearInterval(interval);
  };
  
  const syncOfflineData = async () => {
    try {
      setSyncStatus('syncing');
      const queue = await OfflineDataManager.getSyncQueue();
      
      for (const patient of queue) {
        try {
          const response = await axios.post(`${API_URL}/api/patients`, patient, {
            headers: {
              'Authorization': `Bearer ${await AsyncStorage.getItem('access_token')}`,
              'Content-Type': 'application/json'
            }
          });
          
          if (response.status === 201) {
            await OfflineDataManager.markAsSynced(patient.id);
            Alert.alert('Success', 'Patient data synced successfully');
          }
        } catch (error) {
          console.error('Error syncing patient:', error);
        }
      }
      
      setSyncStatus('idle');
    } catch (error) {
      console.error('Sync error:', error);
      setSyncStatus('error');
    }
  };
  
  const handleFormChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };
  
  const validateStep = (step) => {
    switch (step) {
      case 1:
        return formData.patientName && formData.age && formData.gender && formData.bloodType;
      case 2:
        return formData.heartRate && formData.bloodPressure && formData.oxygenSaturation && formData.temperature;
      case 3:
        return formData.chiefComplaint;
      default:
        return true;
    }
  };
  
  const handleNextStep = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(currentStep + 1);
    } else {
      Alert.alert('Missing Information', 'Please fill all required fields');
    }
  };
  
  const handlePreviousStep = () => {
    setCurrentStep(Math.max(1, currentStep - 1));
  };
  
  const handleSubmit = async () => {
    setIsLoading(true);
    
    try {
      const patientData = {
        demographics: {
          name: formData.patientName,
          age: parseInt(formData.age),
          gender: formData.gender,
          blood_type: formData.bloodType
        },
        medical_history: {
          allergies: formData.allergies.split(',').map(a => a.trim()),
          medications: formData.medications.split(',').map(m => m.trim()),
          conditions: formData.conditions.split(',').map(c => c.trim())
        },
        vitals: {
          heart_rate: parseInt(formData.heartRate),
          blood_pressure: formData.bloodPressure,
          oxygen_saturation: parseFloat(formData.oxygenSaturation),
          temperature: parseFloat(formData.temperature),
          respiratory_rate: parseInt(formData.respiratoryRate)
        },
        chief_complaint: formData.chiefComplaint,
        ambulance_id: await AsyncStorage.getItem('ambulance_id'),
        origin_latitude: location?.latitude,
        origin_longitude: location?.longitude
      };
      
      if (isOnline) {
        // Send online
        const response = await axios.post(`${API_URL}/api/patients`, patientData, {
          headers: {
            'Authorization': `Bearer ${await AsyncStorage.getItem('access_token')}`,
            'Content-Type': 'application/json'
          }
        });
        
        Alert.alert('Success', `Patient record created: ${response.data.patient_id}`);
      } else {
        // Save offline
        const saved = await OfflineDataManager.savePatientData(patientData);
        if (saved) {
          Alert.alert('Saved Locally', 'Patient data saved. Will sync when online.');
        }
      }
      
      // Reset form
      setFormData({
        patientName: '', age: '', gender: '', bloodType: '',
        allergies: '', medications: '', conditions: '',
        chiefComplaint: '',
        heartRate: '', bloodPressure: '', oxygenSaturation: '', 
        temperature: '', respiratoryRate: ''
      });
      setCurrentStep(1);
    } catch (error) {
      console.error('Error submitting patient data:', error);
      Alert.alert('Error', 'Failed to submit patient data. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };
  
  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>🚑 AmbuLink Ambulance</Text>
        <Text style={styles.headerSubtitle}>
          Patient Data Collection • {isOnline ? '🟢 Online' : '🔴 Offline'}
        </Text>
      </View>
      
      {/* Progress Bar */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Step {currentStep} of 4</Text>
        <View style={styles.progressBar}>
          <View style={{
            ...styles.progressFill,
            width: `${(currentStep / 4) * 100}%`
          }} />
        </View>
      </View>
      
      <ScrollView style={{ flex: 1, padding: 8 }}>
        {/* Step 1: Demographics */}
        {currentStep === 1 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>👤 Patient Demographics</Text>
            
            <View style={styles.formGroup}>
              <Text style={styles.label}>Patient Name *</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Full name"
                value={formData.patientName}
                onChangeText={(value) => handleFormChange('patientName', value)}
              />
            </View>
            
            <View style={styles.row}>
              <View style={styles.column}>
                <Text style={styles.label}>Age (years) *</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="45"
                  keyboardType="numeric"
                  value={formData.age}
                  onChangeText={(value) => handleFormChange('age', value)}
                />
              </View>
              <View style={styles.column}>
                <Text style={styles.label}>Gender *</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="M/F/O"
                  value={formData.gender}
                  onChangeText={(value) => handleFormChange('gender', value)}
                />
              </View>
            </View>
            
            <View style={styles.formGroup}>
              <Text style={styles.label}>Blood Type *</Text>
              <TextInput
                style={styles.textInput}
                placeholder="O+, AB-, etc."
                value={formData.bloodType}
                onChangeText={(value) => handleFormChange('bloodType', value)}
              />
            </View>
          </View>
        )}
        
        {/* Step 2: Medical History */}
        {currentStep === 2 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>📋 Medical History</Text>
            
            <View style={styles.formGroup}>
              <Text style={styles.label}>Allergies (comma-separated)</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Penicillin, Peanuts"
                value={formData.allergies}
                onChangeText={(value) => handleFormChange('allergies', value)}
              />
            </View>
            
            <View style={styles.formGroup}>
              <Text style={styles.label}>Current Medications</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Aspirin, Lisinopril"
                value={formData.medications}
                onChangeText={(value) => handleFormChange('medications', value)}
              />
            </View>
            
            <View style={styles.formGroup}>
              <Text style={styles.label}>Chronic Conditions</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Diabetes, Hypertension"
                value={formData.conditions}
                onChangeText={(value) => handleFormChange('conditions', value)}
              />
            </View>
          </View>
        )}
        
        {/* Step 3: Vitals */}
        {currentStep === 3 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>❤️ Vital Signs</Text>
            
            <View style={styles.row}>
              <View style={styles.column}>
                <Text style={styles.label}>Heart Rate (bpm) *</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="92"
                  keyboardType="numeric"
                  value={formData.heartRate}
                  onChangeText={(value) => handleFormChange('heartRate', value)}
                />
              </View>
              <View style={styles.column}>
                <Text style={styles.label}>O₂ Saturation (%) *</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="98"
                  keyboardType="numeric"
                  value={formData.oxygenSaturation}
                  onChangeText={(value) => handleFormChange('oxygenSaturation', value)}
                />
              </View>
            </View>
            
            <View style={styles.row}>
              <View style={styles.column}>
                <Text style={styles.label}>Blood Pressure *</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="140/90"
                  value={formData.bloodPressure}
                  onChangeText={(value) => handleFormChange('bloodPressure', value)}
                />
              </View>
              <View style={styles.column}>
                <Text style={styles.label}>Temperature (°C) *</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="37.2"
                  keyboardType="decimal-pad"
                  value={formData.temperature}
                  onChangeText={(value) => handleFormChange('temperature', value)}
                />
              </View>
            </View>
            
            <View style={styles.formGroup}>
              <Text style={styles.label}>Respiratory Rate</Text>
              <TextInput
                style={styles.textInput}
                placeholder="16"
                keyboardType="numeric"
                value={formData.respiratoryRate}
                onChangeText={(value) => handleFormChange('respiratoryRate', value)}
              />
            </View>
          </View>
        )}
        
        {/* Step 4: Chief Complaint & Review */}
        {currentStep === 4 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>📝 Chief Complaint</Text>
            
            <View style={styles.formGroup}>
              <Text style={styles.label}>Chief Complaint / Reason for Transport *</Text>
              <TextInput
                style={{...styles.textInput, height: 100}}
                placeholder="Describe patient's primary complaint and any observations"
                multiline
                numberOfLines={6}
                value={formData.chiefComplaint}
                onChangeText={(value) => handleFormChange('chiefComplaint', value)}
                textAlignVertical="top"
              />
            </View>
            
            {/* Review Summary */}
            <View style={{marginTop: 20}}>
              <Text style={styles.sectionTitle}>Review Information</Text>
              
              <View style={styles.formGroup}>
                <Text style={{fontSize: 12, color: '#666'}}>
                  <Text style={{fontWeight: 'bold'}}>Patient:</Text> {formData.patientName}, {formData.age} y/o\n
                  <Text style={{fontWeight: 'bold'}}>Heart Rate:</Text> {formData.heartRate} bpm\n
                  <Text style={{fontWeight: 'bold'}}>BP:</Text> {formData.bloodPressure}\n
                  <Text style={{fontWeight: 'bold'}}>O₂:</Text> {formData.oxygenSaturation}%\n
                  <Text style={{fontWeight: 'bold'}}>Allergies:</Text> {formData.allergies || 'None listed'}
                </Text>
              </View>
            </View>
          </View>
        )}
      </ScrollView>
      
      {/* Navigation Buttons */}
      <View style={{...styles.section, marginBottom: 0}}>
        <View style={{flexDirection: 'row', gap: 8}}>
          {currentStep > 1 && (
            <TouchableOpacity
              style={{flex: 1, ...styles.button, backgroundColor: '#6c757d'}}
              onPress={handlePreviousStep}
              disabled={isLoading}
            >
              <Text style={styles.buttonText}>← Previous</Text>
            </TouchableOpacity>
          )}
          
          {currentStep < 4 ? (
            <TouchableOpacity
              style={{flex: 1, ...styles.button, ...(isLoading && styles.buttonDisabled)}}
              onPress={handleNextStep}
              disabled={isLoading}
            >
              <Text style={styles.buttonText}>Next →</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={{flex: 1, ...styles.button, backgroundColor: colors.success, ...(isLoading && styles.buttonDisabled)}}
              onPress={handleSubmit}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text style={styles.buttonText}>✓ Submit Patient Data</Text>
              )}
            </TouchableOpacity>
          )}
        </View>
        
        {!isOnline && (
          <View style={{...styles.statusBadge, ...styles.dangerBadge, marginTop: 12, width: '100%', justifyContent: 'center'}}>
            <Text style={{...styles.badgeText, ...styles.dangerText, textAlign: 'center'}}>
              📡 Offline Mode - Data will sync when connection is restored
            </Text>
          </View>
        )}
        
        {syncStatus === 'syncing' && (
          <View style={{marginTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center'}}>
            <ActivityIndicator color={colors.primary} size="small" />
            <Text style={styles.infoText}> Syncing offline data...</Text>
          </View>
        )}
      </View>
    </View>
  );
};

export default AmbulanceApp;