# Distributed under the OSI-approved BSD 3-Clause License.  See accompanying
# file LICENSE.rst or https://cmake.org/licensing for details.

cmake_minimum_required(VERSION ${CMAKE_VERSION}) # this file comes with cmake

# If CMAKE_DISABLE_SOURCE_CHANGES is set to true and the source directory is an
# existing directory in our source tree, calling file(MAKE_DIRECTORY) on it
# would cause a fatal error, even though it would be a no-op.
if(NOT EXISTS "/Users/zhekich_solovev/Sites/Messanger/backend/build/_deps/libpqxx-src")
  file(MAKE_DIRECTORY "/Users/zhekich_solovev/Sites/Messanger/backend/build/_deps/libpqxx-src")
endif()
file(MAKE_DIRECTORY
  "/Users/zhekich_solovev/Sites/Messanger/backend/build/_deps/libpqxx-build"
  "/Users/zhekich_solovev/Sites/Messanger/backend/build/_deps/libpqxx-subbuild/libpqxx-populate-prefix"
  "/Users/zhekich_solovev/Sites/Messanger/backend/build/_deps/libpqxx-subbuild/libpqxx-populate-prefix/tmp"
  "/Users/zhekich_solovev/Sites/Messanger/backend/build/_deps/libpqxx-subbuild/libpqxx-populate-prefix/src/libpqxx-populate-stamp"
  "/Users/zhekich_solovev/Sites/Messanger/backend/build/_deps/libpqxx-subbuild/libpqxx-populate-prefix/src"
  "/Users/zhekich_solovev/Sites/Messanger/backend/build/_deps/libpqxx-subbuild/libpqxx-populate-prefix/src/libpqxx-populate-stamp"
)

set(configSubDirs )
foreach(subDir IN LISTS configSubDirs)
    file(MAKE_DIRECTORY "/Users/zhekich_solovev/Sites/Messanger/backend/build/_deps/libpqxx-subbuild/libpqxx-populate-prefix/src/libpqxx-populate-stamp/${subDir}")
endforeach()
if(cfgdir)
  file(MAKE_DIRECTORY "/Users/zhekich_solovev/Sites/Messanger/backend/build/_deps/libpqxx-subbuild/libpqxx-populate-prefix/src/libpqxx-populate-stamp${cfgdir}") # cfgdir has leading slash
endif()
