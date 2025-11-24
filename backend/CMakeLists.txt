cmake_minimum_required(VERSION 3.10)
project(Messanger)

set(CMAKE_CXX_STANDARD 17)

add_executable(main
    main.cpp
    db/connection.cpp
    db/user_repo.cpp
)

target_include_directories(main PRIVATE
    ${CMAKE_SOURCE_DIR}/backend/include
    ${CMAKE_SOURCE_DIR}/backend/include/jwt-cpp/include
    ${CMAKE_SOURCE_DIR}/backend/db
    ${CMAKE_SOURCE_DIR}/include
    ${CMAKE_SOURCE_DIR}/include/jwt-cpp/include
    ${CMAKE_SOURCE_DIR}/db
)

target_link_libraries(main PRIVATE pqxx pq pthread ssl crypto)

if (WIN32)
    target_link_libraries(main ws2_32 wsock32)
endif()

