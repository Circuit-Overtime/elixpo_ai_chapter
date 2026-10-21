/* Native RGB565/indexed scaler for OreoOS Gallery.
 *
 * The badge firmware omits the on-device Viper emitter, but supports dynamic
 * xtensawin .mpy modules.  These kernels keep all per-pixel work out of the
 * Python VM and write directly into Display._buf.
 */
#include "py/dynruntime.h"

static void get_buffer(mp_obj_t obj, mp_buffer_info_t *info, int flags,
    size_t minimum) {
    mp_get_buffer_raise(obj, info, flags);
    if (info->len < minimum) {
        mp_raise_ValueError(MP_ERROR_TEXT("buffer too small"));
    }
}

static void indexed_scale_kernel(const uint8_t *indices,
    const uint16_t *palette, uint16_t *dst, mp_int_t sw, mp_int_t sh,
    mp_int_t dw, mp_int_t dh) {
    // Build the nearest-neighbour maps once per frame. Recomputing the X
    // accumulator for all 240 rows costs several milliseconds on the S3.
    uint16_t xmap[320];
    uint16_t ymap[240];
    mp_int_t sx = 0;
    mp_int_t xacc = 0;
    for (mp_int_t x = 0; x < dw; ++x) {
        xmap[x] = (uint16_t)sx;
        xacc += sw;
        while (xacc >= dw) {
            xacc -= dw;
            ++sx;
        }
    }
    mp_int_t sy = 0;
    mp_int_t yacc = 0;
    for (mp_int_t y = 0; y < dh; ++y) {
        ymap[y] = (uint16_t)sy;
        yacc += sh;
        while (yacc >= dh) {
            yacc -= dh;
            ++sy;
        }
    }

    for (mp_int_t y = 0; y < dh; ++y) {
        const uint8_t *src_row = indices + ymap[y] * sw;
        uint16_t *dst_row = dst + y * dw;
        for (mp_int_t x = 0; x < dw; ++x) {
            *dst_row++ = palette[src_row[xmap[x]]];
        }
    }
}

// indexed_scale(indices, palette_rgb565be, dst, src_w, src_h, dst_w, dst_h)
// Expands one 8-bit indexed frame to an opaque, full-screen RGB565 frame.
static mp_obj_t indexed_scale(mp_obj_fun_bc_t *self, size_t n_args,
    size_t n_kw, mp_obj_t *args) {
    (void)self;
    mp_arg_check_num(n_args, n_kw, 7, 7, false);

    mp_int_t sw = mp_obj_get_int(args[3]);
    mp_int_t sh = mp_obj_get_int(args[4]);
    mp_int_t dw = mp_obj_get_int(args[5]);
    mp_int_t dh = mp_obj_get_int(args[6]);
    if (sw <= 0 || sh <= 0 || dw <= 0 || dh <= 0 ||
        sw > 320 || sh > 240 || dw > 320 || dh > 240) {
        mp_raise_ValueError(MP_ERROR_TEXT("invalid dimensions"));
    }

    mp_buffer_info_t index_info;
    mp_buffer_info_t palette_info;
    mp_buffer_info_t dst_info;
    get_buffer(args[0], &index_info, MP_BUFFER_READ, (size_t)sw * sh);
    get_buffer(args[1], &palette_info, MP_BUFFER_READ, 512);
    get_buffer(args[2], &dst_info, MP_BUFFER_RW, (size_t)dw * dh * 2);

    indexed_scale_kernel(
        (const uint8_t *)index_info.buf,
        (const uint16_t *)palette_info.buf,
        (uint16_t *)dst_info.buf, sw, sh, dw, dh);
    return mp_const_none;
}

