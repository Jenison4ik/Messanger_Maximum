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

    auto serialize_messages = [](const std::vector<StoredMessage>& messages) {
        crow::json::wvalue::list list;
        list.reserve(messages.size());
        for (const auto& msg : messages) {
            crow::json::wvalue entry;
            entry["id"] = msg.id;
            entry["chat_id"] = msg.chat_id;
            entry["sender_id"] = msg.sender_id;
            entry["text"] = msg.text;
            entry["time"] = msg.time_iso;
            list.emplace_back(std::move(entry));
        }
        return list;
    };

    auto serialize_dialogs = [](const std::vector<DialogSummary>& dialogs) {
        crow::json::wvalue::list list;
        list.reserve(dialogs.size());
        for (const auto& dlg : dialogs) {
            crow::json::wvalue entry;
            entry["chat_id"] = dlg.chat_id;
            entry["peer_id"] = dlg.peer_id;
            entry["peer_username"] = dlg.peer_username;
            entry["peer_name"] = dlg.peer_name;
            entry["last_text"] = dlg.last_text;
            entry["last_time"] = dlg.last_time;
            list.emplace_back(std::move(entry));
        }
        return list;
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

    CROW_ROUTE(app, "/users/lookup/<string>")
    ([&users](const crow::request& req, const std::string& username) {
        auto claims = crow::jwt_auth::authorize(req);
        if (!claims) {
            return crow::response(401, "Missing or invalid token");
        }

        auto user = users.findByUsername(username);
        if (!user) {
            return crow::response(404, "User not found");
        }

        crow::json::wvalue resp;
        resp["id"] = user->id;
        resp["name"] = user->name;
        resp["username"] = user->username;
        resp["email"] = user->email;
        return crow::response(resp);
    });

    CROW_ROUTE(app, "/users/search")
    ([&users](const crow::request& req) {
        auto claims = crow::jwt_auth::authorize(req);
        if (!claims) {
            return crow::response(401, "Missing or invalid token");
        }

        auto needle = req.url_params.get("name");
        if (!needle || std::string(needle).empty()) {
            return crow::response(400, "Parameter 'name' is required");
        }

        int limit = 20;
        if (auto limit_param = req.url_params.get("count")) {
            try {
                limit = std::stoi(limit_param);
            } catch (...) {
                return crow::response(400, "Invalid count");
            }
            if (limit < 1) limit = 1;
            if (limit > 100) limit = 100;
        }

        auto found = users.searchByName(needle, limit);
        crow::json::wvalue::list items;
        items.reserve(found.size());
        for (const auto& user : found) {
            crow::json::wvalue item;
            item["id"] = user.id;
            item["name"] = user.name;
            item["username"] = user.username;
            item["email"] = user.email;
            items.emplace_back(std::move(item));
        }
        crow::json::wvalue resp;
        resp["results"] = std::move(items);
        return crow::response(resp);
    });

    CROW_ROUTE(app, "/chats")
    ([&](const crow::request& req) {
        auto claims = crow::jwt_auth::authorize(req);
        if (!claims) {
            return crow::response(401, "Missing or invalid token");
        }

        int limit = 50;
        if (auto limit_param = req.url_params.get("count")) {
            try {
                limit = std::stoi(limit_param);
            } catch (...) {
                return crow::response(400, "Invalid count");
            }
            if (limit < 1) limit = 1;
            if (limit > 200) limit = 200;
        }

        int offset = 0;
        if (auto offset_param = req.url_params.get("offset")) {
            try {
                offset = std::stoi(offset_param);
            } catch (...) {
                return crow::response(400, "Invalid offset");
            }
            if (offset < 0) offset = 0;
        }

        auto dialogs = chats.listDialogs(claims->user_id, limit, offset);
        crow::json::wvalue resp;
        resp["chats"] = std::move(serialize_dialogs(dialogs));
        return crow::response(resp);
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
                err["type"] = "error";
                err["message"] = "Binary messages are unsupported";
                conn.send_text(err.dump());
                return;
            }

            auto* ctx = static_cast<WsUserContext*>(conn.userdata());
            if (!ctx) {
                conn.close("Unauthorized");
                return;
            }

            auto payload = crow::json::load(data);
            auto send_error = [&](const std::string& message) {
                crow::json::wvalue err;
                err["type"] = "error";
                err["message"] = message;
                conn.send_text(err.dump());
            };

            if (!payload) {
                send_error("Malformed JSON");
                return;
            }

            std::string action = "message";
            if (payload.has("type")) {
                if (payload["type"].t() != crow::json::type::String) {
                    send_error("Field 'type' must be a string");
                    return;
                }
                action = payload["type"].s();
            }

            auto parse_count = [&](int& count) -> bool {
                if (!payload.has("count")) {
                    return true;
                }
                if (payload["count"].t() != crow::json::type::Number) {
                    send_error("Field 'count' must be a number");
                    return false;
                }
                count = static_cast<int>(payload["count"].i());
                if (count < 1) count = 1;
                if (count > 200) count = 200;
                return true;
            };

            auto parse_before_id = [&]() -> std::optional<int> {
                if (!payload.has("before_id"))
                    return std::nullopt;
                if (payload["before_id"].t() != crow::json::type::Number) {
                    send_error("Field 'before_id' must be a number");
                    return std::nullopt;
                }
                return static_cast<int>(payload["before_id"].i());
            };

            if (action == "message") {
                if (!payload.has("recipient_username") || !payload.has("text")) {
                    send_error("Recipient username and text are required");
                    return;
                }

                if (payload["recipient_username"].t() != crow::json::type::String || payload["text"].t() != crow::json::type::String) {
                    send_error("Invalid payload types");
                    return;
                }

                std::string recipient_username = payload["recipient_username"].s();
                if (recipient_username.empty()) {
                    send_error("Recipient username must not be empty");
                    return;
                }

                std::string message_text = payload["text"].s();
                if (message_text.empty()) {
                    send_error("Message text must not be empty");
                    return;
                }

                auto target = users.findByUsername(recipient_username);
                if (!target) {
                    send_error("Recipient not found");
                    return;
                }

                int recipient = target->id;
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
                        forward["from_username"] = ctx->username;
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
                ack["recipient_username"] = recipient_username;
                ack["message_id"] = stored_message.id;
                ack["delivered"] = delivered;
                ack["text"] = stored_message.text;
                ack["time"] = stored_message.time_iso;
                conn.send_text(ack.dump());
                return;
            }

            if (action == "history_with_user") {
                if (!payload.has("peer_username") || payload["peer_username"].t() != crow::json::type::String) {
                    send_error("Field 'peer_username' is required");
                    return;
                }

                std::string peer_username = payload["peer_username"].s();
                if (peer_username.empty()) {
                    send_error("Peer username must not be empty");
                    return;
                }

                auto target = users.findByUsername(peer_username);
                if (!target) {
                    send_error("User not found");
                    return;
                }

                int count = 50;
                if (!parse_count(count)) {
                    return;
                }
                auto before = parse_before_id();
                if (payload.has("before_id") && !before) {
                    return;
                }

                auto chat_id = chats.findDialogChat(ctx->user_id, target->id);
                crow::json::wvalue response;
                response["type"] = "history";
                response["mode"] = "with_user";
                response["peer_username"] = peer_username;

                if (chat_id) {
                    auto messages = chats.fetchMessages(*chat_id, count, before);
                    auto json_messages = serialize_messages(messages);
                    response["chat_id"] = *chat_id;
                    response["messages"] = std::move(json_messages);
                } else {
                    response["chat_id"] = nullptr;
                    response["messages"] = crow::json::wvalue::list();
                }
                conn.send_text(response.dump());
                return;
            }

            if (action == "history_by_chat") {
                if (!payload.has("chat_id") || payload["chat_id"].t() != crow::json::type::Number) {
                    send_error("Field 'chat_id' must be a number");
                    return;
                }
                int chat_id = static_cast<int>(payload["chat_id"].i());
                if (chat_id <= 0) {
                    send_error("Chat id must be positive");
                    return;
                }

                if (!chats.isParticipant(chat_id, ctx->user_id)) {
                    send_error("Access denied");
                    return;
                }

                int count = 50;
                if (!parse_count(count)) {
                    return;
                }
                auto before = parse_before_id();
                if (payload.has("before_id") && !before) {
                    return;
                }

                auto messages = chats.fetchMessagesByChatId(chat_id, count, before);
                auto json_messages = serialize_messages(messages);
                crow::json::wvalue response;
                response["type"] = "history";
                response["mode"] = "by_chat";
                response["chat_id"] = chat_id;
                response["messages"] = std::move(json_messages);
                conn.send_text(response.dump());
                return;
            }

            if (action == "list_chats") {
                int count = 50;
                if (!parse_count(count)) {
                    return;
                }
                int offset = 0;
                if (payload.has("offset")) {
                    if (payload["offset"].t() != crow::json::type::Number) {
                        send_error("Field 'offset' must be a number");
                        return;
                    }
                    offset = static_cast<int>(payload["offset"].i());
                    if (offset < 0) offset = 0;
                }

                auto dialogs = chats.listDialogs(ctx->user_id, count, offset);
                auto chats_json = serialize_dialogs(dialogs);
                crow::json::wvalue response;
                response["type"] = "chat_list";
                response["offset"] = offset;
                response["count"] = count;
                response["chats"] = std::move(chats_json);
                conn.send_text(response.dump());
                return;
            }

            if (action == "user_lookup") {
                if (!payload.has("username") || payload["username"].t() != crow::json::type::String) {
                    send_error("Field 'username' is required");
                    return;
                }
                std::string username = payload["username"].s();
                if (username.empty()) {
                    send_error("Username must not be empty");
                    return;
                }
                auto target = users.findByUsername(username);
                if (!target) {
                    send_error("User not found");
                    return;
                }

                crow::json::wvalue response;
                response["type"] = "user_lookup";
                response["user"]["id"] = target->id;
                response["user"]["username"] = target->username;
                response["user"]["name"] = target->name;
                response["user"]["email"] = target->email;
                conn.send_text(response.dump());
                return;
            }

            if (action == "user_search") {
                if (!payload.has("name") || payload["name"].t() != crow::json::type::String) {
                    send_error("Field 'name' is required");
                    return;
                }
                std::string query = payload["name"].s();
                if (query.empty()) {
                    send_error("Field 'name' must not be empty");
                    return;
                }
                int count = 20;
                if (!parse_count(count)) {
                    return;
                }
                auto found = users.searchByName(query, count);
                crow::json::wvalue::list list;
                list.reserve(found.size());
                for (const auto& user : found) {
                    crow::json::wvalue entry;
                    entry["id"] = user.id;
                    entry["username"] = user.username;
                    entry["name"] = user.name;
                    entry["email"] = user.email;
                    list.emplace_back(std::move(entry));
                }
                crow::json::wvalue response;
                response["type"] = "user_search";
                response["query"] = query;
                response["results"] = std::move(list);
                conn.send_text(response.dump());
                return;
            }

            send_error("Unknown message type");
        })
        .onclose([&](crow::websocket::connection& conn, const std::string&, uint16_t) {
            cleanup_ws(conn);
        })
        .onerror([&](crow::websocket::connection& conn, const std::string&) {
            cleanup_ws(conn);
        });

    CROW_ROUTE(app, "/chats/with/<string>/messages")
    ([&](const crow::request& req, const std::string& peer_username) {
        auto claims = crow::jwt_auth::authorize(req);
        if (!claims) {
            return crow::response(401, "Missing or invalid token");
        }

        if (peer_username.empty()) {
            return crow::response(400, "Peer username must not be empty");
        }

        auto target = users.findByUsername(peer_username);
        if (!target) {
            return crow::response(404, "User not found");
        }

        int count = 50;
        if (auto count_param = req.url_params.get("count")) {
            try {
                count = std::stoi(count_param);
            } catch (...) {
                return crow::response(400, "Invalid count");
            }
            if (count < 1) count = 1;
            if (count > 200) count = 200;
        }

        std::optional<int> before;
        if (auto before_param = req.url_params.get("before_id")) {
            try {
                before = std::stoi(before_param);
            } catch (...) {
                return crow::response(400, "Invalid before_id");
            }
        }

        auto chat_id = chats.findDialogChat(claims->user_id, target->id);
        crow::json::wvalue resp;
        resp["peer_username"] = peer_username;

        if (chat_id) {
            auto messages = chats.fetchMessages(*chat_id, count, before);
            resp["chat_id"] = *chat_id;
            auto json_messages = serialize_messages(messages);
            resp["messages"] = std::move(json_messages);
        } else {
            resp["chat_id"] = nullptr;
            resp["messages"] = crow::json::wvalue::list();
        }

        return crow::response(resp);
    });

    CROW_ROUTE(app, "/chats/<int>/messages")
    ([&](const crow::request& req, int chat_id) {
        auto claims = crow::jwt_auth::authorize(req);
        if (!claims) {
            return crow::response(401, "Missing or invalid token");
        }

        if (chat_id <= 0) {
            return crow::response(400, "Chat id must be positive");
        }

        if (!chats.isParticipant(chat_id, claims->user_id)) {
            return crow::response(403, "Access denied");
        }

        int count = 50;
        if (auto count_param = req.url_params.get("count")) {
            try {
                count = std::stoi(count_param);
            } catch (...) {
                return crow::response(400, "Invalid count");
            }
            if (count < 1) count = 1;
            if (count > 200) count = 200;
        }

        std::optional<int> before;
        if (auto before_param = req.url_params.get("before_id")) {
            try {
                before = std::stoi(before_param);
            } catch (...) {
                return crow::response(400, "Invalid before_id");
            }
        }

        auto messages = chats.fetchMessagesByChatId(chat_id, count, before);
        auto json_messages = serialize_messages(messages);
        crow::json::wvalue resp;
        resp["chat_id"] = chat_id;
        resp["messages"] = std::move(json_messages);
        return crow::response(resp);
    });

    app.port(8080).multithreaded().run();
}
