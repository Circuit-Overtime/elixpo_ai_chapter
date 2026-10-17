//code improvished by @boolOvertime [YouTube]
//inspired from Ben Eater's 8 Bit Breadboard computer, this code
//performs operations to run simple programs on the computer.
//The idea is simple and same as of Ben but there are some differences:- 
//1. I'm using shift registers and an arduino to communicate with the control world.
//2. I can thus output hypothetically infinite amount of bits from the arduino to control the control world.
//3. The Instructions are taken as T1 T2 T3 T4 T5, with the fetch cycle in T1 AND T2 scopes, the rest can be calculated from the steps according
//to ben's videos.

#define SHIFT_DATA 2 //DataIn LS595
#define SHIFT_CLK 3 //clockIn LS595
#define SHIFT_LATCH 4 //storage_clkIn LS595


#define STP22 A1 //the most significant step bit
#define STP21 A2
#define STP20 A3 //the least significant step bit

#define INS23 6 //most significant instruction bit
#define INS22 7
#define INS21 8
#define INS20 9 //least significant instruction bit

//the bits are arranged in reversed order
//to match with the orientation of the                          // ORIGINAL BIT PATTERN
//breadboard
#define SCK  0b0000000000000001  // Halt clock -->                 0b1000000000000000
#define MARI 0b0000000000000010  // Memory address register in --> 0b0100000000000000
#define RIN  0b0000000000000100  // RAM data in -->                0b0010000000000000
#define ROT  0b0000000000001000  // RAM data out -->               0b0001000000000000
#define IRO  0b0000000000010000  // Instruction register out -->   0b0000100000000000
#define IRI  0b0000000000100000  // Instruction register in -->    0b0000010000000000
#define ARO  0b0000000001000000  // A register out -->             0b0000001000000000
#define ARI  0b0000000010000000  // A register in -->              0b0000000100000000
#define EO   0b0000000100000000  // ALU out -->                    0b0000000010000000
#define SUB  0b0000001000000000  // ALU subtract -->               0b0000000001000000
#define BRO  0b0000010000000000  // ALU subtract -->               0b0000000000100000
#define BRI  0b0000100000000000  // B register in -->              0b0000000000010000
#define OURI 0b0001000000000000  // Output register in -->         0b0000000000001000  
#define CKOT 0b0010000000000000  // Program counter out -->        0b0000000000000100
#define CKEN 0b0100000000000000  // Program counter enable -->     0b0000000000000010
#define CKLD 0b1000000000000000  // Jump (program counter in) -->  0b0000000000000001
#define NOP  0b0000000000000000 //NOP (No Operation) -->           0b0000000000000000
//#define moreInstructions 0bxxxxxxxxxxxxxxxx
//add further instruction definitions here

uint16_t result; //contains the instruction for the Computer in Binary
int instBitInt; //CONTAINS THE INSTRUCTION AS INT (lsb 0's are ignored)
String stepString; //CONTAINS THE STEP
String instBitString; //contains the step as an integer (lsb 0's are ignored)

void giveInstruction(uint16_t binValue) //function to shiftOut the instruction by the shift registers!
{
  shiftOut(SHIFT_DATA, SHIFT_CLK, MSBFIRST, (binValue >> 8)); //MSB 8 BITS
  shiftOut(SHIFT_DATA, SHIFT_CLK, MSBFIRST, binValue); //remaining 8 BITS
  digitalWrite(SHIFT_LATCH, LOW);
  digitalWrite(SHIFT_LATCH, HIGH);
  digitalWrite(SHIFT_LATCH, LOW);
}
void setup() {
  // put your setup code here, to run once:
  pinMode(SHIFT_DATA, OUTPUT);
  pinMode(SHIFT_CLK, OUTPUT);
  pinMode(SHIFT_LATCH, OUTPUT);
  pinMode(A1, INPUT);
  pinMode(A2, INPUT);
  pinMode(A3, INPUT);
  pinMode(A4, INPUT);
  pinMode(A5, INPUT);
  pinMode(A6, INPUT);
  pinMode(A7, INPUT);
  Serial.begin(57600);
}


