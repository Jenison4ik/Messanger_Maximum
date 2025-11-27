#pragma once
#include <optional>
#include <string>
#include <vector>
#include "pqxx_fwd.h"

struct StoredMessage {
    int id;
    int chat_id;
    int sender_id;
    std::string text;
    std::string time_iso;
};

class ChatRepository {
public:
    explicit ChatRepository(pqxx::connection& conn);

    std::optional<int> findDialogChat(int first_user_id, int second_user_id);
    int ensureDialogChat(int first_user_id, int second_user_id);
    StoredMessage addMessage(int chat_id, int sender_id, const std::string& text);
    std::vector<StoredMessage> fetchMessages(int chat_id, int limit, std::optional<int> before_message_id);

private:
    pqxx::connection& db;
    std::optional<int> doFindDialog(pqxx::work& txn, int first_user_id, int second_user_id);
};

