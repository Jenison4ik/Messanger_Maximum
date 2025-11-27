#pragma once

#if !defined(MESSANGER_HAS_PQXX_FWD)
#define MESSANGER_HAS_PQXX_FWD

#if defined(__has_include)
#  if __has_include(<pqxx/pqxx>)
#    include <pqxx/pqxx>
#    define MESSANGER_HAS_PQXX 1
#  endif
#endif

#ifndef MESSANGER_HAS_PQXX
namespace pqxx {
class connection;
}
#endif

#endif // MESSANGER_HAS_PQXX_FWD

