#include "chat_repo.h"
#include <pqxx/pqxx>
#include <algorithm>

ChatRepository::ChatRepository(pqxx::connection& conn) : db(conn) {}

std::optional<int> ChatRepository::doFindDialog(pqxx::work& txn, int first_user_id, int second_user_id) {
    auto result = txn.exec_params(
        R"SQL(
        SELECT c.id
        FROM chats c
        JOIN chat_participants p1 ON p1.chat_id = c.id AND p1.participant_id = $1
        JOIN chat_participants p2 ON p2.chat_id = c.id AND p2.participant_id = $2
        WHERE c.type = 'dialog'
        LIMIT 1;
        )SQL",
        first_user_id,
        second_user_id
    );
    if (result.empty()) return std::nullopt;
    return result[0]["id"].as<int>();
}

std::optional<int> ChatRepository::findDialogChat(int first_user_id, int second_user_id) {
    pqxx::work txn(db);
    auto id = doFindDialog(txn, first_user_id, second_user_id);
    txn.commit();
    return id;
}

int ChatRepository::ensureDialogChat(int first_user_id, int second_user_id) {
    pqxx::work txn(db);
    if (auto existing = doFindDialog(txn, first_user_id, second_user_id)) {
        txn.commit();
        return *existing;
    }

    auto chat_res = txn.exec_params(
        "INSERT INTO chats (type) VALUES ('dialog') RETURNING id;"
    );
    int chat_id = chat_res[0]["id"].as<int>();

    txn.exec_params(
        "INSERT INTO chat_participants (chat_id, participant_id, role) VALUES ($1, $2, 'member') ON CONFLICT DO NOTHING;",
        chat_id,
        first_user_id
    );
    txn.exec_params(
        "INSERT INTO chat_participants (chat_id, participant_id, role) VALUES ($1, $2, 'member') ON CONFLICT DO NOTHING;",
        chat_id,
        second_user_id
    );

    txn.commit();
    return chat_id;
}

bool ChatRepository::isParticipant(int chat_id, int user_id) {
    pqxx::work txn(db);
    auto result = txn.exec_params(
        "SELECT 1 FROM chat_participants WHERE chat_id = $1 AND participant_id = $2 LIMIT 1;",
        chat_id,
        user_id
    );
    txn.commit();
    return !result.empty();
}

StoredMessage ChatRepository::addMessage(int chat_id, int sender_id, const std::string& text) {
    pqxx::work txn(db);
    auto result = txn.exec_params(
        "INSERT INTO messages (chat_id, sender_id, text) VALUES ($1, $2, $3) RETURNING id, chat_id, sender_id, text, time;",
        chat_id,
        sender_id,
        text
    );
    txn.commit();

    const auto& row = result[0];
    return StoredMessage{
        row["id"].as<int>(),
        row["chat_id"].as<int>(),
        row["sender_id"].as<int>(),
        row["text"].c_str(),
        row["time"].c_str()
    };
}

std::vector<StoredMessage> ChatRepository::fetchMessages(int chat_id, int limit, std::optional<int> before_message_id) {
    pqxx::work txn(db);
    pqxx::result result;
    if (before_message_id) {
        result = txn.exec_params(
            R"SQL(
            SELECT id, chat_id, sender_id, text, time
            FROM messages
            WHERE chat_id = $1 AND id < $2
            ORDER BY id DESC
            LIMIT $3;
            )SQL",
            chat_id,
            *before_message_id,
            limit
        );
    } else {
        result = txn.exec_params(
            R"SQL(
            SELECT id, chat_id, sender_id, text, time
            FROM messages
            WHERE chat_id = $1
            ORDER BY id DESC
            LIMIT $2;
            )SQL",
            chat_id,
            limit
        );
    }
    txn.commit();

    std::vector<StoredMessage> messages;
    messages.reserve(result.size());
    for (const auto& row : result) {
        messages.push_back(StoredMessage{
            row["id"].as<int>(),
            row["chat_id"].as<int>(),
            row["sender_id"].as<int>(),
            row["text"].c_str(),
            row["time"].c_str()
        });
    }
    std::reverse(messages.begin(), messages.end());
    return messages;
}

std::vector<StoredMessage> ChatRepository::fetchMessagesByChatId(int chat_id, int limit, std::optional<int> before_message_id) {
    return fetchMessages(chat_id, limit, before_message_id);
}

std::vector<DialogSummary> ChatRepository::listDialogs(int user_id, int limit, int offset) {
    pqxx::work txn(db);
    auto result = txn.exec_params(
        R"SQL(
        SELECT
            c.id AS chat_id,
            peer.id AS peer_id,
            peer.username AS peer_username,
            peer.name AS peer_name,
            lm.text AS last_text,
            lm.time AS last_time
        FROM chats c
        JOIN chat_participants p_self ON p_self.chat_id = c.id AND p_self.participant_id = $1
        JOIN chat_participants p_peer ON p_peer.chat_id = c.id AND p_peer.participant_id <> $1
        JOIN users peer ON peer.id = p_peer.participant_id
        LEFT JOIN LATERAL (
            SELECT text, time
            FROM messages m
            WHERE m.chat_id = c.id
            ORDER BY m.time DESC
            LIMIT 1
        ) lm ON TRUE
        WHERE c.type = 'dialog'
        ORDER BY COALESCE(lm.time, c.created_at) DESC
        LIMIT $2 OFFSET $3;
        )SQL",
        user_id,
        limit,
        offset
    );
    txn.commit();

    std::vector<DialogSummary> dialogs;
    dialogs.reserve(result.size());
    for (const auto& row : result) {
        DialogSummary summary{
            row["chat_id"].as<int>(),
            row["peer_id"].as<int>(),
            row["peer_username"].c_str(),
            row["peer_name"].c_str(),
            row["last_text"].is_null() ? "" : row["last_text"].c_str(),
            row["last_time"].is_null() ? "" : row["last_time"].c_str()
        };
        dialogs.emplace_back(std::move(summary));
    }
    return dialogs;
}

