#include "user_repo.h"
#include <optional>

UserRepository::UserRepository(pqxx::connection& conn) : db(conn) {}

std::vector<User> UserRepository::getAllUsers() {
    // Открываем транзакцию уровня work (read/write). Она автоматически
    // отменится, если не вызвать commit() из-за исключения.
    pqxx::work txn(db);

    // Простое чтение всех строк. Здесь можно добавить ORDER BY/WHERE позже.
    auto result = txn.exec("SELECT id, username FROM users");
    txn.commit();

    std::vector<User> users;
    for (auto row : result) {
        users.push_back(User{
            row["id"].as<int>(),          // Конвертируем значение столбца в int.
            row["username"].c_str()       // c_str() создаёт std::string.
        });
    }
    return users;
}

// Поиск пользователя по email: возвращает std::optional<User>, если пользователь найден
std::optional<User> UserRepository::findByEmail(const std::string& email) {
    pqxx::work txn(db);
    // Выполняем выборку по email
    auto result = txn.exec_params(
        "SELECT id, username, email, password_hash FROM users WHERE email = $1 LIMIT 1;",
        email
    );
    if (result.empty()) return std::nullopt;
    const auto& row = result[0];
    User user{
        row["id"].as<int>(),
        row["username"].c_str(),
        row["email"].c_str(),
        row["password_hash"].c_str(),
    };
    return user;
}

// Создание пользователя с email и хэшем пароля
int UserRepository::createUser(const std::string& username, const std::string& user, const std::string& email, const std::string& password_hash) {
    pqxx::work txn(db);
    // Используем параметризованный запрос для безопасности
    auto result = txn.exec_params(
        "INSERT INTO users (username, \"user\", email, password_hash) VALUES ($1, $2, $3, $4) RETURNING id;",
        username, user, email, password_hash
    );
    int id = result[0]["id"].as<int>();
    txn.commit();
    return id;
}
