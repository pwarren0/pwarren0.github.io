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

// Initialize the screen with black.
// for (let i = SCREEN_BASE; i < SCREEN_END; i++) {
//   M[i] = 0xff000000;
// }

function clear_mem() {
  for (let i = 0; i < M.length; i++) {
    M[i] = 0x00000000;
  }
}

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

var keyMap = {
  ArrowUp: 30,
  ArrowRight: 31,
  ArrowDown: 32,
  ArrowLeft: 33,
};

document.addEventListener('keydown', (event) => {
  if (event.defaultPrevented) {
    return; // Do nothing if event already handled
  }
  if (keyMap[event.code] !== undefined) {
    add_key_press(keyMap[event.code]);
  }
  event.preventDefault();
});

/** @type {HTMLTextAreaElement} */
const code = document.getElementById('code');
function load_code() {
  code.value
    .split(/\s/)
    .filter(Boolean)
    .map((v) => parseInt(v, 16))
    .forEach((v, i) => (M[i] = v));
}

const btn_start = document.getElementById('start');
const btn_step = document.getElementById('step');
const btn_reload = document.getElementById('reload');
btn_start.addEventListener('click', handle_btn);
btn_step.addEventListener('click', handle_btn);
btn_reload.addEventListener('click', handle_btn);

var STATE_INIT = 0;
var STATE_RUNNING = 1;
var STATE_PAUSED = 2;
var STATE_BLOCKED = 3;
var STATE_HALTED = 4;
var STATE_CURR;

var btn_handlers = {
  [STATE_INIT]: {
    start() {
      set_state_running();
    },
    step() {
      set_state_paused();
    },
  },
  [STATE_RUNNING]: {},
  [STATE_PAUSED]: {
    start() {
      set_state_running();
    },
    step() {
      set_state_paused();
    },
    reload() {
      set_state_init();
    },
  },
  [STATE_BLOCKED]: {},
  [STATE_HALTED]: {
    start() {
      set_state_init();
      set_state_running();
    },
    step() {
      set_state_init();
      set_state_paused();
    },
    reload() {
      set_state_init();
    },
  },
};

function handle_btn(event) {
  // dispatch to the relevant handler based for the current state.
  const currentHandlers = btn_handlers[STATE_CURR];
  switch (event.target) {
    case btn_start:
      currentHandlers.start();
      break;
    case btn_step:
      currentHandlers.step();
      break;
    case btn_reload:
      currentHandlers.reload();
      break;
  }
}

function btn_disable_unused() {
  // buttons are disabled if they don't have a handler.
  btn_start.disabled = !btn_handlers[STATE_CURR].start;
  btn_step.disabled = !btn_handlers[STATE_CURR].step;
  btn_reload.disabled = !btn_handlers[STATE_CURR].reload;
}

function set_state_init() {
  STATE_CURR = STATE_INIT;
  PC = 0;
  stepCount = 0;
  btn_disable_unused();
  clear_mem();
  flush_screen();
  load_code();
}
function set_state_running() {
  STATE_CURR = STATE_RUNNING;
  maxStepCount = Number.POSITIVE_INFINITY;
  btn_disable_unused();
  machine_start();
}
function set_state_paused() {
  STATE_CURR = STATE_PAUSED;
  maxStepCount = stepCount + 1;
  btn_disable_unused();
  machine_start();
}
var STATE_RESUME;
function set_state_blocked() {
  STATE_RESUME = STATE_CURR;
  STATE_CURR = STATE_BLOCKED;
  btn_disable_unused();
}
function set_state_resume() {
  if (STATE_RESUME === STATE_PAUSED) {
    set_state_paused();
  }
  if (STATE_RESUME === STATE_RUNNING) {
    set_state_running();
  }
}
function set_state_halted() {
  STATE_CURR = STATE_HALTED;
  btn_disable_unused();
}
set_state_init();

const val = (v) => M[v];
const ptr = (v) => val(M[v]);
const addr = (v) => '$' + v.toString(16);
const addrPtr = (v) => addr(M[v]);
const INSTR = [
  ['null'],
  [' jmp', val],
  [' jif', val, val],
  [' lpc', addr],
  [' mov', addr, val],
  ['load', addr, ptr], // M[A] <- M[M[B]]
  ['stor', val, addrPtr], // M[A] -> M[M[B]]
  [' add', addr, val, val],
  [' sub', addr, val, val],
  [' mul', addr, val, val],
  [' div', addr, val, val],
  [' mod', addr, val, val],
  ['  lt', addr, val, val],
  ['nand', addr, val, val],
  ['draw'],
  ['read', addr],
  ['prnt', val],
];
function show_instr() {
  const fmt = INSTR[OP];
  if (fmt) {
    const [name, ...fmtarg] = fmt;
    const argsVals = [A, B, C];
    const args = fmtarg.map((f, i) => f(argsVals[i])).join(' ');
    console.log(`${PC.toString(16).padStart(4)}: ${name} ${args}`);
  }
}

const E_HALT = 0;
const E_BREAK = 1;
const E_KEYBOARD = 2;
const E_DRAW = 3;
const E_PRINT = 4;

var PC;
var OP;
var A;
var B;
var C;
var RET;
var RET_CODE;

var keyboardBuffer = [];
var requestAnimationFrameHandle;
var maxStepCount;
var stepCount;

function add_key_press(key) {
  if (STATE_CURR === STATE_BLOCKED && RET === E_KEYBOARD) {
    console.log('key press', key);
    M[RET_CODE] = key;
    set_state_resume();
  } else if (STATE_CURR === STATE_RUNNING) {
    keyboardBuffer.push(key);
    // max buffer length
    if (keyboardBuffer.length > 5) {
      keyboardBuffer.shift();
    }
  }
}

function machine_start() {
  requestAnimationFrameHandle = requestAnimationFrame(machine_step_outer);
}
function machine_step_outer() {
  loop: while (true) {
    RET = machine_step_inner();
    switch (RET) {
      case E_DRAW:
        flush_screen();
        break loop;
      case E_HALT: {
        console.log(`Halted. (${stepCount} steps)`);
        cancelAnimationFrame(requestAnimationFrameHandle);
        set_state_halted();
        return;
      }
      case E_KEYBOARD: {
        if (keyboardBuffer.length > 0) {
          M[RET_CODE] = keyboardBuffer.shift();
          break;
        } else {
          cancelAnimationFrame(requestAnimationFrameHandle);
          set_state_blocked();
          return;
        }
      }
      case E_PRINT: {
        print(RET_CODE);
        break;
      }
      case E_BREAK: {
        cancelAnimationFrame(requestAnimationFrameHandle);
        return;
      }
    }
  }
  requestAnimationFrameHandle = requestAnimationFrame(machine_step_outer);
}
function machine_step_inner() {
  while (stepCount < maxStepCount) {
    stepCount++;
    OP = M[PC];
    A = M[PC + 1];
    B = M[PC + 2];
    C = M[PC + 3];
    if (stepCount === maxStepCount) {
      // stepping mode
      show_instr();
    }
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
  return E_BREAK;
}
