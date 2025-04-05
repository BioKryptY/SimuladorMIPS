// Pipeline com 5 estágios
const pipeline = [null, null, null, null, null];

// Instruções de exemplo
const program = [];

// Definição dos tipos de instruções
const InstructionType = {
   R_TYPE: 'R_TYPE',    // add, sub, mul
   I_TYPE: 'I_TYPE',    // lw, sw, beq
   J_TYPE: 'J_TYPE',     // j
   NOP: 'NOP'
};

// Definição dos opcodes
const Opcode = {
   ADD: 'add',
   SUB: 'sub',
   MUL: 'mul',
   LW: 'lw',
   SW: 'sw',
   BEQ: 'beq',
   J: 'j',
   NOP: 'nop'
};

// Estados do preditor de branch
const BranchState = {
   STRONGLY_TAKEN: 3,
   WEAKLY_TAKEN: 2,
   WEAKLY_NOT_TAKEN: 1,
   STRONGLY_NOT_TAKEN: 0
};

const RegisterAlias = {};
for (let i = 0; i <= 31; i++) {
   RegisterAlias[`$s${i}`] = i;
}

// Classe para representar uma instrução MIPS
class Instruction {
   constructor(type, opcode, rs, rt, rd, offset, target) {
      this.type = type;
      this.opcode = opcode;
      this.rs = rs;     // primeiro registrador fonte
      this.rt = rt;     // segundo registrador fonte
      this.rd = rd;     // registrador destino
      this.offset = offset;  // offset para lw/sw/beq
      this.target = target;  // endereço alvo para j/beq
   }

   toString() {
      switch (this.type) {
         case InstructionType.R_TYPE:
            return `${this.opcode} $${this.rd}, $${this.rs}, $${this.rt}`;
         case InstructionType.I_TYPE:
            if (this.opcode === 'beq') {
               return `${this.opcode} $${this.rs}, $${this.rt}, ${this.offset}`;
            } else {
               return `${this.opcode} $${this.rt}, ${this.offset}($${this.rs})`;
            }
         case InstructionType.J_TYPE:
            return `${this.opcode} ${this.target}`;
         case InstructionType.NOP:
            return 'nop';
         default:
            return '[instrução inválida]';
      }
   }
}

// Classe principal do Pipeline MIPS
class MIPSPipeline {
   constructor() {
      // Registradores do pipeline
      this.registradores = new Array(32).fill(0);  // $0-$31
      this.memoria = new Array(1024).fill(0);   // 1KB de memória

      // Estágios do pipeline
      this.pipelineStages = {
         IF: null,
         ID: null,
         EX: null,
         MEM: null,
         WB: null
      };

      // Contador de programa
      this.PC = 0;

      // Tabela de predição de branch (2 bits)
      this.branchPredictor = new Map();

      // Estado do pipeline
      this.stalled = false;
      this.cycle = 0;

      // Cache de instruções
      this.instructionCache = new Map();

      // Estado de execução
      this.isRunning = false;
      this.runInterval = null;
      this.runSpeed = 1000; // 1 segundo por ciclo

   }

   // Método para executar um ciclo do pipeline
   executeCycle() {
      console.log('Executando ciclo...'); // Debug log

      // Executar forwarding antes de avançar as instruções
      this.executeForwarding();

      // Verificar hazards
      const hasHazard = this.detectHazards();
      if (hasHazard) {
         console.log('Hazard detectado, pipeline estagnado'); // Debug log
         this.stalled = true;
      } else {
         this.stalled = false;
      }

      // Executar estágios em ordem reversa para evitar sobrescrita
      this.executeWB();
      this.executeMEM();
      this.executeEX();
      this.executeID();
      this.executeIF();

      this.cycle++;
      console.log(`Ciclo ${this.cycle} completado`); // Debug log
      this.updateUI();
   }

