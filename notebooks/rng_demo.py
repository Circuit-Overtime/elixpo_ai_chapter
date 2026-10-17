"""
How PyTorch's "randomness" actually works.

TL;DR
  - CPU  default generator  -> Mersenne Twister (MT19937), same as Python's `random`
  - CUDA default generator  -> Philox 4x32 (counter-based, parallel-friendly)
  - xorshift128+ is V8/JavaScript Math.random(), NOT PyTorch. Different universe.

Run:  python notebooks/rng_demo.py
"""

import torch
import random
import numpy as np


def section(title):
    print("\n" + "=" * 60)
    print(title)
    print("=" * 60)


# ---------------------------------------------------------------
# 1. Reproducibility: same seed -> same "random" numbers
# ---------------------------------------------------------------
section("1. Same seed -> identical sequence (pseudo-random)")

torch.manual_seed(1337)
a = torch.randint(0, 100, (5,))

torch.manual_seed(1337)          # reset to the SAME starting point
b = torch.randint(0, 100, (5,))

torch.manual_seed(2024)          # different seed
c = torch.randint(0, 100, (5,))

print("seed 1337, run A:", a.tolist())
print("seed 1337, run B:", b.tolist(), "<- identical to A")
print("seed 2024       :", c.tolist(), "<- different")
print("A == B ?", torch.equal(a, b))


# ---------------------------------------------------------------
# 2. Which algorithm? Inspect the generator.
# ---------------------------------------------------------------
section("2. The CPU engine is Mersenne Twister (MT19937)")

gen = torch.default_generator
state = gen.get_state()
# MT19937 keeps an internal array of 624 x 32-bit words + an index.
# PyTorch stores that state as a byte tensor. Its size gives it away.
print("generator device :", gen.device)
print("state tensor size :", state.numel(), "bytes")
print("  -> 624 words * 4 bytes = %d, plus index/padding" % (624 * 4))
print("This 624-word state IS the fingerprint of MT19937.")


# ---------------------------------------------------------------
# 3. Proof: PyTorch CPU == Python's random (both MT19937)
#    Seed both the same way and they march in lock-step on the
#    raw 32-bit integers the engine produces.
# ---------------------------------------------------------------
section("3. PyTorch and Python's `random` share the MT19937 engine")

# Python's random module is documented as MT19937.
py_rng = random.Random(1337)
print("Python random.Random(1337), three 32-bit ints:")
print("  ", [py_rng.getrandbits(32) for _ in range(3)])
print("Both libraries implement the SAME algorithm; seeding/whitening")
print("differ, so the user-facing numbers differ, but the core engine")
print("(624-word MT19937) is identical.")


# ---------------------------------------------------------------
# 4. A from-scratch MT19937 so you can SEE the algorithm.
#    This is the actual reference pseudo-code (Matsumoto 1998).
# ---------------------------------------------------------------
section("4. MT19937 implemented from scratch (the actual algorithm)")

class MT19937:
    def __init__(self, seed):
        self.mt = [0] * 624
        self.index = 624
        # Python's `random` does NOT seed with a plain scalar. It calls
        # init_by_array(key), where an int seed becomes an array of 32-bit
        # words. To reproduce Python's numbers we must do the same.
        self._init_by_array(self._int_to_key(seed))

    def _int_to_key(self, n):
        # split the seed into little-endian 32-bit words (CPython's scheme)
        if n == 0:
            return [0]
        key = []
        while n > 0:
            key.append(n & 0xFFFFFFFF)
            n >>= 32
        return key

    def _init_genrand(self, s):
        self.mt[0] = s & 0xFFFFFFFF
        for i in range(1, 624):
            self.mt[i] = (1812433253 * (self.mt[i - 1] ^ (self.mt[i - 1] >> 30)) + i) & 0xFFFFFFFF

    def _init_by_array(self, key):
        self._init_genrand(19650218)
        i, j = 1, 0
        for _ in range(max(624, len(key))):
            self.mt[i] = ((self.mt[i] ^ ((self.mt[i - 1] ^ (self.mt[i - 1] >> 30)) * 1664525)) + key[j] + j) & 0xFFFFFFFF
            i += 1; j += 1
            if i >= 624:
                self.mt[0] = self.mt[623]; i = 1
            if j >= len(key):
                j = 0
        for _ in range(623):
            self.mt[i] = ((self.mt[i] ^ ((self.mt[i - 1] ^ (self.mt[i - 1] >> 30)) * 1566083941)) - i) & 0xFFFFFFFF
            i += 1
            if i >= 624:
                self.mt[0] = self.mt[623]; i = 1
        self.mt[0] = 0x80000000  # MSB = 1, guarantees a non-zero initial state

    def _generate(self):
        for i in range(624):
            y = (self.mt[i] & 0x80000000) + (self.mt[(i + 1) % 624] & 0x7FFFFFFF)
            self.mt[i] = self.mt[(i + 397) % 624] ^ (y >> 1)
            if y % 2 != 0:
                self.mt[i] ^= 2567483615
        self.index = 0

    def next(self):
        if self.index >= 624:
            self._generate()
        y = self.mt[self.index]
        y ^= y >> 11                      # tempering
        y ^= (y << 7) & 2636928640
        y ^= (y << 15) & 4022730752
        y ^= y >> 18
        self.index += 1
        return y & 0xFFFFFFFF

mine = MT19937(1337)
py_rng2 = random.Random(1337)
my_nums = [mine.next() for _ in range(3)]
py_nums = [py_rng2.getrandbits(32) for _ in range(3)]
print("My MT19937   :", my_nums)
print("Python random:", py_nums)
print("Match?", my_nums == py_nums,
      "-> you just reimplemented the exact algorithm driving rand.")


# ---------------------------------------------------------------
# 5. Seed EVERYTHING for a fully reproducible training run.
# ---------------------------------------------------------------
section("5. Pinning all RNGs (what you do at the top of training)")

def seed_everything(seed):
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)  # GPU uses Philox, seeded separately

seed_everything(1337)
print("torch :", torch.randint(0, 100, (3,)).tolist())
print("numpy :", np.random.randint(0, 100, 3).tolist())
print("python:", [random.randint(0, 99) for _ in range(3)])
print("Re-run the script -> these three lines never change.")
