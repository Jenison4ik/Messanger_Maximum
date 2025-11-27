#include "crow/middlewares/jwt_auth.h"
#include <crow.h>
#include "db/connection.h"
#include "db/user_repo.h"
#include <pqxx/except.hxx>
#include <jwt-cpp/jwt.h>

int main() {
    crow::SimpleApp app;

    Database db;
    UserRepository users(db.get());

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
            auto token = jwt::create()
                .set_issuer("messanger-api")
                .set_type("JWS") 
                .set_payload_claim("user_id", jwt::claim(std::to_string(id)))
                .set_payload_claim("username", jwt::claim(body["username"].s()))
                .sign(jwt::algorithm::hs256{"SIMPLE_SECRET"});
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

    app.port(8080).multithreaded().run();
}
