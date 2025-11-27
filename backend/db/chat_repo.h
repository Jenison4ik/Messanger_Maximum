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

struct DialogSummary {
    int chat_id;
    int peer_id;
    std::string peer_username;
    std::string peer_name;
    std::string last_text;
    std::string last_time;
};

class ChatRepository {
public:
    explicit ChatRepository(pqxx::connection& conn);

    std::optional<int> findDialogChat(int first_user_id, int second_user_id);
    int ensureDialogChat(int first_user_id, int second_user_id);
    bool isParticipant(int chat_id, int user_id);
    StoredMessage addMessage(int chat_id, int sender_id, const std::string& text);
    std::vector<StoredMessage> fetchMessages(int chat_id, int limit, std::optional<int> before_message_id);
    std::vector<StoredMessage> fetchMessagesByChatId(int chat_id, int limit, std::optional<int> before_message_id);
    std::vector<DialogSummary> listDialogs(int user_id, int limit, int offset);

private:
    pqxx::connection& db;
    std::optional<int> doFindDialog(pqxx::work& txn, int first_user_id, int second_user_id);
};

