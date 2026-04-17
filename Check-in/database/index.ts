import * as SQLite from 'expo-sqlite';

let db: SQLite.SQLiteDatabase | null = null;

export const getDb = async () => {
  if (!db) {
    db = await SQLite.openDatabaseAsync('checkin.db');
  }
  return db;
};

export const initDb = async () => {
  try {
    const database = await getDb();
    
    await database.execAsync('PRAGMA foreign_keys = ON;');
    
    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS eventos (
        id TEXT PRIMARY KEY,
        nome TEXT NOT NULL,
        data TEXT NOT NULL,
        capacidade INTEGER
      );
      
      CREATE TABLE IF NOT EXISTS participantes (
        id TEXT PRIMARY KEY,
        nome TEXT NOT NULL,
        email TEXT,
        cpf TEXT,
        funcao TEXT,
        localDeTrabalho TEXT,
        eventoId TEXT NOT NULL,
        checkedIn INTEGER DEFAULT 0,
        checkInTime TEXT,
        FOREIGN KEY (eventoId) REFERENCES eventos(id) ON DELETE CASCADE
      );
    `);

    // Migration: add localDeTrabalho to existing databases
    try {
      await database.execAsync(
        `ALTER TABLE participantes ADD COLUMN localDeTrabalho TEXT;`
      );
    } catch (_) {
      // Column already exists — safe to ignore
    }

    // Migration: add checkInTime to existing databases
    try {
      await database.execAsync(
        `ALTER TABLE participantes ADD COLUMN checkInTime TEXT;`
      );
    } catch (_) {
      // Column already exists — safe to ignore
    }

    // Migration: add cpf to existing databases
    try {
      await database.execAsync(
        `ALTER TABLE participantes ADD COLUMN cpf TEXT;`
      );
    } catch (_) {
      // Column already exists — safe to ignore
    }

    console.log("Banco de dados inicializado com sucesso.");
  } catch (error) {
    console.error("Erro ao inicializar o banco de dados:", error);
  }
};
