add_library(usermod_oreo_rv565 INTERFACE)

target_sources(usermod_oreo_rv565 INTERFACE
    ${CMAKE_CURRENT_LIST_DIR}/modoreo_rv565.c
)

target_include_directories(usermod_oreo_rv565 INTERFACE
    ${CMAKE_CURRENT_LIST_DIR}
)

target_link_libraries(usermod INTERFACE usermod_oreo_rv565)
