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
