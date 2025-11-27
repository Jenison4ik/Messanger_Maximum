#include "crow/middlewares/jwt_auth.h"
#include "crow/websocket.h"
#include <crow.h>
#include "db/connection.h"
#include "db/chat_repo.h"
#include "db/user_repo.h"
#include <jwt-cpp/jwt.h>
#include <pqxx/except.hxx>
#include <mutex>
#include <optional>
#include <string>
#include <unordered_map>

namespace {
constexpr auto kJwtIssuer = "messanger-api";
constexpr auto kJwtSecret = "SIMPLE_SECRET";

std::string make_jwt(int user_id, const std::string& username) {
    return jwt::create()
        .set_issuer(kJwtIssuer)
        .set_type("JWS")
        .set_payload_claim("user_id", jwt::claim(std::to_string(user_id)))
        .set_payload_claim("username", jwt::claim(username))
        .sign(jwt::algorithm::hs256{kJwtSecret});
}

struct WsUserContext {
    int user_id{};
    std::string username;
};
} // namespace

int main() {
    crow::SimpleApp app;

    Database db;
    UserRepository users(db.get());
    ChatRepository chats(db.get());

    std::mutex ws_mutex;
    std::unordered_map<int, crow::websocket::connection*> live_connections;

    auto cleanup_ws = [&](crow::websocket::connection& conn) {
        auto* ctx = static_cast<WsUserContext*>(conn.userdata());
        if (!ctx) {
            return;
        }
        {
            std::lock_guard<std::mutex> lock(ws_mutex);
            auto it = live_connections.find(ctx->user_id);
            if (it != live_connections.end() && it->second == &conn) {
                live_connections.erase(it);
            }
        }
        delete ctx;
        conn.userdata(nullptr);
    };

    CROW_ROUTE(app, "/auth/login")
    .methods("POST"_method)
    ([&users](const crow::request& req) {
        auto body = crow::json::load(req.body);
        if (!body || !body.has("email") || !body.has("password")) {
            return crow::response(400, "Missing required fields");
        }

        auto user = users.findByEmail(body["email"].s());
        if (!user || user->password_hash != body["password"].s()) {
            return crow::response(401, "Invalid credentials");
        }

        crow::json::wvalue resp;
        resp["token"] = make_jwt(user->id, user->username);
        resp["user_id"] = user->id;
        resp["username"] = user->username;
        resp["name"] = user->name;
        return crow::response(resp);
    });

    // получить список пользователей
    CROW_ROUTE(app, "/users")
    ([&users](const crow::request& req) -> crow::response {
        auto claims = crow::jwt_auth::authorize(req);
        if (!claims) {
            return crow::response(401, "Missing or invalid token");
        }

        auto list = users.getAllUsers();
        crow::json::wvalue result;
        crow::json::wvalue::list users_json;
        users_json.reserve(list.size());
        for (auto& u : list) {
            crow::json::wvalue user;
            user["id"] = u.id;
            user["name"] = u.name;
            user["username"] = u.username;
            users_json.emplace_back(std::move(user));
        }
        result["users"] = std::move(users_json);

        return crow::response(result);
    });

    // добавить пользователя (регистрация)
    CROW_ROUTE(app, "/users").methods("POST"_method)
    ([&users](const crow::request& req) {
        auto body = crow::json::load(req.body);
        if (!body || !body.has("name") || !body.has("username") || !body.has("email") || !body.has("password"))
            return crow::response(400, "Missing required fields");

        try {
            int id = users.createUser(body["name"].s(), body["username"].s(), body["email"].s(), body["password"].s());
            // Генерируем JWT для нового пользователя
            auto token = make_jwt(id, body["username"].s());
            crow::json::wvalue resp;
            resp["token"] = token;
            resp["user_id"] = id;
            resp["username"] = body["username"].s();
            return crow::response(201, resp);
        } catch (const pqxx::unique_violation& e) {
            std::string duplicate_value;
            const std::string constraint = e.what();
            if (constraint.find("(username)") != std::string::npos) {
                duplicate_value = "username";
            } else if (constraint.find("(email)") != std::string::npos) {
                duplicate_value = "email";
            }
            crow::json::wvalue err;
            err["error"] = "duplicate value";
            err["detail"] = e.what();
            if (!duplicate_value.empty()) {
                err["duplicate"] = duplicate_value;
            }
            return crow::response(409, err);
        } catch (const std::exception& e) {
            return crow::response(500, e.what());
        }
    });

    CROW_ROUTE(app, "/ws/chat")
        .websocket(&app)
        .onaccept([&](const crow::request& req, std::optional<crow::response>& res, void** userdata) {
            auto claims = crow::jwt_auth::authorize(req);
            if (!claims) {
                res = crow::response(401, "Missing or invalid token");
                return;
            }
            auto* ctx = new WsUserContext{claims->user_id, claims->username};
            *userdata = ctx;
        })
        .onopen([&](crow::websocket::connection& conn) {
            auto* ctx = static_cast<WsUserContext*>(conn.userdata());
            if (!ctx) {
                conn.close("Unauthorized");
                return;
            }
            {
                std::lock_guard<std::mutex> lock(ws_mutex);
                live_connections[ctx->user_id] = &conn;
            }

            crow::json::wvalue welcome;
            welcome["type"] = "welcome";
            welcome["user_id"] = ctx->user_id;
            welcome["username"] = ctx->username;
            conn.send_text(welcome.dump());
        })
        .onmessage([&](crow::websocket::connection& conn, const std::string& data, bool is_binary) {
            if (is_binary) {
                crow::json::wvalue err;
                err["error"] = "Binary messages are unsupported";
                conn.send_text(err.dump());
                return;
            }

            auto* ctx = static_cast<WsUserContext*>(conn.userdata());
            if (!ctx) {
                conn.close("Unauthorized");
                return;
            }

            auto payload = crow::json::load(data);
            if (!payload || !payload.has("recipient_id") || !payload.has("text")) {
                crow::json::wvalue err;
                err["error"] = "Recipient id and text are required";
                conn.send_text(err.dump());
                return;
            }

            if (payload["recipient_id"].t() != crow::json::type::Number || payload["text"].t() != crow::json::type::String) {
                crow::json::wvalue err;
                err["error"] = "Invalid payload types";
                conn.send_text(err.dump());
                return;
            }

            int recipient = static_cast<int>(payload["recipient_id"].i());
            std::string message_text = payload["text"].s();
            if (message_text.empty()) {
                crow::json::wvalue err;
                err["error"] = "Message text must not be empty";
                conn.send_text(err.dump());
                return;
            }

            auto target = users.findById(recipient);
            if (!target) {
                crow::json::wvalue err;
                err["error"] = "Recipient not found";
                conn.send_text(err.dump());
                return;
            }

            int chat_id = chats.ensureDialogChat(ctx->user_id, recipient);
            auto stored_message = chats.addMessage(chat_id, ctx->user_id, message_text);

            bool delivered = false;
            {
                std::lock_guard<std::mutex> lock(ws_mutex);
                auto it = live_connections.find(recipient);
                if (it != live_connections.end() && it->second) {
                    crow::json::wvalue forward;
                    forward["type"] = "message";
                    forward["chat_id"] = stored_message.chat_id;
                    forward["message_id"] = stored_message.id;
                    forward["from"] = ctx->user_id;
                    forward["username"] = ctx->username;
                    forward["text"] = stored_message.text;
                    forward["time"] = stored_message.time_iso;
                    it->second->send_text(forward.dump());
                    delivered = true;
                }
            }

            crow::json::wvalue ack;
            ack["type"] = "delivery";
            ack["chat_id"] = stored_message.chat_id;
            ack["recipient_id"] = recipient;
            ack["message_id"] = stored_message.id;
            ack["delivered"] = delivered;
            ack["text"] = stored_message.text;
            ack["time"] = stored_message.time_iso;
            conn.send_text(ack.dump());
        })
        .onclose([&](crow::websocket::connection& conn, const std::string&, uint16_t) {
            cleanup_ws(conn);
        })
        .onerror([&](crow::websocket::connection& conn, const std::string&) {
            cleanup_ws(conn);
        });

    CROW_ROUTE(app, "/chats/<int>/messages")
    ([&](const crow::request& req, int peer_id) {
        auto claims = crow::jwt_auth::authorize(req);
        if (!claims) {
            return crow::response(401, "Missing or invalid token");
        }

        if (peer_id <= 0) {
            return crow::response(400, "Peer id must be positive");
        }

        auto target = users.findById(peer_id);
        if (!target) {
            return crow::response(404, "User not found");
        }

        int limit = 50;
        if (auto limit_param = req.url_params.get("limit")) {
            try {
                limit = std::stoi(limit_param);
            } catch (...) {
                return crow::response(400, "Invalid limit");
            }
            if (limit < 1) limit = 1;
            if (limit > 200) limit = 200;
        }

        std::optional<int> before;
        if (auto before_param = req.url_params.get("before_id")) {
            try {
                before = std::stoi(before_param);
            } catch (...) {
                return crow::response(400, "Invalid before_id");
            }
        }

        auto chat_id = chats.findDialogChat(claims->user_id, peer_id);
        crow::json::wvalue resp;
        resp["peer_id"] = peer_id;
        crow::json::wvalue::list messages_json;

        if (chat_id) {
            auto messages = chats.fetchMessages(*chat_id, limit, before);
            messages_json.reserve(messages.size());
            for (const auto& msg : messages) {
                crow::json::wvalue entry;
                entry["id"] = msg.id;
                entry["chat_id"] = msg.chat_id;
                entry["sender_id"] = msg.sender_id;
                entry["text"] = msg.text;
                entry["time"] = msg.time_iso;
                messages_json.emplace_back(std::move(entry));
            }
            resp["chat_id"] = *chat_id;
        } else {
            resp["chat_id"] = nullptr;
        }

        resp["messages"] = std::move(messages_json);
        return crow::response(resp);
    });

    app.port(8080).multithreaded().run();
}
