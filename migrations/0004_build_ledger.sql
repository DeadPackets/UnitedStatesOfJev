CREATE TABLE build_calls (scenario TEXT, name TEXT, model TEXT, at INTEGER, seconds REAL, cost REAL, input INTEGER, output INTEGER, reasoning INTEGER, cached INTEGER, cache_write INTEGER, finish TEXT);
CREATE INDEX build_calls_scenario ON build_calls (scenario);
CREATE TABLE build_parts (scenario TEXT, part TEXT, body TEXT, at INTEGER, PRIMARY KEY (scenario, part));
