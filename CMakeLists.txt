cmake_minimum_required(VERSION 3.10)
project(Messanger)

set(CMAKE_CXX_STANDARD 17)
include_directories(/opt/homebrew/include)
include_directories(${CMAKE_SOURCE_DIR}/crow/include)
add_executable(main main.cpp)