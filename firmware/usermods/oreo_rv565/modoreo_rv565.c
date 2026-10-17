// Firmware-resident RV565 frame inflater for OreoOS on ESP32-S3.
//
// RV565 v6 stores each RGB565 frame as an independent zlib-wrapped Deflate
// payload.  The ESP32-S3 ROM already contains miniz's tinfl implementation, so
// Gallery can decode directly from its reused compressed buffer into its
// reused RGB565 frame buffer without allocating a Python bytes object or
// running the Deflate stream through the MicroPython layer.

#include <stddef.h>

#include "py/runtime.h"
#include "miniz.h"

static mp_obj_t oreo_rv565_inflate_frame(mp_obj_t source_obj,
                                          mp_obj_t destination_obj) {
    mp_buffer_info_t source;
    mp_buffer_info_t destination;
    mp_get_buffer_raise(source_obj, &source, MP_BUFFER_READ);
    mp_get_buffer_raise(destination_obj, &destination, MP_BUFFER_WRITE);

    if (source.len == 0 || destination.len == 0) {
        mp_raise_ValueError(MP_ERROR_TEXT("empty RV565 frame buffer"));
    }

    const size_t written = tinfl_decompress_mem_to_mem(
        destination.buf,
        destination.len,
        source.buf,
        source.len,
        TINFL_FLAG_PARSE_ZLIB_HEADER
    );
    if (written != destination.len) {
        mp_raise_ValueError(MP_ERROR_TEXT("invalid RV565 frame"));
    }

    return mp_obj_new_int_from_uint(written);
}
static MP_DEFINE_CONST_FUN_OBJ_2(
    oreo_rv565_inflate_frame_obj,
    oreo_rv565_inflate_frame
);

static const mp_rom_map_elem_t oreo_rv565_module_globals_table[] = {
    {MP_ROM_QSTR(MP_QSTR___name__), MP_ROM_QSTR(MP_QSTR__oreo_rv565)},
    {MP_ROM_QSTR(MP_QSTR_inflate_frame),
     MP_ROM_PTR(&oreo_rv565_inflate_frame_obj)},
};
static MP_DEFINE_CONST_DICT(
    oreo_rv565_module_globals,
    oreo_rv565_module_globals_table
);

const mp_obj_module_t oreo_rv565_module = {
    .base = {&mp_type_module},
    .globals = (mp_obj_dict_t *)&oreo_rv565_module_globals,
};

MP_REGISTER_MODULE(MP_QSTR__oreo_rv565, oreo_rv565_module);
