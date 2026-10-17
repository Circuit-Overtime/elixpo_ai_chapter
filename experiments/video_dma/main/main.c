#include <stdbool.h>
#include <stdio.h>
#include <stdint.h>
#include <string.h>

#include "driver/gpio.h"
#include "driver/spi_master.h"
#include "esp_app_desc.h"
#include "esp_err.h"
#include "esp_heap_caps.h"
#include "esp_log.h"
#include "esp_rom_sys.h"
#include "esp_timer.h"
#include "miniz.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#define LCD_HOST       SPI2_HOST
#define PIN_MOSI       11
#define PIN_SCLK       12
#define PIN_CS         14
#define PIN_DC         15
#define PIN_RST        16
#define PIN_BL         17

#define LCD_W          320
#define LCD_H          240
#define LCD_SPI_HZ     (40 * 1000 * 1000)
#define STRIPE_ROWS    24
#define STRIPE_BYTES   (LCD_W * STRIPE_ROWS * 2)
#define WARMUP_SECONDS 2
#define SAMPLE_SECONDS 30

static const char *TAG = "video_dma";
static spi_device_handle_t lcd;
static uint16_t xmap[LCD_W];
static uint16_t ymap[LCD_H];

extern const uint8_t video_start[] asm("_binary_video_rv565_start");
extern const uint8_t video_end[] asm("_binary_video_rv565_end");

typedef struct {
    uint8_t version;
    uint16_t width;
    uint16_t height;
    uint8_t fps;
    uint16_t frames;
    size_t frame_bytes;
    const uint8_t *payload;
    const uint8_t **compressed_frames;
    uint32_t *compressed_sizes;
    uint8_t *decoded_frame;
} clip_t;

typedef struct {
    uint32_t sequence;
    uint16_t source_frame;
    uint32_t inflate_us;
    uint32_t scale_us;
    uint32_t dma_wait_us;
    uint32_t lcd_us;
    uint32_t work_us;
    uint16_t skipped;
    uint8_t deadline_missed;
} frame_sample_t;

typedef struct {
    uint32_t scale_us;
    uint32_t dma_wait_us;
    uint32_t lcd_us;
} lcd_metrics_t;

static uint32_t read_le32(const uint8_t *p)
{
    return (uint32_t)p[0] | ((uint32_t)p[1] << 8) |
           ((uint32_t)p[2] << 16) | ((uint32_t)p[3] << 24);
}

static void spi_poll(const void *data, size_t bytes)
{
    spi_transaction_t tx = {
        .length = bytes * 8,
        .tx_buffer = data,
    };
    ESP_ERROR_CHECK(spi_device_polling_transmit(lcd, &tx));
}

static void lcd_command(uint8_t command, const void *data, size_t bytes)
{
    gpio_set_level(PIN_CS, 0);
    gpio_set_level(PIN_DC, 0);
    spi_poll(&command, 1);
    if (data != NULL && bytes != 0) {
        gpio_set_level(PIN_DC, 1);
        spi_poll(data, bytes);
    }
    gpio_set_level(PIN_CS, 1);
}

