#pragma once

#define Q_TASK(name, return_type, parameters) \
  extern "C" return_type qf_task_##name parameters
