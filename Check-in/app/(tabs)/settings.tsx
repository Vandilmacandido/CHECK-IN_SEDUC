import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, SafeAreaView } from 'react-native';
import { clearActiveEventId } from '@/services/activeEvent';
import { getDb } from '@/database';
import { Trash2, AlertOctagon } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

export default function SettingsScreen() {

  const handleClearDb = () => {
    Alert.alert(
      'Atenção',
      'Tem certeza que deseja apagar todos os dados do aplicativo? Isso não pode ser desfeito.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { 
          text: 'Apagar', 
          style: 'destructive',
          onPress: async () => {
            const db = await getDb();
            await db.runAsync('DELETE FROM participantes');
            await db.runAsync('DELETE FROM eventos');
            await clearActiveEventId();
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            Alert.alert('Sucesso', 'Todos os dados foram apagados.');
          }
        }
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Configurações</Text>
      </View>

      <View style={styles.content}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Dados</Text>
          <TouchableOpacity style={styles.settingsRow} onPress={handleClearDb}>
            <View style={styles.rowLeft}>
              <View style={[styles.iconWrap, { backgroundColor: '#ffebee' }]}>
                <Trash2 size={24} color="#dc3545" />
              </View>
              <Text style={styles.rowLabelText}>Apagar Todos os Dados</Text>
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.infoCard}>
          <AlertOctagon size={24} color="#0056b3" style={{ marginBottom: 12 }} />
          <Text style={styles.infoTitle}>Check-in Offline</Text>
          <Text style={styles.infoText}>
            Todos os seus dados estão seguros no armazenamento local do dispositivo. 
            Não é necessária conexão com a internet para gerar e escanear QR Codes ou confirmar presenças.
          </Text>
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
    padding: 24,
    paddingTop: 40,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#dee2e6',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#212529',
  },
  content: {
    padding: 24,
    paddingBottom: 120,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#6c757d',
    textTransform: 'uppercase',
    marginBottom: 16,
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  rowLabelText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#dc3545',
  },
  infoCard: {
    backgroundColor: '#e6f0fa',
    borderRadius: 16,
    padding: 24,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0056b3',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#495057',
    lineHeight: 20,
  },
});