   // Estágio IF (Instruction Fetch)
   executeIF() {
      if (!this.stalled) {
         const instruction = this.fetchInstruction(this.PC);
         if (instruction) {
            console.log('IF: Buscando instrução', instruction.toString()); // Debug log
            this.pipelineStages.IF = instruction;
         } else {
            console.log('IF: Nenhuma instrução encontrada no endereço', this.PC); // Debug log
         }
      }
   }

   // Estágio ID (Instruction Decode)
   executeID() {
      if (this.pipelineStages.IF) {
         const instruction = this.pipelineStages.IF;
         console.log('ID: Decodificando instrução', instruction.toString()); // Debug log

         // Tratar instruções de controle
         if (instruction.opcode === Opcode.BEQ || instruction.opcode === Opcode.J) {
            const predictedTaken = this.predictBranch(this.PC);

            if (instruction.opcode === Opcode.BEQ) {
               const rsValue = this.registradores[instruction.rs];
               const rtValue = this.registradores[instruction.rt];
               const actualTaken = rsValue === rtValue;

               console.log(`BEQ: rs=${rsValue}, rt=${rtValue}, taken=${actualTaken}`); // Debug log

               // Atualizar preditor
               this.updateBranchPredictor(this.PC, actualTaken);

               if (predictedTaken !== actualTaken) {
                  console.log('Predição incorreta, corrigindo pipeline'); // Debug log
                  // Predição incorreta - inserir NOPs e corrigir PC
                  this.pipelineStages.IF = {
                     type: InstructionType.NOP,
                     opcode: 'nop',
                     toString() { return 'nop'; }
                  };
                  this.pipelineStages.ID = {
                     instruction: {
                        type: InstructionType.NOP,
                        opcode: 'nop',
                        toString() { return 'nop'; }
                     },
                     rsValue: 0,
                     rtValue: 0
                  };

                  if (actualTaken) {
                     this.PC = this.PC + (instruction.offset * 4);
                  } else {
                     this.PC = this.PC + 4;
                  }
                  return;
               } else {
                  // Predição correta, atualizar PC normalmente
                  this.PC = this.PC + 4;
               }
            } else if (instruction.opcode === Opcode.J) {
               this.pipelineStages.IF = {
                  type: InstructionType.NOP,
                  opcode: 'nop',
                  toString() { return 'nop'; }
               };
               this.pipelineStages.ID = {
                  type: InstructionType.NOP,
                  opcode: 'nop',
                  toString() { return 'nop'; }
               };
               console.log(`J: pulando para ${instruction.target}`); // Debug log
               this.PC = instruction.target * 4;
            }
         } else {
            // Para instruções não-branch, incrementar PC normalmente
            this.PC = this.PC + 4;
         }

         this.pipelineStages.ID = {
            instruction: instruction,
            rsValue: this.registradores[instruction.rs],
            rtValue: this.registradores[instruction.rt]
         };
         this.pipelineStages.IF = null;
      }
   }

   // Estágio EX (Execute)
   executeEX() {
      if (this.pipelineStages.ID) {
         const { instruction, rsValue, rtValue } = this.pipelineStages.ID;
         console.log('EX: Executando instrução', instruction.toString()); // Debug log
         let result;

         switch (instruction.opcode) {
            case Opcode.ADD:
               result = rsValue + rtValue;
               console.log(`ADD: ${rsValue} + ${rtValue} = ${result}`); // Debug log
               break;
            case Opcode.SUB:
               result = rsValue - rtValue;
               console.log(`SUB: ${rsValue} - ${rtValue} = ${result}`); // Debug log
               break;
            case Opcode.MUL:
               result = rsValue * rtValue;
               console.log(`MUL: ${rsValue} * ${rtValue} = ${result}`); // Debug log
               break;
            case Opcode.BEQ:
               result = rsValue === rtValue;
               console.log(`BEQ: ${rsValue} === ${rtValue} = ${result}`); // Debug log
               break;
         }

         this.pipelineStages.EX = {
            instruction: instruction,
            result: result
         };
         this.pipelineStages.ID = null;
      }
   }

