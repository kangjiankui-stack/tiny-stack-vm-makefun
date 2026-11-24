// Tiny stack VM for make.fun's tiny-stack-vm-01 bounty.
// A faithful interpreter of the tiny stack ISA version 1 (see ISA.md in the
// kit): 32-bit wrapping values, a 256-value data stack, 64 return addresses,
// 256 words of memory, and every trap with its own exit code. Reads
// /input/<id>/{program,input}.bin and writes /output/<id>/{stdout.bin,exit.txt}.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Opcode table: byte -> imm + pops * 8 + pushes * 64. The set is ISA.md's.
const T = { 0: 0, 1: 65, 2: 68, 3: 8, 4: 136, 5: 144, 6: 208, 7: 216, 16: 80, 17: 80, 18: 80, 19: 80, 20: 80, 21: 80, 22: 80, 23: 72, 24: 80, 25: 80, 26: 80, 27: 72, 28: 80, 29: 80, 30: 80, 32: 80, 33: 80, 34: 80, 48: 2, 49: 10, 50: 10, 51: 2, 52: 0, 64: 72, 65: 16, 80: 8, 81: 8, 82: 64, 83: 8 };

function run(p, inp) {
  const D = new Int32Array(256);
  let sp = 0;
  const C = new Int32Array(64);
  let cp = 0;
  const M = new Int32Array(256);
  const out = new Uint8Array(65536);
  let ol = 0, ip = 0, pc = 0, st = 0;
  const end = (code) => ({ out: out.subarray(0, ol), code });
  for (;;) {
    if (st === 1e6) return end(10);
    if (pc < 0 || pc >= p.length) return end(9);
    const op = p[pc];
    const t = T[op];
    if (t === undefined) return end(5);
    const im = t & 7, po = (t >> 3) & 3, pu = (t >> 5) & 3;
    if (pc + im >= p.length) return end(9);
    st++;
    const nx = pc + 1 + im;
    if (sp < po) return end(2);
    if (sp - po + pu > 256) return end(3);
    pc = nx;
    if (op >= 16 && op <= 34 && op !== 23 && op !== 27) {
      const b = D[sp - 1], a = D[sp - 2];
      let r = 0;
      if (op === 16) r = (a + b) | 0;
      else if (op === 17) r = (a - b) | 0;
      else if (op === 18) r = Math.imul(a, b);
      else if (op === 19) {
        if (b === 0) return end(4);
        r = a === -2147483648 && b === -1 ? a : (a / b) | 0;
      } else if (op === 20) {
        if (b === 0) return end(4);
        r = b === -1 ? 0 : (a % b) | 0;
      } else if (op === 21) {
        if (b === 0) return end(4);
        r = Math.floor((a >>> 0) / (b >>> 0)) | 0;
      } else if (op === 22) {
        if (b === 0) return end(4);
        r = ((a >>> 0) % (b >>> 0)) | 0;
      } else if (op === 24) r = a & b;
      else if (op === 25) r = a | b;
      else if (op === 26) r = a ^ b;
      else if (op === 28) r = a << (b & 31);
      else if (op === 29) r = a >> (b & 31);
      else if (op === 30) r = (a >>> (b & 31)) | 0;
      else if (op === 32) r = a === b ? 1 : 0;
      else if (op === 33) r = a < b ? 1 : 0;
      else r = (a >>> 0) < (b >>> 0) ? 1 : 0;
      sp -= 2;
      D[sp++] = r;
      continue;
    }
    const rel = ((p[nx - 2] | (p[nx - 1] << 8)) << 16) >> 16;
    switch (op) {
      case 0: return end(0);
      case 1: D[sp++] = (p[nx - 1] << 24) >> 24; break;
      case 2: D[sp++] = p[nx - 4] | (p[nx - 3] << 8) | (p[nx - 2] << 16) | (p[nx - 1] << 24); break;
      case 3: sp--; break;
      case 4: D[sp] = D[sp - 1]; sp++; break;
      case 5: { const x = D[sp - 1]; D[sp - 1] = D[sp - 2]; D[sp - 2] = x; break; }
      case 6: D[sp] = D[sp - 2]; sp++; break;
      case 7: { const x = D[sp - 3]; D[sp - 3] = D[sp - 2]; D[sp - 2] = D[sp - 1]; D[sp - 1] = x; break; }
      case 23: D[sp - 1] = (-D[sp - 1]) | 0; break;
      case 27: D[sp - 1] = ~D[sp - 1]; break;
      case 48: pc = nx + rel; break;
      case 49: if (D[--sp] === 0) pc = nx + rel; break;
      case 50: if (D[--sp] !== 0) pc = nx + rel; break;
      case 51:
        if (cp === 64) return end(7);
        C[cp++] = nx;
        pc = p[nx - 2] | (p[nx - 1] << 8);
        break;
      case 52:
        if (cp === 0) return end(8);
        pc = C[--cp];
        break;
      case 64: {
        const a = D[sp - 1];
        if (a < 0 || a >= 256) return end(6);
        D[sp - 1] = M[a];
        break;
      }
      case 65: {
        const a = D[sp - 1], v = D[sp - 2];
        if (a < 0 || a >= 256) return end(6);
        sp -= 2;
        M[a] = v;
        break;
      }
      case 80: {
        const s = String(D[sp - 1]);
        if (ol + s.length > 65536) return end(11);
        sp--;
        for (let i = 0; i < s.length; i++) out[ol++] = s.charCodeAt(i);
        break;
      }
      case 81:
        if (ol + 1 > 65536) return end(11);
        out[ol++] = D[--sp] & 255;
        break;
      case 82: D[sp++] = ip < inp.length ? inp[ip++] : -1; break;
      case 83: return end(D[--sp] & 255);
    }
  }
}

const I = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const O = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
for (const id of readdirSync(I).sort()) {
  const r = run(new Uint8Array(readFileSync(join(I, id, 'program.bin'))), new Uint8Array(readFileSync(join(I, id, 'input.bin'))));
  mkdirSync(join(O, id), { recursive: true });
  writeFileSync(join(O, id, 'stdout.bin'), r.out);
  writeFileSync(join(O, id, 'exit.txt'), r.code + '\n');
}
