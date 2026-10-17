// Hardware-timed IR envelope receiver for OreoOS on ESP32-S3.
//
// The TSOP38238 demodulates the optical carrier and drives GPIO18 low during
// each carrier burst. ESP-IDF RMT records that envelope at 1 us resolution,
// independently of MicroPython, display flushes, and garbage collection.

#include <stdbool.h>
#include <stdint.h>

#include "py/runtime.h"

#include "driver/gpio.h"
#include "driver/rmt_rx.h"
#include "esp_err.h"
#include "esp_heap_caps.h"

#define OREO_IR_RESOLUTION_HZ (1000000U)
#define OREO_IR_MAX_SYMBOLS   (512U)
#define OREO_IR_MEM_SYMBOLS   (64U)
#define OREO_IR_MIN_NS        (20000U)
#define OREO_IR_IDLE_NS       (25000000U)

static rmt_channel_handle_t s_rx_channel;
static rmt_symbol_word_t *s_symbols;
static volatile size_t s_symbol_count;
static volatile bool s_frame_ready;
static bool s_started;
static int s_rx_gpio = -1;

static rmt_receive_config_t s_receive_config = {
    .signal_range_min_ns = OREO_IR_MIN_NS,
    .signal_range_max_ns = OREO_IR_IDLE_NS,
};

static void oreo_ir_raise(esp_err_t err, const char *operation) {
    mp_raise_msg_varg(&mp_type_OSError, MP_ERROR_TEXT("%s failed: %s"),
        operation, esp_err_to_name(err));
}

static bool IRAM_ATTR oreo_ir_rx_done(
    rmt_channel_handle_t channel,
    const rmt_rx_done_event_data_t *event,
    void *context
) {
    (void)channel;
    (void)context;
    s_symbol_count = event->num_symbols;
    s_frame_ready = true;
    return false;
}

static esp_err_t oreo_ir_arm(void) {
    s_symbol_count = 0;
    s_frame_ready = false;
    return rmt_receive(
        s_rx_channel,
        s_symbols,
        OREO_IR_MAX_SYMBOLS * sizeof(rmt_symbol_word_t),
        &s_receive_config
    );
}

static esp_err_t oreo_ir_stop_internal(void) {
    esp_err_t cleanup_err = ESP_OK;
    if (s_rx_channel != NULL) {
        // rmt_disable() accepts both ENABLE and RUN. Do not free the DMA
        // buffer unless deletion succeeds: a state-transition failure must
        // never leave RMT writing into released memory.
        esp_err_t disable_err = rmt_disable(s_rx_channel);
        esp_err_t delete_err = rmt_del_channel(s_rx_channel);
        if (delete_err == ESP_OK) {
            s_rx_channel = NULL;
        } else {
            cleanup_err = delete_err;
            if (disable_err != ESP_OK) {
                cleanup_err = disable_err;
            }
        }
    }
    if (s_rx_channel == NULL && s_symbols != NULL) {
        heap_caps_free(s_symbols);
        s_symbols = NULL;
    }
    if (s_rx_channel == NULL) {
        s_symbol_count = 0;
        s_frame_ready = false;
        s_started = false;
        s_rx_gpio = -1;
    }
    return cleanup_err;
}

static mp_obj_t oreo_ir_start(mp_obj_t pin_obj) {
    int pin = mp_obj_get_int(pin_obj);
    if (!GPIO_IS_VALID_GPIO(pin)) {
        mp_raise_ValueError(MP_ERROR_TEXT("invalid IR RX GPIO"));
    }

    // App redraws and tab transitions can request the same receiver twice.
    // Treat that as success instead of tearing down a live transaction.
    if (s_started && s_rx_gpio == pin) {
        return mp_const_none;
    }

    esp_err_t err = oreo_ir_stop_internal();
    if (err != ESP_OK) {
        oreo_ir_raise(err, "RMT RX cleanup");
    }

    s_symbols = heap_caps_aligned_calloc(
        64,
        OREO_IR_MAX_SYMBOLS,
        sizeof(rmt_symbol_word_t),
        MALLOC_CAP_8BIT | MALLOC_CAP_INTERNAL | MALLOC_CAP_DMA
    );
    if (s_symbols == NULL) {
        mp_raise_msg(&mp_type_MemoryError, MP_ERROR_TEXT("IR RX buffer"));
    }

    gpio_set_pull_mode((gpio_num_t)pin, GPIO_PULLUP_ONLY);

    rmt_rx_channel_config_t channel_config = {
        .clk_src = RMT_CLK_SRC_DEFAULT,
        .resolution_hz = OREO_IR_RESOLUTION_HZ,
        .mem_block_symbols = OREO_IR_MEM_SYMBOLS,
        .gpio_num = (gpio_num_t)pin,
        .flags.with_dma = true,
    };
    err = rmt_new_rx_channel(&channel_config, &s_rx_channel);
    if (err != ESP_OK) {
        // DMA is preferred, but hardware timing still remains exact when the
        // target/IDF cannot allocate a DMA-capable RMT RX channel.
        channel_config.flags.with_dma = false;
        err = rmt_new_rx_channel(&channel_config, &s_rx_channel);
    }
    if (err != ESP_OK) {
        oreo_ir_stop_internal();
        oreo_ir_raise(err, "RMT RX channel");
    }

    rmt_rx_event_callbacks_t callbacks = {
        .on_recv_done = oreo_ir_rx_done,
    };
    err = rmt_rx_register_event_callbacks(s_rx_channel, &callbacks, NULL);
    if (err != ESP_OK) {
        oreo_ir_stop_internal();
        oreo_ir_raise(err, "RMT RX callback");
    }
    err = rmt_enable(s_rx_channel);
    if (err != ESP_OK) {
        oreo_ir_stop_internal();
        oreo_ir_raise(err, "RMT RX enable");
    }
    err = oreo_ir_arm();
    if (err != ESP_OK) {
        oreo_ir_stop_internal();
        oreo_ir_raise(err, "RMT RX arm");
    }

    s_started = true;
    s_rx_gpio = pin;
    return mp_const_none;
}
static MP_DEFINE_CONST_FUN_OBJ_1(oreo_ir_start_obj, oreo_ir_start);

