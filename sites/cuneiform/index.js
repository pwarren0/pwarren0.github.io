const MEM_SIZE = 0x200000;
const SCREEN_BASE = 0x100000;
const WORD_SIZE = 4;
const SCREEN_WIDTH = 512;
const SCREEN_HEIGHT = 684;
const MEM_HEIGHT = 4096;

const SCREEN_END = SCREEN_BASE + SCREEN_WIDTH * SCREEN_HEIGHT;
const SCREEN_OFFSET = SCREEN_BASE * WORD_SIZE;
const SCREEN_LENGTH = SCREEN_WIDTH * SCREEN_HEIGHT * WORD_SIZE;

const memory = new ArrayBuffer(MEM_SIZE * WORD_SIZE);
const Mu8 = new Uint8ClampedArray(memory);
const M = new Uint32Array(memory);
const screen = new Uint8ClampedArray(memory, SCREEN_OFFSET, SCREEN_LENGTH);
const imgData = new ImageData(screen, SCREEN_WIDTH, SCREEN_HEIGHT);

if (window.location.hash) {
  download_image(window.location.hash.slice(1));
}

function save_pc_in_jmp_header() {
  // If the memory starts with [1, 2, ...] (that is, a jump instruction where
  // the jump target is the 3rd word), then put the PC in the 3rd word.
  if (M[0] === 1 && M[1] === 2) {
    M[2] = PC;
    console.log('saved PC in header');
  }
}

function download_memory() {
  download(memory, 'img_' + Date.now() + '.bin', 'application/octet-stream');
}

async function load_memory(fileOrBlob) {
  const ab = await fileOrBlob.arrayBuffer();
  const dst = new Uint8Array(memory);
  const src = new Uint8Array(ab);
  dst.set(src);
}

// Function to download data to a file
function download(data, filename, type) {
  var file = new Blob([data], { type: type });
  if (window.navigator.msSaveOrOpenBlob)
    // IE10+
    window.navigator.msSaveOrOpenBlob(file, filename);
  else {
    // Others
    var a = document.createElement('a'),
      url = URL.createObjectURL(file);
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    }, 0);
  }
}

function clear_mem() {
  for (let i = 0; i < M.length; i++) {
    // M[i] = Math.floor(Math.random() * 0x100000000);
    M[i] = 0;
  }
  // Initialize the screen with black.
  // for (let i = SCREEN_BASE; i < SCREEN_END; i++) {
  //   M[i] = 0xff000000;
  // }
}

/** @type {HTMLCanvasElement} */
const canvas = document.getElementById('screen');
canvas.width = SCREEN_WIDTH;
canvas.height = SCREEN_HEIGHT;
const ctx = canvas.getContext('2d');

function flush_screen() {
  // if (createImageBitmap) {
  //   createImageBitmap(imgData, 0, 2048, SCREEN_WIDTH, SCREEN_HEIGHT).then(
  //     (bm) => {
  //       ctx.drawImage(bm, 0, 0, SCREEN_WIDTH, MEM_HEIGHT);
  //     }
  //   );
  // } else {
  ctx.putImageData(imgData, 0, 0);
  // }
}

const output = document.getElementById('output');
function print(val) {
  output.innerText += val + ' ';
}
function clear_output() {
  output.innerText = '';
}

var keyMap = {
  Space: 32,
  ArrowUp: 49,
  ArrowRight: 50,
  ArrowDown: 51,
  ArrowLeft: 52,
};

