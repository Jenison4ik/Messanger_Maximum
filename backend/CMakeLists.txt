cmake_minimum_required(VERSION 3.10)
project(Messanger)

set(CMAKE_CXX_STANDARD 17)
include_directories(${CMAKE_SOURCE_DIR}/include)
include_directories(${CMAKE_SOURCE_DIR}/db)
include_directories(${CMAKE_SOURCE_DIR}/include/jwt-cpp)

find_library(BCRYPT_LIB bcrypt)
if(BCRYPT_LIB)
    target_link_libraries(main PRIVATE ${BCRYPT_LIB})
endif()

add_executable(main
    main.cpp
    db/connection.cpp
    db/user_repo.cpp
)
target_link_libraries(main PRIVATE pqxx pq)
if (WIN32)
    target_link_libraries(main ws2_32 wsock32)
endif()

