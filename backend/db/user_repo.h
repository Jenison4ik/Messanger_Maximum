#pragma once
#include <string>
#include <vector>
#include <pqxx/pqxx>
#include <optional>

/**
 * @brief Пользователь с email и хэшем пароля
 * id — идентификатор; username — отображаемое имя; email — почта для входа;
 * password_hash — хэш пароля (bcrypt).
 */
struct User {
    int id;
    std::string username;
    std::string email;
    std::string password_hash;
};

/**
 * @brief Репозиторий инкапсулирует SQL-запросы к таблице users.
 *
 * Использует уже открытое соединение pqxx для создания транзакций.
 * Методы класса находятся на уровне DAO: никаких бизнес-инвариантов,
 * только CRUD-операции. Логику можно расширять по мере необходимости.
 */
class UserRepository {
public:
    /**
     * @param conn Ссылка на существующее соединение, которым владеет Database.
     */
    UserRepository(pqxx::connection& conn);

    /**
     * @brief Получить всех пользователей в порядке, заданном SELECT.
     *
     * Каждая строка мапится в структуру User. В случае ошибки pqxx бросит
     * исключение, что позволяет вызывающему обработать проблему подключения.
     */
    std::vector<User> getAllUsers();

    /**
     * @brief Создать пользователя и вернуть его id, сгенерированный БД.
     *
     * Используется RETURNING, чтобы получить значение без повторного SELECT.
     */
    int createUser(const std::string& username);

    /**
     * @brief Найти пользователя по email
     * @param email — адрес электронной почты
     * @return User если найден, иначе std::nullopt
     */
    std::optional<User> findByEmail(const std::string& email);
    /**
     * @brief Добавить пользователя с email и хэшем пароля
     * @param username — имя пользователя
     * @param email — email для входа
     * @param password_hash — bcrypt хэш пароля
     * @return id пользователя
     */
    int createUser(const std::string& username, const std::string& email, const std::string& password_hash);

private:
    /// Ссылка на общую pqxx-коннекцию; владеет ей объект Database.
    pqxx::connection& db;
};