document.addEventListener('keydown', (event) => {
  if (event.defaultPrevented) {
    return; // Do nothing if event already handled
  }
  if (keyMap[event.code] !== undefined) {
    add_key_press(keyMap[event.code]);
    event.preventDefault();
  } else {
    console.log('unhandled key', event.code, event.keyCode);
  }
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

const btn_save = document.getElementById('save');
const btn_load = document.getElementById('load');
const ipt_files = document.getElementById('files');

const btn_upload = document.getElementById('upload');

btn_start.addEventListener('click', handle_btn);
btn_step.addEventListener('click', handle_btn);
btn_reload.addEventListener('click', handle_btn);

btn_save.addEventListener('click', () => {
  save_pc_in_jmp_header();
  download_memory();
});
btn_load.addEventListener('click', () => {
  ipt_files.click();
});
ipt_files.addEventListener('change', (event) => {
  // Get the FileList object from the file select event
  const files = event.target.files;
  // Check if there are files in the FileList
  if (files.length !== 1) {
    console.log('incorrect #files: ' + files.length);
    return;
  }
  // For this we only want one image. We'll take the first.
  var file = files[0];

  set_state_init();
  load_memory(file).then(() => {
    flush_screen();
    set_state_running(Number.POSITIVE_INFINITY);
    event.target.value = ''; // reset the input field
  });
});

btn_upload.addEventListener('click', async () => {
  const response = await fetch('http://localhost:8080/save', {
    method: 'put',
    headers: {
      'Content-Type': 'application/octet-stream',
    },
    body: new Blob([memory]),
  });
  const { hash } = await response.json();
  window.location.hash = hash;
});

async function download_image(hash) {
  const response = await fetch('http://localhost:8080/img/' + hash);
  const blob = await response.blob();
  set_state_init();
  await load_memory(blob);
  flush_screen();
  set_state_running(Number.POSITIVE_INFINITY);
}

var STATE_INIT = 0;
var STATE_RUNNING = 1;
var STATE_PAUSED = 2;
var STATE_BLOCKED_1 = 3;
var STATE_BLOCKED_N = 4;
var STATE_HALTED = 5;
var STATE_CURR;

var event_handlers = {
  [STATE_INIT]: {
    start() {
      set_state_running(Number.POSITIVE_INFINITY);
    },
    step() {
      set_state_running(1);
    },
  },
  [STATE_RUNNING]: {
    BREAK() {
      set_state_paused();
    },
    READ() {
      set_state_blocked();
    },
    HALT() {
      set_state_halted();
    },
  },
  [STATE_PAUSED]: {
    start() {
      set_state_running(Number.POSITIVE_INFINITY);
    },
    step() {
      set_state_running(1);
    },
    reload() {
      set_state_init();
    },
  },
  [STATE_BLOCKED_1]: {
    KEY() {
      set_state_running(1);
    },
    reload() {
      set_state_init();
      set_state_running(1);
    },
    start() {
      set_state_blocked_n();
    },
  },
  [STATE_BLOCKED_N]: {
    KEY() {
      set_state_running(Number.POSITIVE_INFINITY);
    },
    reload() {
      set_state_init();
      set_state_running(Number.POSITIVE_INFINITY);
    },
    step() {
      set_state_blocked_1();
    },
  },
  [STATE_HALTED]: {
    reload() {
      set_state_init();
    },
    start() {
      set_state_init();
      set_state_running(Number.POSITIVE_INFINITY);
    },
    step() {
      set_state_init();
      set_state_running(1);
    },
  },
};

function handle_btn(event) {
  // dispatch to the relevant handler based for the current state.
  const currentHandlers = event_handlers[STATE_CURR];
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
function handle_event(code) {
  // dispatch to the relevant handler based for the current state.
  const currentHandlers = event_handlers[STATE_CURR];
  switch (code) {
    case E_BREAK: {
      if (currentHandlers.BREAK) {
        currentHandlers.BREAK();
      }
      break;
    }
    case E_KEYBOARD: {
      if (currentHandlers.READ) {
        currentHandlers.READ();
      }
      break;
    }
    case E_HALT: {
      if (currentHandlers.HALT) {
        currentHandlers.HALT();
      }
      break;
    }
    case 'key': {
      if (currentHandlers.KEY) {
        currentHandlers.KEY();
      }
      break;
    }
  }
}

function btn_disable_unused() {
  // buttons are disabled if they don't have a handler.
  btn_start.disabled = !event_handlers[STATE_CURR].start;
  btn_step.disabled = !event_handlers[STATE_CURR].step;
  btn_reload.disabled = !event_handlers[STATE_CURR].reload;
}

function set_state_init() {
  STATE_CURR = STATE_INIT;
  PC = 0;
  stepCount = 0;
  btn_disable_unused();
  clear_mem();
  clear_output();
  flush_screen();
  load_code();
}
function set_state_running(gas) {
  STATE_CURR = STATE_RUNNING;
  maxStepCount = stepCount + gas;
  btn_disable_unused();
  machine_start();
}
function set_state_paused() {
  STATE_CURR = STATE_PAUSED;
  btn_disable_unused();
}
function set_state_blocked() {
  if (maxStepCount > stepCount) {
    set_state_blocked_n();
  } else {
    set_state_blocked_1();
  }
}
function set_state_blocked_1() {
  STATE_CURR = STATE_BLOCKED_1;
  btn_disable_unused();
}
function set_state_blocked_n() {
  STATE_CURR = STATE_BLOCKED_N;
  btn_disable_unused();
}
function is_blocked() {
  return STATE_CURR === STATE_BLOCKED_1 || STATE_CURR == STATE_BLOCKED_N;
}
function set_state_halted() {
  STATE_CURR = STATE_HALTED;
  btn_disable_unused();
}
set_state_init();
set_state_running(Number.POSITIVE_INFINITY); // be brave! have the machine start as running.

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
  if (is_blocked() && RET === E_KEYBOARD) {
    M[RET_CODE] = key;
    handle_event('key');
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
        handle_event(E_HALT);
        return;
      }
      case E_KEYBOARD: {
        if (keyboardBuffer.length > 0) {
          M[RET_CODE] = keyboardBuffer.shift();
          break;
        } else {
          cancelAnimationFrame(requestAnimationFrameHandle);
          handle_event(E_KEYBOARD);
          return;
        }
      }
      case E_PRINT: {
        print(RET_CODE);
        break;
      }
      case E_BREAK: {
        cancelAnimationFrame(requestAnimationFrameHandle);
        handle_event(E_BREAK);
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
