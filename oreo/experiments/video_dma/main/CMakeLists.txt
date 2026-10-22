set(VIDEO_FILE "${CMAKE_CURRENT_LIST_DIR}/video.rv565")
if(NOT EXISTS "${VIDEO_FILE}")
    message(FATAL_ERROR
        "Missing ${VIDEO_FILE}. Run tools/encode_video_benchmark.py first.")
endif()

idf_component_register(
    SRCS "main.c"
    INCLUDE_DIRS "."
    EMBED_FILES "video.rv565"
)

# idf.py -DRV565_OVERLAP=1 selects the dual-core overlapped decode path;
# -DRV565_BACKLIGHT=<percent> sets the PWM backlight duty. Both are cached,
# so pass them explicitly every time the mode changes.
if(NOT DEFINED RV565_OVERLAP)
    set(RV565_OVERLAP 0)
endif()
if(NOT DEFINED RV565_BACKLIGHT)
    set(RV565_BACKLIGHT 60)
endif()
if(NOT DEFINED RV565_SELFTEST)
    set(RV565_SELFTEST 0)
endif()
target_compile_definitions(${COMPONENT_LIB} PRIVATE
    RV565_OVERLAP=${RV565_OVERLAP}
    RV565_BACKLIGHT=${RV565_BACKLIGHT}
    RV565_SELFTEST=${RV565_SELFTEST})
