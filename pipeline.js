// Pipeline com 5 estágios
const pipeline = [null, null, null, null, null];

// Instruções de exemplo
const program = [];

/**
 * Conjunto de Instruções MIPS Suportado
 *
 * O simulador implementa um subconjunto básico do conjunto de instruções MIPS,
 * incluindo as instruções necessárias para demonstrar o funcionamento do pipeline.
 *
 * Tipos de Instruções:
 * 1. R-Type (Registrador)
 *    - Formato: op $rd, $rs, $rt
 *    - Instruções:
 *      * add $rd, $rs, $rt  // Soma: $rd = $rs + $rt
 *      * sub $rd, $rs, $rt  // Subtração: $rd = $rs - $rt
 *      * mul $rd, $rs, $rt  // Multiplicação: $rd = $rs * $rt
 *
 * 2. I-Type (Imediato)
 *    - Formato: op $rt, offset($rs)
 *    - Instruções:
 *      * lw $rt, offset($rs)  // Load Word: $rt = Mem[$rs + offset]
 *      * sw $rt, offset($rs)  // Store Word: Mem[$rs + offset] = $rt
 *      * beq $rs, $rt, label  // Branch if Equal: if ($rs == $rt) PC = label
 *
 * 3. J-Type (Jump)
 *    - Formato: op target
 *    - Instruções:
 *      * j target  // Jump: PC = target
 *
 * 4. NOP
 *    - Formato: nop
 *    - Instrução especial para stalls e bubbles no pipeline
 */

// Definição dos tipos de instruções
const InstructionType = {
   R_TYPE: 'R_TYPE',    // add, sub, mul
   I_TYPE: 'I_TYPE',    // lw, sw, beq
   J_TYPE: 'J_TYPE',     // j
   NOP: 'NOP'
};

// Definição dos opcodes
const Opcode = {
   ADD: 'add',    // Soma dois registradores
   SUB: 'sub',    // Subtrai dois registradores
   MUL: 'mul',    // Multiplica dois registradores
   LW: 'lw',      // Carrega da memória
   SW: 'sw',      // Armazena na memória
   BEQ: 'beq',    // Branch if equal
   J: 'j',        // Jump incondicional
   NOP: 'nop'     // No operation
};

// Estados do preditor de branch
const BranchState = {
   STRONGLY_TAKEN: 3,      // Fortemente tomado
   WEAKLY_TAKEN: 2,        // Fracamente tomado
   WEAKLY_NOT_TAKEN: 1,    // Fracamente não tomado
   STRONGLY_NOT_TAKEN: 0   // Fortemente não tomado
};

// Mapeamento de aliases de registradores para índices
const RegisterAlias = {};
for (let i = 0; i <= 31; i++) {
   RegisterAlias[`$s${i}`] = i;
}

// Mapeamento inverso para exibição
const RegisterName = {};
for (let i = 0; i <= 31; i++) {
   RegisterName[i] = `$s${i}`;
}

/**
 * Classe que representa uma instrução MIPS
 *
 * Esta classe encapsula todas as informações necessárias para representar
 * uma instrução MIPS, incluindo seu tipo, opcode e operandos.
 *
 * Campos:
 * - type: Tipo da instrução (R_TYPE, I_TYPE, J_TYPE, NOP)
 * - opcode: Código da operação (add, sub, mul, lw, sw, beq, j)
 * - rs: Primeiro registrador fonte (para R-type e I-type)
 * - rt: Segundo registrador fonte (para R-type) ou registrador destino (para I-type)
 * - rd: Registrador destino (para R-type)
 * - offset: Deslocamento para instruções de memória e branch
 * - target: Endereço alvo para instruções de jump
 *
 * Métodos:
 * - toString(): Retorna a representação em string da instrução
 */
class Instruction {
   constructor(type, opcode, rs, rt, rd, offset, target) {
      this.type = type;      // Tipo da instrução (R_TYPE, I_TYPE, J_TYPE, NOP)
      this.opcode = opcode;  // Código da operação
      this.rs = rs;         // Primeiro registrador fonte
      this.rt = rt;         // Segundo registrador fonte ou destino
      this.rd = rd;         // Registrador destino
      this.offset = offset; // Deslocamento para memória/branch
      this.target = target; // Endereço alvo para jump
   }