   // Estágio MEM (Memory Access)
   executeMEM() {
      if (this.pipelineStages.EX) {
         let { instruction, result } = this.pipelineStages.EX;
         console.log('MEM: Acessando memória para instrução', instruction.toString()); // Debug log

         if (instruction.opcode === Opcode.LW) {
            const address = this.registradores[instruction.rs] + instruction.offset;
            result = this.memoria[address / 4];
            console.log(`LW: endereço=${address}, valor=${result}`); // Debug log
         } else if (instruction.opcode === Opcode.SW) {
            const address = this.registradores[instruction.rs] + instruction.offset;
            this.memoria[address / 4] = this.registradores[instruction.rt];
            console.log(`SW: endereço=${address}, valor=${this.registradores[instruction.rt]}`); // Debug log
         }

         this.pipelineStages.MEM = {
            instruction: instruction,
            result: result
         };
         this.pipelineStages.EX = null;
      }
   }

   // Estágio WB (Write Back)
   executeWB() {
      if (this.pipelineStages.MEM) {
         const { instruction, result } = this.pipelineStages.MEM;
         console.log('WB: Escrevendo resultado da instrução', instruction.toString()); // Debug log

         if (instruction.type === InstructionType.R_TYPE) {
            this.registradores[instruction.rd] = result;
            console.log(`WB: registrador $${instruction.rd} = ${result}`); // Debug log
         } else if (instruction.opcode === Opcode.LW) {
            this.registradores[instruction.rt] = result;
            console.log(`WB: registrador $${instruction.rt} = ${result}`); // Debug log
         }

         this.pipelineStages.WB = {
            instruction: instruction,
            result: result
         };
         this.pipelineStages.MEM = null;
      }
   }

   // Método para buscar uma instrução
   fetchInstruction(address) {
      if (this.instructionCache.has(address)) {
         return this.instructionCache.get(address);
      }
      return null;
   }

   // Método para detectar hazards
   detectHazards() {
      return this.detectStructuralHazard() ||
         this.detectDataHazard() ||
         this.detectControlHazard();
   }

   // Detecção de hazard estrutural
   detectStructuralHazard() {
      // Verificar conflito de acesso à memória
      if (this.pipelineStages.MEM && this.pipelineStages.IF) {
         const memInstruction = this.pipelineStages.MEM.instruction;
         if (memInstruction.opcode === Opcode.LW || memInstruction.opcode === Opcode.SW) {
            return true;
         }
      }
      return false;
   }

   // Detecção de hazard de dados
   detectDataHazard() {
      if (!this.pipelineStages.ID || !this.pipelineStages.EX) return false;

      const idInstruction = this.pipelineStages.ID.instruction;
      const exInstruction = this.pipelineStages.EX.instruction;

      // Verificar dependência RAW (Read After Write)
      if (exInstruction.type === InstructionType.R_TYPE) {
         if (idInstruction.rs === exInstruction.rd || idInstruction.rt === exInstruction.rd) {
            return true;
         }
      }

      // Verificar dependência para instruções de load
      if (exInstruction.opcode === Opcode.LW) {
         if (idInstruction.rs === exInstruction.rt || idInstruction.rt === exInstruction.rt) {
            return true;
         }
      }

      return false;
   }

   // Detecção de hazard de controle
   detectControlHazard() {
      if (!this.pipelineStages.ID) return false;

      const idInstruction = this.pipelineStages.ID.instruction;
      return idInstruction.opcode === Opcode.BEQ || idInstruction.opcode === Opcode.J;
   }

