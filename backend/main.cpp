#include "db/connection.h"
#include "db/user_repo.h"
#include <crow.h>

int main() {
    crow::SimpleApp app;

    Database db;
    UserRepository users(db.get());

    // получить список пользователей
    CROW_ROUTE(app, "/users")
    ([&users]() {
        auto list = users.getAllUsers();

        crow::json::wvalue result;
        crow::json::wvalue::list users_json;
        users_json.reserve(list.size());

        for (auto& u : list) {
            crow::json::wvalue user;
            user["id"] = u.id;
            user["username"] = u.username;
            users_json.emplace_back(std::move(user));
        }

        result["users"] = std::move(users_json);
        return result;
    });

    // добавить пользователя
    CROW_ROUTE(app, "/users").methods("POST"_method)
    ([&users](const crow::request& req) {
        auto body = crow::json::load(req.body);
        if (!body || !body.has("username") || !body.has("email") ||
            !body.has("password") || !body.has("user")) {
            return crow::response(400, "missing fields");
        }

        try {
            int id = users.createUser(body["username"].s(),
                                    body["user"].s(),
                                    body["email"].s(),
                                    body["password"].s());
            crow::json::wvalue ok;
            ok["id"] = id;
            return crow::response(201, ok);
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
                err["dublicate"] = duplicate_value;
            }
            return crow::response(409, err);
        } catch (const std::exception& e) {
            return crow::response(500, e.what());
        }
    });

    app.port(8080).multithreaded().run();
}
