import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, SafeAreaView, Alert, Modal, KeyboardAvoidingView, Platform, TouchableWithoutFeedback, Keyboard, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { getParticipantesPorEvento, Participante, getEventStats, addParticipante, checkExistingParticipante } from '@/services/participantService';
import { getEventoById, Evento } from '@/services/eventService';
import { setActiveEventId } from '@/services/activeEvent';
import { useFocusEffect } from '@react-navigation/native';
import { ChevronLeft, Search, Users, CheckCircle, QrCode, UploadCloud, Download, FileText, UserPlus, X, User } from 'lucide-react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as MailComposer from 'expo-mail-composer';
import QRCode from 'react-native-qrcode-svg';
import Papa from 'papaparse';
import { v4 as uuidv4 } from 'uuid';
import { Mail, Trash2, FileCheck, Clock } from 'lucide-react-native';
import { clearParticipantes, getParticipantesPresentes } from '@/services/participantService';
import { getDeclarationQRText, generateDeclarationPdf, formatCPF } from '@/services/declarationService';

export default function EventScreen() {
  const { id } = useLocalSearchParams();
  const eventId = id as string;
  const router = useRouter();

  const [evento, setEvento] = useState<Evento | null>(null);
  const [participantes, setParticipantes] = useState<Participante[]>([]);
  const [filteredParticipantes, setFilteredParticipantes] = useState<Participante[]>([]);
  const [stats, setStats] = useState({ total: 0, checkins: 0 });
  const [activeTab, setActiveTab] = useState<'lista' | 'importar' | 'relatorio'>('lista');
  const [filter, setFilter] = useState<'todos' | 'presentes' | 'ausentes'>('todos');
  const [searchQuery, setSearchQuery] = useState('');

  const loadData = useCallback(async () => {
    const evt = await getEventoById(eventId);
    setEvento(evt);
    
    if (evt) {
      await setActiveEventId(eventId);
      const parts = await getParticipantesPorEvento(eventId);
      setParticipantes(parts);
      setStats(await getEventStats(eventId));
    }
  }, [eventId]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  useEffect(() => {
    let result = participantes;
    
    if (filter === 'presentes') {
      result = result.filter(p => p.checkedIn === 1);
    } else if (filter === 'ausentes') {
      result = result.filter(p => p.checkedIn === 0);
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(p => 
        p.nome.toLowerCase().includes(q) || 
        p.email.toLowerCase().includes(q)
      );
    }

    setFilteredParticipantes(result);
  }, [participantes, filter, searchQuery]);


  const handleImportCSV = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values', 'application/vnd.ms-excel'],
        copyToCacheDirectory: true,
      });

      if (result.canceled) return;

      const file = result.assets[0];
      const fileContent = await FileSystem.readAsStringAsync(file.uri, { encoding: FileSystem.EncodingType.UTF8 });
      
      Papa.parse<any>(fileContent, {
        header: false, // Get raw arrays to handle missing headers
        skipEmptyLines: 'greedy',
        complete: async (results) => {
          const rows = results.data as string[][];
          if (rows.length === 0) return;

          let imported = 0;
          let skipped = 0;
          let duplicates = 0;

          // Check if first row is a header
          const firstRow = rows[0].map(c => (c || '').trim().toLowerCase());
          const hasHeader = firstRow.some(c => 
            c.includes('nome') || 
            c.includes('email') || 
            c.includes('e-mail') || 
            c.includes('função') || 
            c.includes('name') ||
            c.includes('cpf')
          );
          
          let dataRows = rows;
          let nameIdx = 0, emailIdx = 1, cpfIdx = -1, roleIdx = -1, localIdx = -1;

          if (hasHeader) {
            // Find column indices dynamically
            nameIdx = firstRow.findIndex(c => c.includes('nome') || c.includes('name'));
            emailIdx = firstRow.findIndex(c => c.includes('email') || c.includes('e-mail'));
            cpfIdx = firstRow.findIndex(c => c.includes('cpf'));
            roleIdx = firstRow.findIndex(c => c.includes('funç') || c.includes('role') || c.includes('funcao') || c.includes('cargo'));
            localIdx = firstRow.findIndex(c => c.includes('local') || c.includes('trabalho') || c.includes('workplace') || c.includes('lotacao') || c.includes('lotação'));
            
            // Skip the header row for processing
            dataRows = rows.slice(1);
          } else {
            // Fallback: Infer based on number of columns in the first row
            const colCount = rows[0].length;
            if (colCount >= 5) {
              // Assumes: Nome, Email, Funcao, Local, CPF
              roleIdx = 2;
              localIdx = 3;
              cpfIdx = 4;
            } else {
              // Assumes: Nome, Email, Funcao, Local (Legacy)
              roleIdx = 2;
              localIdx = 3;
              cpfIdx = -1;
            }
          }

          for (const row of dataRows) {
            const nome = (row[nameIdx] ?? '').trim();
            const email = (row[emailIdx] ?? '').trim();
            const cpf = cpfIdx !== -1 ? (row[cpfIdx] ?? '').trim() : '';
            const funcao = roleIdx !== -1 ? (row[roleIdx] ?? '').trim() : '';
            const localDeTrabalho = localIdx !== -1 ? (row[localIdx] ?? '').trim() : '';

            if (!nome || !email) {
              skipped++;
              continue;
            }

            // Check for duplicates
            const isDuplicate = await checkExistingParticipante(eventId, email);
            if (isDuplicate) {
              duplicates++;
              continue;
            }

            await addParticipante({
              id: uuidv4(),
              nome: nome.trim(),
              email,
              cpf,
              funcao: funcao.trim(),
              localDeTrabalho: localDeTrabalho.trim(),
              eventoId: eventId,
              checkedIn: 0
            });
            imported++;
          }
          
          let alertMsg = `${imported} participantes importados com sucesso.`;
          if (duplicates > 0) alertMsg += `\n${duplicates} duplicatas foram ignoradas.`;
          if (skipped > 0) alertMsg += `\n${skipped} linhas inválidas (sem e-mail ou nome) foram ignoradas.`;
          
          Alert.alert('Importação Concluída', alertMsg);
          loadData();
        },
        error: (error: any) => {
          console.error(error);
          Alert.alert('Erro', `Falha ao processar CSV: ${error.message}`);
        }
      });

    } catch (error) {
      console.error(error);
      Alert.alert('Erro', 'Houve um problema ao importar o arquivo.');
    }
  };

  const qrRef = useRef<any>(null);
  const [isSendingEmails, setIsSendingEmails] = useState(false);
  const [isSendingDeclarations, setIsSendingDeclarations] = useState(false);
  const [sendingCount, setSendingCount] = useState(0);
  const [totalToProcess, setTotalToProcess] = useState(0);
  const [qrValue, setQrValue] = useState('');
  
  // States for manual participant addition
  const [isManualModalVisible, setIsManualModalVisible] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newCpf, setNewCpf] = useState('');
  const [newRole, setNewRole] = useState('');
  const [newWorkplace, setNewWorkplace] = useState('');

  const handleSaveParticipant = async () => {
    if (!newName || !newEmail) {
      Alert.alert('Erro', 'Nome e E-mail são obrigatórios.');
      return;
    }

    try {
      const isDuplicate = await checkExistingParticipante(eventId, newEmail);
      if (isDuplicate) {
        Alert.alert('Erro', 'Este e-mail já está cadastrado para este evento.');
        return;
      }

      await addParticipante({
        id: uuidv4(),
        nome: newName.trim(),
        email: newEmail.trim(),
        cpf: newCpf.trim(),
        funcao: newRole.trim(),
        localDeTrabalho: newWorkplace.trim(),
        eventoId: eventId,
        checkedIn: 0
      });

      setNewName('');
      setNewEmail('');
      setNewCpf('');
      setNewRole('');
      setNewWorkplace('');
      loadData();
    } catch (error) {
      console.error(error);
      Alert.alert('Erro', 'Não foi possível adicionar o participante.');
    }
  };

  const handleClearParticipants = async () => {
    Alert.alert(
      'Limpar Lista',
      'Tem certeza que deseja excluir todos os participantes?',
      [
        { text: 'Cancelar', style: 'cancel' },
        { 
          text: 'Excluir', 
          style: 'destructive', 
          onPress: async () => {
            await clearParticipantes(eventId);
            loadData();
          } 
        }
      ]
    );
  };

  const handleSendAllEmails = async () => {
    if (participantes.length === 0) {
      Alert.alert('Erro', 'Não há participantes para enviar e-mails.');
      return;
    }

    const isAvailable = await MailComposer.isAvailableAsync();
    if (!isAvailable) {
      Alert.alert('Erro', 'Serviço de e-mail não disponível.');
      return;
    }

    Alert.alert(
      'Enviar E-mails',
      `O app iniciará o envio para ${participantes.length} pessoas. O sistema de e-mail solicita a confirmação do envio de cada mensagem individualmente (segurança do sistema). Deseja começar?`,
      [
        { text: 'Não', style: 'cancel' },
        { 
          text: 'Sim, Começar', 
          onPress: () => processEmails(0)
        }
      ]
    );
  };

  const processEmails = async (index: number) => {
    if (index >= participantes.length) {
      setIsSendingEmails(false);
      setSendingCount(0);
      setTotalToProcess(0);
      Alert.alert('Concluído', 'Processo de envio finalizado.');
      return;
    }

    setIsSendingEmails(true);
    setTotalToProcess(participantes.length);
    setSendingCount(index + 1);
    
    const p = participantes[index];
    const qrData = `v1|${(p.id || '').trim()}|${(p.eventoId || '').trim()}|${(p.nome || '').trim()}|${(p.email || '').trim()}`;
    
    // Update QR value to trigger render
    setQrValue(qrData);

    // Give it a tiny bit of time to render
    setTimeout(async () => {
        if (!qrRef.current) return;
        
        try {
            qrRef.current.toDataURL(async (dataURL: string) => {
                const fileUri = `${FileSystem.cacheDirectory}qr_${p.id}.png`;
                await FileSystem.writeAsStringAsync(fileUri, dataURL, { encoding: FileSystem.EncodingType.Base64 });
                
                await MailComposer.composeAsync({
                    recipients: [p.email],
                    subject: `Confirmação de Inscrição: ${evento?.nome}`,
                    body: `
                      <div style="background-color: #f8f9fa; padding: 20px; font-family: sans-serif;">
                        <div style="background-color: #ffffff; padding: 30px; border-radius: 16px; max-width: 500px; margin: 0 auto; border: 1px solid #dee2e6;">
                          <h2 style="color: #0056b3; margin-top: 0;">Olá ${p.nome},</h2>
                          <p style="color: #212529; font-size: 16px; line-height: 1.5;">Sua inscrição no evento <b>${evento?.nome}</b> (${evento?.data}) foi confirmada.</p>
                          
                          <div style="background-color: #e6f0fa; padding: 15px; border-radius: 8px; margin: 20px 0;">
                            <p style="margin: 5px 0; color: #495057;"><b>CPF:</b> ${formatCPF(p.cpf)}</p>
                            <p style="margin: 5px 0; color: #495057;"><b>Função:</b> ${p.funcao}</p>
                            <p style="margin: 5px 0; color: #495057;"><b>Local:</b> ${p.localDeTrabalho ?? ''}</p>
                          </div>

                          <p style="color: #6c757d; font-size: 14px; margin-bottom: 25px;">
                            <b>💡 Dica:</b> No momento do check-in, aumente o brilho do seu celular para facilitar a leitura do QR Code em anexo.
                          </p>
                          
                          <p style="color: #212529; font-size: 14px;">Atenciosamente,<br>Equipe Organizadora</p>
                        </div>
                      </div>
                    `,
                    isHtml: true,
                    attachments: [fileUri]
                }).then(() => {
                    // Start next one after completion
                    processEmails(index + 1);
                });
            });
        } catch (error) {
            console.error(error);
            // Skip to next one on error but log it
            processEmails(index + 1);
        }
    }, 400); // Increased timeout to 400ms to guarantee rendering
  };

  const handleSendAllDeclarations = async () => {
    const presentes = participantes.filter(p => p.checkedIn === 1);
    if (presentes.length === 0) {
      Alert.alert('Aviso', 'Não há participantes presentes para receber declarações.');
      return;
    }

    const isAvailable = await MailComposer.isAvailableAsync();
    if (!isAvailable) {
      Alert.alert('Erro', 'Serviço de e-mail não disponível.');
      return;
    }

    Alert.alert(
      'Enviar Declarações',
      `O app enviará declarações autenticadas para ${presentes.length} presentes. Deseja começar?`,
      [
        { text: 'Não', style: 'cancel' },
        { 
          text: 'Sim, Começar', 
          onPress: () => processDeclarations(presentes, 0)
        }
      ]
    );
  };

  const processDeclarations = async (lista: Participante[], index: number) => {
    if (index >= lista.length) {
      setIsSendingDeclarations(false);
      setSendingCount(0);
      setTotalToProcess(0);
      Alert.alert('Concluído', 'Todas as declarações foram processadas.');
      return;
    }

    setIsSendingDeclarations(true);
    setTotalToProcess(lista.length);
    setSendingCount(index + 1);

    const p = lista[index];
    if (!evento) return;

    // QR Code text for authentication
    const qrText = getDeclarationQRText(p, evento);
    setQrValue(qrText);

    setTimeout(async () => {
      if (!qrRef.current) return;
      try {
        qrRef.current.toDataURL(async (dataURL: string) => {
          const qrBase64 = `data:image/png;base64,${dataURL}`;
          const pdfUri = await generateDeclarationPdf(p, evento, qrBase64);

          await MailComposer.composeAsync({
            recipients: [p.email],
            subject: `Sua Declaração de Participação: ${evento.nome}`,
            body: `Olá ${p.nome}, segue em anexo sua declaração de participação no evento ${evento.nome}.`,
            attachments: [pdfUri]
          }).then(() => {
            processDeclarations(lista, index + 1);
          });
        });
      } catch (error) {
        processDeclarations(lista, index + 1);
      }
    }, 400); // Increased to 400ms to guarantee rendering on all devices
  };

  const handleExportCSV = async () => {
    const dataToExport = participantes.map(p => ({
      Nome: p.nome,
      Email: p.email,
      CPF: p.cpf || '',
      Funcao: p.funcao,
      LocalDeTrabalho: p.localDeTrabalho,
      Status: p.checkedIn ? 'Presente' : 'Ausente'
    }));

    const csvStr = Papa.unparse(dataToExport);
    
    const fileUri = `${FileSystem.documentDirectory}participantes_${evento?.nome.replace(/ /g, '_')}.csv`;
    await FileSystem.writeAsStringAsync(fileUri, csvStr, { encoding: FileSystem.EncodingType.UTF8 });
    
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(fileUri);
    }
  };

  const handleExportPDF = async () => {
    const presentes = participantes.filter(p => p.checkedIn === 1);
    
    const html = `
      <html>
        <head>
          <style>
            body { font-family: 'Helvetica'; padding: 20px; color: #333; }
            h1 { color: #0056b3; }
            .header { margin-bottom: 30px; border-bottom: 2px solid #0056b3; padding-bottom: 10px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
            th { background-color: #f8f9fa; color: #0056b3; }
            .stats { display: flex; justify-content: space-between; margin-bottom: 20px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>${evento?.nome}</h1>
            <div class="stats">
              <span>Data: ${evento?.data}</span>
              <span>Total Presentes: ${stats.checkins}</span>
            </div>
          </div>
          
          <h2>Lista de Presença</h2>
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Email</th>
                <th>CPF</th>
                <th>Cargo</th>
                <th>Local</th>
                <th>Check-in</th>
              </tr>
            </thead>
            <tbody>
              ${presentes.map(p => `
                <tr>
                  <td>${p.nome}</td>
                  <td>${p.email}</td>
                  <td>${p.cpf || '---'}</td>
                  <td>${p.funcao}</td>
                  <td>${p.localDeTrabalho || '---'}</td>
                  <td>${p.checkInTime || '---'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </body>
      </html>
    `;

    try {
      const { uri } = await Print.printToFileAsync({ 
        html,
        orientation: Print.Orientation.landscape
      });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri);
      }
    } catch (error) {
      console.error(error);
      Alert.alert('Erro', 'Não foi possível gerar o PDF.');
    }
  };

  const renderParticipante = ({ item }: { item: Participante }) => (
    <TouchableOpacity 
      style={styles.participantCard}
      onPress={() => router.push(`/participant/${item.id}`)}
    >
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{item.nome.charAt(0).toUpperCase()}</Text>
      </View>
      <View style={styles.participantInfo}>
        <Text style={styles.participantName}>{item.nome}</Text>
        <Text style={styles.participantRole}>
          {item.funcao}{item.localDeTrabalho ? ` • ${item.localDeTrabalho}` : ''}
        </Text>
        <Text style={styles.participantEmail}>
          {item.cpf ? `${item.cpf} • ` : ''}{item.email}
        </Text>
        {item.checkedIn === 1 && item.checkInTime && (
          <View style={styles.checkInTimeRow}>
            <Clock size={12} color="#28a745" />
            <Text style={styles.checkInTimeText}>Presente às {item.checkInTime}</Text>
          </View>
        )}
      </View>
      <View style={styles.statusBadge}>
        {item.checkedIn ? (
          <CheckCircle size={24} color="#28a745" />
        ) : (
          <View style={styles.pendingBadge}>
            <Text style={styles.pendingText}>AUSENTE</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Hidden QR Generator for Email Batch */}
      <View style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }}>
        {qrValue ? <QRCode value={qrValue} size={260} ecl="M" quietZone={20} backgroundColor="#ffffff" color="#000000" getRef={(c) => (qrRef.current = c)} /> : null}
      </View>

      {isSendingEmails && (
        <View style={styles.sendingOverlay}>
          <View style={styles.sendingCard}>
            <Mail size={40} color="#0056b3" />
            <Text style={styles.sendingTitle}>Enviando E-mails...</Text>
            <Text style={styles.sendingProgress}>{sendingCount} de {participantes.length}</Text>
            <Text style={styles.sendingSub}>Aguardando confirmação do sistema de e-mail</Text>
          </View>
        </View>
      )}

      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <ChevronLeft size={32} color="#212529" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{evento?.nome || 'Detalhes'}</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.tabsMenu}>
        <TouchableOpacity 
          style={[styles.tabBtn, activeTab === 'lista' && styles.tabBtnActive]}
          onPress={() => setActiveTab('lista')}>
          <Text style={[styles.tabText, activeTab === 'lista' && styles.tabTextActive]}>Lista</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.tabBtn, activeTab === 'importar' && styles.tabBtnActive]}
          onPress={() => setActiveTab('importar')}>
          <Text style={[styles.tabText, activeTab === 'importar' && styles.tabTextActive]}>Importar</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.tabBtn, activeTab === 'relatorio' && styles.tabBtnActive]}
          onPress={() => setActiveTab('relatorio')}>
          <Text style={[styles.tabText, activeTab === 'relatorio' && styles.tabTextActive]}>Relatório</Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'lista' && (
        <View style={styles.tabContent}>
          <View style={styles.searchRow}>
            <View style={styles.searchContainer}>
              <Search size={20} color="#6c757d" style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder="Nome ou e-mail..."
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
            </View>
            <TouchableOpacity 
              style={styles.btnAddManual}
              onPress={() => setIsManualModalVisible(true)}
            >
              <UserPlus size={24} color="#fff" />
            </TouchableOpacity>
          </View>
          
          <View style={styles.filterMenu}>
            {(['todos', 'presentes', 'ausentes'] as const).map(f => (
              <TouchableOpacity
                key={f}
                style={[styles.filterChip, filter === f && styles.filterChipActive]}
                onPress={() => setFilter(f)}
              >
                <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
                  {f.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <FlatList
            data={filteredParticipantes}
            keyExtractor={item => item.id}
            renderItem={renderParticipante}
            contentContainerStyle={styles.listContainer}
            ListEmptyComponent={
              <Text style={styles.emptyText}>Nenhum participante encontrado.</Text>
            }
          />

          <TouchableOpacity 
            style={styles.fab}
            onPress={() => router.push('/(tabs)/scanner')}
          >
            <QrCode size={24} color="#fff" />
            <Text style={styles.fabText}>Scanner</Text>
          </TouchableOpacity>
        </View>
      )}

      {activeTab === 'importar' && (
        <View style={[styles.tabContent, { padding: 24 }]}>
          <View style={styles.importCard}>
            <View style={styles.importIconWrap}>
              <UploadCloud size={48} color="#0056b3" />
            </View>
            <Text style={styles.importTitle}>Selecione o arquivo CSV</Text>
            <Text style={styles.importText}>O arquivo deve conter as colunas: nome, email, cpf, funcao, localDeTrabalho</Text>
            
            <TouchableOpacity style={styles.btnPrimary} onPress={handleImportCSV}>
              <Text style={styles.btnPrimaryText}>Importar .CSV</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

  {activeTab === 'relatorio' && (
        <View style={[styles.tabContent, { padding: 24 }]}>
          <View style={styles.dashboardRow}>
            <View style={[styles.dashCard, { backgroundColor: '#e6f0fa' }]}>
              <Users size={24} color="#0056b3" />
              <Text style={styles.dashValue}>{stats.total}</Text>
              <Text style={styles.dashLabel}>TOTAL</Text>
            </View>
            <View style={[styles.dashCard, { backgroundColor: '#e8f5e9' }]}>
              <CheckCircle size={24} color="#28a745" />
              <Text style={[styles.dashValue, { color: '#28a745' }]}>{stats.checkins}</Text>
              <Text style={styles.dashLabel}>CHECK-INS</Text>
            </View>
          </View>
          
          <View style={styles.exportSection}>
            <Text style={styles.sectionTitle}>Comunicação e Exportação</Text>

            <TouchableOpacity style={styles.msgBtn} onPress={handleSendAllEmails}>
              <Mail size={24} color="#fff" />
              <View style={styles.exportTextWrap}>
                <Text style={[styles.exportTitle, { color: '#fff' }]}>E-mail para TODOS</Text>
                <Text style={[styles.exportDesc, { color: '#fff', opacity: 0.8 }]}>Enviar QR Individual por e-mail</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={styles.exportBtn} onPress={handleExportCSV}>
              <Download size={24} color="#212529" />
              <View style={styles.exportTextWrap}>
                <Text style={styles.exportTitle}>Exportar CSV Completo</Text>
                <Text style={styles.exportDesc}>Todos os participantes e seus status</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={styles.exportBtn} onPress={handleExportPDF}>
              <FileText size={24} color="#212529" />
              <View style={styles.exportTextWrap}>
                <Text style={styles.exportTitle}>Relatório de Presença (PDF)</Text>
                <Text style={styles.exportDesc}>Lista de quem fez check-in com horários</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.exportBtn, { borderColor: '#e8f5e9', borderWidth: 1 }]} 
              onPress={handleSendAllDeclarations}
            >
              <FileCheck size={24} color="#28a745" />
              <View style={styles.exportTextWrap}>
                <Text style={[styles.exportTitle, { color: '#28a745' }]}>Enviar Declarações p/ Todos</Text>
                <Text style={styles.exportDesc}>Mandar certificados autenticados por e-mail</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.exportBtn, { borderColor: '#ffebee', borderWidth: 1 }]} onPress={handleClearParticipants}>
              <Trash2 size={24} color="#dc3545" />
              <View style={styles.exportTextWrap}>
                <Text style={[styles.exportTitle, { color: '#dc3545' }]}>Limpar Tudo</Text>
                <Text style={styles.exportDesc}>Excluir permanentemente todos os inscritos</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Progress Overlay para Envio em Lote */}
      {(isSendingEmails || isSendingDeclarations) && (
        <View style={styles.overlay}>
          <View style={styles.overlayCard}>
            <Text style={styles.overlayTitle}>
              {isSendingEmails ? 'Enviando QR Codes...' : 'Gerando Declarações...'}
            </Text>
            <View style={styles.progressContainer}>
              <View style={[styles.progressBar, { width: totalToProcess > 0 ? `${(sendingCount / totalToProcess) * 100}%` : '0%' }]} />
            </View>
            <Text style={styles.progressText}>
              Processando: {sendingCount} de {totalToProcess}
            </Text>
            <Text style={styles.overlaySubText}>O e-mail abrirá automaticamente a cada passo</Text>
          </View>
        </View>
      )}

      {/* QR Code Oculto para geração de arquivos */}
      <View style={{ position: 'absolute', top: -1000, left: -1000, opacity: 0 }}>
        <QRCode
          value={qrValue || 'placeholder'}
          size={200}
          getRef={(c) => (qrRef.current = c)}
        />
      </View>

      {/* Modal for Manual Participant Addition */}
      <Modal 
        visible={isManualModalVisible} 
        animationType="slide" 
        transparent 
        statusBarTranslucent
        onRequestClose={() => setIsManualModalVisible(false)}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <SafeAreaView style={styles.modalOverlay}>
            <KeyboardAvoidingView 
              behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
              keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 100}
              style={{ flex: 1, justifyContent: 'flex-end' }}
            >
              <ScrollView 
                contentContainerStyle={{ flexGrow: 1, justifyContent: 'flex-end' }}
                keyboardShouldPersistTaps="handled"
                bounces={false}
              >
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <View style={styles.modalTitleIcon}>
                   <UserPlus size={24} color="#0056b3" />
                   <Text style={styles.modalTitle}>Novo Inscrito</Text>
                </View>
                <TouchableOpacity onPress={() => setIsManualModalVisible(false)}>
                  <X size={24} color="#6c757d" />
                </TouchableOpacity>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Nome Completo</Text>
                <TextInput 
                  style={styles.input}
                  placeholder="Ex: João da Silva"
                  value={newName}
                  onChangeText={setNewName}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>E-mail</Text>
                <TextInput 
                  style={styles.input}
                  placeholder="joao@exemplo.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  value={newEmail}
                  onChangeText={setNewEmail}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>CPF (Opcional)</Text>
                <TextInput 
                  style={styles.input}
                  placeholder="000.000.000-00"
                  keyboardType="numeric"
                  value={newCpf}
                  onChangeText={setNewCpf}
                />
              </View>

              <View style={styles.inputRow}>
                <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
                  <Text style={styles.label}>Função / Cargo</Text>
                  <TextInput 
                    style={styles.input}
                    placeholder="Ex: Professor"
                    value={newRole}
                    onChangeText={setNewRole}
                  />
                </View>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.label}>Local de Trabalho</Text>
                  <TextInput 
                    style={styles.input}
                    placeholder="Ex: Sede"
                    value={newWorkplace}
                    onChangeText={setNewWorkplace}
                  />
                </View>
              </View>

              <TouchableOpacity style={styles.btnSave} onPress={handleSaveParticipant}>
                <Text style={styles.btnSaveText}>Salvar Participante</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </TouchableWithoutFeedback>
    </Modal>
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
    paddingBottom: 8,
  },
  backBtn: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#212529',
  },
  tabsMenu: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderColor: '#dee2e6',
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 16,
    alignItems: 'center',
  },
  tabBtnActive: {
    borderBottomWidth: 3,
    borderColor: '#0056b3',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6c757d',
  },
  tabTextActive: {
    color: '#0056b3',
  },
  tabContent: {
    flex: 1,
  },
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginLeft: 16,
    marginVertical: 16,
    marginRight: 12,
    borderRadius: 12,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 16,
    color: '#212529',
  },
  filterMenu: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#e9ecef',
    marginRight: 8,
  },
  filterChipActive: {
    backgroundColor: '#343a40',
  },
  filterText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#495057',
  },
  filterTextActive: {
    color: '#fff',
  },
  listContainer: {
    padding: 16,
    paddingBottom: 220,
  },
  participantCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#e6f0fa',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0056b3',
  },
  participantInfo: {
    flex: 1,
    marginLeft: 16,
  },
  participantName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#212529',
    marginBottom: 4,
  },
  participantRole: {
    fontSize: 12,
    color: '#6c757d',
  },
  participantEmail: {
    fontSize: 11,
    color: '#adb5bd',
    marginTop: 2,
  },
  statusBadge: {
    marginLeft: 16,
  },
  pendingBadge: {
    backgroundColor: '#e9ecef',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  pendingText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#6c757d',
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 40,
    color: '#6c757d',
  },
  fab: {
    position: 'absolute',
    bottom: 160,
    right: 24,
    backgroundColor: '#0056b3',
    flexDirection: 'row',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 30,
    alignItems: 'center',
    shadowColor: '#0056b3',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  fabText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  importCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#dee2e6',
    borderStyle: 'dashed',
  },
  importIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#e6f0fa',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  importTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#212529',
    marginBottom: 8,
  },
  importText: {
    fontSize: 14,
    color: '#6c757d',
    textAlign: 'center',
    marginBottom: 32,
  },
  btnPrimary: {
    backgroundColor: '#0056b3',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
  },
  btnPrimaryText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  dashboardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 32,
  },
  dashCard: {
    flex: 1,
    borderRadius: 16,
    padding: 24,
    marginHorizontal: 8,
  },
  dashValue: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#0056b3',
    marginTop: 16,
    marginBottom: 4,
  },
  dashLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#6c757d',
  },
  exportSection: {
    marginTop: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#212529',
    marginBottom: 16,
  },
  exportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  exportTextWrap: {
    marginLeft: 16,
  },
  exportTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#212529',
  },
  exportDesc: {
    fontSize: 12,
    color: '#6c757d',
    marginTop: 4,
  },
  msgBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0056b3',
    padding: 20,
    borderRadius: 16,
    marginBottom: 16,
    shadowColor: '#0056b3',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 2,
  },
  sendingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  sendingCard: {
    backgroundColor: '#fff',
    padding: 32,
    borderRadius: 24,
    alignItems: 'center',
    width: '80%',
  },
  sendingTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#212529',
    marginTop: 16,
  },
  sendingProgress: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#0056b3',
    marginVertical: 8,
  },
  sendingSub: {
    fontSize: 12,
    color: '#6c757d',
    textAlign: 'center',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 16,
  },
  btnAddManual: {
    backgroundColor: '#0056b3',
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#0056b3',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  overlayCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 30,
    width: '85%',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  overlayTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#212529',
    marginBottom: 20,
    textAlign: 'center',
  },
  progressContainer: {
    width: '100%',
    height: 12,
    backgroundColor: '#e9ecef',
    borderRadius: 6,
    overflow: 'hidden',
    marginBottom: 15,
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#0056b3',
  },
  progressText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#0056b3',
    marginBottom: 8,
  },
  overlaySubText: {
    fontSize: 12,
    color: '#6c757d',
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 80,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitleIcon: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#212529',
    marginLeft: 12,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#495057',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#dee2e6',
    fontSize: 16,
    color: '#212529',
  },
  inputRow: {
    flexDirection: 'row',
  },
  btnSave: {
    backgroundColor: '#0056b3',
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
    marginTop: 10,
    shadowColor: '#0056b3',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  btnSaveText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  checkInTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 4,
  },
  checkInTimeText: {
    fontSize: 12,
    color: '#28a745',
    fontWeight: '500',
  },
});
