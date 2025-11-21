CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    "user" TEXT NOT NULL,
    username TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL
);
