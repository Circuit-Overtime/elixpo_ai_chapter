# Build the Gallery accelerator as a dynamically-loadable MicroPython module.
#
# Example (MicroPython v1.28.0 source + Espressif toolchain):
#   make MPY_DIR=/tmp/oreo-micropython-v1.28 \
#     CROSS=/tmp/oreo-xtensa/xtensa-esp-elf/bin/xtensa-esp32s3-elf-

MOD = gallery_native
SRC = gallery_native.c
ARCH ?= xtensawin

ifndef MPY_DIR
$(error MPY_DIR must point to the matching MicroPython source tree)
endif

include $(MPY_DIR)/py/dynruntime.mk

.PHONY: install
install: $(MOD).mpy
	cp $(MOD).mpy ../src/$(MOD).mpy