   // Método para executar forwarding
   executeForwarding() {
      if (!this.pipelineStages.ID || !this.pipelineStages.EX) return;

      const idInstruction = this.pipelineStages.ID.instruction;
      const exInstruction = this.pipelineStages.EX.instruction;

      // Forwarding EX -> ID
      if (exInstruction.type === InstructionType.R_TYPE) {
         if (idInstruction.rs === exInstruction.rd) {
            this.pipelineStages.ID.rsValue = this.pipelineStages.EX.result;
         }
         if (idInstruction.rt === exInstruction.rd) {
            this.pipelineStages.ID.rtValue = this.pipelineStages.EX.result;
         }
      }

      // Forwarding MEM -> EX
      if (this.pipelineStages.MEM) {
         const memInstruction = this.pipelineStages.MEM.instruction;
         if (memInstruction.type === InstructionType.R_TYPE) {
            if (idInstruction.rs === memInstruction.rd) {
               this.pipelineStages.ID.rsValue = this.pipelineStages.MEM.result;
            }
            if (idInstruction.rt === memInstruction.rd) {
               this.pipelineStages.ID.rtValue = this.pipelineStages.MEM.result;
            }
         }
      }
   }

   // Método para prever o resultado de um branch
   predictBranch(address) {
      if (!this.branchPredictor.has(address)) {
         this.branchPredictor.set(address, BranchState.WEAKLY_NOT_TAKEN);
      }

      const state = this.branchPredictor.get(address);
      return state >= BranchState.WEAKLY_TAKEN;
   }

   // Método para atualizar o preditor de branch
   updateBranchPredictor(address, taken) {
      if (!this.branchPredictor.has(address)) {
         this.branchPredictor.set(address, BranchState.WEAKLY_NOT_TAKEN);
      }

      let state = this.branchPredictor.get(address);

      if (taken) {
         state = Math.min(state + 1, BranchState.STRONGLY_TAKEN);
      } else {
         state = Math.max(state - 1, BranchState.STRONGLY_NOT_TAKEN);
      }

      this.branchPredictor.set(address, state);
   }

   // Método para atualizar a interface
   updateUI() {
      console.log('Atualizando interface...'); // Debug log

      // Atualizar pipeline
      this.updatePipelineDisplay();

      // Atualizar registradores
      this.updateRegistersDisplay();

      // Atualizar memória
      this.updateMemoryDisplay();

      // Atualizar preditor de branch
      this.updateBranchPredictorDisplay();

      console.log('Interface atualizada'); // Debug log
   }

   // Métodos auxiliares para atualização da UI
   updatePipelineDisplay() {
      console.log('Atualizando display do pipeline...'); // Debug log

      // Atualizar cada estágio do pipeline
      for (const estagio in this.pipelineStages) {
         const stageElement = document.getElementById(`${estagio.toLowerCase()}-estagio`);
         if (!stageElement) {
            console.error(`Elemento ${estagio.toLowerCase()}-estagio não encontrado`); // Debug log
            continue;
         }

         const instructionBox = stageElement.querySelector('.caixa-instrucao');
         if (!instructionBox) {
            console.error(`Elemento .caixa-instrucao não encontrado em ${estagio.toLowerCase()}-estagio`); // Debug log
            continue;
         }

         const stageData = this.pipelineStages[estagio];

         if (stageData) {
            // Pode ser o próprio objeto Instruction ou um objeto { instruction: Instruction }
            const instruction = stageData.instruction || stageData;
            if (instruction && typeof instruction.toString === 'function') {
               instructionBox.textContent = instruction.toString();

               // Adicionar classe de hazard se necessário
               if (this.detectHazards()) {
                  instructionBox.classList.add('hazard');
               } else {
                  instructionBox.classList.remove('hazard');
               }
            } else {
               instructionBox.textContent = '[instrução inválida]';
            }
         } else {
            instructionBox.textContent = '';
            instructionBox.classList.remove('hazard');
         }
      }
   }