static void lcd_init(void)
{
    const gpio_config_t outputs = {
        .pin_bit_mask = (1ULL << PIN_CS) | (1ULL << PIN_DC) |
                        (1ULL << PIN_RST) | (1ULL << PIN_BL),
        .mode = GPIO_MODE_OUTPUT,
    };
    ESP_ERROR_CHECK(gpio_config(&outputs));
    gpio_set_level(PIN_CS, 1);
    gpio_set_level(PIN_BL, 0);
    gpio_set_level(PIN_RST, 1);
    vTaskDelay(pdMS_TO_TICKS(10));
    gpio_set_level(PIN_RST, 0);
    vTaskDelay(pdMS_TO_TICKS(10));
    gpio_set_level(PIN_RST, 1);
    vTaskDelay(pdMS_TO_TICKS(120));

    lcd_command(0x01, NULL, 0);  // software reset
    vTaskDelay(pdMS_TO_TICKS(150));
    lcd_command(0x11, NULL, 0);  // sleep out
    vTaskDelay(pdMS_TO_TICKS(120));

    const uint8_t colmod = 0x55;  // RGB565
    const uint8_t madctl = 0x60;  // landscape 320x240
    const uint8_t porch[] = {0x0c, 0x0c, 0x00, 0x33, 0x33};
    const uint8_t frctrl = 0x0f;  // normal 60 Hz panel scan
    const uint8_t lcm = 0x2c;
    const uint8_t enable_vdv = 0x01;
    const uint8_t vrhs = 0x12;
    const uint8_t vdvs = 0x20;
    const uint8_t vcom = 0x20;
    const uint8_t columns[] = {0x00, 0x00, 0x01, 0x3f};
    const uint8_t rows[] = {0x00, 0x00, 0x00, 0xef};
    lcd_command(0x3a, &colmod, 1);
    lcd_command(0x36, &madctl, 1);
    lcd_command(0xb2, porch, sizeof(porch));
    lcd_command(0xc6, &frctrl, 1);
    lcd_command(0xc0, &lcm, 1);
    lcd_command(0xc2, &enable_vdv, 1);
    lcd_command(0xc3, &vrhs, 1);
    lcd_command(0xc4, &vdvs, 1);
    lcd_command(0xbb, &vcom, 1);
    lcd_command(0x2a, columns, sizeof(columns));
    lcd_command(0x2b, rows, sizeof(rows));
    lcd_command(0x21, NULL, 0);  // display inversion on
    lcd_command(0x13, NULL, 0);  // normal mode
    lcd_command(0x29, NULL, 0);  // display on
    vTaskDelay(pdMS_TO_TICKS(20));
}

static void spi_init(void)
{
    const spi_bus_config_t bus = {
        .mosi_io_num = PIN_MOSI,
        .miso_io_num = -1,
        .sclk_io_num = PIN_SCLK,
        .quadwp_io_num = -1,
        .quadhd_io_num = -1,
        .data4_io_num = -1,
        .data5_io_num = -1,
        .data6_io_num = -1,
        .data7_io_num = -1,
        .max_transfer_sz = STRIPE_BYTES,
    };
    ESP_ERROR_CHECK(spi_bus_initialize(LCD_HOST, &bus, SPI_DMA_CH_AUTO));

    const spi_device_interface_config_t device = {
        .clock_speed_hz = LCD_SPI_HZ,
        .mode = 0,
        .spics_io_num = -1,  // CS is held manually across RAMWR + all stripes
        .queue_size = 2,
        .flags = SPI_DEVICE_HALFDUPLEX,
    };
    ESP_ERROR_CHECK(spi_bus_add_device(LCD_HOST, &device, &lcd));
}

static bool parse_clip(clip_t *clip)
{
    const size_t size = (size_t)(video_end - video_start);
    if (size < 12 || memcmp(video_start, "RV5", 3) != 0 ||
            (video_start[3] != 5 && video_start[3] != 6)) {
        ESP_LOGE(TAG, "expected an RV565 v5/v6 video");
        return false;
    }
    memset(clip, 0, sizeof(*clip));
    clip->version = video_start[3];
    clip->width = video_start[4] | ((uint16_t)video_start[5] << 8);
    clip->height = video_start[6] | ((uint16_t)video_start[7] << 8);
    clip->fps = video_start[8];
    clip->frames = video_start[10] | ((uint16_t)video_start[11] << 8);
    clip->frame_bytes = (size_t)clip->width * clip->height * 2;
    clip->payload = video_start + 12;
    if (clip->width == 0 || clip->height == 0 ||
            clip->width > LCD_W || clip->height > LCD_H ||
            clip->fps == 0 || clip->fps > 30 || clip->frames == 0) {
        ESP_LOGE(TAG, "invalid dimensions, timing, frame count, or file size");
        return false;
    }
    if (clip->version == 5) {
        if (size != 12 + clip->frame_bytes * clip->frames) {
            ESP_LOGE(TAG, "invalid RV565 v5 payload size");
            return false;
        }
    } else {
        clip->compressed_frames = heap_caps_malloc(
            clip->frames * sizeof(*clip->compressed_frames), MALLOC_CAP_INTERNAL);
        clip->compressed_sizes = heap_caps_malloc(
            clip->frames * sizeof(*clip->compressed_sizes), MALLOC_CAP_INTERNAL);
        // One 180x135 RGB565 frame is only 48.6 KB. Keep it in internal RAM:
        // the standalone benchmark does not enable the external-PSRAM
        // allocator, and internal memory also gives the scaler lower latency.
        clip->decoded_frame = heap_caps_malloc(
            clip->frame_bytes, MALLOC_CAP_INTERNAL | MALLOC_CAP_8BIT);
        if (!clip->compressed_frames || !clip->compressed_sizes ||
                !clip->decoded_frame) {
            ESP_LOGE(TAG, "could not allocate RV565 v6 decode state");
            return false;
        }
        const uint8_t *cursor = clip->payload;
        for (uint16_t i = 0; i < clip->frames; ++i) {
            if ((size_t)(video_end - cursor) < 4) {
                ESP_LOGE(TAG, "truncated RV565 v6 frame table");
                return false;
            }
            const uint32_t packed = read_le32(cursor);
            cursor += 4;
            if (packed == 0 || (size_t)(video_end - cursor) < packed) {
                ESP_LOGE(TAG, "invalid RV565 v6 frame %u", i);
                return false;
            }
            clip->compressed_frames[i] = cursor;
            clip->compressed_sizes[i] = packed;
            cursor += packed;
        }
        if (cursor != video_end) {
            ESP_LOGE(TAG, "trailing bytes in RV565 v6 payload");
            return false;
        }
    }
    for (int x = 0; x < LCD_W; ++x) {
        xmap[x] = (uint16_t)((x * clip->width) / LCD_W);
    }
    for (int y = 0; y < LCD_H; ++y) {
        ymap[y] = (uint16_t)((y * clip->height) / LCD_H);
    }
    return true;
}