static mp_obj_t oreo_ir_stop(void) {
    esp_err_t err = oreo_ir_stop_internal();
    if (err != ESP_OK) {
        oreo_ir_raise(err, "RMT RX stop");
    }
    return mp_const_none;
}
static MP_DEFINE_CONST_FUN_OBJ_0(oreo_ir_stop_obj, oreo_ir_stop);

static mp_obj_t oreo_ir_poll(void) {
    if (!s_started || !s_frame_ready) {
        return mp_const_none;
    }

    size_t symbol_count = s_symbol_count;
    if (symbol_count > OREO_IR_MAX_SYMBOLS) {
        symbol_count = OREO_IR_MAX_SYMBOLS;
    }

    // The TSOP is idle HIGH and marks are LOW. Drop any leading idle segment,
    // then return alternating mark/space durations independent of pin polarity.
    mp_obj_t *durations = m_new(mp_obj_t, symbol_count * 2);
    size_t duration_count = 0;
    bool found_mark = false;
    for (size_t i = 0; i < symbol_count; ++i) {
        const rmt_symbol_word_t symbol = s_symbols[i];
        const uint16_t widths[2] = {symbol.duration0, symbol.duration1};
        const uint8_t levels[2] = {symbol.level0, symbol.level1};
        for (size_t part = 0; part < 2; ++part) {
            uint16_t width = widths[part];
            if (width == 0) {
                continue;
            }
            if (!found_mark) {
                if (levels[part] != 0) {
                    continue;
                }
                found_mark = true;
            }
            durations[duration_count++] = mp_obj_new_int_from_uint(width);
        }
    }

    s_frame_ready = false;
    s_symbol_count = 0;
    esp_err_t err = oreo_ir_arm();
    if (err != ESP_OK) {
        m_del(mp_obj_t, durations, symbol_count * 2);
        oreo_ir_stop_internal();
        oreo_ir_raise(err, "RMT RX rearm");
    }

    if (duration_count == 0) {
        m_del(mp_obj_t, durations, symbol_count * 2);
        return mp_const_none;
    }
    mp_obj_t result = mp_obj_new_tuple(duration_count, durations);
    m_del(mp_obj_t, durations, symbol_count * 2);
    return result;
}
static MP_DEFINE_CONST_FUN_OBJ_0(oreo_ir_poll_obj, oreo_ir_poll);

static mp_obj_t oreo_ir_active(void) {
    return mp_obj_new_bool(s_started);
}
static MP_DEFINE_CONST_FUN_OBJ_0(oreo_ir_active_obj, oreo_ir_active);

static const mp_rom_map_elem_t oreo_ir_module_globals_table[] = {
    {MP_ROM_QSTR(MP_QSTR___name__), MP_ROM_QSTR(MP_QSTR__oreo_ir)},
    {MP_ROM_QSTR(MP_QSTR_start), MP_ROM_PTR(&oreo_ir_start_obj)},
    {MP_ROM_QSTR(MP_QSTR_stop), MP_ROM_PTR(&oreo_ir_stop_obj)},
    {MP_ROM_QSTR(MP_QSTR_poll), MP_ROM_PTR(&oreo_ir_poll_obj)},
    {MP_ROM_QSTR(MP_QSTR_active), MP_ROM_PTR(&oreo_ir_active_obj)},
};
static MP_DEFINE_CONST_DICT(oreo_ir_module_globals, oreo_ir_module_globals_table);

const mp_obj_module_t oreo_ir_module = {
    .base = {&mp_type_module},
    .globals = (mp_obj_dict_t *)&oreo_ir_module_globals,
};

MP_REGISTER_MODULE(MP_QSTR__oreo_ir, oreo_ir_module);
