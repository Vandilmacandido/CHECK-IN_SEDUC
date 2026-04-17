import { getDb } from '../database';

export interface Participante {
  id: string;
  nome: string;
  email: string;
  cpf?: string;
  funcao: string;
  localDeTrabalho: string;
  eventoId: string;
  checkedIn: number;
  checkInTime?: string;
}

export const getParticipantesPorEvento = async (eventoId: string): Promise<Participante[]> => {
  const db = await getDb();
  const rows = await db.getAllAsync('SELECT * FROM participantes WHERE eventoId = ? ORDER BY nome ASC', [eventoId]);
  return rows as Participante[];
};

export const getParticipantesPresentes = async (eventoId: string): Promise<Participante[]> => {
  const db = await getDb();
  const rows = await db.getAllAsync('SELECT * FROM participantes WHERE eventoId = ? AND checkedIn = 1 ORDER BY nome ASC', [eventoId]);
  return rows as Participante[];
};

export const addParticipante = async (participante: Participante) => {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO participantes (id, nome, email, cpf, funcao, localDeTrabalho, eventoId, checkedIn, checkInTime) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [participante.id, participante.nome, participante.email, participante.cpf || '', participante.funcao, participante.localDeTrabalho ?? '', participante.eventoId, participante.checkedIn, participante.checkInTime || null]
  );
};

export const updateCheckIn = async (id: string, checkedIn: number) => {
  const db = await getDb();
  const checkInTime = checkedIn === 1 ? new Date().toLocaleString('pt-BR') : null;
  await db.runAsync('UPDATE participantes SET checkedIn = ?, checkInTime = ? WHERE id = ?', [checkedIn, checkInTime, id]);
};

export const getParticipanteById = async (id: string): Promise<Participante | null> => {
  const db = await getDb();
  const row = await db.getFirstAsync('SELECT * FROM participantes WHERE id = ?', [id]);
  return row as Participante | null;
};

export const clearParticipantes = async (eventoId: string) => {
    const db = await getDb();
    await db.runAsync('DELETE FROM participantes WHERE eventoId = ?', [eventoId]);
};

export const getEventStats = async (eventoId: string) => {
  const db = await getDb();
  const totalRow = await db.getFirstAsync<{total: number}>('SELECT COUNT(*) as total FROM participantes WHERE eventoId = ?', [eventoId]);
  const checkinsRow = await db.getFirstAsync<{checkins: number}>('SELECT COUNT(*) as checkins FROM participantes WHERE eventoId = ? AND checkedIn = 1', [eventoId]);
  
  return {
    total: totalRow?.total || 0,
    checkins: checkinsRow?.checkins || 0,
  };
};

export const checkExistingParticipante = async (eventoId: string, email: string): Promise<boolean> => {
  const db = await getDb();
  const row = await db.getFirstAsync('SELECT id FROM participantes WHERE eventoId = ? AND email = ?', [eventoId, email]);
  return !!row;
};

export const getParticipanteByEmail = async (eventoId: string, email: string): Promise<Participante | null> => {
  const db = await getDb();
  // Case-insensitive search using LOWER
  const row = await db.getFirstAsync('SELECT * FROM participantes WHERE eventoId = ? AND LOWER(email) = LOWER(?)', [eventoId, email]);
  return row as Participante | null;
};