   /**
    * Retorna a representação em string da instrução
    *
    * O formato da string depende do tipo da instrução:
    * - R-type: "op $rd, $rs, $rt"
    * - I-type (lw/sw): "op $rt, offset($rs)"
    * - I-type (beq): "op $rs, $rt, offset"
    * - J-type: "op target"
    * - NOP: "nop"
    */
   toString() {
      switch (this.type) {
         case InstructionType.R_TYPE:
            return `${this.opcode} ${RegisterName[this.rd]}, ${RegisterName[this.rs]}, ${RegisterName[this.rt]}`;
         case InstructionType.I_TYPE:
            if (this.opcode === 'beq') {
               return `${this.opcode} ${RegisterName[this.rs]}, ${RegisterName[this.rt]}, ${this.offset}`;
            } else {
               return `${this.opcode} ${RegisterName[this.rt]}, ${this.offset}(${RegisterName[this.rs]})`;
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

/**
 * Implementação do Pipeline MIPS
 *
 * O pipeline é implementado como uma classe MIPSPipeline que gerencia:
 * 1. Os 5 estágios do pipeline (IF, ID, EX, MEM, WB)
 * 2. Os registradores ($s0-$s31)
 * 3. A memória (array de 1KB)
 * 4. O contador de programa (PC)
 * 5. O preditor de branch
 *
 * Estrutura do Pipeline:
 * - Cada estágio é representado por um slot no objeto pipelineStages
 * - As instruções avançam de um estágio para outro a cada ciclo
 * - O pipeline pode ser estagnado (stalled) em caso de hazards
 *
 * Ciclo de Execução:
 * 1. Verifica hazards e executa forwarding
 * 2. Executa os estágios em ordem reversa (WB → MEM → EX → ID → IF)
 * 3. Atualiza a interface do usuário
 *
 * Registradores:
 * - 32 registradores ($0-$31)
 * - Valores armazenados em um array
 * - Suporte a aliases (ex: $s0, $s31)
 *
 * Memória:
 * - Array de 1KB (1024 bytes)
 * - Suporte a load/store
 */
class MIPSPipeline {
   constructor() {
      // Registradores do pipeline
      this.registradores = new Array(32).fill(0);  // $0-$31
      this.memoria = new Array(1024).fill(0);   // 1KB de memória

      // Estágios do pipeline
      this.pipelineStages = {
         IF: null,  // Instruction Fetch
         ID: null,  // Instruction Decode
         EX: null,  // Execute
         MEM: null, // Memory Access
         WB: null   // Write Back
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

   /**
    * Executa um ciclo completo do pipeline
    *
    * O ciclo é executado em ordem reversa para evitar sobrescrita:
    * 1. WB: Escreve resultados nos registradores
    * 2. MEM: Acessa memória
    * 3. EX: Executa operações
    * 4. ID: Decodifica instrução
    * 5. IF: Busca nova instrução
    *
    * Antes de executar os estágios:
    * - Verifica hazards
    * - Executa forwarding
    * - Atualiza estado do pipeline
    */
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

   /**
    * Estágio IF - Busca de Instrução
    *
    * Responsabilidades:
    * 1. Busca a próxima instrução da memória usando o PC
    * 2. Armazena a instrução no estágio IF do pipeline
    * 3. Incrementa o PC para a próxima instrução
    * 4. Trata stalls do pipeline
    *
    * Hazards:
    * - Controle: Branches podem causar mudanças no PC
    * - Estrutural: Conflitos de acesso à memória
    */
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

   /**
    * Estágio ID - Decodificação de Instrução
    *
    * Responsabilidades:
    * 1. Decodifica a instrução em campos (opcode, registradores, etc)
    * 2. Lê valores dos registradores fonte
    * 3. Detecta e trata hazards de dados
    * 4. Gerencia instruções de controle (branches e jumps)
    * 5. Atualiza o preditor de branch
    *
    * Hazards:
    * - Dados: RAW (Read After Write)
    * - Controle: Branches e jumps
    */
   executeID() {
      if (this.pipelineStages.IF) {
         const instruction = this.pipelineStages.IF;
         console.log('ID: Decodificando instrução', instruction.toString()); // Debug log

         // Tratar instruções de controle
         if (instruction.opcode === Opcode.BEQ || instruction.opcode === Opcode.J) {
            if (instruction.opcode === Opcode.BEQ) {
               // Obter valores dos registradores
               const rs = instruction.rs;
               const rt = instruction.rt;
               const rsValue = this.registradores[rs] || 0;
               const rtValue = this.registradores[rt] || 0;

               // Comparar valores para decidir se o branch é tomado
               const actualTaken = rsValue === rtValue;

               console.log(`BEQ: ${RegisterName[rs]}=${rsValue}, ${RegisterName[rt]}=${rtValue}, taken=${actualTaken}`);
               console.log(`Índices de registradores: rs=${rs}, rt=${rt}`);

               // Se o branch for tomado, ajustar o PC para o endereço alvo
               if (actualTaken) {
                  console.log(`BEQ tomado: Ajustando PC para ${instruction.offset} (endereço ${instruction.offset * 4})`);
                  // Já resolvemos o label para um índice de instrução, então precisamos converter para endereço
                  this.PC = instruction.offset * 4;

                  // Inserir NOPs no pipeline
                  this.pipelineStages.IF = {
                     type: InstructionType.NOP,
                     opcode: 'nop',
                     toString() { return 'nop'; }
                  };
               } else {
                  // Se não tomado, incrementar PC normalmente
                  console.log(`BEQ não tomado: Mantendo PC normal ${this.PC} -> ${this.PC + 4}`);
                  this.PC = this.PC + 4;
               }
            } else if (instruction.opcode === Opcode.J) {
               console.log(`J: pulando para índice ${instruction.target} (endereço ${instruction.target * 4})`); // Debug log
               this.PC = instruction.target * 4;

               // Inserir NOPs no pipeline
               this.pipelineStages.IF = {
                  type: InstructionType.NOP,
                  opcode: 'nop',
                  toString() { return 'nop'; }
               };
            }
         } else {
            // Para instruções não-branch, incrementar PC normalmente
            console.log(`Instrução normal: Incrementando PC ${this.PC} -> ${this.PC + 4}`);
            this.PC = this.PC + 4;
         }

         this.pipelineStages.ID = {
            instruction: instruction,
            rsValue: this.registradores[instruction.rs] || 0,
            rtValue: this.registradores[instruction.rt] || 0
         };
         this.pipelineStages.IF = null;
      }
   }

   /**
    * Estágio EX - Execução
    *
    * Responsabilidades:
    * 1. Executa operações aritméticas/lógicas
    * 2. Calcula endereços de memória para load/store
    * 3. Compara valores para branches
    * 4. Implementa forwarding para resolver hazards
    *
    * Hazards:
    * - Dados: Resolvido via forwarding
    * - Estrutural: Unidades funcionais
    */
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
               console.log(`BEQ: Comparando ${RegisterName[instruction.rs]}=${rsValue} === ${RegisterName[instruction.rt]}=${rtValue} = ${result}`); // Debug log
               this.dumpRegisters();
               break;
         }

         this.pipelineStages.EX = {
            instruction: instruction,
            result: result
         };
         this.pipelineStages.ID = null;
      }
   }

   // Método para mostrar o estado atual dos registradores
   dumpRegisters() {
      console.log("=== Estado dos Registradores ===");
      for (let i = 0; i <= 31; i++) {
         if (this.registradores[i] !== 0) {
            console.log(`${RegisterName[i]} = ${this.registradores[i]}`);
         }
      }
      console.log("===============================");
   }

   /**
    * Estágio MEM - Acesso à Memória
    *
    * Responsabilidades:
    * 1. Acessa memória para instruções load/store
    * 2. Lê ou escreve dados da memória
    * 3. Passa resultados adiante para outras instruções
    *
    * Hazards:
    * - Estrutural: Conflitos de acesso à memória
    * - Dados: Resolvido via forwarding
    */
   executeMEM() {
      if (this.pipelineStages.EX) {
         let { instruction, result } = this.pipelineStages.EX;
         console.log('MEM: Acessando memória para instrução', instruction.toString()); // Debug log

         if (instruction.opcode === Opcode.LW) {
            const address = this.registradores[instruction.rs] + instruction.offset;
            // Converter endereço de memória para índice de array
            result = this.memoria[address / 4];
            console.log(`LW: endereço=${address}, valor=${result}`); // Debug log
         } else if (instruction.opcode === Opcode.SW) {
            const address = this.registradores[instruction.rs] + instruction.offset;
            // Converter endereço de memória para índice de array
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

   /**
    * Estágio WB - Write Back
    *
    * Responsabilidades:
    * 1. Escreve resultados nos registradores destino
    * 2. Finaliza a execução da instrução
    *
    * Hazards:
    * - Dados: RAW (Read After Write)
    */
   executeWB() {
      if (this.pipelineStages.MEM) {
         const { instruction, result } = this.pipelineStages.MEM;
         console.log('WB: Escrevendo resultado da instrução', instruction.toString()); // Debug log

         if (instruction.type === InstructionType.R_TYPE) {
            this.registradores[instruction.rd] = result;
            console.log(`WB: registrador ${RegisterName[instruction.rd]} = ${result}`); // Debug log
         } else if (instruction.opcode === Opcode.LW) {
            this.registradores[instruction.rt] = result;
            console.log(`WB: registrador ${RegisterName[instruction.rt]} = ${result}`); // Debug log
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

   /**
    * Implementação dos Hazards no Pipeline MIPS
    *
    * O pipeline implementa três tipos de hazards:
    *
    * 1. Hazard Estrutural:
    *    - Ocorre quando duas instruções tentam usar o mesmo recurso
    *    - Exemplo: Duas instruções tentando acessar a memória no mesmo ciclo
    *    - Solução: Stall do pipeline até o recurso estar livre
    *    - Implementação:
    *      * Verifica conflitos de acesso à memória
    *      * Verifica conflitos na unidade de multiplicação
    *      * Insere NOPs quando necessário
    *
    * 2. Hazard de Dados:
    *    - Ocorre quando uma instrução depende do resultado de outra
    *    - Exemplo: mul $s1, $s2, $s3 seguido de add $s4, $s1, $s5
    *    - Soluções:
    *      * Forwarding (EX→EX e MEM→EX)
    *      * Stall como fallback
    *    - Implementação:
    *      * Verifica dependências RAW (Read After Write)
    *      * Implementa forwarding em dois níveis
    *      * Insere stalls quando o forwarding não é possível
    *
    * 3. Hazard de Controle:
    *    - Ocorre em instruções de branch e jump
    *    - Exemplo: beq $s1, $s2, target ou j target
    *    - Solução: Predição de branch dinâmica
    *    - Implementação:
    *      * Preditor de branch de 2 bits
    *      * Estados: Strongly/Weakly Taken/Not Taken
    *      * Correção de predições incorretas
    */

   // Detecção de hazard estrutural
   detectStructuralHazard() {
      // Verificar conflito de acesso à memória
      if (this.pipelineStages.MEM && this.pipelineStages.IF) {
         const memInstruction = this.pipelineStages.MEM.instruction;
         const ifInstruction = this.pipelineStages.IF;

         // Conflito entre duas instruções de memória
         if ((memInstruction.opcode === Opcode.LW || memInstruction.opcode === Opcode.SW) &&
            (ifInstruction.opcode === Opcode.LW || ifInstruction.opcode === Opcode.SW)) {
            console.log('Hazard estrutural: Conflito de acesso à memória');
            return true;
         }
      }

      // Verificar conflito na unidade de multiplicação
      if (this.pipelineStages.EX && this.pipelineStages.ID) {
         const exInstruction = this.pipelineStages.EX.instruction;
         const idInstruction = this.pipelineStages.ID.instruction;

         // Conflito entre duas instruções MUL
         if (exInstruction.opcode === Opcode.MUL && idInstruction.opcode === Opcode.MUL) {
            console.log('Hazard estrutural: Conflito na unidade de multiplicação');
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
            console.log('Hazard de dados: RAW dependência em registrador');
            return true;
         }
      }

      // Verificar dependência para instruções de load
      if (exInstruction.opcode === Opcode.LW) {
         if (idInstruction.rs === exInstruction.rt || idInstruction.rt === exInstruction.rt) {
            console.log('Hazard de dados: RAW dependência após load');
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

      // Forwarding EX -> EX
      if (exInstruction.type === InstructionType.R_TYPE) {
         if (idInstruction.rs === exInstruction.rd) {
            console.log('Forwarding EX->EX: rs =', this.pipelineStages.EX.result);
            this.pipelineStages.ID.rsValue = this.pipelineStages.EX.result;
         }
         if (idInstruction.rt === exInstruction.rd) {
            console.log('Forwarding EX->EX: rt =', this.pipelineStages.EX.result);
            this.pipelineStages.ID.rtValue = this.pipelineStages.EX.result;
         }
      }

      // Forwarding MEM -> EX
      if (this.pipelineStages.MEM) {
         const memInstruction = this.pipelineStages.MEM.instruction;
         if (memInstruction.type === InstructionType.R_TYPE) {
            if (idInstruction.rs === memInstruction.rd) {
               console.log('Forwarding MEM->EX: rs =', this.pipelineStages.MEM.result);
               this.pipelineStages.ID.rsValue = this.pipelineStages.MEM.result;
            }
            if (idInstruction.rt === memInstruction.rd) {
               console.log('Forwarding MEM->EX: rt =', this.pipelineStages.MEM.result);
               this.pipelineStages.ID.rtValue = this.pipelineStages.MEM.result;
            }
         }
      }
   }

   // Método para prever o resultado de um branch
   predictBranch(address) {
      if (!this.branchPredictor.has(address)) {
         // Estado inicial: WEAKLY_NOT_TAKEN
         this.branchPredictor.set(address, BranchState.WEAKLY_NOT_TAKEN);
      }

      const state = this.branchPredictor.get(address);
      console.log(`Predição de branch em PC ${address}: ${this.getBranchStateName(state)}`);
      return state >= BranchState.WEAKLY_TAKEN;
   }

   // Método para atualizar o preditor de branch
   updateBranchPredictor(address, taken) {
      if (!this.branchPredictor.has(address)) {
         this.branchPredictor.set(address, BranchState.WEAKLY_NOT_TAKEN);
      }

      let state = this.branchPredictor.get(address);

      // Atualizar estado baseado no resultado real
      if (taken) {
         // Incrementa estado (máximo STRONGLY_TAKEN)
         state = Math.min(state + 1, BranchState.STRONGLY_TAKEN);
      } else {
         // Decrementa estado (mínimo STRONGLY_NOT_TAKEN)
         state = Math.max(state - 1, BranchState.STRONGLY_NOT_TAKEN);
      }

      this.branchPredictor.set(address, state);
      console.log(`Atualizando preditor em PC ${address}: ${this.getBranchStateName(state)}`);
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

      // Mostrar registradores $s0-$s31 com valores não-zero
      for (let i = 0; i <= 31; i++) {
         if (this.registradores[i] !== 0) {  // Exibir apenas registradores com valores
            const registerDiv = document.createElement('div');
            registerDiv.className = 'registrador-item';
            registerDiv.textContent = `${RegisterName[i]}: ${this.registradores[i]}`;
            console.log(`Registrador ${RegisterName[i]}: ${this.registradores[i]}`); // Debug log
            registersList.appendChild(registerDiv);
         }
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

      // Mostrar apenas endereços de memória com valores
      for (let i = 0; i < this.memoria.length; i++) {
         if (this.memoria[i] !== 0) {
            const enderecoBytes = i * 4; // Converter índice de array para endereço em bytes
            const memoryDiv = document.createElement('div');
            memoryDiv.className = 'memoria-item';
            memoryDiv.textContent = `[${enderecoBytes}]: ${this.memoria[i]}`;
            console.log(`Memória[${enderecoBytes}]: ${this.memoria[i]}`); // Debug log
            memoryList.appendChild(memoryDiv);
         }
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

      // Mapa de labels para endereços de memória
      const labels = new Map();

      // Primeira passagem: identificar labels
      const lines = programText.split('\n');
      let address = 0;
      for (const line of lines) {
         let trimmedLine = line.trim();

         // Verificar se a linha contém um label
         const labelMatch = trimmedLine.match(/^(\w+):\s*(.*)$/);
         if (labelMatch) {
            const label = labelMatch[1];
            trimmedLine = labelMatch[2].trim();
            labels.set(label, address / 4); // Converter para índice de instrução
            console.log(`Label "${label}" encontrado no endereço ${address} (instrução ${address / 4})`);
         }

         // Apenas incrementar o contador se a linha contiver uma instrução
         if (trimmedLine && !trimmedLine.startsWith('#')) {
            address += 4;
         }
      }

      // Debugar todos os labels encontrados
      console.log("Labels encontrados:", Array.from(labels.entries()));

      // Segunda passagem: carregar instruções
      address = 0;
      for (const line of lines) {
         let trimmedLine = line.trim();

         // Remover o label da linha
         const labelMatch = trimmedLine.match(/^(\w+):\s*(.*)$/);
         if (labelMatch) {
            trimmedLine = labelMatch[2].trim();
         }

         if (trimmedLine && !trimmedLine.startsWith('#')) {
            const instr = this.parseInstruction(trimmedLine, labels);
            if (instr) {
               this.instructionCache.set(address, instr);
               console.log(`Instrução em ${address}: ${instr.toString()}`);
            }
            address += 4;
         }
      }

      // Debugar todas as instruções carregadas
      console.log("Instruções carregadas:");
      for (const [addr, instr] of this.instructionCache.entries()) {
         console.log(`[${addr}]: ${instr.toString()}`);
      }

      if (this.instructionCache.size === 0) {
         alert('Nenhuma instrução válida encontrada. Verifique o formato do programa.');
      }
      this.updateUI();
   }

   parseRegister(str) {
      str = str.replace(',', '').trim();

      // Verificar se é um registrador simbólico do tipo $sX
      if (RegisterAlias.hasOwnProperty(str)) {
         return RegisterAlias[str];
      }

      // Se não for um registrador simbólico válido, retornar null
      console.log(`Registrador inválido: ${str}. Apenas registradores $s0-$s31 são suportados.`);
      return null;
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
            return `${this.opcode} ${RegisterName[this.rd]}, ${RegisterName[this.rs]}, ${RegisterName[this.rt]}`;
         }
      };
   }

   parseITypeInstruction(parts, labels) {
      console.log('Parsing I-type:', parts);
      const opcode = parts[0].toLowerCase();

      if (opcode === 'beq') {
         if (parts.length !== 4) return null;
         const rs = this.parseRegister(parts[1]);
         const rt = this.parseRegister(parts[2]);
         let offset;

         // Verificar se o offset é um label
         if (labels && labels.has(parts[3])) {
            offset = labels.get(parts[3]);
            console.log(`Label "${parts[3]}" resolvido para offset ${offset} (PC relativo)`);
         } else {
            offset = parseInt(parts[3]);
         }

         if ([rs, rt].some(v => v === null) || isNaN(offset)) {
            console.error(`Erro no parsing de beq: rs=${rs}, rt=${rt}, offset=${offset}`);
            return null;
         }

         return {
            type: InstructionType.I_TYPE,
            opcode: 'beq',
            rs,
            rt,
            offset,
            labelName: labels && labels.has(parts[3]) ? parts[3] : null,  // Guardar o nome do label para debug
            toString() {
               const targetStr = this.labelName ? `${this.offset} (${this.labelName})` : this.offset;
               return `${this.opcode} ${RegisterName[this.rs]}, ${RegisterName[this.rt]}, ${targetStr}`;
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
               return `${this.opcode} ${RegisterName[this.rt]}, ${this.offset}(${RegisterName[this.rs]})`;
            }
         };
      }
      return null;
   }

   parseJTypeInstruction(parts, labels) {
      console.log('Parsing J-type:', parts);
      if (parts.length !== 2) return null;

      let target;
      let labelName = null;

      // Verificar se o target é um label
      if (labels && labels.has(parts[1])) {
         target = labels.get(parts[1]);
         labelName = parts[1]; // Guardar o nome do label
         console.log(`Label "${parts[1]}" resolvido para target ${target} (endereço absoluto)`);
      } else {
         target = parseInt(parts[1]);
      }

      if (isNaN(target)) {
         console.error(`Erro no parsing de jump: target=${target}`);
         return null;
      }

      return {
         type: InstructionType.J_TYPE,
         opcode: parts[0],
         target,
         labelName,
         toString() {
            const targetStr = this.labelName ? `${this.target} (${this.labelName})` : this.target;
            return `${this.opcode} ${targetStr}`;
         }
      };
   }

   // Método para fazer parse de uma instrução
   parseInstruction(line, labels) {
      console.log(`parseInstruction: original line: "${line}"`);
      line = line.split('#')[0].trim();
      console.log(`parseInstruction: cleaned line: "${line}"`);
      if (!line) return null;

      // Manter as vírgulas para melhor parsing
      const parts = line.split(/\s+/);
      const opcode = parts[0].toLowerCase();

      // Remover as vírgulas dos operandos
      for (let i = 1; i < parts.length; i++) {
         parts[i] = parts[i].replace(',', '').trim();
      }

      console.log(`parseInstruction: opcode: "${opcode}", parts:`, parts);
      switch (opcode) {
         case 'add':
         case 'sub':
         case 'mul':
            return this.parseRTypeInstruction(parts);
         case 'lw':
         case 'sw':
         case 'beq':
            return this.parseITypeInstruction(parts, labels);
         case 'j':
            return this.parseJTypeInstruction(parts, labels);
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

   // Método para tratar hazard de controle
   handleControlHazard(instruction, actualTaken) {
      console.log("Método handleControlHazard está obsoleto, o tratamento é feito em executeID");
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
                  if (RegisterAlias.hasOwnProperty(reg)) {
                     const index = RegisterAlias[reg];
                     pipeline.registradores[index] = data.registradores[reg];
                     console.log(`Registrador ${reg} = ${data.registradores[reg]}`);
                  } else {
                     console.warn(`AVISO: Registrador desconhecido ${reg}. Apenas registradores $s0-$s31 são suportados.`);
                  }
               }
            }

            // Carrega memória
            if (data.memoria) {
               for (const addr in data.memoria) {
                  const index = parseInt(addr);
                  if (!isNaN(index)) {
                     // Converte endereço de memória em bytes para índice do array (divido por 4)
                     pipeline.memoria[index / 4] = data.memoria[addr];
                     console.log(`Memória[${index}] = ${data.memoria[addr]}`);
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
               if (RegisterAlias.hasOwnProperty(reg)) {
                  const index = RegisterAlias[reg];
                  pipeline.registradores[index] = lastLoadedProgram.registradores[reg];
                  console.log(`Registrador ${reg} = ${lastLoadedProgram.registradores[reg]}`);
               } else {
                  console.warn(`AVISO: Registrador desconhecido ${reg}. Apenas registradores $s0-$s31 são suportados.`);
               }
            }
         }

         if (lastLoadedProgram.memoria) {
            for (const addr in lastLoadedProgram.memoria) {
               const index = parseInt(addr);
               if (!isNaN(index)) {
                  // Converte endereço de memória em bytes para índice do array (divido por 4)
                  pipeline.memoria[index / 4] = lastLoadedProgram.memoria[addr];
                  console.log(`Memória[${index}] = ${lastLoadedProgram.memoria[addr]}`);
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
