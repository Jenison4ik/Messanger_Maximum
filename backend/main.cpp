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
        if (!body || !body.has("username") || !body.has("email") || !body.has("password"))
            return crow::response(400);

        int id = users.createUser(body["username"].s(), body["email"].s(), body["password"].s());
        return crow::response(200, "Created user id = " + std::to_string(id));
    });

    app.port(8080).run();
}
