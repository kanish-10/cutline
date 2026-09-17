CREATE TABLE rollback_probe (id INTEGER PRIMARY KEY);
INSERT INTO rollback_probe VALUES (1);
UPDATE cards SET title = 'must roll back';
INSERT INTO missing_table VALUES (1);