static bool decode_frame(clip_t *clip, uint16_t frame_index)
{
    if (clip->version == 5) {
        return true;
    }
    const size_t written = tinfl_decompress_mem_to_mem(
        clip->decoded_frame, clip->frame_bytes,
        clip->compressed_frames[frame_index], clip->compressed_sizes[frame_index],
        TINFL_FLAG_PARSE_ZLIB_HEADER);
    return written == clip->frame_bytes;
}

static void expand_stripe(const clip_t *clip, uint16_t frame_index,
                          int first_row, int rows, uint8_t *destination)
{
    const uint8_t *frame = clip->version == 5
        ? clip->payload + (size_t)frame_index * clip->frame_bytes
        : clip->decoded_frame;
    for (int row = 0; row < rows; ++row) {
        const uint8_t *source = frame +
            ((size_t)ymap[first_row + row] * clip->width * 2);
        uint8_t *target = destination + row * LCD_W * 2;
        for (int x = 0; x < LCD_W; ++x) {
            const int source_offset = xmap[x] * 2;
            *target++ = source[source_offset];
            *target++ = source[source_offset + 1];
        }
    }
}

static void send_frame(const clip_t *clip, uint16_t frame_index,
                       uint8_t *buffers[2], lcd_metrics_t *metrics)
{
    memset(metrics, 0, sizeof(*metrics));
    const int64_t lcd_start = esp_timer_get_time();
    const uint8_t ramwr = 0x2c;
    gpio_set_level(PIN_CS, 0);
    gpio_set_level(PIN_DC, 0);
    spi_poll(&ramwr, 1);
    gpio_set_level(PIN_DC, 1);

    int current = 0;
    int row = 0;
    int rows = STRIPE_ROWS;
    int64_t phase_start = esp_timer_get_time();
    expand_stripe(clip, frame_index, row, rows, buffers[current]);
    metrics->scale_us += (uint32_t)(esp_timer_get_time() - phase_start);

    while (row < LCD_H) {
        spi_transaction_t transaction = {
            .length = (size_t)rows * LCD_W * 2 * 8,
            .tx_buffer = buffers[current],
        };
        ESP_ERROR_CHECK(spi_device_queue_trans(lcd, &transaction, portMAX_DELAY));

        const int next_row = row + rows;
        const int next_rows = (next_row < LCD_H)
            ? ((LCD_H - next_row < STRIPE_ROWS) ? LCD_H - next_row : STRIPE_ROWS)
            : 0;
        const int next = current ^ 1;
        // CPU expansion and memory-mapped flash reads happen while GDMA sends
        // the current stripe. Only the short wait below remains serialized.
        if (next_rows != 0) {
            phase_start = esp_timer_get_time();
            expand_stripe(clip, frame_index, next_row, next_rows, buffers[next]);
            metrics->scale_us +=
                (uint32_t)(esp_timer_get_time() - phase_start);
        }

        spi_transaction_t *complete = NULL;
        phase_start = esp_timer_get_time();
        ESP_ERROR_CHECK(spi_device_get_trans_result(lcd, &complete,
                                                    portMAX_DELAY));
        metrics->dma_wait_us +=
            (uint32_t)(esp_timer_get_time() - phase_start);
        row = next_row;
        rows = next_rows;
        current = next;
    }
    gpio_set_level(PIN_CS, 1);
    metrics->lcd_us = (uint32_t)(esp_timer_get_time() - lcd_start);
}

