#include <Arduino_LED_Matrix.h>
#include <Arduino_RouterBridge.h>

#include "add.qtask.h"

Arduino_LED_Matrix qf_matrix;

int32_t qf_stage2_add(int32_t a, int32_t b) {
  return qf_task_add(a, b);
}

void setup() {
  qf_matrix.begin();
  qf_matrix.clear();

  if (!Bridge.begin()) {
    while (true) {
      delay(1000);
    }
  }

  Bridge.provide_safe("qf_qtask_add", qf_stage2_add);
}

void loop() {
  delay(1);
}
