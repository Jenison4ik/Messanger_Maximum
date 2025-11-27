#include "connection.h"
#include <pqxx/pqxx>
#include <cstdlib>
#include <iostream>

/**
 * @brief Строит строку подключения вида
 * "host=... port=... user=... password=... dbname=..."
 * исходя из переменных окружения, которые предоставляет docker-compose.
 */
Database::Database() :
    conn(
        // Каждое значение берётся из ENV; std::string нужен, чтобы избежать UB с nullptr.
        "host=" + std::string(std::getenv("DB_HOST")) +
        " port=" + std::string(std::getenv("DB_PORT")) +
        " user=" + std::string(std::getenv("DB_USER")) +
        " password=" + std::string(std::getenv("DB_PASSWORD")) +
        " dbname=" + std::string(std::getenv("DB_NAME"))
    )
{
    // Простое уведомление в stdout помогает понять, что коннект прошёл успешно.
    std::cout << "Connected to DB!" << std::endl;
}

pqxx::connection& Database::get() {
    // Возвращаем ссылку, чтобы вызывающий мог создавать свои транзакции.
    return conn;
}
