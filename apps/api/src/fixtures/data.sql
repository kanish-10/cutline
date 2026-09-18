INSERT INTO user VALUES ('u1', 'Alice', 'alice@example.com', 1, NULL, 100, 200);
INSERT INTO session VALUES ('s1', 900, 'session-token', 100, 200, '127.0.0.1', 'test-agent', 'u1');
INSERT INTO account VALUES ('a1', 'alice', 'credential', 'u1', NULL, NULL, NULL, NULL, NULL, NULL, 'password-hash', 100, 200);
INSERT INTO verification VALUES ('v1', 'alice@example.com', 'verification-value', 900, 100, 200);
INSERT INTO boards (id, user_id, creator_type) VALUES ('b1', 'u1', 'video');
INSERT INTO stages VALUES ('st1', 'b1', 'Backlog', '#123456', 0);
INSERT INTO cards VALUES ('c1', 'b1', 'st1', 'Keep my card', 'Important notes', '[{"id":"item1","text":"Keep","done":false}]', '["tag"]', '["https://example.com"]', 0, 3, '2026-01-01', '2026-01-02', NULL);
