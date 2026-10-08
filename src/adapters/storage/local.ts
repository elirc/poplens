import { promises as fs } from "node:fs";
import path from "node:path";
import { env } from "@/env";
import type { StorageAdapter } from "../types";

function resolveKey(key: string): string {
  const safe = path.normalize(key).replace(/^(\.\.(\/|\\|$))+/, "");
  const full = path.resolve(env.LOCAL_STORAGE_DIR, safe);
  const root = path.resolve(env.LOCAL_STORAGE_DIR);
  if (!full.startsWith(root)) throw new Error(`Unsafe storage key: ${key}`);
  return full;
}

/** Local-disk storage under LOCAL_STORAGE_DIR (default .storage/). */
export const localStorageAdapter: StorageAdapter = {
  async put(key, data) {
    const full = resolveKey(key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, data);
  },
  async get(key) {
    try {
      return await fs.readFile(resolveKey(key));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw e;
    }
  },
  async exists(key) {
    try {
      await fs.access(resolveKey(key));
      return true;
    } catch {
      return false;
    }
  },
  async delete(key) {
    try {
      await fs.unlink(resolveKey(key));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
  },
};
