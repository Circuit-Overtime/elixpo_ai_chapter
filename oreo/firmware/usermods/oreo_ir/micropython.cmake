add_library(usermod_oreo_ir INTERFACE)

target_sources(usermod_oreo_ir INTERFACE
    ${CMAKE_CURRENT_LIST_DIR}/modoreo_ir.c
)

target_include_directories(usermod_oreo_ir INTERFACE
    ${CMAKE_CURRENT_LIST_DIR}
)

target_link_libraries(usermod INTERFACE usermod_oreo_ir)
