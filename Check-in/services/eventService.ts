import { getDb } from '../database';

export interface Evento {
  id: string;
  nome: string;
  data: string;
  capacidade: number;
}

export const addEvento = async (id: string, nome: string, data: string, capacidade: number) => {
  const db = await getDb();
  await db.runAsync('INSERT INTO eventos (id, nome, data, capacidade) VALUES (?, ?, ?, ?)', [id, nome, data, capacidade]);
};

export const getEventos = async (): Promise<Evento[]> => {
  const db = await getDb();
  const allRows = await db.getAllAsync('SELECT * FROM eventos ORDER BY data DESC');
  return allRows as Evento[];
};

export const getEventoById = async (id: string): Promise<Evento | null> => {
  const db = await getDb();
  const row = await db.getFirstAsync('SELECT * FROM eventos WHERE id = ?', [id]);
  return row ? (row as Evento) : null;
};

export const deleteEvento = async (id: string) => {
  const db = await getDb();
  await db.runAsync('DELETE FROM eventos WHERE id = ?', [id]);
};
