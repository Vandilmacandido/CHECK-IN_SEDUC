import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useCodeScanner,
} from 'react-native-vision-camera';
import { useIsFocused } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import {
  getParticipanteById,
  getParticipanteByEmail,
  updateCheckIn,
  Participante,
} from '@/services/participantService';
import { getEventoById } from '@/services/eventService';
import {
  CheckCircle,
  AlertTriangle,
  XCircle,
  User,
  Mail,
} from 'lucide-react-native';

type ScanResult = {
  status: 'success' | 'warning' | 'error';
  message: string;
  participante?: Participante;
};

export default function ScannerScreen() {
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');
  const isFocused = useIsFocused();

  // Use ref for the scan guard so the camera thread always reads the latest value
  const isProcessingRef = useRef(false);
  const [scanned, setScanned] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const router = useRouter();

  const handleExit = () => {
    if (result?.participante?.eventoId) {
      router.push(`/event/${result.participante.eventoId}`);
    } else {
      router.push('/');
    }
    resetScanner();
  };

  useEffect(() => {
    if (!hasPermission) {
      requestPermission();
    }
  }, [hasPermission]);

  // Reset scanner every time screen gains focus
  useEffect(() => {
    if (isFocused) {
      isProcessingRef.current = false;
      setScanned(false);
      setResult(null);
    }
  }, [isFocused]);

  const processScannedData = async (data: string) => {
    console.log('QR Scanned raw:', data);

    try {
      if (!data) throw new Error('Dados vazios no QR Code');

      let id = '';
      let eventoId = '';
      let email = '';
      let nome = '';

      // Support for new pipe-separated format: v1|id|eventId|nome|email
      if (data.startsWith('v1|')) {
        const parts = data.split('|');
        id = (parts[1] || '').trim();
        eventoId = (parts[2] || '').trim();
        nome = (parts[3] || '').trim();
        email = (parts[4] || '').trim();
      } else {
        // Fallback to JSON
        try {
          const qrData = JSON.parse(data);
          id = (qrData.id || '').trim();
          eventoId = (qrData.eventoId || '').trim();
          email = (qrData.email || '').trim();
          nome = (qrData.nome || '').trim();
        } catch {
          const preview = data.length > 40 ? data.substring(0, 40) + '...' : data;
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          setResult({
            status: 'error',
            message: `QR inválido.\n\n"${preview}"\n\nEscaneie um QR gerado pelo aplicativo.`,
          });
          return;
        }
      }

      if (!id || !eventoId) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setResult({ status: 'error', message: 'QR Code incompleto ou em formato incorreto.' });
        return;
      }

      // Validate event exists locally
      const evento = await getEventoById(eventoId);
      if (!evento) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setResult({
          status: 'error',
          message: `Evento não encontrado no dispositivo.\n\nEste QR pertence a um evento não cadastrado aqui.`,
        });
        return;
      }

      // Find participant — by ID first, then by email as fallback
      let participant: Participante | null = await getParticipanteById(id);
      if (!participant && email) {
        // Fallback search by email (cleaned)
        participant = await getParticipanteByEmail(eventoId, email.toLowerCase());
      }

      if (!participant) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setResult({
          status: 'error',
          message: `Participante não encontrado.\n\nEvento: ${evento.nome}`,
          participante: {
            nome: nome || 'Desconhecido',
            funcao: '',
            email: email || '',
            id,
            eventoId,
            checkedIn: 0,
            localDeTrabalho: '',
          },
        });
        return;
      }

      // Perform check-in
      if (participant.checkedIn) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        setResult({ status: 'warning', message: 'Check-in já realizado!', participante: participant });
      } else {
        await updateCheckIn(participant.id, 1);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setResult({
          status: 'success',
          message: 'Check-in confirmado! ✓',
          participante: { ...participant, checkedIn: 1 },
        });
      }
    } catch (err: any) {
      console.error('Scanner Error:', err);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setResult({ status: 'error', message: `Erro: ${err.message || 'desconhecido'}` });
    }
  };

  // useCodeScanner — onCodeScanned runs on the CAMERA THREAD
  // Keep callback minimal; use ref guard + setTimeout to dispatch to JS thread
  const codeScanner = useCodeScanner({
    codeTypes: ['qr'],
    onCodeScanned: (codes) => {
      if (isProcessingRef.current) return;
      if (codes.length === 0 || !codes[0].value) return;

      // Lock immediately via ref (thread-safe)
      isProcessingRef.current = true;
      const value = codes[0].value;

      // Dispatch to JS thread
      setTimeout(() => {
        setScanned(true);
        processScannedData(value);
      }, 0);
    },
  });

  const resetScanner = () => {
    isProcessingRef.current = false;
    setScanned(false);
    setResult(null);
  };

  // --- PERMISSION NOT GRANTED ---
  if (!hasPermission) {
    return (
      <View style={styles.centered}>
        <XCircle size={48} color="#dc3545" />
        <Text style={styles.permText}>
          Acesso à câmera negado.{'\n'}Vá às configurações do dispositivo e permita a câmera.
        </Text>
        <TouchableOpacity style={styles.btnRescan} onPress={requestPermission}>
          <Text style={styles.btnRescanText}>Solicitar Permissão</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // --- NO CAMERA DEVICE ---
  if (!device) {
    return (
      <View style={styles.centered}>
        <XCircle size={48} color="#dc3545" />
        <Text style={styles.permText}>Câmera não encontrada neste dispositivo.</Text>
      </View>
    );
  }

  const renderResult = () => {
    if (!result) return null;

    const bgColor =
      result.status === 'success' ? '#e8f5e9' :
      result.status === 'warning' ? '#fff8e1' : '#ffebee';

    const icon =
      result.status === 'success' ? <CheckCircle size={56} color="#28a745" /> :
      result.status === 'warning' ? <AlertTriangle size={56} color="#ffc107" /> :
      <XCircle size={56} color="#dc3545" />;

    return (
      <View style={[styles.resultCard, { backgroundColor: bgColor }]}>
        {icon}
        <Text style={styles.resultTitle}>{result.message}</Text>

        {result.participante && (
          <View style={styles.participantInfo}>
            {!!result.participante.nome && (
              <View style={styles.participantRow}>
                <User size={20} color="#0056b3" />
                <Text style={styles.participantName}>{result.participante.nome}</Text>
              </View>
            )}
            {!!result.participante.email && (
              <View style={styles.participantRow}>
                <Mail size={16} color="#6c757d" />
                <Text style={styles.participantEmail}>{result.participante.email}</Text>
              </View>
            )}
            {!!result.participante.funcao && (
              <Text style={styles.participantRole}>{result.participante.funcao}</Text>
            )}
          </View>
        )}

        <TouchableOpacity style={styles.btnRescan} onPress={resetScanner}>
          <Text style={styles.btnRescanText}>Escanear Novamente</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.btnRescan, styles.btnExit]} onPress={handleExit}>
          <Text style={styles.btnExitText}>Voltar a tela inicial</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <Camera
        style={StyleSheet.absoluteFillObject}
        device={device}
        isActive={isFocused && !scanned}
        codeScanner={codeScanner}
        photo={false}
        video={false}
        audio={false}
      />

      {/* Viewfinder overlay */}
      {!scanned && (
        <View style={styles.overlay} pointerEvents="none">
          <View style={styles.unfocused}>
            <Text style={styles.eventLabel}>Pronto para escanear</Text>
          </View>
          <View style={styles.middleRow}>
            <View style={styles.unfocused} />
            <View style={styles.focusBox}>
              <View style={[styles.corner, styles.topLeft]} />
              <View style={[styles.corner, styles.topRight]} />
              <View style={[styles.corner, styles.bottomLeft]} />
              <View style={[styles.corner, styles.bottomRight]} />
            </View>
            <View style={styles.unfocused} />
          </View>
          <View style={styles.unfocused}>
            <Text style={styles.instructionText}>Posicione o QR Code dentro do quadrado</Text>
          </View>
        </View>
      )}

      {/* Result card */}
      {scanned && (
        <View style={styles.resultOverlay}>
          {renderResult()}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: '#f8f9fa',
    gap: 16,
  },
  permText: {
    fontSize: 15,
    color: '#212529',
    textAlign: 'center',
    lineHeight: 22,
  },

  // --- Viewfinder overlay ---
  overlay: {
    ...StyleSheet.absoluteFillObject,
    flex: 1,
    flexDirection: 'column',
  },
  unfocused: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.58)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  middleRow: {
    flexDirection: 'row',
    height: 270,
  },
  focusBox: {
    width: 270,
    height: 270,
    backgroundColor: 'transparent',
    position: 'relative',
  },
  eventLabel: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 20,
  },
  instructionText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 28,
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    textAlign: 'center',
  },
  corner: {
    position: 'absolute',
    width: 46,
    height: 46,
    borderColor: '#fff',
  },
  topLeft:     { top: 0,    left: 0,  borderTopWidth: 4,    borderLeftWidth: 4,  borderTopLeftRadius: 16 },
  topRight:    { top: 0,    right: 0, borderTopWidth: 4,    borderRightWidth: 4, borderTopRightRadius: 16 },
  bottomLeft:  { bottom: 0, left: 0,  borderBottomWidth: 4, borderLeftWidth: 4,  borderBottomLeftRadius: 16 },
  bottomRight: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 16 },

  // --- Result overlay ---
  resultOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.78)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  resultCard: {
    width: '100%',
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  resultTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 20,
    color: '#212529',
    lineHeight: 26,
  },
  participantInfo: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    gap: 8,
  },
  participantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  participantName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#212529',
    flexShrink: 1,
  },
  participantEmail: {
    fontSize: 14,
    color: '#495057',
    flexShrink: 1,
  },
  participantRole: {
    fontSize: 13,
    color: '#6c757d',
    marginTop: 4,
    marginLeft: 30,
  },
  btnRescan: {
    backgroundColor: '#0056b3',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
  },
  btnRescanText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  btnExit: {
    backgroundColor: 'transparent',
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#ced4da',
  },
  btnExitText: {
    color: '#495057',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
