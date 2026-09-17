CREATE TRIGGER unknown_trigger AFTER INSERT ON cards BEGIN UPDATE cards SET version = 99 WHERE id = NEW.id; END;
