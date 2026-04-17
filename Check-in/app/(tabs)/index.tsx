import React, { useState, useCallback } from 'react';
import { Plus, BarChart2, Calendar as CalendarIcon, X, Trash2 } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { getEventos, addEvento, deleteEvento, Evento } from '@/services/eventService';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Modal, TextInput, SafeAreaView, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { getEventStats } from '@/services/participantService';
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';

interface EventWithStats extends Evento {
  stats: { total: number; checkins: number };
}

export default function EventosScreen() {
  const [eventos, setEventos] = useState<EventWithStats[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [nome, setNome] = useState('');
  const [data, setData] = useState('');
  const [capacidade, setCapacidade] = useState('');
  
  const router = useRouter();

  const loadEventos = async () => {
    const evts = await getEventos();
    const evtsWithStats = await Promise.all(
      evts.map(async (evt) => {
        const stats = await getEventStats(evt.id);
        return { ...evt, stats };
      })
    );
    setEventos(evtsWithStats);
  };

  useFocusEffect(
    useCallback(() => {
      loadEventos();
    }, [])
  );

  const handleCreateEvent = async () => {
    if (!nome || !data) return;
    const id = uuidv4();
    await addEvento(id, nome, data, parseInt(capacidade) || 0);
    setModalVisible(false);
    setNome('');
    setData('');
    setCapacidade('');
    loadEventos();
  };

  const handleDeleteEvent = (id: string, nome: string) => {
    Alert.alert(
      'Excluir Evento',
      `Deseja realmente excluir o evento "${nome}"? Todos os participantes vinculados também serão removidos.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { 
          text: 'Excluir', 
          style: 'destructive', 
          onPress: async () => {
            await deleteEvento(id);
            loadEventos();
          } 
        }
      ]
    );
  };

  const renderEvent = ({ item }: { item: EventWithStats }) => {
    const progress = item.capacidade > 0 ? item.stats.checkins / item.capacidade : 0;
    
    return (
      <TouchableOpacity 
        style={styles.card}
        onPress={() => router.push(`/event/${item.id}`)}
      >
        <View style={styles.cardHeader}>
          <View>
            <Text style={styles.cardTitle}>{item.nome}</Text>
            <View style={styles.dateRow}>
              <CalendarIcon size={14} color="#6c757d" />
              <Text style={styles.dateText}>{item.data}</Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <TouchableOpacity 
              style={[styles.iconContainer, { backgroundColor: '#ffebee', marginRight: 8 }]}
              onPress={() => handleDeleteEvent(item.id, item.nome)}
            >
              <Trash2 size={20} color="#dc3545" />
            </TouchableOpacity>
            <View style={styles.iconContainer}>
              <BarChart2 size={20} color="#0056b3" />
            </View>
          </View>
        </View>

        <View style={styles.statsContainer}>
          <Text style={styles.statsLabel}>CHECK-INS</Text>
          <View style={styles.statsRow}>
            <Text style={styles.statsValue}>{item.stats.checkins}</Text>
            <Text style={styles.statsTotal}> / {item.capacidade > 0 ? item.capacidade : item.stats.total}</Text>
            
            <View style={styles.progressContainer}>
              <View style={[styles.progressBar, { width: `${Math.min(progress * 100, 100)}%` }]} />
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.greeting}>Bem-vindo,</Text>
        <Text style={styles.title}>Seus Eventos</Text>
      </View>

      <FlatList
        data={eventos}
        keyExtractor={(item) => item.id}
        renderItem={renderEvent}
        contentContainerStyle={styles.listContainer}
        showsVerticalScrollIndicator={false}
      />

      <TouchableOpacity style={styles.fab} onPress={() => setModalVisible(true)}>
        <Plus size={24} color="#fff" />
      </TouchableOpacity>

      <Modal visible={modalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
          style={{ flex: 1 }}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Novo Evento</Text>
                <TouchableOpacity onPress={() => setModalVisible(false)}>
                  <X size={24} color="#000" />
                </TouchableOpacity>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Nome do Evento</Text>
                <TextInput 
                  style={styles.input}
                  placeholder="Ex: Conferência Anual 2025"
                  value={nome}
                  onChangeText={setNome}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Data e Hora</Text>
                <TextInput 
                  style={styles.input}
                  placeholder="DD/MM/YYYY, HH:mm"
                  value={data}
                  onChangeText={setData}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Capacidade</Text>
                <TextInput 
                  style={styles.input}
                  placeholder="0"
                  keyboardType="numeric"
                  value={capacidade}
                  onChangeText={setCapacidade}
                />
              </View>

              <TouchableOpacity style={styles.btnCreate} onPress={handleCreateEvent}>
                <Text style={styles.btnCreateText}>Criar Evento</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
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
    padding: 24,
    paddingTop: 40,
  },
  greeting: {
    fontSize: 16,
    color: '#6c757d',
    marginBottom: 4,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#212529',
  },
  listContainer: {
    padding: 16,
    paddingBottom: 200,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#212529',
    marginBottom: 8,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dateText: {
    marginLeft: 6,
    fontSize: 14,
    color: '#6c757d',
  },
  iconContainer: {
    backgroundColor: '#e6f0fa',
    padding: 8,
    borderRadius: 8,
  },
  statsContainer: {
    marginTop: 8,
  },
  statsLabel: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#495057',
    marginBottom: 4,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statsValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#0056b3',
  },
  statsTotal: {
    fontSize: 14,
    color: '#6c757d',
    marginLeft: 4,
  },
  progressContainer: {
    flex: 1,
    height: 6,
    backgroundColor: '#e9ecef',
    borderRadius: 3,
    marginLeft: 16,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#0056b3',
    borderRadius: 3,
  },
  fab: {
    position: 'absolute',
    bottom: 160,
    right: 24,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#0056b3',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#0056b3',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#f8f9fa',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 180,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#212529',
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#495057',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#e9ecef',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#212529',
  },
  btnCreate: {
    backgroundColor: '#0056b3',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 16,
  },
  btnCreateText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
