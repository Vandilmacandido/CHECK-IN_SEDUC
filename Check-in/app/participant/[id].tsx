import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { getParticipanteById, Participante } from '@/services/participantService';
import { getEventoById, Evento } from '@/services/eventService';
import { ChevronLeft, Mail, User, Briefcase, MapPin, CheckCircle, AlertCircle, FileCheck, Clock, CreditCard } from 'lucide-react-native';
import QRCode from 'react-native-qrcode-svg';
import * as MailComposer from 'expo-mail-composer';
import * as FileSystem from 'expo-file-system/legacy';
import { getDeclarationQRText, generateDeclarationPdf, formatCPF } from '@/services/declarationService';

export default function ParticipantScreen() {
  const { id } = useLocalSearchParams();
  const participantId = id as string;
  const router = useRouter();
  
  const [participante, setParticipante] = useState<Participante | null>(null);
  const [evento, setEvento] = useState<Evento | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const qrRef = useRef<any>(null);
  const declarationQrRef = useRef<any>(null);

  useEffect(() => {
    getParticipanteById(participantId).then(async (p) => {
      setParticipante(p);
      if (p) {
        const evt = await getEventoById(p.eventoId);
        setEvento(evt);
      }
    });
  }, [participantId]);

  const handleSendEmail = async () => {
    if (!participante || !qrRef.current) return;

    try {
      qrRef.current.toDataURL(async (dataURL: string) => {
        const fileUri = `${FileSystem.cacheDirectory}qr_${participante.id}.png`;
        await FileSystem.writeAsStringAsync(fileUri, dataURL, { encoding: FileSystem.EncodingType.Base64 });

        const isAvailable = await MailComposer.isAvailableAsync();
        if (isAvailable) {
          await MailComposer.composeAsync({
            recipients: [participante.email],
            subject: 'Seu QR Code de Check-in',
            body: `
              <div style="background-color: #f8f9fa; padding: 20px; font-family: sans-serif;">
                <div style="background-color: #ffffff; padding: 30px; border-radius: 16px; max-width: 500px; margin: 0 auto; border: 1px solid #dee2e6;">
                  <h2 style="color: #0056b3; margin-top: 0;">Olá ${participante.nome},</h2>
                  <p style="color: #212529; font-size: 16px; line-height: 1.5;">Aqui está o seu QR Code para check-in no evento.</p>
                  
                  <div style="background-color: #e6f0fa; padding: 15px; border-radius: 8px; margin: 20px 0;">
                    <p style="margin: 5px 0; color: #495057;"><b>Evento:</b> ${evento?.nome}</p>
                    <p style="margin: 5px 0; color: #495057;"><b>CPF:</b> ${formatCPF(participante.cpf)}</p>
                    <p style="margin: 5px 0; color: #495057;"><b>Função:</b> ${participante.funcao}</p>
                    <p style="margin: 5px 0; color: #495057;"><b>Local:</b> ${participante.localDeTrabalho ?? ''}</p>
                  </div>

                  <p style="color: #6c757d; font-size: 14px; margin-bottom: 25px;">
                    <b>💡 Dica:</b> No momento do check-in, aumente o brilho do seu celular para facilitar a leitura.
                  </p>
                  
                  <p style="color: #212529; font-size: 14px;">Apresente o QR Code em anexo na entrada.</p>
                </div>
              </div>
            `,
            isHtml: true,
            attachments: [fileUri]
          });
        } else {
          Alert.alert('Erro', 'O serviço de e-mail não está disponível.');
        }
      });
    } catch (error) {
      console.error(error);
      Alert.alert('Erro', 'Não foi possível enviar o QR Code.');
    }
  };

  const handleSendDeclaration = async () => {
    if (!participante || !evento || !declarationQrRef.current) return;
    
    setIsGenerating(true);
    try {
      declarationQrRef.current.toDataURL(async (dataURL: string) => {
        const qrBase64 = `data:image/png;base64,${dataURL}`;
        const pdfUri = await generateDeclarationPdf(participante, evento, qrBase64);

        const isAvailable = await MailComposer.isAvailableAsync();
        if (isAvailable) {
          await MailComposer.composeAsync({
            recipients: [participante.email],
            subject: `Declaração de Participação - ${evento.nome}`,
            body: `
              <div style="font-family: sans-serif; line-height: 1.5; color: #333;">
                <h2>Olá, ${participante.nome}!</h2>
                <p>Parabéns pela sua participação no evento <b>${evento.nome}</b>.</p>
                <p>Em anexo, enviamos a sua <b>Declaração de Comparecimento</b> oficial com autenticação via QR Code.</p>
                <p>Atenciosamente,<br>Equipe Check-in Digital</p>
              </div>
            `,
            isHtml: true,
            attachments: [pdfUri]
          });
        }
        setIsGenerating(false);
      });
    } catch (error) {
      console.error(error);
      Alert.alert('Erro', 'Não foi possível gerar a declaração.');
      setIsGenerating(false);
    }
  };

  if (!participante) return null;

  const qrData = `v1|${(participante.id || '').trim()}|${(participante.eventoId || '').trim()}|${(participante.nome || '').trim()}|${(participante.email || '').trim()}`;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <ChevronLeft size={32} color="#212529" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Participante</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.content}>
        <View style={styles.card}>
          <View style={styles.avatar}>
            <User size={48} color="#0056b3" />
          </View>
          
          <Text style={styles.name}>{participante.nome}</Text>
          <Text style={styles.role}>{participante.funcao}</Text>
          {participante.localDeTrabalho ? (
            <View style={styles.infoRow}>
              <MapPin size={14} color="#6c757d" />
              <Text style={styles.infoText}>{participante.localDeTrabalho}</Text>
            </View>
          ) : null}
          <Text style={styles.email}>{participante.email}</Text>
          {participante.cpf ? (
            <View style={[styles.infoRow, { marginTop: 4 }]}>
              <CreditCard size={14} color="#6c757d" />
              <Text style={styles.infoText}>CPF: {formatCPF(participante.cpf)}</Text>
            </View>
          ) : null}

          <View style={styles.statusBadge}>
            {participante.checkedIn ? (
              <View style={{ alignItems: 'center' }}>
                <View style={[styles.statusBubble, { backgroundColor: '#e8f5e9' }]}>
                  <CheckCircle size={16} color="#28a745" />
                  <Text style={[styles.statusText, { color: '#28a745' }]}>CHECK-IN REALIZADO</Text>
                </View>
                {participante.checkInTime && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
                    <Clock size={12} color="#6c757d" />
                    <Text style={{ fontSize: 12, color: '#6c757d', marginLeft: 4 }}>
                      Às ${participante.checkInTime}
                    </Text>
                  </View>
                )}
              </View>
            ) : (
              <View style={[styles.statusBubble, { backgroundColor: '#fff8e1' }]}>
                <AlertCircle size={16} color="#ffc107" />
                <Text style={[styles.statusText, { color: '#ffc107' }]}>PENDENTE</Text>
              </View>
            )}
          </View>

          <View style={styles.qrContainer}>
            <QRCode
              value={qrData}
              size={260}
              ecl="M"
              quietZone={20}
              backgroundColor="#ffffff"
              color="#000000"
              getRef={(c) => (qrRef.current = c)}
            />
          </View>
          <Text style={styles.qrHint}>QR Code Único e Intransferível</Text>

          <TouchableOpacity 
            style={[styles.btnEmail, { marginBottom: 12 }]} 
            onPress={handleSendEmail}
          >
            <Mail size={20} color="#fff" style={{ marginRight: 8 }} />
            <Text style={styles.btnEmailText}>Enviar QR Code</Text>
          </TouchableOpacity>

          {participante.checkedIn === 1 && (
            <TouchableOpacity 
              style={[styles.btnEmail, { backgroundColor: '#28a745' }]} 
              onPress={handleSendDeclaration}
              disabled={isGenerating}
            >
              <FileCheck size={20} color="#fff" style={{ marginRight: 8 }} />
              <Text style={styles.btnEmailText}>
                {isGenerating ? 'Gerando...' : 'Enviar Declaração'}
              </Text>
            </TouchableOpacity>
          )}

          {/* QR Code Invisível para a Declaração */}
          <View style={{ height: 0, opacity: 0, overflow: 'hidden' }}>
            {evento && (
              <QRCode
                value={getDeclarationQRText(participante, evento)}
                size={200}
                getRef={(c) => (declarationQrRef.current = c)}
              />
            )}
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 32,
    paddingBottom: 24,
  },
  backBtn: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#212529',
  },
  content: {
    padding: 24,
    paddingBottom: 180,
    alignItems: 'center',
  },
  card: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#e6f0fa',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  name: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#212529',
    marginBottom: 4,
    textAlign: 'center',
  },
  role: {
    fontSize: 16,
    color: '#0056b3',
    fontWeight: '600',
    marginBottom: 4,
  },
  email: {
    fontSize: 14,
    color: '#6c757d',
    marginBottom: 24,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    gap: 6,
  },
  infoText: {
    fontSize: 13,
    color: '#6c757d',
  },
  statusBadge: {
    marginBottom: 32,
  },
  statusBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  statusText: {
    fontSize: 12,
    fontWeight: 'bold',
    marginLeft: 6,
  },
  qrContainer: {
    padding: 16,
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#dee2e6',
    marginBottom: 16,
  },
  qrHint: {
    fontSize: 12,
    color: '#6c757d',
    marginBottom: 32,
  },
  btnEmail: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0056b3',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    width: '100%',
    justifyContent: 'center',
  },
  btnEmailText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
