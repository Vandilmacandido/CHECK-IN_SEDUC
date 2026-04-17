import AsyncStorage from '@react-native-async-storage/async-storage';

const ACTIVE_EVENT_KEY = '@active_event_id';

export const setActiveEventId = async (id: string) => {
  await AsyncStorage.setItem(ACTIVE_EVENT_KEY, id);
};

export const getActiveEventId = async (): Promise<string | null> => {
  return await AsyncStorage.getItem(ACTIVE_EVENT_KEY);
};

export const clearActiveEventId = async () => {
  await AsyncStorage.removeItem(ACTIVE_EVENT_KEY);
};