static void print_heap_state(const char *phase)
{
    const uint32_t caps[] = {
        MALLOC_CAP_INTERNAL | MALLOC_CAP_8BIT,
        MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT,
    };
    const char *names[] = {"internal", "spiram"};
    for (size_t i = 0; i < 2; ++i) {
        printf("RV565_HEAP,%s,%s,total=%u,free=%u,min_free=%u,largest=%u\n",
               phase, names[i],
               (unsigned)heap_caps_get_total_size(caps[i]),
               (unsigned)heap_caps_get_free_size(caps[i]),
               (unsigned)heap_caps_get_minimum_free_size(caps[i]),
               (unsigned)heap_caps_get_largest_free_block(caps[i]));
    }
}

static void print_firmware_metadata(void)
{
    const esp_app_desc_t *description = esp_app_get_description();
    printf("RV565_META,project=%s\n", description->project_name);
    printf("RV565_META,version=%s\n", description->version);
    printf("RV565_META,build_date=%s\n", description->date);
    printf("RV565_META,build_time=%s\n", description->time);
    printf("RV565_META,idf=%s\n", description->idf_ver);
    printf("RV565_META,elf_sha256=");
    for (size_t i = 0; i < sizeof(description->app_elf_sha256); ++i) {
        printf("%02x", description->app_elf_sha256[i]);
    }
    printf("\n");
}

static bool present_frame(clip_t *clip, uint16_t frame,
                          uint8_t *buffers[2], frame_sample_t *sample)
{
    const int64_t work_start = esp_timer_get_time();
    const int64_t inflate_start = work_start;
    if (!decode_frame(clip, frame)) {
        return false;
    }
    sample->inflate_us = (uint32_t)(esp_timer_get_time() - inflate_start);

    lcd_metrics_t lcd_metrics;
    send_frame(clip, frame, buffers, &lcd_metrics);
    sample->scale_us = lcd_metrics.scale_us;
    sample->dma_wait_us = lcd_metrics.dma_wait_us;
    sample->lcd_us = lcd_metrics.lcd_us;
    sample->work_us = (uint32_t)(esp_timer_get_time() - work_start);
    return true;
}

