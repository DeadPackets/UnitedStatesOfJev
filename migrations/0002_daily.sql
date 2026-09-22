CREATE TABLE dailies (day TEXT PRIMARY KEY, scenario TEXT, status TEXT, prompt TEXT, created INTEGER);
CREATE TABLE daily_plays (id TEXT, day TEXT, game TEXT, grid TEXT, won INTEGER, ended INTEGER DEFAULT 0, created INTEGER, PRIMARY KEY (id, day));
CREATE INDEX daily_plays_game ON daily_plays (game);
