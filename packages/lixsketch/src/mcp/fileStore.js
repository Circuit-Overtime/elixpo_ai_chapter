import { mkdir, open, readFile, rename, stat, unlink } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createEmptyScene, validateScene } from './scene.js';

const MAX_SCENE_FILE_BYTES = 20 * 1024 * 1024;

export class FileSceneStore {
  constructor(filePath) {
    if (!filePath) throw new Error('A scene file path is required');
    this.filePath = resolve(filePath);
    this.writeChain = Promise.resolve();
  }

  async read() {
    try {
      const details = await stat(this.filePath);
      if (details.size > MAX_SCENE_FILE_BYTES) {
        throw new Error(`Scene file exceeds the ${MAX_SCENE_FILE_BYTES / 1024 / 1024} MB MCP limit`);
      }
      const source = await readFile(this.filePath, 'utf8');
      const scene = JSON.parse(source);
      const validation = validateScene(scene);
      if (!validation.valid) throw new Error(`Invalid scene file: ${validation.errors.join('; ')}`);
      return scene;
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      const scene = createEmptyScene();
      await this.write(scene);
      return scene;
    }
  }

  async write(scene) {
    const validation = validateScene(scene);
    if (!validation.valid) throw new Error(`Refusing to store invalid scene: ${validation.errors.join('; ')}`);
    this.writeChain = this.writeChain.then(async () => {
      await mkdir(dirname(this.filePath), { recursive: true });
      const temporary = `${this.filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
      try {
        const serialized = `${JSON.stringify(scene, null, 2)}\n`;
        if (Buffer.byteLength(serialized, 'utf8') > MAX_SCENE_FILE_BYTES) {
          throw new Error(`Scene file exceeds the ${MAX_SCENE_FILE_BYTES / 1024 / 1024} MB MCP limit`);
        }
        const handle = await open(temporary, 'wx', 0o600);
        try {
          await handle.writeFile(serialized, 'utf8');
          await handle.sync();
        } finally {
          await handle.close();
        }
        await rename(temporary, this.filePath);
      } catch (error) {
        await unlink(temporary).catch(() => {});
        throw error;
      }
    });
    await this.writeChain;
    return structuredClone(scene);
  }

  async info() {
    try {
      const details = await stat(this.filePath);
      return { path: this.filePath, sizeBytes: details.size, updatedAt: details.mtime.toISOString() };
    } catch (error) {
      if (error?.code === 'ENOENT') return { path: this.filePath, sizeBytes: 0, updatedAt: null };
      throw error;
    }
  }
}
