set(CMAKE_POLICY_VERSION_MINIMUM 3.5)
cmake_minimum_required(VERSION 3.16)
project(Messanger LANGUAGES CXX)

if(MINGW)
    set(_default_msys_prefix "C:/msys64/mingw64")
    if(NOT DEFINED OPENSSL_ROOT_DIR AND EXISTS "${_default_msys_prefix}/include/openssl/ssl.h")
        set(OPENSSL_ROOT_DIR "${_default_msys_prefix}" CACHE PATH "OpenSSL root (auto-detected for MSYS2)" FORCE)
    endif()
    if(DEFINED OPENSSL_ROOT_DIR)
        list(APPEND CMAKE_PREFIX_PATH "${OPENSSL_ROOT_DIR}")
    endif()
endif()

set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

include(FetchContent)
set(JWT_BUILD_EXAMPLES OFF CACHE INTERNAL "")
set(JWT_BUILD_TESTS OFF CACHE INTERNAL "")
set(JWT_BUILD_BENCHMARKS OFF CACHE INTERNAL "")
set(JWT_BUILD_DOCS OFF CACHE INTERNAL "")
FetchContent_Declare(
    jwt-cpp
    GIT_REPOSITORY https://github.com/Thalhammer/jwt-cpp.git
    GIT_TAG v0.7.0
    GIT_SHALLOW TRUE
)
FetchContent_MakeAvailable(jwt-cpp)

add_executable(main
    main.cpp
    db/connection.cpp
    db/user_repo.cpp
)

target_include_directories(main PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/include
    ${CMAKE_CURRENT_SOURCE_DIR}/db
)

target_link_libraries(main PRIVATE
    jwt-cpp::jwt-cpp
    pqxx
    pq
    pthread
    ssl
    crypto
)

if (WIN32)
    target_link_libraries(main PRIVATE ws2_32 wsock32)
endif()

