// Simple semaphore for concurrency limiting
export class Semaphore {
    constructor(max) {
      this.max = max;
      this.current = 0;
      this.queue = [];
    }
  
    async acquire() {
      if (this.current < this.max) {
        this.current++;
        return;
      }
      return new Promise(resolve => this.queue.push(resolve));
    }
  
    release() {
      this.current--;
      if (this.queue.length > 0) {
        this.current++;
        const resolve = this.queue.shift();
        resolve();
      }
    }
  }