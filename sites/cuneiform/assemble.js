let I = 0;
const M = [];

function emit(val) {
  const addr = I;
  M[addr] = val;
  I++;
  return addr;
}

const emit4 = (instruction, A = 0, B = 0, C = 0) =>
  [instruction, A, B, C].map(emit);

const alloc4 = () => [0xcafebabe, 0xcafebabe, 0xcafebabe, 0xcafebabe].map(emit);
// const alloc = (len, values) => [].map(emit);

const jmp = (A) => emit4(0x1, A); // PC <- M[A]
const jif = (A, B) => emit4(0x2, A, B); // if M[B] = 0 then PC <- M[A]
const sub = (A, B, C) => emit4(0x8, A, B, C); // M[A] = M[B] - M[C];
const print = (A) => emit4(0x10, A);
const read = (A) => emit4(0xf, A);

const label = (addr) => (M[addr] = I);

//  let acc
//  let x = 100
// while x != 0
//  acc = read()  // E_KEYBOARD
//  print(acc) // "non-standard" opcode 16
//  x--;

// jmp(_START); where M[_START] = 8 //skip over memory allocations
emit4(0x1, I + 2, 8, 0); // problem: this is a forward declaration

const START = 2; // M[2] = 8
// _START = -1;
// JMP ...
// ACC X _ _
const [ACC, X, END, _1] = alloc4();
M[ACC] = 42; // we can statically declare the inital value of a memory location.
M[X] = 100;
M[_1] = 1;

// START = 8
if (I != 8) throw Error(); // assert start

label(START);
jif(END, X); // while X != 0
read(ACC); // acc = read()
print(ACC); // print(acc)
sub(X, X, _1); // x--
jmp(START); // repeat while
label(END); // end while

for (let i = 0; i < M.length; i += 4) {
  console.log(
    M.slice(i, i + 4)
      .map((v) => v.toString(16))
      .join(' ')
  );
}
