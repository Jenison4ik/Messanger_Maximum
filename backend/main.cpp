#include "crow.h"

int main()
{
    crow::SimpleApp app;

    crow::mustache::set_base("templates");

    // Для отдачи cтатических файлов (css, js, картинки)
    CROW_ROUTE(app, "/<string>")
    ([](const crow::request& req, crow::response& res, std::string filename){
        std::string full_path = "templates/" + filename;
        res.set_static_file_info(full_path);
        res.end();
    });

    CROW_ROUTE(app, "/")([](){
        auto page = crow::mustache::load_text("index.html");
        return page;
    });

    app.port(18080).multithreaded().run();
}