// indexed_scale_at(frames, offset, dst, src_w, src_h, dst_w, dst_h)
// The palette and indices are adjacent inside a preloaded V4 clip. Passing an
// offset avoids allocating two memoryview slices for every displayed frame.
static mp_obj_t indexed_scale_at(mp_obj_fun_bc_t *self, size_t n_args,
    size_t n_kw, mp_obj_t *args) {
    (void)self;
    mp_arg_check_num(n_args, n_kw, 7, 7, false);

    mp_int_t offset = mp_obj_get_int(args[1]);
    mp_int_t sw = mp_obj_get_int(args[3]);
    mp_int_t sh = mp_obj_get_int(args[4]);
    mp_int_t dw = mp_obj_get_int(args[5]);
    mp_int_t dh = mp_obj_get_int(args[6]);
    if (offset < 0 || sw <= 0 || sh <= 0 || dw <= 0 || dh <= 0 ||
        sw > 320 || sh > 240 || dw > 320 || dh > 240) {
        mp_raise_ValueError(MP_ERROR_TEXT("invalid dimensions"));
    }

    size_t frame_size = 512 + (size_t)sw * sh;
    mp_buffer_info_t frames_info;
    mp_buffer_info_t dst_info;
    get_buffer(args[0], &frames_info, MP_BUFFER_READ,
        (size_t)offset + frame_size);
    get_buffer(args[2], &dst_info, MP_BUFFER_RW, (size_t)dw * dh * 2);
    const uint8_t *frame = (const uint8_t *)frames_info.buf + offset;

    indexed_scale_kernel(frame + 512, (const uint16_t *)frame,
        (uint16_t *)dst_info.buf, sw, sh, dw, dh);
    return mp_const_none;
}

// rgb565_scale(src, dst, src_w, src_h, x, y, dst_w, dst_h, dst_stride)
// Used by photos and legacy RGB565 video.  Source and destination bytes are
// already in panel order (big endian), so the kernel only scales and copies.
static mp_obj_t rgb565_scale(mp_obj_fun_bc_t *self, size_t n_args,
    size_t n_kw, mp_obj_t *args) {
    (void)self;
    mp_arg_check_num(n_args, n_kw, 9, 9, false);

    mp_int_t sw = mp_obj_get_int(args[2]);
    mp_int_t sh = mp_obj_get_int(args[3]);
    mp_int_t dx = mp_obj_get_int(args[4]);
    mp_int_t dy = mp_obj_get_int(args[5]);
    mp_int_t dw = mp_obj_get_int(args[6]);
    mp_int_t dh = mp_obj_get_int(args[7]);
    mp_int_t stride = mp_obj_get_int(args[8]);
    if (sw <= 0 || sh <= 0 || dx < 0 || dy < 0 || dw <= 0 || dh <= 0 ||
        stride <= 0 || dx + dw > stride || sw > 320 || sh > 320 ||
        dy + dh > 320) {
        mp_raise_ValueError(MP_ERROR_TEXT("invalid dimensions"));
    }

    mp_buffer_info_t src_info;
    mp_buffer_info_t dst_info;
    get_buffer(args[0], &src_info, MP_BUFFER_READ, (size_t)sw * sh * 2);
    get_buffer(args[1], &dst_info, MP_BUFFER_RW,
        ((size_t)(dy + dh - 1) * stride + dx + dw) * 2);

    const uint16_t *src = (const uint16_t *)src_info.buf;
    uint16_t *dst = (uint16_t *)dst_info.buf;
    mp_int_t sy = 0;
    mp_int_t yacc = 0;
    for (mp_int_t y = 0; y < dh; ++y) {
        const uint16_t *src_row = src + sy * sw;
        uint16_t *dst_row = dst + (dy + y) * stride + dx;
        mp_int_t sx = 0;
        mp_int_t xacc = 0;
        for (mp_int_t x = 0; x < dw; ++x) {
            *dst_row++ = src_row[sx];
            xacc += sw;
            while (xacc >= dw) {
                xacc -= dw;
                ++sx;
            }
        }
        yacc += sh;
        while (yacc >= dh) {
            yacc -= dh;
            ++sy;
        }
    }
    return mp_const_none;
}

mp_obj_t mpy_init(mp_obj_fun_bc_t *self, size_t n_args, size_t n_kw,
    mp_obj_t *args) {
    (void)n_args;
    (void)n_kw;
    (void)args;
    MP_DYNRUNTIME_INIT_ENTRY
    mp_store_global(MP_QSTR_indexed_scale,
        MP_DYNRUNTIME_MAKE_FUNCTION(indexed_scale));
    mp_store_global(MP_QSTR_indexed_scale_at,
        MP_DYNRUNTIME_MAKE_FUNCTION(indexed_scale_at));
    mp_store_global(MP_QSTR_rgb565_scale,
        MP_DYNRUNTIME_MAKE_FUNCTION(rgb565_scale));
    MP_DYNRUNTIME_INIT_EXIT
}
