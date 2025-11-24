#pragma once
#include <string>
#include <optional>
#include <crow.h>
#include <jwt-cpp/jwt.h>

namespace crow {
namespace jwt_auth {

struct Claims {
    int user_id{};
    std::string username;
};

inline std::optional<Claims> authorize(const request& req, const std::string& secret = "SIMPLE_SECRET") {
    auto it = req.headers.find("authorization");
    if (it == req.headers.end() || it->second.size() < 8) {
        return std::nullopt;
    }

    const std::string& header = it->second;
    if (header.rfind("Bearer ", 0) != 0) {
        return std::nullopt;
    }

    const std::string token = header.substr(7);
    try {
        auto decoded = jwt::decode(token);
        jwt::verify()
            .allow_algorithm(jwt::algorithm::hs256{secret})
            .verify(decoded);

        Claims claims{};
        claims.user_id = std::stoi(decoded.get_payload_claim("user_id").as_string());
        if (decoded.has_payload_claim("username")) {
            claims.username = decoded.get_payload_claim("username").as_string();
        }
        return claims;
    } catch (...) {
        return std::nullopt;
    }
}

} // namespace jwt_auth
} // namespace crow