   updateRegistersDisplay() {
      console.log('Atualizando display dos registradores...'); // Debug log

      const registersList = document.getElementById('registradores-list');
      if (!registersList) {
         console.error('Elemento registradores-list não encontrado'); // Debug log
         return;
      }

      registersList.innerHTML = '';

      // Mostrar registradores $s0-$s7
      for (let i = 0; i <= 31; i++) {
         const registerDiv = document.createElement('div');
         registerDiv.className = 'registrador-item';
         registerDiv.textContent = `$s${i}: ${this.registradores[i]}`;
         console.log(`Registrador $${i}: ${this.registradores[i]}`); // Debug log
         registersList.appendChild(registerDiv);
      }
   }

   updateMemoryDisplay() {
      console.log('Atualizando display da memória...'); // Debug log

      const memoryList = document.getElementById('memoria-list');
      if (!memoryList) {
         console.error('Elemento memoria-list não encontrado'); // Debug log
         return;
      }

      memoryList.innerHTML = '';

      // Mostrar primeiros 31 endereços de memória
      for (let i = 0; i <= 31; i++) {
         const memoryDiv = document.createElement('div');
         memoryDiv.className = 'memoria-item';
         memoryDiv.textContent = `[${i}]: ${this.memoria[i]}`;
         console.log(`Memória[${i}]: ${this.memoria[i]}`); // Debug log
         memoryList.appendChild(memoryDiv);
      }
   }

   updateBranchPredictorDisplay() {
      console.log('Atualizando display do preditor de branch...'); // Debug log

      const branchContainer = document.querySelector('.predicao-branch div');
      if (!branchContainer) {
         console.error('Elemento predicao-branch div não encontrado'); // Debug log
         return;
      }

      branchContainer.innerHTML = '';

      for (const [address, state] of this.branchPredictor) {
         const stateDiv = document.createElement('div');
         stateDiv.className = 'predicao-estado';
         stateDiv.textContent = `PC ${address}: ${this.getBranchStateName(state)}`;
         console.log(`Preditor de branch em PC ${address}: ${this.getBranchStateName(state)}`); // Debug log
         branchContainer.appendChild(stateDiv);
      }
   }

   getBranchStateName(state) {
      switch (state) {
         case BranchState.STRONGLY_TAKEN:
            return 'Strongly Taken';
         case BranchState.WEAKLY_TAKEN:
            return 'Weakly Taken';
         case BranchState.WEAKLY_NOT_TAKEN:
            return 'Weakly Not Taken';
         case BranchState.STRONGLY_NOT_TAKEN:
            return 'Strongly Not Taken';
         default:
            return 'Unknown';
      }
   }

   // Método para carregar um programa
   loadProgram(programText) {
      this.instructionCache.clear();
      this.PC = 0;
      const lines = programText.split('\n');
      let address = 0;
      for (const line of lines) {
         const trimmedLine = line.trim();
         if (trimmedLine && !trimmedLine.startsWith('#')) {
            const instr = this.parseInstruction(trimmedLine);
            if (instr) this.instructionCache.set(address, instr);
            address += 4;
         }
      }
      if (this.instructionCache.size === 0) {
         alert('Nenhuma instrução válida encontrada. Verifique o formato do programa.');
      }
      this.updateUI();
   }

   parseRegister(str) {
      str = str.replace(',', '').trim();
      if (RegisterAlias.hasOwnProperty(str)) return RegisterAlias[str];
      const n = parseInt(str.replace('$', ''));
      const result = isNaN(n) ? null : n;
      console.log(`parseRegister('${str}') => ${result}`);
      return result;
   }

   parseRTypeInstruction(parts) {
      console.log('Parsing R-type:', parts);
      if (parts.length !== 4) return null;
      const rd = this.parseRegister(parts[1]);
      const rs = this.parseRegister(parts[2]);
      const rt = this.parseRegister(parts[3]);
      if ([rd, rs, rt].some(v => v === null)) return null;
      return {
         type: InstructionType.R_TYPE,
         opcode: parts[0],
         rs,
         rt,
         rd,
         toString() {
            return `${this.opcode} $${this.rd}, $${this.rs}, $${this.rt}`;
         }
      };
   }

