// 临时 mock：node 环境没有 indexedDB，用内存实现替代 idb-keyval
const memory = new Map<string, unknown>();

export const get = async (key: string) => memory.get(key);
export const set = async (key: string, value: unknown) => {
  memory.set(key, value);
};
export const del = async (key: string) => {
  memory.delete(key);
};
