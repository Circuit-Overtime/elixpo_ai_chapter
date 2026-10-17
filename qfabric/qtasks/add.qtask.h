#pragma once

#include <stdint.h>

#include "qtask.h"

Q_TASK(add, int32_t, (int32_t a, int32_t b)) {
  return a + b;
}
