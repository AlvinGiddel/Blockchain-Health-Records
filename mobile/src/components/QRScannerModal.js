import React, { useState, useEffect } from 'react';
import { View, Text, Modal, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { X, QrCode, Flashlight, ShieldCheck } from 'lucide-react-native';
import { COLORS } from '../theme/colors';

export default function QRScannerModal({ visible, onClose, onScanComplete }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [torch, setTorch] = useState(false);

  useEffect(() => {
    if (visible) {
      setScanned(false);
    }
  }, [visible]);

  if (!visible) return null;

  const handleBarcodeScanned = ({ data }) => {
    if (scanned) return;
    setScanned(true);

    try {
      // Try to parse structured BHC payload
      let parsed = null;
      try {
        parsed = JSON.parse(data);
      } catch (e) {
        parsed = { rawHash: data };
      }

      if (onScanComplete) {
        onScanComplete(parsed);
      }
      onClose();
    } catch (err) {
      Alert.alert('Scan Error', 'Unable to parse QR passport data.');
      setScanned(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={false}>
      <View style={styles.container}>
        {/* Top Controls */}
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <QrCode size={20} color={COLORS.accent} />
            <Text style={styles.headerTitle}>Triage QR Scanner</Text>
          </View>
          <View style={styles.actionButtons}>
            <TouchableOpacity 
              onPress={() => setTorch(prev => !prev)} 
              style={[styles.iconButton, torch && styles.activeIconButton]}
            >
              <Flashlight size={18} color={torch ? '#000' : COLORS.textPrimary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={onClose} style={styles.iconButton}>
              <X size={18} color={COLORS.textPrimary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Camera Permission State */}
        {!permission?.granted ? (
          <View style={styles.permissionContainer}>
            <ShieldCheck size={48} color={COLORS.primary} style={{ marginBottom: 16 }} />
            <Text style={styles.permissionTitle}>Camera Access Required</Text>
            <Text style={styles.permissionText}>
              To verify patient QR Health Passports, allow Blockchain Health Records to access your camera.
            </Text>
            <TouchableOpacity onPress={requestPermission} style={styles.permissionButton}>
              <Text style={styles.permissionButtonText}>Grant Camera Permission</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onClose} style={{ marginTop: 16 }}>
              <Text style={{ color: COLORS.textMuted }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.cameraWrapper}>
            <CameraView
              style={StyleSheet.absoluteFillObject}
              enableTorch={torch}
              barcodeScannerSettings={{
                barcodeTypes: ['qr']
              }}
              onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
            />

            {/* Viewfinder Target Box Overlay */}
            <View style={styles.overlay}>
              <View style={styles.unfocusedContainer} />
              <View style={styles.middleContainer}>
                <View style={styles.unfocusedContainer} />
                <View style={styles.targetFrame}>
                  <View style={[styles.corner, styles.topLeft]} />
                  <View style={[styles.corner, styles.topRight]} />
                  <View style={[styles.corner, styles.bottomLeft]} />
                  <View style={[styles.corner, styles.bottomRight]} />
                </View>
                <View style={styles.unfocusedContainer} />
              </View>
              <View style={styles.unfocusedContainer}>
                <Text style={styles.guideText}>Align patient's QR Health Passport within the frame</Text>
              </View>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    paddingTop: 50
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 16,
    zIndex: 10
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  headerTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700'
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 10
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  activeIconButton: {
    backgroundColor: COLORS.accent
  },
  cameraWrapper: {
    flex: 1
  },
  permissionContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30
  },
  permissionTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8
  },
  permissionText: {
    color: COLORS.textSecondary,
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 24
  },
  permissionButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10
  },
  permissionButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14
  },
  overlay: {
    flex: 1
  },
  unfocusedContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20
  },
  middleContainer: {
    flexDirection: 'row',
    height: 260
  },
  targetFrame: {
    width: 260,
    height: 260,
    position: 'relative'
  },
  corner: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderColor: COLORS.accent
  },
  topLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4
  },
  topRight: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4
  },
  guideText: {
    color: '#fff',
    fontSize: 13,
    textAlign: 'center',
    fontWeight: '500'
  }
});