   parseITypeInstruction(parts) {
      console.log('Parsing I-type:', parts);
      const opcode = parts[0].toLowerCase();

      if (opcode === 'beq') {
         if (parts.length !== 4) return null;
         const rs = this.parseRegister(parts[1]);
         const rt = this.parseRegister(parts[2]);
         const offset = parseInt(parts[3]);
         if ([rs, rt].some(v => v === null) || isNaN(offset)) return null;
         return {
            type: InstructionType.I_TYPE,
            opcode: 'beq',
            rs,
            rt,
            offset,
            toString() {
               return `${this.opcode} $${this.rs}, $${this.rt}, ${this.offset}`;
            }
         };
      } else if (opcode === 'lw' || opcode === 'sw') {
         if (parts.length !== 3) return null;
         const rt = this.parseRegister(parts[1]);
         const offsetMatch = parts[2].match(/(-?\d+)\((\$\w+)\)/);
         if (!offsetMatch) return null;
         const offset = parseInt(offsetMatch[1]);
         const rs = this.parseRegister(offsetMatch[2]);
         if ([rs, rt].some(v => v === null)) return null;
         return {
            type: InstructionType.I_TYPE,
            opcode: opcode,
            rs,
            rt,
            offset,
            toString() {
               return `${this.opcode} $${this.rt}, ${this.offset}($${this.rs})`;
            }
         };
      }
      return null;
   }

   parseJTypeInstruction(parts) {
      console.log('Parsing J-type:', parts);
      if (parts.length !== 2) return null;
      const target = parseInt(parts[1]);
      if (isNaN(target)) return null;
      return {
         type: InstructionType.J_TYPE,
         opcode: parts[0],
         target,
         toString() {
            return `${this.opcode} ${this.target}`;
         }
      };
   }

   // Método para fazer parse de uma instrução
   parseInstruction(line) {
      console.log(`parseInstruction: original line: "${line}"`);
      line = line.split('#')[0].replace(/,/g, '').trim();
      console.log(`parseInstruction: cleaned line: "${line}"`);
      if (!line) return null;
      const parts = line.split(/\s+/);
      const opcode = parts[0].toLowerCase();
      console.log(`parseInstruction: opcode: "${opcode}", parts:`, parts);
      switch (opcode) {
         case 'add':
         case 'sub':
         case 'mul':
            return this.parseRTypeInstruction(parts);
         case 'lw':
         case 'sw':
         case 'beq':
            return this.parseITypeInstruction(parts);
         case 'j':
            return this.parseJTypeInstruction(parts);
         case 'nop':
            return {
               type: InstructionType.NOP,
               opcode: 'nop',
               toString() {
                  return 'nop';
               }
            };
         default:
            console.warn(`parseInstruction: opcode desconhecido "${opcode}"`);
            return null;
      }
   }

   // Método para executar continuamente
   run() {
      if (this.isRunning) return;

      this.isRunning = true;
      this.runInterval = setInterval(() => {
         this.executeCycle();
      }, this.runSpeed);
   }

   // Método para parar a execução
   stop() {
      if (!this.isRunning) return;

      this.isRunning = false;
      clearInterval(this.runInterval);
      this.runInterval = null;
   }

   // Método para resetar o pipeline
   reset() {
      // Parar execução se estiver rodando
      this.stop();

      // Resetar registradores
      this.registradores = new Array(32).fill(0);

      // Resetar memória
      this.memoria = new Array(1024).fill(0);

      // Resetar pipeline
      this.pipelineStages = {
         IF: null,
         ID: null,
         EX: null,
         MEM: null,
         WB: null
      };

      // Resetar PC
      this.PC = 0;

      // Resetar preditor de branch
      this.branchPredictor.clear();

      // Resetar cache de instruções
      this.instructionCache.clear();

      // Resetar estado
      this.stalled = false;
      this.cycle = 0;

      // Atualizar interface
      this.updateUI();
   }

