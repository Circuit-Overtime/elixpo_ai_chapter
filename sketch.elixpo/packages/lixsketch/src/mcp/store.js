import { createEmptyScene, validateScene } from './scene.js';

export class MemorySceneStore {
  #scene;

  constructor(scene = createEmptyScene()) {
    const validation = validateScene(scene);
    if (!validation.valid) throw new Error(`Invalid initial scene: ${validation.errors.join('; ')}`);
    this.#scene = structuredClone(scene);
  }

  async read() {
    return structuredClone(this.#scene);
  }

  async write(scene) {
    const validation = validateScene(scene);
    if (!validation.valid) throw new Error(`Refusing to store invalid scene: ${validation.errors.join('; ')}`);
    this.#scene = structuredClone(scene);
    return this.read();
  }
}

