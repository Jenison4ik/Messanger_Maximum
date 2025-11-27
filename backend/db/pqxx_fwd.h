#pragma once

#ifdef __has_include
#  if __has_include(<pqxx/pqxx>)
#    include <pqxx/pqxx>
#    define MESSANGER_PQXX_AVAILABLE 1
#  endif
#endif

#ifndef MESSANGER_PQXX_AVAILABLE
namespace pqxx {
class connection;
}
#endif