void loop() {
  // put your main code here, to run repeatedly:
  int stateA1 = digitalRead(STP22); //step most significant (2^2)
  int stateA2 = digitalRead(STP21); //step most significant (2^1)
  int stateA3 = digitalRead(STP20); //step least significant (2^0)
  String stepString = String(stateA1) + String(stateA2) + String(stateA3);
  int stepInt = stepString.toInt();

  int MSI1 = digitalRead(INS23); //most significant instruction bit
  int MSI2 = digitalRead(INS22); //most significant instruction bit 
  int MSI3 = digitalRead(INS21); //most significant instruction bit 
  int MSI4 = digitalRead(INS20); //lest significant instruction bit

  String instBitString = String(MSI1) + String(MSI2) + String(MSI3) + String(MSI4); //combined instruction value from Instruction Register
  int instBitInt = instBitString.toInt(); //changing to int for accessing switch case statements
  
  switch (stepInt) {
    case 000: //000
        fetchCycle(); 
      break;
    case 1: //001
      fetchCycleExtend();
      break;
    case 10: //010
      stepT3Instruction(instBitInt);
      break;
    case 11: //011
      stepT4Instruction(instBitInt);
      break;
    case 100: //100
      stepT5Instruction(instBitInt);
      break;
     //we are resetting after the step reaches to 4, we can increase the count by adjusting the reset wire of the step counter
    //we can increse the case by 101 110 and 111 (max 3 bit counter can go upto 111)
  }
  
  delay(20); //setting the delay to 20ms
  //it means that the board would update 1000/20 times per second
  //which means that the board would update at 50Hz, so the computer clock cannot be more that 50Hz freq.

}


void fetchCycle()
{
   result = MARI|CKOT;
   giveInstruction(result);
   Serial.println("STEP1 FETCH --> MARI|CKOT"); //Fetch Cycle Instructions
}
void fetchCycleExtend()
{
  result = ROT|IRI|CKEN;
  giveInstruction(result);
  Serial.println("STEP2 FETCH --> ROT|IRI|CKEN"); //Fetch Cycle Instructions
}
void stepT3Instruction(int instBitInt)
{
   switch(instBitInt)
   {
    case 1: //0001 LDA
      result = MARI|IRO;
      giveInstruction(result);
      break; 
    case 10: //0010 ADD
      result = MARI|IRO;
      giveInstruction(result);
      break;
    case 1110: //1110 OUT
      result = ARO|OURI;
      giveInstruction(result);
      break;
    case 1111: //1111 HLT
      result = SCK;
      giveInstruction(result);
      break;
  
   }
}

void stepT4Instruction(int instBitInt)
{
   switch(instBitInt)
   {
    case 1: //0001 LDA
      result = ROT|ARI;
      giveInstruction(result);
      break;
    case 10: //0010 ADD
      result = ROT|BRI;
      giveInstruction(result);
      break;
    case 1110: //1110 OUT
      result = NOP;
      giveInstruction(result);
      break;
    case 1111: //1111 HLT
      result = NOP;
      giveInstruction(result);
      break;
  
   }
}

void stepT5Instruction(int instBitInt)
{


   switch(instBitInt)
   {
    case 1: //0001 LDA
      result = NOP;
      giveInstruction(result); 
      break;
    case 10: //0010 ADD
      result = ARI|EO;
      giveInstruction(result);
      break;
    case 1110: //1110 OUT
      result = NOP;
      giveInstruction(result);
      break;
    case 1111: //1111 HLT
      result = NOP;
      giveInstruction(result);
      break;
  
   }
}
//Currently runnig the Program 
//LDA 14
//ADD 15
//OUT 
//HLT