void app_main(void)
{
    print_heap_state("boot");

    clip_t clip;
    if (!parse_clip(&clip)) {
        return;
    }
    print_heap_state("media_open");

    const uint32_t warmup_frames = clip.fps * WARMUP_SECONDS;
    const uint32_t sample_count = clip.fps * SAMPLE_SECONDS;
    frame_sample_t *samples = heap_caps_calloc(
        sample_count, sizeof(*samples), MALLOC_CAP_INTERNAL | MALLOC_CAP_8BIT);
    uint8_t *buffers[2] = {
        heap_caps_aligned_alloc(4, STRIPE_BYTES,
                                MALLOC_CAP_DMA | MALLOC_CAP_INTERNAL),
        heap_caps_aligned_alloc(4, STRIPE_BYTES,
                                MALLOC_CAP_DMA | MALLOC_CAP_INTERNAL),
    };
    if (samples == NULL || buffers[0] == NULL || buffers[1] == NULL) {
        ESP_LOGE(TAG, "could not allocate measurement or DMA stripe buffers");
        return;
    }
    print_heap_state("ready");

    spi_init();
    lcd_init();
    int actual_spi_khz = 0;
    ESP_ERROR_CHECK(spi_device_get_actual_freq(lcd, &actual_spi_khz));

    print_firmware_metadata();
    printf("RV565_META,schema=1\n");
    printf("RV565_META,cpu_mhz=%u\n", CONFIG_ESP_DEFAULT_CPU_FREQ_MHZ);
    printf("RV565_META,spi_khz=%d\n", actual_spi_khz);
    printf("RV565_META,source_width=%u\n", clip.width);
    printf("RV565_META,source_height=%u\n", clip.height);
    printf("RV565_META,source_fps=%u\n", clip.fps);
    printf("RV565_META,source_frames=%u\n", clip.frames);
    printf("RV565_META,container_version=%u\n", clip.version);
    printf("RV565_META,container_bytes=%u\n",
           (unsigned)(video_end - video_start));
    printf("RV565_META,warmup_frames=%u\n", (unsigned)warmup_frames);
    printf("RV565_META,sample_frames=%u\n", (unsigned)sample_count);
    printf("RV565_READY\n");
    fflush(stdout);

    const int64_t frame_period_us = 1000000LL / clip.fps;
    int64_t deadline = esp_timer_get_time();
    uint16_t frame = 0;
    bool backlight_on = false;
    frame_sample_t scratch = {0};

    for (uint32_t i = 0; i < warmup_frames; ++i) {
        if (!present_frame(&clip, frame, buffers, &scratch)) {
            ESP_LOGE(TAG, "warm-up frame %u failed to inflate", frame);
            return;
        }
        if (!backlight_on) {
            gpio_set_level(PIN_BL, 1);
            backlight_on = true;
        }
        frame = (uint16_t)((frame + 1) % clip.frames);
        deadline += frame_period_us;
        int64_t now = esp_timer_get_time();
        while (now > deadline + frame_period_us) {
            frame = (uint16_t)((frame + 1) % clip.frames);
            deadline += frame_period_us;
        }
        const int64_t remaining = deadline - now;
        if (remaining > 0) {
            esp_rom_delay_us((uint32_t)remaining);
        }
    }

    printf("RV565_BEGIN\n");
    fflush(stdout);
    const int64_t measurement_start = esp_timer_get_time();
    deadline = measurement_start;
    uint32_t dropped = 0;
    uint32_t deadline_misses = 0;

    for (uint32_t i = 0; i < sample_count; ++i) {
        frame_sample_t *sample = &samples[i];
        sample->sequence = i;
        sample->source_frame = frame;
        if (!present_frame(&clip, frame, buffers, sample)) {
            ESP_LOGE(TAG, "measured frame %u failed to inflate", frame);
            return;
        }
        frame = (uint16_t)((frame + 1) % clip.frames);
        deadline += frame_period_us;

        int64_t now = esp_timer_get_time();
        sample->deadline_missed = now > deadline;
        deadline_misses += sample->deadline_missed;
        while (now > deadline + frame_period_us) {
            frame = (uint16_t)((frame + 1) % clip.frames);
            deadline += frame_period_us;
            ++sample->skipped;
            ++dropped;
        }
        if (i + 1 < sample_count) {
            const int64_t remaining = deadline - now;
            if (remaining > 0) {
                esp_rom_delay_us((uint32_t)remaining);
            }
        }
    }
    const int64_t measurement_us = esp_timer_get_time() - measurement_start;
    print_heap_state("complete");
    printf("RV565_SUMMARY,frames=%u,elapsed_us=%lld,fps=%.6f,drops=%u,"
           "deadline_misses=%u\n",
           (unsigned)sample_count, (long long)measurement_us,
           sample_count * 1000000.0 / (double)measurement_us,
           (unsigned)dropped, (unsigned)deadline_misses);
    printf("RV565_COLUMNS,sequence,source_frame,inflate_us,scale_us,"
           "dma_wait_us,lcd_us,work_us,skipped,deadline_missed\n");
    for (uint32_t i = 0; i < sample_count; ++i) {
        const frame_sample_t *sample = &samples[i];
        printf("RV565_FRAME,%u,%u,%u,%u,%u,%u,%u,%u,%u\n",
               (unsigned)sample->sequence, (unsigned)sample->source_frame,
               (unsigned)sample->inflate_us, (unsigned)sample->scale_us,
               (unsigned)sample->dma_wait_us, (unsigned)sample->lcd_us,
               (unsigned)sample->work_us, (unsigned)sample->skipped,
               (unsigned)sample->deadline_missed);
    }
    printf("RV565_END\n");
    fflush(stdout);

    while (true) {
        vTaskDelay(pdMS_TO_TICKS(1000));
    }
}
