CREATE UNIQUE INDEX user_email_unique ON user (email);
CREATE UNIQUE INDEX session_token_unique ON session (token);
CREATE UNIQUE INDEX boards_user_id_unique ON boards (user_id);