   // Método para ajustar velocidade de execução
   setRunSpeed(speed) {
      this.runSpeed = speed;
      if (this.isRunning) {
         this.stop();
         this.run();
      }
   }
}

let lastLoadedProgram = null;  // salva o último programa carregado

// Inicialização da interface
document.addEventListener('DOMContentLoaded', () => {
   console.log('Inicializando interface...'); // Debug log
   const pipeline = new MIPSPipeline();

   // Event listeners para os botões
   document.getElementById('next-cycle').addEventListener('click', () => {
      console.log('Botão próximo ciclo clicado'); // Debug log
      pipeline.stop();
      pipeline.executeCycle();
   });

   document.getElementById('run').addEventListener('click', () => {
      console.log('Botão executar clicado'); // Debug log
      if (pipeline.isRunning) {
         pipeline.stop();
         document.getElementById('run').textContent = 'Executar';
      } else {
         pipeline.run();
         document.getElementById('run').textContent = 'Parar';
      }
   });

   document.getElementById('file-input').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
         try {
            const data = JSON.parse(event.target.result);

            if (!data.program) {
               alert("Arquivo inválido. Campo 'program' é obrigatório.");
               return;
            }

            lastLoadedProgram = data; // Salva para o reset

            // Carrega o programa
            pipeline.reset();
            pipeline.loadProgram(data.program.join('\n'));

            // Carrega registradores
            if (data.registradores) {
               for (const reg in data.registradores) {
                  const index = RegisterAlias[reg];
                  if (index !== undefined) {
                     pipeline.registradores[index] = data.registradores[reg];
                  }
               }
            }

            // Carrega memória
            if (data.memoria) {
               for (const addr in data.memoria) {
                  const index = parseInt(addr);
                  if (!isNaN(index)) {
                     pipeline.memoria[index] = data.memoria[addr];
                  }
               }
            }

            pipeline.updateUI();

            document.getElementById('run').textContent = 'Executar';
            alert('Programa carregado com sucesso!');
         } catch (err) {
            alert('Erro ao ler o arquivo: ' + err.message);
         }
      };
      reader.readAsText(file);
   });

   document.getElementById('reset').addEventListener('click', () => {
      console.log('Botão reset clicado');

      pipeline.reset();

      if (lastLoadedProgram) {
         // Recarregar o último programa
         pipeline.loadProgram(lastLoadedProgram.program.join('\n'));

         if (lastLoadedProgram.registradores) {
            for (const reg in lastLoadedProgram.registradores) {
               const index = RegisterAlias[reg];
               if (index !== undefined) {
                  pipeline.registradores[index] = lastLoadedProgram.registradores[reg];
               }
            }
         }

         if (lastLoadedProgram.memoria) {
            for (const addr in lastLoadedProgram.memoria) {
               const index = parseInt(addr);
               if (!isNaN(index)) {
                  pipeline.memoria[index] = lastLoadedProgram.memoria[addr];
               }
            }
         }

         pipeline.updateUI();
      }

      document.getElementById('run').textContent = 'Executar';
   });

   // Adicionar controle de velocidade
   const speedControl = document.createElement('div');
   speedControl.className = 'controle-velocidade';
   speedControl.innerHTML = `
      <label for="speed">Velocidade (ms):</label>
      <input type="range" id="speed" min="100" max="2000" step="100" value="1000">
      <span id="speed-value">1000</span>
   `;
   document.querySelector('.controles').appendChild(speedControl);

   document.getElementById('speed').addEventListener('input', (e) => {
      const speed = parseInt(e.target.value);
      document.getElementById('speed-value').textContent = speed;
      pipeline.setRunSpeed(speed);
   });
});
