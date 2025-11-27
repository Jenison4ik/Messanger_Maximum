#include "user_repo.h"
#include <pqxx/pqxx>
#include <optional>

UserRepository::UserRepository(pqxx::connection& conn) : db(conn) {}

std::vector<User> UserRepository::getAllUsers() {
    // Открываем транзакцию уровня work (read/write). Она автоматически
    // отменится, если не вызвать commit() из-за исключения.
    pqxx::work txn(db);

    // Простое чтение всех строк. Здесь можно добавить ORDER BY/WHERE позже.
    auto result = txn.exec("SELECT id, name, username, email FROM users ORDER BY username");
    txn.commit();

    std::vector<User> users;
    users.reserve(result.size());
    for (const auto& row : result) {
        users.push_back(User{
            row["id"].as<int>(),
            row["name"].c_str(),
            row["username"].c_str(),
            row["email"].c_str(),
            "" // пароль не нужен для публичного списка
        });
    }
    return users;
}

// Поиск пользователя по email: возвращает std::optional<User>, если пользователь найден
std::optional<User> UserRepository::findByEmail(const std::string& email) {
    pqxx::work txn(db);
    // Выполняем выборку по email
    auto result = txn.exec_params(
        "SELECT id, name, username, email, password_hash FROM users WHERE email = $1 LIMIT 1;",
        email
    );
    if (result.empty()) return std::nullopt;
    const auto& row = result[0];
    User user{
        row["id"].as<int>(),
        row["name"].c_str(),
        row["username"].c_str(),
        row["email"].c_str(),
        row["password_hash"].c_str(),
    };
    return user;
}

std::optional<User> UserRepository::findByUsername(const std::string& username) {
    pqxx::work txn(db);
    auto result = txn.exec_params(
        "SELECT id, name, username, email, password_hash FROM users WHERE username = $1 LIMIT 1;",
        username
    );
    if (result.empty()) return std::nullopt;
    const auto& row = result[0];
    User user{
        row["id"].as<int>(),
        row["name"].c_str(),
        row["username"].c_str(),
        row["email"].c_str(),
        row["password_hash"].c_str(),
    };
    return user;
}

// Поиск пользователя по id
std::optional<User> UserRepository::findById(int id) {
    pqxx::work txn(db);
    auto result = txn.exec_params(
        "SELECT id, name, username, email, password_hash FROM users WHERE id = $1 LIMIT 1;",
        id
    );
    if (result.empty()) return std::nullopt;
    const auto& row = result[0];
    User user{
        row["id"].as<int>(),
        row["name"].c_str(),
        row["username"].c_str(),
        row["email"].c_str(),
        row["password_hash"].c_str(),
    };
    return user;
}

// Добавить пользователя с email и хэшем пароля
int UserRepository::createUser(const std::string& name, const std::string& username, const std::string& email, const std::string& password_hash) {
    pqxx::work txn(db);
    auto result = txn.exec_params(
        "INSERT INTO users (name, username, email, password_hash) VALUES ($1, $2, $3, $4) RETURNING id;",
        name, username, email, password_hash
    );
    int id = result[0]["id"].as<int>();
    txn.commit();
    return id;
}

std::vector<User> UserRepository::searchByName(const std::string& needle, int limit) {
    pqxx::work txn(db);
    auto result = txn.exec_params(
        "SELECT id, name, username, email FROM users WHERE name ILIKE '%' || $1 || '%' ORDER BY name LIMIT $2;",
        needle,
        limit
    );
    txn.commit();

    std::vector<User> users;
    users.reserve(result.size());
    for (const auto& row : result) {
        users.push_back(User{
            row["id"].as<int>(),
            row["name"].c_str(),
            row["username"].c_str(),
            row["email"].c_str(),
            ""
        });
    }
    return users;
}
