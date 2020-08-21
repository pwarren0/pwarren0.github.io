// create the machine memory
const MEM_SIZE = 0x200000;
const SCREEN_BASE = 0x100000;
const WORD_SIZE = 4;
const SCREEN_WIDTH = 512;
const SCREEN_HEIGHT = 684;

const SCREEN_END = SCREEN_BASE + SCREEN_WIDTH * SCREEN_HEIGHT;
const SCREEN_OFFSET = SCREEN_BASE * WORD_SIZE;
const SCREEN_LENGTH = SCREEN_WIDTH * SCREEN_HEIGHT * WORD_SIZE;

const memory = new ArrayBuffer(MEM_SIZE * WORD_SIZE);
const M = new Uint32Array(memory);
const screen = new Uint8ClampedArray(memory, SCREEN_OFFSET, SCREEN_LENGTH);
const imgData = new ImageData(screen, SCREEN_WIDTH, SCREEN_HEIGHT);

for (let i = SCREEN_BASE; i < SCREEN_END; i++) {
  M[i] = 0xff000000;
}

window.M = M;

/** @type {HTMLCanvasElement} */
const canvas = document.getElementById('screen');
canvas.width = SCREEN_WIDTH;
canvas.height = SCREEN_HEIGHT;
const ctx = canvas.getContext('2d');

function flush_screen() {
  ctx.putImageData(imgData, 0, 0);
}

const output = document.getElementById('output');
function print(val) {
  output.innerText += val + ' ';
}

/** @type {HTMLTextAreaElement} */
const code = document.getElementById('code');
function load_code() {
  code.value
    .split(/\s/)
    .filter(Boolean)
    .map((v) => parseInt(v, 16))
    .forEach((v, i) => (M[i] = v));
}

/** @type {HTMLButtonElement} */
const start = document.getElementById('start');
start.addEventListener('click', function (event) {
  load_code();
  run_machine();
});

// flush_screen();
const INSTR = [
  'null',
  'jmp',
  'jmpif',
  'save',
  'assign',
  'load',
  'store',
  'add',
  'sub',
  'mul',
  'div',
  'mod',
  'lt',
  'nand',
  'draw',
  'read',
];

const E_HALT = 0;
const E_KEYBOARD = 2;
const E_DRAW = 3;
const E_PRINT = 4;

var PC = 0;
var OP;
var A;
var B;
var C;
var RET;
var RET_CODE;
var globalID;
var stepCount = 0;
var startTime;

function bigstep() {
  while (true) {
    stepCount++;
    OP = M[PC];
    A = M[PC + 1];
    B = M[PC + 2];
    C = M[PC + 3];
    switch (OP) {
      case 0:
        return E_HALT;
      case 1:
        PC = M[A];
        continue;
      case 2:
        PC = M[B] === 0 ? M[A] : PC + 4;
        continue;
      case 3:
        M[A] = PC;
        PC += 4;
        continue;
      case 4:
        M[A] = M[B];
        PC += 4;
        continue;
      case 5:
        M[A] = M[M[B]];
        PC += 4;
        continue;
      case 6:
        M[M[B]] = M[A];
        PC += 4;
        continue;
      case 7:
        M[A] = M[B] + M[C];
        PC += 4;
        continue;
      case 8:
        M[A] = M[B] - M[C];
        PC += 4;
        continue;
      case 9:
        M[A] = M[B] * M[C];
        PC += 4;
        continue;
      case 10:
        M[A] = Math.floor(M[B] / M[C]);
        PC += 4;
        continue;
      case 11:
        M[A] = M[B] % M[C];
        PC += 4;
        continue;
      case 12:
        M[A] = M[B] < M[C] ? 1 : 0;
        PC += 4;
        continue;
      case 13:
        M[A] = ~(M[B] & M[A]);
        PC += 4;
        continue;
      case 14:
        PC += 4;
        return E_DRAW;
      case 15:
        RET_CODE = A;
        PC += 4;
        return E_KEYBOARD;
      case 16:
        RET_CODE = M[A];
        PC += 4;
        return E_PRINT; // put M[A] as output.
      default: {
        console.log(
          `M[${PC}..${PC + 4}]: ${OP} ${A} ${B} ${C}: (no such opcode).`
        );
        return E_HALT;
      }
    }
  }
}

function repeatOften() {
  loop: while (true) {
    RET = bigstep();
    switch (RET) {
      case E_DRAW:
        flush_screen();
        break loop;
      case E_HALT: {
        const duration = Date.now() - startTime;
        const stepsPerSecond = Math.round(stepCount / duration);
        console.log(
          `Halted. (${stepCount} steps, ${stepsPerSecond} steps per second)`
        );
        cancelAnimationFrame(globalID);
        return;
      }
      case E_KEYBOARD: {
        M[RET_CODE] = Math.floor(Math.random() * 256);
        break;
      }
      case E_PRINT: {
        print(RET_CODE);
      }
    }
  }
  globalID = requestAnimationFrame(repeatOften);
}

function run_machine() {
  PC = 0;
  startTime = Date.now();
  globalID = requestAnimationFrame(repeatOften);
}
